# pi-stack

My setup for running [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
in a Docker [sbx](https://docs.docker.com/ai/sandboxes/) sandbox. Leverages multiple
models to check each other (today Claude and GPT), plus the skills I use to actually do
stuff, and defaults that work for me (Dracula, emacs, etc.).

It runs full-auto. The VM is disposable and can't reach the host (unless you let it), so there
is nothing to approve, ever.

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

Plus pi-lens for inline type and lint errors (JS/TS, Python, C/C++), a browser,
plan mode, MCP, and web search. Defaults: dracula, emacs keys, thinking
collapsed, a status line, and a watchdog that cancels a stuck call instead of
spinning on "working..." forever.

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
