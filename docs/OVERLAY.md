# Building a private overlay

pi-stack is open-core: the public repo and image ship a generic coding stack, and
anything company-specific (proprietary skills, a CRM/warehouse/HR connector, an
internal `capabilities.json`) lives in a **private overlay**. The overlay is its
own **peer repo** — a sibling directory you keep private, never a subdirectory of
pi-stack. pi-stack references it by path (`OVERLAY`, default `../pi-stack-work`).

An overlay has two halves, because pi-stack runs in two places:

| half | runs | mechanism |
|---|---|---|
| **sandbox** | inside the disposable VM | a **mixin kit** (`kit/`) stacked with `--kit` |
| **host** | on your host (outside the VM) | **`host/overlay_*.go` plugins**, symlinked into `pi-stack/services/host/` at build |

A copyable scaffold lives in [`examples/overlay/`](../examples/overlay). The layout:

```
../my-overlay/                 # a peer repo (sibling of pi-stack), kept private
  kit/
    spec.yaml                  # kind: mixin
    files/
      home/agent/.pi/agent/
        skills/<your-skill>/SKILL.md     # private skills
        capabilities.json                # overwrites the public generic one
      usr/local/bin/<wrapper>            # in-sandbox CLI wrappers
  host/
    overlay_<name>.go          # host plugins (Go, package main)
  overlay.mk                   # private make targets
```

Point pi-stack at it once, in `config/local.mk`:

```makefile
OVERLAY = ../my-overlay
```

## 1. Sandbox half — the mixin kit (`kit/`)

A mixin kit is a directory with a `spec.yaml` (`kind: mixin`) and a `files/` tree
that maps directly into the sandbox filesystem. `make run` stacks it automatically
when `$(OVERLAY)/kit/spec.yaml` exists:

```bash
sbx run pi-stack --kit ./pi-kit --kit ../my-overlay/kit --mcp ... .
```

- **Skills** under `files/home/agent/.pi/agent/skills/` are added to the agent's
  skill set (additive — they don't touch the baked public skills).
- **`capabilities.json`** overwrites the public generic one, so your skills can ask
  for `crm`/`warehouse`/etc. and resolve to your real providers. Write
  capabilities, not vendors (see the `capability-routing` skill).
- **Wrappers** under `files/usr/local/bin/` are thin in-sandbox shims that forward
  to a host service, so credentials/SSO stay on the host (see half 2).

## 2. Host half — `host/overlay_*.go` plugins

A mixin kit can't ship host binary code, so host-side services (a warehouse exec
proxy, an extra MCP server) are Go files that compile into `pi-stack-host`. Put
them in your overlay's `host/` named `overlay_*.go`. `make serve` / `make
mcp-register` (via the `link-overlay` target) **symlink** them into
`pi-stack/services/host/` before building — the symlinks are gitignored there, so
your private code never enters the public tree, and a public clone (no overlay)
builds clean.

Each plugin **self-registers** via `init()`:

```go
package main

func init() {
    extraCommands["my-svc"] = runMySvc
    extraUsage = append(extraUsage, "  my-svc       my private host service  [overlay]")

    // optional long-running service started by `make serve` (add "my-svc" to SERVICES):
    extraServiceFactories = append(extraServiceFactories, func() hostService {
        return hostService{"my-svc", env("MY_SVC_BIND", "127.0.0.1") + ":12000", myMux()}
    })
}

func runMySvc() { /* ... */ }
```

`extraCommands`/`extraUsage`/`extraServiceFactories` are declared (empty) in
pi-stack's `main.go`; your plugin populates them only when present. The public
binary builds and runs identically without it. Plugins are `package main` and use
pi-stack-host's helpers (`env`, `writeJSON`, `mcpStdio`, `hostService`, …), so they
compile only when symlinked in — edit them in your overlay, build from pi-stack.

Reach the host service from the sandbox over `host.docker.internal:<port>` via the
in-sandbox wrapper from half 1 (add the port to your kit's network rules, or the
public kit already allows `:11442`).

## 3. Make targets — `overlay.mk`

Put private make targets (auth helpers, a `doctor-overlay` readout) in your
overlay's `overlay.mk`; pi-stack's Makefile `-include`s `$(OVERLAY)/overlay.mk`.
`make doctor` calls `doctor-overlay` automatically, so your private integrations
show up in the status readout for you but not for a public cloner. Targets that
build the binary should depend on `link-overlay`.

## What keeps the public repo clean

`.gitignore` ignores `services/host/overlay_*.go` (the symlinks), and
`scripts/check-open-core.sh` (run in CI) fails if any overlay symlink or known
internal marker is ever tracked, and asserts the skills/agents allowlists mirror.
The public image is verified to bake only allowlisted skills + agents. So you can
develop your overlay right next to pi-stack without risk of leaking it.
