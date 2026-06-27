# Private make targets for your overlay. The root Makefile `-include`s
# pi-kit-work/overlay.mk when present, so targets and vars defined here are
# available (and stay out of the public `make help`).

# Example: a config var your host plugin + skills read.
# EXAMPLE_ENDPOINT ?= https://api.your-internal-service.example

.PHONY: doctor-overlay

# `make doctor` calls this automatically (swallowed if absent), so your private
# integrations show up in the status readout for you but not for a public cloner.
doctor-overlay: ## [overlay] status of your private integrations
	@echo "Overlay (private integrations):"
	@printf "  %-10s %s\n" "example" "$$(nc -z localhost 12000 >/dev/null 2>&1 && echo up || echo down) (:12000)"
