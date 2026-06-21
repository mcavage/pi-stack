---
name: code-review
description: Review the current diff for correctness and safety, then get a cross-vendor second opinion from the `review` subagent (a different model vendor than yours, so its blind spots differ). Use for "review", "code review", "check my diff", or as a gate before shipping.
---
# code-review

Two passes: your own analysis plus an independent cross-vendor adversary. The
point of the second pass is *different blind spots*, not a rubber stamp.

## Steps
1. **Scope the diff.** `git diff <base>...HEAD` (or the working tree if not yet
   committed). Identify the base branch if you don't know it.
2. **Your pass.** Read the *changed files*, not just the hunks. Hunt for:
   correctness bugs, broken/edge cases, security holes (injection, authz, leaked
   secrets), race conditions, and silent behavior changes. Record each as
   `path:line` + a concrete failure scenario.
3. **Cross-vendor pass.** Spawn a `review` subagent (Agent tool,
   `subagent_type=review`) with the diff and your findings, instructed to
   *refute* your analysis and surface what you missed. It runs on a different
   vendor than your main model on purpose.
4. **Reconcile.** Merge both passes. Drop findings the adversary convincingly
   refutes; keep what survives. De-dup.
5. **Verdict.** Emit `BLOCK` (real defect), `CONCERNS` (worth fixing, not
   blocking), or `LGTM`, followed by the surviving findings (`path:line`, why,
   suggested fix).

Don't invent issues to look thorough, and don't wave through a real one.
