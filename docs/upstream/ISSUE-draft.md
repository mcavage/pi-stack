# DRAFT — Contribution Proposal issue for earendil-works/pi

> Template: **Contribution Proposal** (`.github/ISSUE_TEMPLATE/contribution.yml`).
> Fields below map to: What / Why / How.
>
> ⚠️ Per CONTRIBUTING.md the issue must be **short (one screen) and in your own
> voice** — they explicitly reject LLM-written text and one screen is the limit.
> **Rewrite this in your words before posting.** This is raw material, not a paste.
> Also: new-contributor issues are auto-closed by default; a maintainer reopens
>
> + replies `lgtm` before you may PR. Don't open a PR first.

---

### What do you want to change?

While pi is streaming a reply, the input box (and any `belowEditor` widget like a
powerbar) jumps up by a row and back down, repeatedly, whenever the content above
the editor gets shorter — markdown re-wrapping as tokens arrive, the hidden
`Thinking...` line toggling, or a tool row collapsing to its result. Goal: keep the
input block visually still during streaming.

### Why?

It's a constant distraction during normal use — the cursor/input line bounces on
almost every streamed reply, not an edge case. `hideThinkingBlock` only removes one
source of it.

### How? (optional)

Root cause is in `packages/tui/src/tui.ts` `doRender()`: on a **bottom-anchored
shrink whose change is within the visible window** (`firstChanged >= prevViewportTop`),
the differential loop re-emits the unchanged bottom block relative to the old
`viewportTop`, one row higher — it never re-anchors `viewportTop`. The shrinks that
already `fullRender(true)` (deleted-tail; change above the viewport) are a different
path and are fine.

I have a fix that adds one guarded branch **after** those full-redraw guards: it
re-anchors `viewportTop` to the new bottom and repaints the visible window in place.
It passes the full `tui-render` suite (24/24 — adds a regression test; updates one
assertion that checked a *mechanism*, `fullRedraws > before`, which the in-place
clear makes unnecessary — that test's real contract, no stale rows + exact viewport,
is unchanged and still asserted). `tsgo` + `biome` clean.

I'd like to implement this myself — patch + tests are ready.

---

## Notes for us (NOT part of the issue)

+ Source patch (`src/tui.ts` + `tui-render.test.ts`) is `tui-bottom-pin/tui-src.patch`;
  headless harness + the full writeup are alongside in `docs/upstream/`. Verified:
  `tui-render` 24/24, `tsgo` build clean, `biome` clean.
+ Correct order: issue → maintainer `lgtm` → PR with `npm run check` + `./test.sh`
  green (and **don't** edit `CHANGELOG.md`).
+ The same fix is vendored into our image (`scripts/patches/`) so we have it now;
  upstreaming lets us drop the vendored copy.
