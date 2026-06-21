---
name: spec
description: Spec-first build loop (BMAD-lite). Turn a feature request into a PRD + lightweight architecture, shard it into self-contained story files, then execute story-by-story — each story context-complete, fanning out subagents. Use for a feature/project bigger than a quick edit, or "spec this out", "plan and build X", "let's do this properly".
---
# spec  (BMAD-lite: spec → shard → build)

Compile a fuzzy request into context-complete work orders, then execute them.
The point: **think hard once**, then let each unit run **fresh and fully briefed**
so the agent never drifts or runs out of context. Keep the spine; skip the
role-play. Scale ceremony to the work — a 2-story feature doesn't need a 10-page
PRD.

## Phase 1 — Spec (think hard, once)
1. **Understand.** Restate the goal in a few sentences; ask only the 1–3
   questions you truly need. If it's still exploratory, run `brainstorm` first.
2. **PRD** → `docs/spec/PRD.md`: problem, goals / non-goals, the epics, and
   numbered functional requirements with acceptance criteria.
3. **Architecture** → `docs/spec/architecture.md`: stack, components, data models,
   key patterns/constraints, and the affected-file map. **Read the real codebase
   first** and match what exists.

## Phase 2 — Shard (compile to work orders)
4. **Story files** → `docs/spec/stories/NN-<slug>.md`, each SELF-CONTAINED: the
   requirement(s) it satisfies, the architecture constraints that apply, explicit
   acceptance criteria, the files it touches, and dev notes. Litmus test: an
   agent that has read ONLY this file could implement it. Sequence them and note
   dependencies.

## Phase 3 — Build (execute, story-by-story)
5. For each story, in dependency order:
   - Implement it. For independent stories, **fan out** — one `deep` subagent per
     story in parallel (Agent tool, `subagent_type=deep`), each handed only its
     story file.
   - Gate with `code-review` (cross-vendor `review` subagent) before "done".
   - Tick off the acceptance criteria; update the story file with what changed.
6. When all stories pass, run `ship`.

If a story reveals the spec was wrong, **stop and fix the spec, then re-shard the
affected stories.** The spec is the source of truth — not the code.
