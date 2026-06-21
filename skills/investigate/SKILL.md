---
name: investigate
description: Root-cause-first debugging — reproduce, investigate, form a falsifiable hypothesis, verify it, THEN fix. Never patch a symptom without a confirmed root cause. Use for "debug this", "why is X broken", "fix this bug", error reports / stack traces, or "it worked yesterday".
---
# investigate

**Iron law: no fix without a confirmed root cause.** A patch that makes the
symptom disappear without an explanation is not a fix.

## Phases
1. **Reproduce.** Get a deterministic repro. If you can't reproduce it, say so
   and gather signal first (logs, stack trace, the recent diff, env).
2. **Investigate.** Read the actual failing code path. When the search space is
   wide, fan out: spawn several `fanout` subagents in parallel (Agent tool,
   `subagent_type=fanout`), each chasing one area/hypothesis, then collect.
3. **Hypothesize.** State the single most likely root cause as a falsifiable
   claim: "X fails because Y at `path:line`."
4. **Verify.** Prove it — add a log, write a failing test, inspect the state. If
   the hypothesis is wrong, return to step 2. Do not skip this.
5. **Fix.** Only now: make the smallest change that addresses the root cause.
   Re-run the repro to confirm it's gone, and add a regression test.

Report: the root cause, the fix (`path:line`), and how you verified it.
