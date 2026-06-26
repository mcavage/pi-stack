# Set DOCKER_USER to your Docker Hub namespace before `make publish`.
# VERSION is a PINNED tag (never `latest`): Docker re-pulls `:latest` on every
# run even when the image is already loaded, so `make load` would be ignored. A
# pinned tag gets IfNotPresent semantics — use the loaded local build if present,
# else pull once. Keep in sync with `version` in package.json and `image:` in
# pi-kit/spec.yaml.
DOCKER_USER ?= mcavage
VERSION     ?= 0.0.1
IMAGE       ?= docker.io/$(DOCKER_USER)/pi-stack:$(VERSION)
LATEST      ?= docker.io/$(DOCKER_USER)/pi-stack:latest
KIT         ?= ./pi-kit
# MCP enablement for `make run`. Set this in config/local.mk (written by
# `make install`) so the stack is configured once, not by hand each run. Listed
# servers are auto-attached (`--mcp <name>`) AND are what `make mcp-register`
# registers among the local stdio servers. EMPTY = dynamic mode: the gateway
# exposes only discovery tools (mcp-find / mcp-exec / code-mode) and the agent
# pulls tools in on demand instead of dumping 100+ into context. NOTE: local
# stdio servers (e.g. slack) are NOT surfaced by dynamic discovery — to use
# them they must be listed here so `make run` attaches them. `MCP=all` attaches
# everything registered.
MCP         ?=
MCP_FLAGS   = $(foreach server,$(MCP),--mcp $(server))
# The local stdio MCP servers this host binary implements. `make mcp-register`
# registers the ones you actually use — i.e. those listed in MCP. A private overlay
# (config/overlay.mk) can append more (e.g. bamboohr).
LOCAL_STDIO_MCP = slack
REGISTER        = $(filter $(LOCAL_STDIO_MCP),$(MCP))

# Host MCP server credentials all come from 1Password via one file of op:// refs
# (config/op-refs.env), resolved by `op run` when the sbx gateway spawns a server.
# OP_BIN is op's absolute path (the sbx daemon's PATH may not include it).
OP_REFS := $(CURDIR)/config/op-refs.env
OP_BIN  := $(shell command -v op 2>/dev/null)

# Owner-specific values live in a gitignored local override so the committed
# defaults stay generic. config/overlay.mk (also gitignored) adds private,
# company-specific integrations (Snowflake/BambooHR targets, vars, extra MCP).
-include config/local.mk
-include config/overlay.mk

# Local-model deps for the self-learning memory (host Ollama). The watcher model
# turns your messages into durable facts (capture); the embed model powers
# semantic recall. `make pull-models` fetches them. Override MEMORY_WATCHER_MODEL
# in config/local.mk to use a different one.
MEMORY_WATCHER_MODEL ?= gemma4
MEMORY_EMBED_MODEL   ?= nomic-embed-text

# SERVICES: which host services `make serve` runs (memory, gws). MCP (top of
# file): which MCP servers `make run` auto-attaches and `make mcp-register`
# registers. Both are the SINGLE place to configure the stack — set them in
# config/local.mk (written by `make install`) so you never pass flags by hand.
SERVICES ?= memory gws

.PHONY: help build load publish validate inspect run run-no-mcp serve doctor memory-serve gws-token-serve mcp-register pull-models secrets pack install clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

build: ## Build the pi-stack image from the DHI base
	docker build -t $(IMAGE) .

load: build ## Build, then load the image into the sbx sandbox runtime store (local dev)
	docker save $(IMAGE) -o out/pi-stack.tar
	sbx template load out/pi-stack.tar
	rm -f out/pi-stack.tar

publish: build ## Push the built image to the registry as :$(VERSION) and :latest (run `docker login` first)
	docker push $(IMAGE)
	docker tag $(IMAGE) $(LATEST)
	docker push $(LATEST)
	@echo "Published $(IMAGE) and $(LATEST)."
	@echo "  Discoverability tag: $(LATEST) (for manual docker pull / Hub browsing)."
	@echo "  Kit pins :$(VERSION), so consumers + local runs resolve the version (no re-pull)."
	@echo "  Consumers: sbx run pi-stack --kit \"git+https://github.com/$(DOCKER_USER)/pi-stack.git#dir=pi-kit\""

validate: ## Validate the sandbox kit
	sbx kit validate $(KIT)

inspect: ## Inspect the kit
	sbx kit inspect $(KIT)

secrets: ## Store provider keys + GitHub token as global sbx service secrets
	@echo "Store once (read by the host proxy, never stored in the VM):"
	@echo '  echo "$$ANTHROPIC_API_KEY" | sbx secret set -g anthropic'
	@echo '  echo "$$OPENAI_API_KEY"    | sbx secret set -g openai'
	@echo '  echo "$$GEMINI_API_KEY"    | sbx secret set -g google'
	@echo '  gh auth token             | sbx secret set -g github   # gh in-sandbox, no GH_TOKEN export needed'

run: ## Launch a pi-stack sandbox. Attaches the MCP servers from config/local.mk (MCP=...); empty = dynamic discovery. Override once-off with `make run MCP="slack"`.
	sbx run pi-stack --kit $(KIT) $(MCP_FLAGS) .

run-no-mcp: ## Launch without sbx Cloud MCP Gateway, for debugging MCP setup failures
	env -u SBX_MCP_URL sbx run pi-stack --kit $(KIT) .

memory-serve: ## Build + run just the memory service (JSON-RPC :11435) from pi-stack-host
	(cd services/host && go build -o $(CURDIR)/out/pi-stack-host .) && exec ./out/pi-stack-host memory

gws-token-serve: ## Build + run just the gws bearer token service (:11441) from pi-stack-host
	(cd services/host && go build -o $(CURDIR)/out/pi-stack-host .) && exec ./out/pi-stack-host gws-token

mcp-register: ## Register the local stdio MCP servers you use (the ones in MCP, config/local.mk) with sbx. The gateway runs each as `op run --env-file=config/op-refs.env -- pi-stack-host <name>`, so creds come from 1Password at spawn (nothing stored in the registration). Needs SBX_MCP_URL + op + config/op-refs.env.
	@command -v sbx >/dev/null 2>&1 || { echo "ERROR: sbx not found"; exit 1; }
	@[ -n "$(strip $(REGISTER))" ] || { echo "Nothing to register: no local stdio servers ($(LOCAL_STDIO_MCP)) are in MCP. Set MCP in config/local.mk."; exit 0; }
	@[ -n "$$SBX_MCP_URL" ] || { echo "ERROR: SBX_MCP_URL is unset — MCP is not enabled, so 'sbx mcp add' will fail."; \
		echo "  Fix (once):  export SBX_MCP_URL=https://gateway.docker.com  &&  sbx daemon stop"; exit 1; }
	@[ -n "$(OP_BIN)" ] || { echo "ERROR: 1Password CLI 'op' not found on PATH."; exit 1; }
	@[ -f "$(OP_REFS)" ] || { echo "ERROR: $(OP_REFS) missing. Create it:  cp config/op-refs.env.example config/op-refs.env  then fill in your refs."; exit 1; }
	@(cd services/host && go build -o $(CURDIR)/out/pi-stack-host .)
	@BIN="$(CURDIR)/out/pi-stack-host"; \
	for s in $(REGISTER); do \
		sbx mcp add $$s --command "$(OP_BIN)" \
			--args run --args --no-masking --args "--env-file=$(OP_REFS)" --args -- --args "$$BIN" --args "$$s" \
			&& echo "  registered: $$s" || echo "  FAILED to register: $$s"; \
	done
	@echo "Verify: sbx mcp ls"
	@echo "Attach: registration is NOT enough — a sandbox only gets these if you START it with them."
	@echo "        \`make run\` does this for you (MCP=$(MCP) from config/local.mk). Local stdio"
	@echo "        servers aren't surfaced by dynamic discovery, and this sbx can't attach to a"
	@echo "        running sandbox — so just \`make run\` (it passes --mcp for each)."
	@echo "        Local stdio servers are NOT surfaced by dynamic mcp-find, and this sbx has no 'mcp load'"
	@echo "        for a running sandbox — so re-run with --mcp to pick them up."
	@echo "Note: each server resolves its creds from config/op-refs.env via op run when the gateway spawns it — make sure those refs are filled + valid."

serve: ## Start the host services named in SERVICES (config/local.mk): memory :11435, gws :11441. MCP servers (slack) are run by the sbx gateway — see `make mcp-register`. Ctrl-C stops all.
	@echo "Host services [$(SERVICES)] — sandboxes reach these on host.docker.internal. Ctrl-C stops all."
	@(cd services/host && go build -o $(CURDIR)/out/pi-stack-host .) || { echo "go build failed (pi-stack-host)"; exit 1; }
	@exec env SNOW_CONN=$(SNOW_CONN) MEMORY_WATCHER_MODEL=$(MEMORY_WATCHER_MODEL) MEMORY_EMBED_MODEL=$(MEMORY_EMBED_MODEL) out/pi-stack-host serve $(SERVICES)

pull-models: ## Pull the local Ollama models the memory loop needs (watcher + embed)
	@command -v ollama >/dev/null 2>&1 || { echo "ollama not installed — see https://ollama.com (optional: enables semantic recall + fact capture)"; exit 1; }
	@echo "Pulling watcher model: $(MEMORY_WATCHER_MODEL)"; ollama pull $(MEMORY_WATCHER_MODEL)
	@echo "Pulling embed model:   $(MEMORY_EMBED_MODEL)";   ollama pull $(MEMORY_EMBED_MODEL)
	@echo "Done. 'make doctor' will now show capture + semantic recall as ready."

doctor: ## Show models + each optional integration: set up? service running?
	@port() { nc -z localhost "$$1" >/dev/null 2>&1 && echo "up" || echo "down"; }; \
	sset() { sbx secret ls 2>/dev/null | grep -qw "$$1" && echo "sbx secret set" || echo "TODO: sbx secret set -g $$1"; }; \
	model() { command -v ollama >/dev/null 2>&1 && ollama list 2>/dev/null | grep -q "^$$1\b" && echo "pulled" || echo "TODO: ollama pull $$1 (or make pull-models)"; }; \
	echo "Config (config/local.mk — the single source of truth):"; \
	printf "  %-9s %s\n" "SERVICES" "$(SERVICES)   (make serve runs these)"; \
	printf "  %-9s %s\n" "MCP"      "$(if $(strip $(MCP)),$(MCP),<empty: dynamic discovery only>)   (make run attaches these)"; \
	echo ""; \
	echo "Models / providers (proxy-injected, never in the VM):"; \
	printf "  %-9s %s\n" "anthropic" "$$(sset anthropic)"; \
	printf "  %-9s %s\n" "openai"    "$$(sset openai)"; \
	printf "  %-9s %s\n" "google"    "$$(sset google)"; \
	printf "  %-9s %s\n" "ollama"    "$$(command -v ollama >/dev/null 2>&1 && echo installed, :11434 $$(port 11434) || echo 'not installed (optional, for local models)')"; \
	printf "  %-9s %s\n" "  watcher" "$$(model $(MEMORY_WATCHER_MODEL)) — fact capture [$(MEMORY_WATCHER_MODEL)]"; \
	printf "  %-9s %s\n" "  embed"   "$$(model $(MEMORY_EMBED_MODEL)) — semantic recall [$(MEMORY_EMBED_MODEL)]"; \
	echo ""; \
	echo "Data tools (host side):"; \
	printf "  %-7s setup: %-30s serving: %s\n" "gh"    "$$(sset github)" "proxy-injected (no service)"; \
	printf "  %-7s setup: %-30s serving: %s\n" "gws"   "$$(command -v gws >/dev/null 2>&1 && echo 'CLI installed' || echo 'TODO: install gws + auth')" ":11441 $$(port 11441)"; \
	printf "  %-7s setup: %-30s serving: %s\n" "memory" "watcher+embed above" ":11435 $$(port 11435) (capture needs the watcher model)"; \
	echo ""; \
	echo "MCP servers (local stdio, run by the sbx gateway — register with 'make mcp-register', attach with 'make run'):"; \
	reg() { sbx mcp ls 2>/dev/null | grep -qw "$$1" && echo "registered" || echo "TODO: make mcp-register"; }; \
	printf "  %-7s %-14s %s\n" "slack"  "$$(reg slack)"    "$(if $(filter slack,$(MCP)),auto-attached on make run,NOT in MCP — add to config/local.mk to use)"; \
	echo "  gateway catalog (atlassian/notion/granola/linear/...): sbx mcp add … then add to MCP in config/local.mk"; \
	echo ""; \
	echo "All of the above is configured in config/local.mk. Start it: make serve (host) + make run (sandbox)."
	@$(MAKE) -s doctor-overlay 2>/dev/null || true

pack: ## Package the kit as a distributable zip
	sbx kit pack $(KIT) -o out/pi-stack-kit.zip

install: ## Put the `pi-stack` launcher on your PATH (~/.local/bin) + create config/local.mk (your stack config) if missing
	mkdir -p $(HOME)/.local/bin
	ln -sf $(CURDIR)/bin/pi-stack $(HOME)/.local/bin/pi-stack
	@echo "Installed: pi-stack -> $(CURDIR)/bin/pi-stack"
	@if [ ! -f config/local.mk ]; then \
		cp config/local.mk.example config/local.mk; \
		echo "Created config/local.mk — edit it to pick SERVICES, MCP, models, then: make serve / make run"; \
	else \
		echo "config/local.mk already present — left as-is (compare with config/local.mk.example for new options)."; \
	fi
	@echo "Ensure ~/.local/bin is on your PATH, then: cd <any project> && pi-stack"

clean: ## Remove the built image
	-docker rmi $(IMAGE)
