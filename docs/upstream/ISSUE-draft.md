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
shrink**, the differential repaint re-emits the unchanged bottom block relative to
the old `viewportTop`, so it lands `index − viewportTop` = one row higher; it never
re-anchors `viewportTop` to the new bottom.

I have a working proof-of-concept that re-anchors the viewport and repaints the
visible window in place (pulling history back down), with a headless repro test
(fake terminal + ANSI emulator measuring real screen rows) that goes red→green.
**But** it changes the deliberate "full-redraw on a viewport-moving shrink"
behavior and breaks two existing `tui-render` tests (`full re-renders when deleted
lines move the viewport upward`, `clears stale content when maxLinesRendered was
inflated by a transient component`). So before a PR I want to agree on the approach:
narrow the re-anchor to only the small in-viewport shrink case while preserving your
full-redraw safety paths, or treat those two behaviors as intended-to-change. Happy
to implement whichever you prefer.

I'd like to implement this myself.

---

## Notes for us (NOT part of the issue)

+ PoC patch (dist + ported to `src/tui.ts`) and the headless tests live in
  `docs/upstream/tui-bottom-pin/`. The source port **compiles** (`tsgo` clean) and
  passes our repro, but fails 2 of their 23 `tui-render.test.ts` cases — see above.
+ Correct order: issue → maintainer `lgtm` → PR with `npm run check` + `./test.sh`
  green (and **don't** edit `CHANGELOG.md`).
+ The full technical writeup is in `docs/upstream/tui-bottom-pin.md`.
