# Set DOCKER_USER to your Docker Hub namespace before `make publish`.
DOCKER_USER ?= mcavage
IMAGE       ?= docker.io/$(DOCKER_USER)/pi-stack:latest
KIT         ?= ./pi-kit

.PHONY: help build load publish validate inspect run secrets pack install clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

build: ## Build the pi-stack image from the DHI base
	docker build -t $(IMAGE) .

load: build ## Build, then load the image into the sbx sandbox runtime store (local dev)
	docker save $(IMAGE) -o pi-stack.tar
	sbx template load pi-stack.tar
	rm -f pi-stack.tar

publish: build ## Push the built image to the registry so consumers can pull it (run `docker login` first)
	docker push $(IMAGE)
	@echo "Published $(IMAGE) — consumers: sbx run pi-stack --kit \"git+https://github.com/$(DOCKER_USER)/pi-stack.git#dir=pi-kit\""

validate: ## Validate the sandbox kit
	sbx kit validate $(KIT)

inspect: ## Inspect the kit
	sbx kit inspect $(KIT)

secrets: ## Store provider API keys as global sbx service secrets
	@echo "Store keys once (read by the host proxy, never stored in the VM):"
	@echo '  echo "$$ANTHROPIC_API_KEY" | sbx secret set -g anthropic'
	@echo '  echo "$$OPENAI_API_KEY"    | sbx secret set -g openai'

run: ## Launch a pi-stack sandbox in the current directory
	sbx run pi-stack --kit $(KIT) .

pack: ## Package the kit as a distributable zip
	sbx kit pack $(KIT) -o pi-stack-kit.zip

install: ## Put the `pi-stack` launcher on your PATH (~/.local/bin) so you can run it from any project
	mkdir -p $(HOME)/.local/bin
	ln -sf $(CURDIR)/bin/pi-stack $(HOME)/.local/bin/pi-stack
	@echo "Installed: pi-stack -> $(CURDIR)/bin/pi-stack"
	@echo "Ensure ~/.local/bin is on your PATH, then: cd <any project> && pi-stack"

clean: ## Remove the built image
	-docker rmi $(IMAGE)
