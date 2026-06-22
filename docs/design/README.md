# pi-stack design

Living design docs for moving Mark's codified agent knowledge off docker-agent
(today in `mcavage-gm-team`) and into pi-stack: one generic stack that runs
anywhere, with the proprietary company integrations plugged in as an overlay only
at work.

How we work: the doc leads. We design here, build against it, and when the build
proves the design wrong we fix the doc first, then the code. Every decision below
is recorded as proposed or locked, with the reason, so we don't re-argue it.

## Architecture

```
CORE  (pi-stack: home, any machine, open-sourceable)
  skills:  generic dev, writing, decision, the memory/learning loop
  agents:  the generic specialists, plus local-model routing via Ollama
  memory:  a host-side JSON-RPC service (built). reviewer becomes a subagent, time becomes an extension
        ^ mixin via --kit / sbx kit add
WORK OVERLAY  (pi-kit-work: private, office only)
  MCP:     opine, snowflake-proxy, chorus, bamboohr, slack
  skills:  the proprietary-data skills and company specifics
  agents:  data-analyst, sales, people-ops
```

The dividing line is generic vs proprietary, not skills vs docker. Memory is
generic and belongs in the core; it runs as a host service the sandboxes call.

## Model tiers

| Tier | Model | Used for |
|---|---|---|
| Local (Ollama, M5) | small Gemma/Qwen class + a local embedder | the watcher, memory embeddings, bulk fanout |
| Frontier Anthropic | opus, haiku | deep work, synthesis |
| Frontier cross-vendor | a non-Anthropic frontier model | review, kept off-Anthropic so its blind spots differ from the main agent |

Exact model tags get confirmed on the machine with `ollama list`, not pinned from
training data.

## The bar for "best stack"

Every conflict between ways of working gets resolved against these:

1. Consistent: same verbs, phases, and output contract across skills.
2. Concise: a skill is a forcing function, not a manual.
3. Output quality: following it reliably produces something shippable.
4. Learns: the system improves with use, on its own.

## Clusters

The ~80 gm-team skills and agent roles, reorganized into ways of working. We
design each as a unit and resolve its conflicts to one best version. We do not
port files.

| # | Cluster | Status |
|---|---|---|
| 1 | [Self-learning loop](./self-learning-loop.md) | **built** (steps 1-3); step 4 + reward attribution are TODO in the doc |
| 2 | Investigate / debug | todo |
| 3 | Spec to build | todo |
| 4 | Review and verification | todo |
| 5 | Ship / PR | todo |
| 6 | Decide / ideate | todo |
| 7 | Deep research / analysis | todo |
| 8 | Writing and voice | todo |
| 9 | Design / UI | todo |
| 10 | Ops cadence | todo |
| 11 | Conventions | todo |
| 12 | Agent roster and orchestration | todo |

## Decision log

| Decision | Status | Reason |
|---|---|---|
| Memory server in TypeScript | locked | pi's extensions are already TS/Node. One language, no third toolchain. Python's venv/uv is the thing we're removing |
| Drop the reviewer MCP | locked | it was a docker-agent crutch for cross-vendor review. pi is natively multi-model and `agents/review.md` already is a cross-vendor subagent |
| Drop the time MCP | locked | pi extensions own this. `timestamps.ts` already proves it. A container is overkill |
| Memory in the core | locked | it's generic, and 61 of 80 skills depend on it. The server is generic, the data is personal, so gitignore `data/` |
| Memory embeddings local | locked | keeps the home core free of external keys |
| Work overlay as a mixin kit | locked | `sbx run --kit` repeats and `sbx kit add/pack/push/pull` exist. Kits are additive (creds, network, files). Others can fork the pattern |
| Capture via a local watcher model | locked | gives us the reward signal we never had. High frequency, privacy-sensitive, small task, so it belongs local on the M5 |
| Watcher model is a swappable env knob | locked | the best small model changes often. Default chosen by bake-off, not by priors |
| Memory store is a host JSON-RPC service, not MCP | locked (built) | the only consumer is a pi extension doing an HTTP POST; MCP's tool-schema layer adds nothing. JSON-RPC is MCP's wire format anyway, so a model-facing surface later is a short hop |
| Extensions talk to the store with node:http, not fetch | locked (built) | pi installs a global undici proxy dispatcher in the sandbox and sbx's NO_PROXY omits host.docker.internal, so fetch() is routed through the proxy and fails. node:http goes direct |
| Watcher reads the user message only | locked (built) | feeding it the agent's reply made it re-capture facts the agent had just restated from memory. User-only kills the feedback loop |
| Watcher default tag | gemma4 (built) | works; a smaller Gemma/Qwen for snappier capture is a future bake-off |
| Entities first-class vs deferred | deferred (built without) | facts + learnings only for now |
| Promotion autonomy | proposed | lean always gated; step 4 not built yet |
| Overlay delivery: kit files vs FROM-pi-stack image | open | pending a spike on whether pi finds kit-delivered skills |

## Spikes

1. Does pi discover skills delivered by a kit's file payload, or only ones baked into the image? **(open, needed for the work overlay)**
2. ~~Is Ollama reachable from the sandbox?~~ **Resolved:** yes, the host service is reached via `host.docker.internal` with `node:http` (the kit allowlist covers the port).
3. ~~Does the TS memory store run standalone with local embeddings?~~ **Resolved:** yes, built and verified.
</content>
