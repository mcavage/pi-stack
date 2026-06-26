---
name: wf-engineering
description: Full engineering pipeline. Orchestrates spec->build with role-preset subagents (architect, engineer, qa-lead, review) across parallel worktrees. Use for "build this feature", "full engineering pass", or any non-trivial change that needs design, implementation, review, QA, and a verification gate.
---
# wf-engineering

Tight orchestration loop: arch spec -> impl plan -> parallel impl (worktrees) -> cross-vendor code review -> QA + security (concurrent) -> verification gate -> ship. No stage is optional except where skip logic allows. All pipeline state lives on disk.

## Pre-flight

1. Check for `.pi-agent/eng/<feature-slug>/status.json`. If it exists, this is a resume: read it and skip to the current stage.
2. Detect git: `git rev-parse --is-inside-work-tree`. If yes, create feature branch from default branch. If no, scratch mode (skip branch management).
3. Create `.pi-agent/eng/<feature-slug>/` for all artifacts. Add `.pi-agent/` to `.gitignore`.
4. Baseline: run the project's build and test commands (detect from package.json, Makefile, go.mod, Cargo.toml, etc.). Record build/test pass and test count. Note pre-existing failures; do not chase them later.
5. Write initial `status.json` with all stages pending, baseline recorded, and `repo_root` from `git rev-parse --show-toplevel`.

## Stage 1: Arch spec (architect subagent, skip for bug fixes <~50 lines)

Prompt the architect to produce: component design, interface definitions, data flow, technology decisions, risks, and testability notes. Write to `arch-spec.md`. If the change has a developer-facing surface, include a DX pass (API shape, naming, composability, progressive disclosure, defaults) in the same spec. Update status.json.

## Stage 2: Impl plan (architect subagent)

From the arch spec (or task description if Stage 1 skipped), produce:
- Ordered implementation units, each with files to touch, approach, and complexity (S, M, L).
- Dependency graph.
- Parallelization groups: units in the same group MUST touch disjoint files. List every file per unit and cross-check. Any overlap forces the unit into a later sequential step.
- Per-unit: exact files the engineer needs to read (context budget).
- Build/test command to verify each unit.

Mark parallel groups clearly:
```
Step 1 (sequential): Unit A, foundation types
Step 2 (parallel): Unit B (cmd/foo.go), Unit C (internal/state.go), Unit D (docs/foo.md)
Step 3 (sequential): Unit E, wire together
```

Run a consistency check (architect): does every arch-spec component have an impl unit? Does every impl unit trace to the spec? Any parallel group file conflicts? Verdict PASS or ISSUES FOUND. One revision loop max. Update status.json.

## Stage 3: Implementation (engineer subagent, parallel via worktrees)

**Sequential units:** work on the feature branch directly. Read only the files listed in the plan. Run build + tests. Commit with imperative subject, `why` in the body, following the repo's existing convention.

**Parallel units:** the orchestrator (not the engineer) sets up worktrees before launching agents.

```bash
git worktree add .pi-agent/eng/<slug>/worktrees/<unit> -b feat/<slug>/<unit> HEAD
```

Fire one engineer subagent per unit in the same turn (all concurrent). Each agent gets:
- Its worktree absolute path for all file operations and bash calls.
- Only the files listed for its unit.
- Build/test commands.
- Instruction to commit before returning.

After all agents complete, the orchestrator merges each unit branch back sequentially (`git merge --no-ff`). A merge conflict means the plan was wrong about disjointness: resolve manually. Then clean up worktrees and unit branches (`git worktree remove --force`, `git branch -D`, `git worktree prune`). Run full build + tests on the feature branch. Update status.json.

Context discipline: each engineer gets a fresh context window with only its unit's plan section and the listed source files. Never tell an agent to "refer to the arch spec." Paste the relevant section. Disk is the bridge between stages.

## Stage 4: Code review (cross-vendor reviewer, via `code-review`)

Diff from the feature branch base + arch spec as input. Evaluate: correctness vs spec, design adherence, security basics, error handling, test coverage, user-facing surface consistency (help text, docs, examples). Verdict: APPROVE, REQUEST CHANGES (max 2 fix loops back to engineer), or BLOCK (escalate to user, stop). Write `review-report.md`. Update status.json.

## Stages 5 + 6: QA and security (concurrent)

Launch both in the same turn. Neither depends on the other's output.

**QA (qa-lead subagent):** Run full test suite. Enumerate uncovered edge cases (nulls, boundaries, error paths). Write tests for gaps. Re-run. Audit user-facing surfaces not covered by tests (help text, docs, examples). Write `qa-report.md`. Update status.json.

**Security (security-lead subagent, skip for refactor/docs/test-only):** STRIDE threat model, OWASP Top 10, supply chain audit on new dependencies, secrets scan, auth/authz review. Findings CRITICAL or HIGH: fix loop (max 2), then escalate. MEDIUM or LOW: note and proceed. Write `security-report.md`. Update status.json.

## Stage 7: Verification gate (orchestrator enforces, no skip)

Run `verify` on each of these. Do not proceed until all pass.

- **Tests:** full suite, zero failures, test count >= baseline, new tests for new behavior (confirmed by QA report).
- **Docs:** help text matches shipped behavior, README/docs updated for any API/CLI/config change, examples actually run.
- **UAT:** build from the feature branch, run the happy path, run one error path, read the output. Not just "no crash." Send back to engineer if broken.
- **Peer review** (skip for bug fixes <~50 lines, test-only, docs-only): send diff + arch spec + QA report to a reviewer subagent. Verdict PASS/REVISE/REJECT. One revision loop max.

Write verification results to status.json. Only after all checks pass, proceed.

## Post-pipeline

1. Confirm all worktrees are removed. Clean up any that remain.
2. Update status.json: all stages complete, pr_url if opened.
3. Summary to user: what was built (arch spec reference), code review verdict, QA results (passed/failed/added), security findings, branch name, commit log.
4. On user approval: rebase the feature branch onto the latest default branch in a worktree (never in the main working directory). Resolve any conflicts there. If >3 conflicts or structural changes, ask first. Never force-push. Then `ship`.

## Skip logic

| Change type | Skip |
|---|---|
| Bug fix <~50 lines | Stage 1, DX review, Stage 7 peer review |
| Simple feature | Stage 1 |
| Refactor | Stage 6, DX review if no API/CLI changes, Stage 7 peer review |
| Docs-only | Stages 4-6, DX review |
| Test-only | Stage 1, Stage 6, DX review |
| Never skip | Stage 7a (tests), 7b (docs), 7c (UAT) |

## Retry and escalation

Max 2 retry loops per stage. On the third failure, escalate to the user with: what was tried, what failed, and a recommendation. Never loop silently.
