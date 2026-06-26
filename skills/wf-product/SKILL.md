---
name: wf-product
description: Full multi-role product workflow, discovery, PR/FAQ, design, architecture review, peer review, eng handoff. Orchestrates product-manager, designer, and architect subagents in sequence with a user gate at the PR/FAQ. Use for "plan this feature", "product workflow", "write a PRD", or "take this from idea to eng-ready".
---

# wf-product

Idea to eng-ready spec, with a user gate at the PR/FAQ. The point: **force
clarity before investment**. PR/FAQ before PRD. PRD before design. No spec
for something that can't be positioned or built. Output feeds directly into
`spec` (Phase 3) or `tdd`.

## Pipeline at a glance

```
1. Discovery (PM + data research + optional architect, concurrent)
2. PR/FAQ (PM writes)
3. PR/FAQ peer review  →  USER GATE (go / redirect / kill)
4. PRD (PM, from approved PR/FAQ)
5. Design + arch review + DX review (concurrent)
6. Copy review
7. Full peer review
8. Eng handoff
```

## Disk discipline

All state lives on disk, not in context. Working dir: `.pi-agent/product/<feature-slug>/`.

On start: look for `status.json`. If it exists, this is a resume: read it, skip
to the current stage. Otherwise create the dir and write `status.json` with all
stages set to `pending`. Update `status.json` on every stage transition.

Never tell a subagent to "read the PR/FAQ." Paste the relevant section inline.
Each subagent gets a fresh context with only what it needs for its stage.

## Stage 1: Discovery (concurrent subagents)

**Skip if:** the user provides a clear brief with evidence, or this is a small
enhancement with an obvious job to be done.

Fan out the discovery subagents in the same turn (PM and Research always; the
architect when the trigger below applies):

**PM subagent** (strong reasoning model), produce:

- JTBD: "When [situation], I want [motivation], so I can [outcome]."
- Top 3-5 assumptions: confidence, evidence, validation method, impact if wrong
- Competitive landscape for this capability
- Opportunity score (importance + (importance - satisfaction) per `pm-prioritization`)
- Cost of delay (H/M/L with rationale)

**Research subagent** (large-context model). This workflow names **capabilities**, not vendors; resolve each through `capability-routing`, which reads `capabilities.json` and either pulls from the wired provider(s) or tells you it is `none`. A capability that resolves to `none` means degrade to web/files and flag the gap. Pull:

- Usage/adoption signals and customer feedback — resolve each via `capability-routing` (it pulls from whatever providers are wired, or degrades to web/files)
- Any prior internal docs from **docs** or notes from **meeting-notes**

This is a multi-capability join; prefer `code-mode` for the fan-out rather than many separate tool calls.

**Architect subagent** (optional, include when the feature touches infrastructure,
security boundaries, or cross-system integration), produce:

- Feasibility: can the current system support this?
- Known constraints or blockers
- Rough complexity signal (trivial / moderate / hard / research-needed)

Merge the subagent outputs into `discovery.md`. Decision gate: if the recommendation is
"deprioritize," stop and present findings to the user before writing anything.

## Stage 2: PR/FAQ (PM subagent)

Input: `discovery.md` (or the user's direct brief if discovery was skipped).

PR/FAQ structure:

- **Press release:** target customer, key benefit, problem solved (quantified),
  how it works, a realistic customer quote, availability.
- **Customer FAQ:** what it does, who it's for, why over the alternative, what
  it costs, what it does NOT do.
- **Internal FAQ:** strategic fit, eng cost (S/M/L/XL), go-to-market motion,
  top risks, cost of not building.

Self-check before returning: would a customer actually read this press release
and care? Is the benefit specific? Does the internal FAQ honestly address the
hard questions?

Write to `pr-faq.md`.

## Stage 3: PR/FAQ Peer Review, then USER GATE

Run a cross-model peer reviewer on `pr-faq.md` + `discovery.md`. Evaluate:

- Accuracy (claims match evidence)
- Slop score 0-10 (must be <=3 to pass; the press release must read like a human)
- Consistency (no contradictions between press release and internal FAQ)
- Clarity (would the user be able to make a go/no-go from this alone?)

Verdict: PASS / REVISE / REJECT. Max 2 revision loops. If REJECT, escalate to
the user with the rationale: the concept may need rethinking.

**Present to the user:** the aligned PR/FAQ, peer review verdict and scores, and
a clear recommendation. **Wait for the user.** Three outcomes:

- **Go:** proceed to Stage 4.
- **Redirect:** update the PR/FAQ with the user's direction, then proceed.
- **Kill:** archive artifacts, done.

## Stages 4-8: The machine (runs automatically after go)

No further user involvement unless something is infeasible or peer review rejects.
Brief notification at handoff; no approval needed.

**Stage 4, PRD (PM subagent).** Input: approved PR/FAQ + discovery artifact.
Produce: JTBD (refined), problem statement, solution scope (building / NOT
building), requirements with P0/P1/P2 priority and testable acceptance criteria,
at least 5 edge cases, success metrics with baselines and targets, dependencies
and risks, timeline with a 1.5x buffer. Self-check: can an engineer implement
this without asking a question? Write to `prd.md`.

**Stage 5, Concurrent: design + arch review + DX review.** Fire all three
subagents in the same turn; collect all before proceeding.

- *Designer*: top 3 key interactions, all states (empty, loading, error,
  overflow, permission denied), mobile-responsive, realistic data, microcopy
  per `microcopy-patterns`. Write to `design.md`.
- *Architect*: feasibility, hidden dependencies, complexity estimate (S/M/L/XL),
  are acceptance criteria testable, performance/security implications, specific
  PRD changes. Verdict: READY / NEEDS REVISION. If NEEDS REVISION, loop back
  to PM (max 2 rounds). Write to `arch-review.md`.
- *DX consultant* (skip if no developer-facing surface): developer mental model,
  API/CLI surface, composability, progressive disclosure, error experience, naming
  consistency, defaults. Verdict: PASS / SUGGESTIONS. Advisory, not blocking;
  folds into the arch-review revision loop if one is needed. Write to `dx-review.md`.

**Stage 6, Copy review.** Input: `prd.md` + `design.md`. Review all UI copy
for anti-slop (no "seamless", "robust", "leverage", etc.), voice consistency,
microcopy-patterns compliance. If CHANGES NEEDED, apply fixes to `design.md`
directly (no designer loop for copy-only edits). Write to `copy-review.md`.

**Stage 7, Full peer review.** Input: full package. Evaluate accuracy, slop
(<=3), completeness, actionability, and consistency across all artifacts. Verdict:
PASS / REVISE / REJECT. Max 2 revision loops; if REJECT, escalate to the user.
Write to `peer-review.md`.

**Stage 8, Eng handoff.** Collect all artifacts. Update `status.json`:
`eng_ready: true`. Notify the user in one paragraph: feature name, complexity
estimate, peer review verdict. The feature dir is the input to `spec` Phase 3 or
`tdd`. The architect's complexity estimate informs story sizing.

## Skip logic

| Situation | Skip |
|---|---|
| Small enhancement (< 1 day eng) | Stages 1-3; start with PRD directly |
| User provides the PR/FAQ | Stages 1-2; start with peer review |
| User provides the spec | Stages 1-4; start with design + arch review |
| API-only / no UI | Design (Stage 5a) and copy review (Stage 6) |
| No developer-facing surface | DX review (Stage 5c) |
| Urgent / time-boxed | Peer reviews (Stages 3 and 7); note in status.json |

## Escalation policy

Max 2 iteration rounds at any gate. If unresolvable, escalate to the user with
both positions and a recommendation. Escalation should be rare. Never loop
silently: each revision is noted in status.json.
