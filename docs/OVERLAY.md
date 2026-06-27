# Building a private overlay

pi-stack is open-core: the public repo and image ship a generic coding stack, and
anything company-specific (proprietary skills, a CRM/warehouse/HR connector, an
internal `capabilities.json`) lives in a **private overlay** that you keep in your
own repo and never publish. This doc shows how to build one.

An overlay has two halves, because pi-stack runs in two places:

| half | runs | mechanism |
|---|---|---|
| **sandbox overlay** | inside the disposable VM | a **mixin kit** (`--kit`) — skills, `capabilities.json`, in-sandbox wrappers |
| **host overlay** | on your host (outside the VM) | a **`services/host/overlay_*.go` plugin** that self-registers into `pi-stack-host` |

A working example lives in [`examples/overlay/`](../examples/overlay). Copy it to
`./pi-kit-work` (gitignored) and edit.

## 1. Sandbox overlay — a mixin kit

A mixin kit is a directory with a `spec.yaml` (`kind: mixin`) and a `files/` tree
that maps directly into the sandbox filesystem. Stack it after the public kit and
its files layer on top of the image:

```
pi-kit-work/
  spec.yaml                                  # kind: mixin
  files/
    home/agent/.pi/agent/
      skills/<your-skill>/SKILL.md           # private skills
      capabilities.json                      # overwrites the public generic one
    usr/local/bin/<your-wrapper>             # in-sandbox CLI wrappers
```

`make run` stacks `./pi-kit-work` automatically when it exists (via `OVERLAY_KIT`),
so you just run `make run` and get:

```bash
sbx run pi-stack --kit ./pi-kit --kit ./pi-kit-work --mcp ... .
```

- **Skills** under `files/home/agent/.pi/agent/skills/` are added to the agent's
  skill set (additive — they don't touch the baked public skills).
- **`capabilities.json`** at `files/home/agent/.pi/agent/capabilities.json`
  overwrites the public generic one, so your skills can ask for `crm`/`warehouse`/
  etc. and resolve to your real providers. Write capabilities, not vendors (see the
  `capability-routing` skill).
- **Wrappers** under `files/usr/local/bin/` are thin in-sandbox shims that forward
  to a host service (so credentials/SSO stay on the host — see the host half below).

Keep the whole directory private. pi-stack gitignores `pi-kit-work/` by default.

## 2. Host overlay — a `pi-stack-host` plugin

A mixin kit can't ship host binary code, so host-side services (a warehouse exec
proxy, an extra MCP server) are Go files that compile into `pi-stack-host`. Drop a
file named `services/host/overlay_*.go` — it's gitignored by default and
**self-registers** via `init()`:

```go
package main

func init() {
    // a new subcommand: `pi-stack-host my-svc`
    extraCommands["my-svc"] = runMySvc
    extraUsage = append(extraUsage, "  my-svc       my private host service")

    // optionally also a long-running service under `make serve`:
    extraServiceFactories = append(extraServiceFactories, func() hostService {
        return hostService{"my-svc", env("MY_SVC_BIND", "127.0.0.1") + ":12000", myMux()}
    })
}

func runMySvc() { /* ... */ }
```

The public binary builds and runs identically whether or not these files are
present — `extraCommands`/`extraUsage`/`extraServiceFactories` are empty in the
public tree. `make serve` builds `services/host/` (picking up your plugins) and
runs the services named in `SERVICES`.

Reach the host service from the sandbox over `host.docker.internal:<port>` (add the
port to your kit's network rules, or the public kit already allows `:11442`), via
the in-sandbox wrapper from half 1.

## 3. Make targets — `overlay.mk`

Put private make targets (auth helpers, a `doctor-overlay` readout) in
`pi-kit-work/overlay.mk`; the Makefile `-include`s it when present. `make doctor`
calls `doctor-overlay` automatically, so your private integrations show up in the
status readout for you but not for a public cloner.

## What stays out of the public repo

`.gitignore` keeps the overlay out of git, and `scripts/check-open-core.sh` (run in
CI) fails if any `services/host/overlay_*.go`, `pi-kit-work/`, or known internal
marker is ever tracked. The public image is verified to bake only the allowlisted
skills + agents. So you can develop your overlay right next to the public tree
without risk of leaking it.
