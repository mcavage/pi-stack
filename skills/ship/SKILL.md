---
name: ship
description: Take the working tree from "done" to "PR open" with a quality gate — run tests, code-review the diff, bump version + changelog, commit, push a branch, open a PR. Stops at PR creation (never auto-merges). Use for "ship", "make a PR", "open a PR", or when the work is ready to land.
---
# ship

Goal: working tree → open PR, with a gate. **Never merge** — stop at PR creation.

## Steps
1. **Branch check.** If on the default branch (`main`/`master`), create a
   feature branch first. Identify the base branch.
2. **Status.** `git status` + `git diff` to see exactly what's shipping.
3. **Tests.** Detect and run the project's test command (package.json scripts,
   Makefile, `pytest`, `cargo test`, …). If tests fail, **STOP** and report —
   never ship red.
4. **Review gate.** Run the `code-review` skill on the diff. If it returns
   `BLOCK`, fix it or surface it before continuing.
5. **Version + changelog.** If the repo has a `VERSION` file and/or
   `CHANGELOG.md`, bump the patch version and add a one-line entry.
6. **Commit.** Stage and commit — imperative subject line, the *why* in the body.
7. **PR.** Push the branch and `gh pr create` with a title + body (summary, test
   evidence, the review verdict). Print the PR URL.

Report the PR URL and the review verdict. Do not merge or deploy.
