---
name: health
description: Code-quality dashboard that runs the project's checks, scores each category 0-10, shows week-over-week trends, and ranks fixes by impact. Use for "health check", "how's the code quality", "show me the score", or before running ship.
---
# health

Run every detectable quality check, score the results, compare to history, and
emit a compact dashboard with the highest-impact fixes first.

## Detection

Auto-detect from project files. Mark a category SKIPPED (not CRITICAL) if the
project genuinely has no tool for it. Never invent a tool that isn't there.

| Category | Weight | Detect via |
|---|---|---|
| Tests | 30% | `package.json` scripts, `pytest.ini`, `go.mod`, `Cargo.toml` |
| Type check | 22% | `tsc`, `pyright`, `mypy`, `cargo check` |
| Lint | 18% | `eslint`, `ruff`, `flake8`, `golangci-lint`, `cargo clippy` |
| Dead code | 15% | `knip`, `ts-prune`, `vulture`, `deadnix` |
| Shell lint | 10% | `shellcheck` (only if shell scripts exist) |
| Other | 5% | formatting drift, schema validation, generated-file drift |

Composite = sum of (score * weight), rounded to one decimal. Exclude SKIPPED
categories from the denominator.

## Scoring

- **10:** clean pass, zero findings
- **8-9:** pass with minor non-blocking warnings
- **5-7:** some failures, localized or easy to fix
- **2-4:** major failures or blocked developer workflow
- **0-1:** category broken or dangerously noisy

Tests failing on critical paths score lower than lint failures at the same
volume. Missing type coverage in a typed project scores below 6. Shell lint
below 10 only matters when shell scripts actually exist.

## Status labels

CLEAN (9-10), WARNING (7-8.9), NEEDS WORK (4-6.9), CRITICAL (0-3.9).

## Steps

1. Detect tools, print what was found and what was skipped.
2. Run each detected tool once. Capture command, exit code, duration, key output.
3. Score each category. Never hide a failure.
4. Read `data/health-history.jsonl` if it exists; find the closest run from 7
   days ago (or the most recent earlier run) for trend comparison.
5. Emit the dashboard (see format below).
6. Append one JSONL record to `data/health-history.jsonl`.

## Dashboard format

```
HEALTH DASHBOARD
Repo: <name>  Branch: <branch>  Commit: <sha>

Overall: 8.3/10  WARNING  (+0.7 WoW)

Tests:      9.0  CLEAN
Type check: 8.5  WARNING
Lint:       6.0  NEEDS WORK
Dead code:  5.5  NEEDS WORK
Shell lint: 10.0 CLEAN
Other:      8.0  WARNING

What ran: ...
Trends: ...
Recommendations (by impact): ...
```

Trend language: Up (>= +0.5), Flat (< 0.5 change), Down (>= -0.5). Only call
out meaningful deltas.

## History record

```json
{"timestamp":"ISO-8601","repo":"name","branch":"branch","commit":"sha","scores":{"tests":8.5,"typecheck":10,"lint":7,"deadcode":6,"shelllint":10,"other":8},"overall":8.3}
```

## Recommendations

Sort by impact: (1) broken tests on changed paths, (2) type-safety regressions,
(3) high-volume lint that hides signal, (4) dead code with maintenance drag,
(5) shell issues affecting release flows, (6) nice-to-have cleanup.

Each recommendation: what it is, why it matters, estimated scope, expected score
lift.

## Guardrails

- Do not claim CLEAN when major categories failed.
- Do not penalize categories the project does not use.
- Do not bury a CRITICAL finding under a strong composite score.
- Prefer evidence (command output, line counts) over general statements.

## Closing

Three lines: current state (one sentence), top fix (highest-impact next step),
ship risk (low/medium/high with reason).

When the score is low, suggest running `investigate` to dig into root causes or
`tdd` to build coverage back up. If health is strong, `ship` is the natural
next step.
