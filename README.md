# pi-stack

A coding agent that runs **full-auto** — no "allow this command?" prompts, ever —
because it lives in a disposable Docker [sbx](https://docs.docker.com/ai/sandboxes/)
sandbox that can't reach your host unless you let it. The VM is throwaway and
isolated, so there's nothing to approve and nothing it can hurt.

Two model vendors run live and check each other ([pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
with Claude + GPT today), plus the skills I actually use to ship. Personal defaults
(Dracula, emacs keys) are just defaults — swap them.

## Try it

You need `sbx` installed and API keys for Claude/GPT (I haven't tested with subscriptions).

```bash
sbx secret set -g anthropic
sbx secret set -g openai
sbx secret set -g github
sbx run pi-stack --kit "git+https://github.com/mcavage/pi-stack.git#dir=pi-kit"
```

sbx stores the keys and its proxy hands them to the providers, so they stay out
of the VM. The last line pulls the image and starts pi in the current directory.

## What's in it

Two model vendors, live at the same time. `/model` switches, `Alt+P` cycles.
Subagent presets run on different models: a cheap one for breadth, the other
vendor for a second opinion, the strongest one for the hard part.

Skills (in `skills/`):

- `ship`: run tests, code-review, then open a PR with gh
- `code-review`: review the diff, then have a second model argue against it
- `investigate`: find the root cause before changing code
- `spec`: write a short plan, then build against it
- `qa` and `design-review`: drive a headless browser against a running app

Those are the highlights; the public image ships ~35 generic dev, writing, and
harness skills in total (the exact set is the allowlist in `.dockerignore`).
Company-specific overlay skills live in a separate private kit and aren't included.

Plus pi-lens for inline type and lint errors (JS/TS, Python, C/C++), `gh`,
`gws`, a browser, plan mode, MCP, and web search. Defaults: dracula, emacs keys, thinking
collapsed, a status line, and a watchdog that cancels a stuck call instead of
spinning on "working..." forever.

## Optional integrations (data tools)

Beyond the model keys, pi-stack can reach external data through a set of
**optional** tools. They're independent — set up the ones you want, skip the rest.
Skills ask for a *capability* (`chat`, `docs`, `github`, …), not a vendor, and
degrade cleanly to web/files when a provider isn't wired (see `capabilities.json`
and the `capability-routing` skill), so nothing breaks if a tool is absent.

Credentials never enter the sandbox: tokens are injected by the sbx proxy or
brokered by a small **host-side** service. One command starts the host services,
another shows status:

```bash
make serve         # start the host HTTP services: memory, gws-token
make pull-models   # pull the local Ollama models the memory loop needs (watcher + embed)
make mcp-register  # register the stdio MCP servers (slack) with the sbx gateway
make doctor        # per tool: is it set up? is its service running / registered? models pulled?
```

Registering a stdio MCP server does **not** put it in a sandbox — local stdio
servers aren't surfaced by dynamic `mcp-find`, and there's no attach-to-running.
You have to *start* the sandbox with them:

```bash
make run MCP="slack"   # == sbx run pi-stack --kit ./pi-kit --mcp slack .
```

| tool | capability | one-time setup | reaches the VM via |
|---|---|---|---|
| **gh** | `github` | `gh auth token \| sbx secret set -g github` | sbx proxy injects the token |
| **gws** | `gworkspace` | `gws auth login` on the host | host token service (`:11441`) |
| **slack** | `chat` | refs in `config/op-refs.env`, then `make mcp-register` | stdio MCP via the sbx gateway (`op run` pulls creds from 1Password) |
| **memory** | — | `make pull-models` (a local [Ollama](https://ollama.com) + a watcher model for fact capture and an embed model for semantic recall; recall degrades to keyword-only and capture is skipped — loudly — without them) | host service (`:11435`) |
| gateway catalog (atlassian, notion, granola, linear, …) | `issues` / `docs` / … | register with `sbx mcp add` | the sbx gateway; `make run MCP="<name>"` to eager-load |

Company-specific connectors (a Snowflake warehouse proxy, a BambooHR directory,
a CRM) live in a private overlay, not in this repo.

## Bring your own skills

A skill is a `SKILL.md`: a name, a note on when to use it, and the steps. Two
ways to add yours.

Per project: drop it in `.pi/skills/` and pi-stack finds it when it runs there.

For every run: put your skills in a mixin kit and pass a second `--kit`. Kits
stack.

```bash
sbx run pi-stack \
  --kit "git+https://github.com/mcavage/pi-stack.git#dir=pi-kit" \
  --kit ./my-kit
```

A mixin kit is a folder with a `spec.yaml` (`kind: mixin`) and a `files/` tree;
anything under `files/home/.pi/agent/skills/` lands in the skills directory. Same
trick covers prompts, extensions, env, and network rules. Format is in
[Docker's kit docs](https://docs.docker.com/ai/sandboxes/customize/kits/).

## Build from source

To change the image, the baked-in skills, or the extensions:

```bash
git clone https://github.com/mcavage/pi-stack
cd pi-stack
docker login dhi.io   # the base image is dhi.io/node (needs a DHI-entitled Docker account)
make load      # build the image, load it into sbx
make install   # put a `pi-stack` command on your PATH
pi-stack       # run it anywhere (keys set as above)
```

Run `make load` after changing the Dockerfile, a skill, or an extension. If you
only changed the kit in `pi-kit/`, a fresh `make run` is enough. `make publish`
pushes the image to Docker Hub, and a GitHub Action does it on version tags.

## For agents

If you are an agent working in this repo, read [AGENTS.md](AGENTS.md): the
layout, the build and run loop, how to write skills and extensions, and the
mistakes not to repeat.
