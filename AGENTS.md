# AGENTS.md — pi-stack

You're working on **pi-stack**: a personal, multi-model **pi** coding-agent
harness that runs inside **Docker Sandboxes** (`sbx`) on a **DHI** (Docker
Hardened Image) Node/Debian base. You may be *running inside* a pi-stack sandbox
or *editing this repo* to extend the harness. This file is the harness's memory —
read it before changing things, and keep it current as you learn.

## Repo layout

| path | what |
|---|---|
| `Dockerfile` | the image: DHI node base + LSP toolchains + chromium + gh + gws + fd + curated pi packages + the baked harness |
| `pi-kit/spec.yaml` | the **sandbox kit** (kit-spec **v1**): image, entrypoint, multi-model proxy creds, network allowlist, `agentContext` |
| `settings.json` | → `~/.pi/agent/settings.json` (theme, trust, `hideThinkingBlock`) |
| `keybindings.json` | → `~/.pi/agent/keybindings.json` (emacs; model-cycle moved to **Alt+P**) |
| `mcp.json` | → `~/.pi/agent/mcp.json` (registers the sbx Cloud MCP Gateway: atlassian/notion/granola/linear/…; `lifecycle:lazy`) |
| `capabilities.json` | → `~/.pi/agent/capabilities.json` (maps capabilities chat/docs/github/... → provider mcp/cli/http/none; swap to retarget every data skill at once). See the `capability-routing` skill |
| `agents/*.md` | 17 subagent presets: orchestration (`fanout`/`review`/`deep`) + a role crew (architect, engineer, designer, qa-lead, security-lead, …) |
| `skills/<name>/SKILL.md` | Agent Skills. The public image bakes ~35 generic skills (the `.dockerignore` allowlist); company-specific skills live in a private overlay kit and are excluded. Dev spine: ship · code-review · investigate · spec · qa · design-review · tdd · verify |
| `extensions/*.ts` | local TypeScript extensions (`status.ts`, `timestamps.ts`) |
| `services/host/` | **`pi-stack-host`** — the single compiled **Go** binary for everything that runs on the HOST. Subcommands: `gws-token` (:11441), `memory` (:11435), `slack`, `serve <services…>` (runs the ones named in `SERVICES`). `make serve` builds + runs it. Private overlay subcommands self-register via `init()` when present (see the open-core note below). |
| `config/local.mk` | **the single stack config** (gitignored; `make install` seeds it from `config/local.mk.example`). Declares `SERVICES` (what `make serve` runs), `MCP` (what `make run` attaches + `make mcp-register` registers), and the Ollama model names. Every make target derives from it — no hand-passed flags. `config/overlay.mk` (also gitignored) adds private company-specific targets. |
| `services/host/{slack,memory}.go` | the former `mcp/*` servers, now `pi-stack-host` subcommands. `slack` is a **stdio MCP server** registered with sbx (`make mcp-register`) and run by the MCP gateway — NOT in `mcp.json`, NOT in `make serve`. `memory` (JSON-RPC :11435, sqlite+FTS5+vectors via Ollama) is a plain host service backing the recall extension. None are baked into the image. |
| `themes/*.json` | `dracula` (default), `pi-stack` |
| `prompts/*.md` | prompt templates (`/name`) |
| `docs/STACK-MAP.md` | capability map vs Claude Code / opencode / cagent (have / package / build) |

## Build → load → run (read this before iterating)

- **Image or baked files** (Dockerfile, settings, keybindings, agents/skills/extensions/themes) → `make load` (build + `docker save` + `sbx template load`). The sbx runtime has its **own image store**, so a locally-built image MUST be loaded in — otherwise sbx pulls it from the registry. `make load` is **heavy** (~1GB tar); batch changes.
  - **The image tag MUST be pinned (never `:latest`).** Docker re-pulls `:latest` on every run even when the image is already loaded, so `make load` gets ignored and you keep downloading. A pinned tag (`VERSION` in the Makefile = `image:` in `pi-kit/spec.yaml` = `version` in package.json) gets IfNotPresent semantics: use the loaded build if present, else pull once.
  - **You (the agent) CANNOT run `make load` / `make run` from inside a pi-stack sandbox** — they need the **host's** Docker + `sbx` CLI, which the VM has no access to. Don't offer to. Edit the baked files, sync them into the live `~/.pi/agent/...` dir + `/reload` for the current session, and tell the **user** to run `make load` on their host to bake it for future sandboxes.
- **Kit only** (`pi-kit/spec.yaml`) → just `make run` a fresh sandbox. `--kit` applies at sandbox **creation** only — no rebuild needed.
- **This file** (`AGENTS.md`) and other workspace files are read live from the mount — no rebuild.
- A running sandbox keeps its **creation-time image**; recreate (`sbx rm -f … && make run`) to pick up image changes.
- **Testing:** never create/remove a sandbox named `pi-stack-pi-stack` — that's what `make run` uses, so you'll collide and strand sbx state. Use `--name pi-stack-test`.
- **Load-check an extension without keys:** `docker run --rm docker.io/mcavage/pi-stack:0.0.1 bash -lc 'pi -p hi'` → "No API key" means extensions loaded fine; "Failed to load extension …" means fix it before loading.

## Updating pi (mechanical, don't relearn)

pi is pinned via `ARG PI_PACKAGE=@earendil-works/pi-coding-agent@<version>` in the Dockerfile. The in-sandbox "Update available" banner just means a newer point release shipped (pi checks npm at runtime); it returns on every release, so bump intentionally. To bump:

1. **Find the target version:** `npm view @earendil-works/pi-coding-agent version` (latest), or pick a specific one from `npm view @earendil-works/pi-coding-agent versions`.
2. **Edit the `PI_PACKAGE` ARG** in the Dockerfile to `@earendil-works/pi-coding-agent@<version>`. Changing the ARG busts the pi-install layer so the rebuild actually reinstalls.
3. **`make load`** (rebuild + load).
4. **Verify the vendored tui patch still applied:** the build log must show `[apply-tui-bottom-pin] patched`, NOT an `anchor not found` warning. If it warns, the renderer moved: refresh `scripts/patches/tui-bottom-pin.block.txt` and the anchor in `apply-tui-bottom-pin.mjs` against the new `@earendil-works/pi-tui/dist/tui.js` (see Hard-won gotchas).
5. **Verify the version:** `docker run --rm --entrypoint pi docker.io/mcavage/pi-stack:0.0.1 --version`.
6. **Recreate sandboxes** to pick up the new pi (they keep their creation-time image): `sbx rm -f <name>` then re-run. A stale sandbox is also the usual cause of in-sandbox auth 401s and "missing extension" surprises, since it carries old image + proxy wiring.

## Writing extensions (`extensions/*.ts`)

- Shape: `export default function (pi: any) { … }`. pi loads `.ts` **directly** (no build step), with **full Node globals at runtime** — `process`, `require`, `setInterval` all work. `@types/node` + `tsconfig.json` make pi-lens/tsserver recognize them. **Do NOT "fix" `process`/`require` errors by deleting them** — they're real at runtime; it was only a type-lint gap (now configured).
- An extension that throws **at load breaks pi startup** → guard defensively. But pi-lens flags empty `catch {}` as error-swallowing, so write `catch { /* best-effort; must not break the agent */ }` (a comment) or actually handle it.
- Core API: `pi.registerCommand(name, {description, handler})`, `pi.registerShortcut("ctrl+alt+x", {…})`, `pi.on(event, (e, ctx) => …)`, `pi.registerTool(…)`, `pi.events`. In handlers: `ctx.ui.notify / setWorkingMessage / setStatus / setWidget`, `ctx.model`, `ctx.getContextUsage()`, `ctx.abort()`, `ctx.isIdle()`.
- Useful events: `turn_start` / `turn_end`, `tool_execution_start` / `update` / `end`, `message_update`, `before_provider_request` / `after_provider_response`, `tool_call` (return `{block,reason}` to gate), `session_shutdown`.
- `extensions/status.ts` is the canonical defensive pattern (live working-line + `/status` + stall watchdog).
- **Never put `.d.ts` (or any non-extension `.ts`) in `extensions/`** — pi tries to load *every* `.ts` there as an extension factory and **crashes pi startup** on a declaration file (`does not export a valid factory function`). Put ambient types in `types/` (covered by `tsconfig` `include`); Node globals come from `@types/node`.
- **Display-only injected messages:** `pi.sendMessage` defaults to `deliverAs:"steer"`, which **triggers an LLM call to deliver the message**. Fired from an idle hook (e.g. `agent_end`) it ends the conversation on an assistant turn, and reasoning models (`claude-opus-4-8`) **400 with "assistant prefill not supported"**. For pure display annotations use `deliverAs:"nextTurn"` ("does not interrupt or trigger anything") and strip them in the `context` hook by `customType`. See `extensions/timestamps.ts`.

## Writing skills (`skills/<name>/SKILL.md`)

YAML frontmatter `name` + `description` (when to use), then tight markdown steps.
Auto-discovered; invoke `/skill:<name>` or let it auto-load. Delegate heavy or
parallel work to subagents via the `Agent` tool (`subagent_type=fanout|review|deep`).

## Models & subagents

- Providers: **Claude + OpenAI**, keys injected proxy-side (the VM only ever sees the `proxy-managed` sentinel). Switch `/model`; cycle **Alt+P**.
- **ALWAYS fully-qualify model ids** (`provider/id`). A bare name like `haiku` can resolve to a keyless provider (e.g. `amazon-bedrock`) and **hang the subagent forever**. Known-good: `anthropic/claude-opus-4-8`, `anthropic/claude-haiku-4-5`, `openai/gpt-5.5`.
- Preset roles: `fanout` = haiku (cheap breadth, read-only), `review` = gpt-5.5 (cross-vendor adversary — different blind spots), `deep` = opus (one hard problem).

## Hard-won gotchas

- **Kit is v1.** `sbx kit validate` warns it's deprecated for v2, but **v2 panics `sbx run`** (it needs an undocumented per-credential source field). Stay on v1.
- **The proxy is TLS-intercepting.** CA trust is installed via the kit `install` command + `NODE_EXTRA_CA_CERTS`. Egress is allowed only to `network.allowedDomains` in `spec.yaml` — a new external host = add it there + recreate the sandbox.
- **The DHI base is minimal:** no `useradd` (append to `/etc/passwd`), `/usr/local/bin` may not exist (`mkdir -p`), no `gzip`/`curl`/`fd`/`hostname` by default (apt-install, or bake the static binary like ruff/fd do).
- **Stalled model streams:** pi has no client read timeout, so a dead SSE stream spins "working…" forever. `status.ts`'s watchdog auto-cancels a turn with no output for 3 min; otherwise `Esc`. Diagnose a hung sandbox with `ps` (idle CPU + no child process = network wait, not compute).
- **Full-auto:** no permission prompts — the sandbox isolation is the safety boundary.
- **MCP host servers go through the sbx gateway — read the runbook**
  (docker/sandboxes `docs/plan/mcp-runbook.md`; needs `SBX_MCP_URL=https://gateway.docker.com`).
  They are **stdio** subcommands of `pi-stack-host` (`slack`; plus overlay servers
  like `bamboohr` when present). `sbx mcp
  add` for a local stdio server takes only `--command` + `--args` (**no `--env`**),
  and the command runs on the HOST as a daemon subprocess. So creds come from
  1Password: the registered command is `op run --env-file=config/op-refs.env --
  pi-stack-host <name>`, which resolves the op:// refs at spawn time. One file
  (`config/op-refs.env`) is the single mechanism for every MCP credential; nothing
  is stored in the registration or the VM. `make mcp-register` wires this.
  **Registration ≠ attachment, and local stdio servers are NOT surfaced by dynamic
  `mcp-find`** (only the remote catalog is) — and this `sbx` build has no
  attach-to-running (`sbx mcp load` doesn't exist; the flag is `--mcp <name>`, not
  `--static-mcp`). So a sandbox only gets a local stdio server (e.g. `slack`) if it
  was **created** with `--mcp <name>`. `make run` does this automatically from the `MCP` list in
  `config/local.mk` — the single config that also drives `serve`/`mcp-register`/
  `doctor`/`pull-models`. Add a server = a tool table + handlers + `run<Name>()` using `mcpStdio`
  (newline-delimited JSON — what the gateway speaks; tolerates Content-Length on
  input). Transports live in `services/host/util.go`.
  - **Do NOT** hand-bake `url`/`command` entries into `mcp.json` pointing at
    `host.docker.internal` — that's a non-native bypass (and a `command` server hits
    pi's stdio client, which speaks newline-delimited JSON). Register with `sbx mcp
    add` instead. `mcp.json` keeps only the `gateway` entry.
  - Plain host services that are NOT MCP (`gws-token`, `memory`, plus overlay
    services like the snow proxy) are different: the sandbox reaches them directly
    over `host.docker.internal` (kit allowlist) via a wrapper/extension, and they
    DO run under `make serve`.
- **HOST = Go, SANDBOX = TypeScript (hard convention).** Everything that runs on
  the host is one compiled Go binary, `services/host/` → `pi-stack-host` (subcommands
  per service). Everything that runs *inside* the sandbox (pi extensions in
  `extensions/`, in-box MCP) is TypeScript. Rationale: a single static binary is
  saner to ship, and — decisively — a Node/Python interpreter that listens on a
  socket and **spawns a child process from network input is backdoor-shaped and
  trips endpoint security / EDR**. A compiled Go binary doing the same work runs
  unflagged. So when you add a host service,
  add a subcommand to `pi-stack-host`, don't write another `node …/server.ts`.
- **gws** follows the host-token pattern: the wrapper fetches a short-lived bearer
  from the `gws-token` service (a `pi-stack-host` subcommand) and runs the real
  binary in-sandbox. `gws-token` execs `gws auth export`, so it's a process-spawner
  too — another reason it's Go.
- **Private overlay (company-specific integrations).** Connectors that are
  specific to one company — e.g. a Snowflake warehouse exec-proxy or a BambooHR
  directory MCP — are NOT in the public repo. Their Go sources
  (`services/host/{snowproxy,bamboohr}.go`), the `bin/snow` wrapper, the Makefile
  targets (`config/overlay.mk`), and their `capabilities.json` routing are all
  gitignored. The pattern: an overlay `*.go` file **self-registers** into
  `pi-stack-host` via `init()` (populating `extraCommands` / `extraUsage` /
  `extraServiceFactories` in `main.go`), so the binary builds and runs identically
  with or without it. To add a company connector, drop a gitignored subcommand file
  in `services/host/` that registers itself — never reference it from a committed
  file.
- **Vendored renderer patch (`scripts/patches/`).** pi-tui's `doRender()` jitters the input box + powerbar up/down while streaming (it doesn't re-anchor the viewport on a bottom-anchored buffer *shrink*). No extension/config fixes it, so the Dockerfile runs `apply-tui-bottom-pin.mjs` after the pi install to patch the installed `@earendil-works/pi-tui/dist/tui.js`. The script is **idempotent + non-fatal** (warns and leaves the file unpatched if a pi version moves the `// Find first and last changed lines` anchor). **On a pi version bump, re-verify it still applies** (`grep "Bottom-block pin" .../pi-tui/dist/tui.js`); if the warning fires, refresh `scripts/patches/tui-bottom-pin.block.txt`. Full root-cause + tests in `docs/upstream/tui-bottom-pin.md` (this is also the eventual upstream PR — gated behind their `lgtm` contribution process).

## Toolchain in the image

node 25 · npm · git · **gh** (HTTPS token via sbx proxy — use for PRs, not SSH) ·
**gws** (host-token wrapper) · ripgrep · **fd** · ruff · clangd · pyright · typescript-language-server ·
**chromium** + **agent-browser** (localhost QA) · python3 · build-essential.
