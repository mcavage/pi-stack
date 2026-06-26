---
name: wf-prototype
description: Fast prototype workflow, spec-lite, design+build, then review. Use for "prototype X", "build me a quick X", "mock this up and make it work", or "I want to see what X looks like". Not for production code; use wf-engineering for that.
---
# wf-prototype

GM orchestrates directly. No PR/FAQ, no multi-week pipeline. Goal: a working
thing the user can see and interact with, as fast as possible.

Total target: under 45 minutes agent-time.

**Not for production code.** The prototype proves the concept. When the user
wants to ship it, transition to wf-engineering for hardening.

## Working directory

Artifacts go in `.pi-agent/prototype/<slug>/`: `spec.md`, `design.md`,
`arch-notes.md`, `review-report.md`, `qa-report.md`.

If the project is a git repo, create branch `prototype/<slug>`.

## Stage 1: Quick Spec (5 min)

Produce a focused spec, not a PRD. Write `spec.md` with:

- **What:** 1-2 sentences on what's being built
- **For:** the specific persona
- **Key Interactions:** top 3, each as "user does X, sees Y"
- **Success Criteria:** 2-3 checkboxes
- **NOT Building:** explicit scope exclusions
- **Data:** real or realistic fake (decide now)

If still fuzzy on what to build, run `brainstorm` first.

## Stage 2: Design + Architecture (run in parallel)

**2a, Design.** Produce working UI components for the top 3 interactions
(`design-system` skill for component conventions). React + Tailwind + shadcn/ui.
Cover all states: empty, loading, populated, error. Realistic data, not Lorem
ipsum. Single-file if possible, under 500 lines. Output: `design.md`.

**2b, Architecture notes.** Lightweight guidance only: recommended stack and
file structure, data model if needed, API endpoints if needed, key libraries and
why, gotchas the engineer should know. Output: `arch-notes.md`.

Skip 2a for CLI tools or when the user supplies a design. Skip 2b for pure UI
prototypes with no backend. Skip both for trivial work under 50 lines.

## Stage 3: Build (15 min)

Input: spec + design + arch notes. Build the working prototype:

- Implement the top 3 interactions; use the designer's components as a starting
  point
- Wire up data (real or fake per spec)
- Run the build or start command to confirm it compiles and opens
- Commit to the prototype branch

**Speed over polish.** Skip tests, skip non-critical error handling, hard-code
config values. QA will check manually in Stage 4.

## Stage 4: Review (concurrent, lightweight)

Fan out three fast passes in parallel (one subagent each), then collect:

- **Code review** (`code-review` skill): does it build, no obvious crashes, no
  security red flags (exposed secrets, XSS, injection). Verdict: APPROVE or
  REQUEST CHANGES. No BLOCK for prototypes.
- **Copy review:** are button labels clear, are error messages helpful, any slop
  in UI text. Apply fixes directly, no loop.
- **QA** (`qa` skill): do the top 3 interactions work, any crashes on obvious
  paths, do all states render. Happy path + one error path.

**Retry rule:** one round maximum for code or QA fixes. This is a prototype.
Ship it.

## Stage 5: Ship

Present to the user:
- What was built (tie to the spec)
- How to run it
- What works (the 3 interactions) and what does not (known limits)
- Branch name
- "Want to iterate, or transition to wf-engineering for production?"

The user sees one touchpoint: the working prototype. No intermediate approvals.

## Transition to production

If the user wants to ship it: the spec, arch-notes, and prototype branch become
input to wf-engineering. wf-engineering Stage 1 (arch-spec) starts from the
arch notes. The engineer refactors prototype code into production quality. Full
`code-review`, `qa`, and `verify` apply. The prototype branch stays as-is;
wf-engineering opens a fresh branch from the default branch.
