---
name: ship
description: Take the working tree from "done" to "PR open" with a quality gate — rebase, run tests + lint, code-review the diff, bump version + changelog, commit, push a branch, open a PR. Stops at PR creation (never auto-merges). Use for "ship", "make a PR", "open a PR", or when the work is ready to land.
---
# ship

Goal: working tree → open PR, with a gate. **Never merge** (stop at PR creation),
never force-push, never push to `main`/`master`.

## Steps
1. **Branch.** If on the default branch, create a feature branch first. Identify
   the base branch from the remote default.
2. **Rebase on base.** Fetch, then rebase onto the base branch. On conflicts,
   abort and report the conflicted files; don't guess through a messy rebase.
3. **Status.** `git status` + `git diff` to see exactly what's shipping.
4. **Tests.** Detect and run the project's test command (package.json scripts,
   Makefile, `pytest`, `cargo test`, …). If tests fail, **STOP** and report;
   never ship red. `verify` the result from real output, not a remembered run.
5. **Lint.** Run the linter if the repo has one. Warnings don't block unless the
   repo treats them as errors. If there's no linter, say so.
6. **Review gate.** Run `code-review` on the diff. If it returns `BLOCK`, fix it
   or surface it before continuing.
7. **Version + changelog.** If the repo has a `VERSION` file and/or
   `CHANGELOG.md`, bump the patch version and add a one-line entry.
8. **Commit.** Imperative subject, the *why* in the body. Follow the repo's
   existing commit convention.
9. **PR.** Push the branch (`-u` if it has no upstream) and `gh pr create` with a
   concise title and this body:
   ```
   ## Summary
   ## Testing
   ## Risks
   ```

Report the PR URL, the test/lint results, and the review verdict. If a step
fails (tests red, rebase conflict, `gh` error), stop and report precisely what
failed so no work is lost. Do not merge or deploy.
</content>
