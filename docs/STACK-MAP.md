# pi-stack — capability map

What you actually reach for across **Claude Code / opencode / cagent**, mapped to
pi-stack coverage. Built from the usage interview (2026-06-20).

**Legend:** ✅ have it · ⚙️ native, needs config · 📦 add a marketplace package · 🔨 build it

## Coverage

| You use… (source) | Status | How / what to do |
|---|---|---|
| Per-agent model routing (cagent) | ✅ | `agents/*.md` presets — `fanout`=haiku, `review`=gpt-5.5, `deep`=opus |
| Background tasks (Claude Code) | ✅ | tintinweb subagents (background + queue); pi-crew async/detached runs |
| Rewind / checkpoints (Claude Code) | ✅ ⚙️ | native session tree — `--fork`, `/tree`, bookmarks; + `git-checkpoint` for file state |
| Model cycling · Ctrl+P (opencode) | ⚙️ | native `--models a,b,c` — set your squad in the kit entrypoint |
| Custom slash commands (Claude Code) | ⚙️ | prompt templates in `prompts/` (`/name`) + `registerCommand`; populate `prompts/` |
| Session continuity (gap #2) | ⚙️ 🔨 | native `-c`/`-r`/`--session-dir`/`--name`; **wire `--session-dir` to the mounted workspace** so sessions survive sandbox recreation |
| **Declarative agent teams** (cagent · gap #1) | 📦 | **`pi-crew`** — builtin teams (fast-fix/implementation/review/research) + agents (analyst/executor/reviewer/verifier…), a planner that sizes fanout, worktree isolation |
| Checkpoint / undo (gap #3) | 📦 | bundled `git-checkpoint` + `bookmark` examples (snapshot + jump-back) |
| Vim / modal editing (opencode) | 🔨 | no turnkey package — port the bundled `modal-editor` example |
| **cagent tabs** | 🔨 | no package — build a session-tabs TUI extension (heaviest; build on pi's session-switch + custom-component UI API) |

## Plan, by effort

**Quick wins — config/wiring (do before the shakedown):**
1. ⚙️ **Session continuity** — entrypoint `pi --session-dir .pi-sessions`; survives sandbox recreation, resume with `pi -c`/`-r`. (gitignore `.pi-sessions/`.)
2. ⚙️ **Model cycle** — `--models opus,sonnet,gpt-5.5,haiku` for Ctrl+P.
3. ⚙️ **Populate `prompts/`** with your common slash commands.

**Add packages — one `pi install` each:**
4. 📦 **`pi-crew`** — declarative teams = your cagent muscle, native to pi.
5. 📦 **`git-checkpoint`** + **`bookmark`** (bundled examples) — checkpoint/undo.

**Builds — real work:**
6. 🔨 **Vim/modal editor** — port the bundled `modal-editor` example.
7. 🔨 **Tabs** — session-tabs TUI extension (medium/large).

## Decisions to make
- **pi-crew vs tintinweb subagents.** pi-crew is the *team-orchestration* layer (declarative, planner, builtin roles, child-process isolation); tintinweb is *ad-hoc* subagents. They overlap. Recommended: trial pi-crew, point it at our `agents/*.md`, and if it subsumes ad-hoc use, consolidate on it.
- **Session-dir location.** Workspace-relative (`.pi-sessions/` in each repo, gitignored) vs a dedicated persisted volume. Workspace-relative is simplest and per-project.

## Explicitly NOT building (you didn't mark these)
Hooks · share links · MCP-toolsets-as-a-must · shareable agent artifacts · opencode
session sharing. Skipped on purpose — revisit only if real use proves otherwise.
