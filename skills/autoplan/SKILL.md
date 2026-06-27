---
name: autoplan
description: Full pre-build review pipeline. Runs idea shaping, scope review, architecture review, product review, and a peer quality gate sequentially with auto-decisions, then presents a final approval gate. Use when the user says "autoplan", "review everything", "full pipeline", or wants a rough idea fully vetted before building.
---
# autoplan

One command: rough idea in, fully reviewed plan out. Each phase runs to
completion before the next begins. Never run phases in parallel.

## Decision principles (auto-answer intermediate questions)

1. **Completeness first.** Pick the approach that covers more edge cases.
2. **Fix the blast radius.** If something adjacent is broken and costs less than
   a day of agent effort to fix, approve the expansion.
3. **Pragmatic.** Two options fix the same thing? Pick the cleaner one.
4. **DRY.** Duplicates existing functionality? Reject. Reuse what exists.
5. **Explicit over clever.** 10-line obvious fix beats 200-line abstraction.
6. **Bias toward action.** Merge over endless review cycles.

**Decision types:**
- **Mechanical** (one clearly right answer): auto-decide silently.
- **Taste** (reasonable people disagree): auto-decide with a note, surface at
  the final gate.
- **User challenge** (agents recommend changing the user's stated direction):
  NEVER auto-decided. Held for the final gate with: what the user said, what
  the agents recommend, why, missing context, and cost if we're wrong.

## Phases

### Phase 1: Shape (idea -> design doc)
Run `brainstorm`. Auto-decide intermediate questions with the principles above.
Two exceptions: context selection and premise agreement are never auto-decided.
Output: design doc written to `DESIGN.md`.

### Phase 2: Scope review (design doc -> reviewed plan)
Run `spec` on the design doc. Focus on scope: what's in, what's out, and why.
Auto-approve expansions that are in the blast radius and under one day of effort.
Output: reviewed plan with scope decisions noted.

### Phase 3: Architecture review
With the reviewed plan, evaluate: data flow, dependencies, failure modes,
and recommended tech stack. Flag anything that is harder than it looks or
has hidden infrastructure assumptions.
Output: architecture assessment.

### Phase 4: Product review
With the reviewed plan and architecture assessment, evaluate: job-to-be-done
clarity, scope appropriateness, measurable success criteria, and what to cut.
Output: product assessment.

### Phase 5: DX review (developer-facing only)
Skip if the plan involves no APIs, CLIs, or SDKs. Otherwise evaluate: naming,
mental models, error surfaces, onboarding friction, and composability.
Output: DX assessment (or marked skipped).

### Phase 6: Peer quality gate
Run `code-review` over all artifacts from Phases 1-5. Verdict: PASS / REVISE /
REJECT. On REVISE: fix and re-submit (max 2 iterations). On REJECT: surface to
the user with a full explanation.

### Phase 7: Final approval gate
Present to the user:
1. **Summary.** One paragraph on what was reviewed and the verdict.
2. **Taste decisions.** Each auto-decided choice where reasonable people could
   disagree. User can override any of them.
3. **User challenges.** Any place multiple phases recommend changing the user's
   stated direction. User decides.
4. **Artifacts.** List all documents with paths.
5. **Next step.** Recommend `spec`, `tdd`, `ship`, or another skill.

## Notes

- Long-running skill (expect 20-60 minutes). Print a progress marker between
  phases so the user knows where things stand.
- If any phase fails, report what completed and what did not. Never silently
  skip a phase.
- The user can interrupt at any phase boundary. Save progress to disk before
  moving on.
