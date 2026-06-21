# pi-stack

A personal, multi-model coding-agent harness: the [**pi** coding
agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
running inside a [Docker Sandbox](https://docs.docker.com/ai/sandboxes/) on a
**Docker Hardened Image (DHI)** Debian base.

The idea: keep pi's tiny 4-tool core, run it isolated and disposable, drive it
with whatever model fits the task (Claude + OpenAI today), and grow a curated
set of skills + TypeScript extensions — the useful bones of a Claude-Code /
opencode / docker-agent workflow, none of the bloat.

## Install — only `sbx` required

```bash
# one-time: store your provider keys (interactive — paste each when prompted)
sbx secret set -g anthropic
sbx secret set -g openai

# run pi-stack in the current project — sbx fetches the kit + pulls the image:
sbx run pi-stack --kit "git+https://github.com/mcavage/pi-stack.git#dir=pi-kit"
```

No clone, no Docker build, no DHI access — the published image already has
everything baked in. For a `pi-stack` command you can run from any directory,
`git clone` the repo and `make install` (a launcher → `~/.local/bin/pi-stack`).

## Architecture

```
pi-stack/
├── Dockerfile          FROM dhi.io/debian-base:trixie-debian13-dev
│                         + Node 24 (nodejs.org tarball — Debian's 20 is too old)
│                         + git / ripgrep / ca-certificates (apt, DHI-patched)
│                         + @earendil-works/pi-coding-agent (npm -g)
│                         + LSP toolchains: JS/TS, Python, C/C++ (+ YAML/JSON)
│                         + 9 curated pi packages (subagents, plan, mcp, lens…)
│                         + non-root `agent` user, sandbox-template conventions
├── pi-kit/spec.yaml    Sandbox kit (v1): image + entrypoint + multi-model proxy
│                         credentials + network allowlist + agent context
├── settings.json       Baked to ~/.pi/agent/settings.json (trust + telemetry)
├── package.json        pi-package manifest (skills/prompts/extensions)
├── agents/             Subagent role presets: fanout / review / deep
├── skills/             ship·code-review·investigate·brainstorm·spec·qa·design-review
├── agents/             Subagent role presets: fanout / review / deep
├── themes/             dracula (default) · pi-stack
├── prompts/            Prompt templates (/name)                      ← next
└── extensions/         Local TypeScript extensions                   ← next
```

### Installed harness (all full-auto — no permission prompts)

| capability | package |
|---|---|
| multi-model subagents (fan-out + cross-vendor review) | `@tintinweb/pi-subagents` + our `agents/` presets |
| plan mode | `pi-plan` |
| MCP servers (wire per-project) | `pi-mcp-adapter` |
| todo tracking · code simplify · web access | `pi-manage-todo-list` · `pi-simplify` · `pi-web-access` |
| inline LSP diagnostics | `pi-lens` (+ tsserver, pyright, ruff, clangd) |
| statusline + usage/cost HUD | `@juanibiapina/pi-powerbar` + `pi-usage` |
| live agent status + stall watchdog | local `extensions/status.ts` (`/status`) |
| opencode-style message timestamps | local `extensions/timestamps.ts` (`/timestamps`) |

**Quiet transcript:** thinking blocks are hidden by default
(`hideThinkingBlock` in `settings.json`) and tool output / thinking can be
toggled on demand with `ctrl+t` (thinking) and `ctrl+o` (tool output). Every
turn is also written to `.pi-sessions/*.jsonl`, so the full reasoning/iteration
stream is always available as an external buffer (`tail -f` it) without
cluttering the live view.

**Next:** ship / code-review / investigate / brainstorm skills · QA + design
browser track · a default theme · live multi-model subagent demo.

**Why a kit *and* a custom image?** The kit (`kind: sandbox`) wires up the
entrypoint, per-provider credential proxying, the network allowlist, and the
agent context. The image bakes pi + the harness in so cold start is fast and
fully reproducible — instead of `npm install`-ing pi on every sandbox create
(what the stock community `pi` kit does on top of `shell-docker`).

## Setup

```bash
# 1. Build the image AND load it into the sbx sandbox runtime store.
#    The sandbox runtime has its own image store separate from the host
#    daemon, so a locally-built image must be `sbx template load`-ed in
#    (otherwise sbx tries to *pull* it and 500s). `make load` does both.
make load

# 2. Store provider keys once (read by the host proxy, never stored in the VM)
echo "$ANTHROPIC_API_KEY" | sbx secret set -g anthropic
echo "$OPENAI_API_KEY"    | sbx secret set -g openai

# 3. Validate the kit, then launch a sandbox in the current dir
make validate
make run            # == sbx run pi-stack --kit ./pi-kit .
```

After editing the `Dockerfile`, re-run `make load`. After editing `pi-kit/`,
just `make run` a fresh sandbox (`--kit` only applies at sandbox *creation*).

### The proxy CA gotcha

The sandbox forces all egress through a TLS-intercepting proxy that injects the
real provider key host-side. Because it terminates TLS with its own CA, a custom
image must trust that CA or every HTTPS call fails with *"self-signed certificate
in certificate chain."* The kit's `install` command decodes `$PROXY_CA_CERT_B64`
into the trust store and sets `NODE_EXTRA_CA_CERTS` so pi's Node runtime trusts
it too. (Stock `sandbox-templates` images bake this in; BYO images don't.)

## Multi-model

Keys for both providers are injected proxy-side. Inside pi, switch with `/model`
or `--model openai/<id>`. The intended pattern: cheap/fast model for bulk
fan-out, stronger model for synthesis and review. Adding more providers is one
`serviceDomains` + `serviceAuth` + `credentials.sources` block in `spec.yaml`
plus a `sbx secret set -g <provider>` (google, xai, groq, openrouter, … are all
built-in proxy services).

## Subagents (multi-model fan-out)

`@tintinweb/pi-subagents` runs subagents in-process and in parallel (`Agent`
tool / `/agents`). Three role presets in `agents/` encode the multi-model thesis:

- **fanout** — cheap/fast (`haiku`), read-only; spawn many for breadth.
- **review** — adversarial 2nd opinion on a *different vendor* (`gpt`) than your
  main model, so its blind spots differ from yours. Run before committing.
- **deep** — strongest (`opus`) for one genuinely hard sub-problem.

Model fields use pi's fuzzy matching and are trivially editable per file.

## Skills (gstack flows, distilled — no YC ceremony)

In `skills/`, baked to `~/.pi/agent/skills/`, auto-discovered (or `/skill:<name>`):

- **ship** — test → code-review → bump → commit → PR (`gh`, never auto-merges).
- **code-review** — diff review + a cross-vendor `review` subagent that *refutes*.
- **investigate** — root-cause-first debugging; fans out `fanout` subagents.
- **brainstorm** — idea → `DESIGN.md`, builder mode only.
- **spec** — BMAD-lite: request → PRD + architecture → sharded story files →
  execute story-by-story (fanning out `deep` subagents). The spine, no ceremony.
- **qa** — dogfood a running web app via the browser; bug report + evidence.
- **design-review** — designer's-eye visual audit via the browser; score + fix.

`qa`/`design-review` drive **`agent-browser`** (Vercel Labs) over a native-arm64
headless **Chromium** baked into the image — works out of the box against a
**localhost** app (the common case).

## Look & feel

**Dracula** theme by default (faithful 51-token palette; `pi-stack` is a bundled
alt — switch via `/settings`). A **powerbar** statusline shows
`git-branch · tokens($cost) · context%` on the left and `provider · model` on the
right (configurable via `/extension-settings`).

## Roadmap (next, designing together)

- **MCP servers** — wire `pi-mcp-adapter` to specific servers per project.
- **external browsing** — `qa`/`design-review` hit localhost today; browsing
  *external* sites from the sandbox needs Chromium pointed at the proxy
  (`--proxy-server`) + trusting the proxy CA. Add when needed.
