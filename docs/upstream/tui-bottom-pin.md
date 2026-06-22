# pi-tui: input box + bottom widgets jump up/down during streaming

**Repo:** `earendil-works/pi` · **Package:** `packages/tui` (`@earendil-works/pi-tui`)
**Affected:** `0.79.8` **and `0.79.9`** (`dist/tui.js` is byte-identical in both) · **Type:** rendering bug + fix (tested)

> 0.79.9 fixes two *related but distinct* chat-component things — Markdown streaming
> **code-fence** shrink/flicker (#5846) and clearing stale lines when content shrinks **to zero** —
> neither of which is this renderer-level reanchor. The jitter from general markdown re-wrap, the
> hidden `Thinking...` spacer, and tool-row collapse remains.

## Summary

While the agent streams, the **input editor and any `belowEditor` widgets (e.g. a powerbar) jump
up a row and back down**, repeatedly, whenever content *above* the editor gets shorter — markdown
re-wrapping as tokens arrive, the hidden `Thinking...` spacer toggling, or a tool row collapsing
from "running" to its result.

Root cause is in `TUI.doRender()` (`packages/tui/src/tui.ts`): on a **bottom-anchored buffer
shrink whose change lies *within* the visible window**, the differential render path repaints from
`firstChanged` relative to the *un-re-anchored* `viewportTop`, so the unchanged bottom block is
re-emitted `index − viewportTop` = one row higher. It never re-anchors `viewportTop` to the new
bottom. (This is *not* fixable from an extension — extensions only own the `status`/`aboveEditor`
rows, which are already constant; the churn is in `chatContainer`, rendered entirely by pi.)

## Why only *this* shrink (not the ones that already full-redraw)

`doRender()` already routes other shrinks correctly, verified with `PI_DEBUG_REDRAW=1`:

- **Deleted-tail shrink** (`firstChanged >= newLines.length`) → `deleted lines moved viewport up`
  → `fullRender(true)`. ✅ already pinned (via full redraw).
- **Change above the viewport** (`firstChanged < prevViewportTop`, e.g. a "stuck-high" viewport
  left by a transient overlay) → `firstChanged < viewportTop` → `fullRender(true)`. ✅ already
  cleared.
- **Change *within* the viewport** (`firstChanged >= prevViewportTop`) → falls through to the
  differential loop, which does **not** re-anchor `viewportTop` → **the bottom block drifts up.**
  ← this is the bug, and the only path that needs fixing.

## Fix

Insert one guarded branch **after** the `firstChanged < prevViewportTop` full-redraw guard and
before the differential render loop. On a bottom-anchored shrink it re-anchors `viewportTop` to
`newLines.length - height` and repaints the whole visible window in place (synchronized output),
pulling the lines that scrolled just above back down — so the bottom block keeps its exact screen
rows, with no jump and no full-screen clear.

Placement matters: it sits **below** the two `fullRender(true)` guards, so the deliberate
full-redraw-on-shrink behaviours are untouched. Scoped by guards: bottom-anchored before *and*
after the shrink, no overlays, no kitty images in the visible window.

Full patch (renderer + tests): **`tui-bottom-pin/tui-src.patch`** (`git apply` from the repo root).

## Tests — all green

Against `packages/tui/test/tui-render.test.ts` (`node --test`): **24 / 24 pass.**

- All 22 pre-existing differential/shrink/image/resize cases: unchanged, still pass.
- One pre-existing assertion updated **with justification**: `clears stale content when
  maxLinesRendered was inflated by a transient component` asserted a *mechanism*
  (`fullRedraws > before`). The pin clears the inflated/stale rows in place at the earlier shrink,
  so the later full redraw is no longer needed. Its **real contract is unchanged** and still
  asserted: no stale `Chat 12/13/14`, and `viewport === [Chat 5..11, Editor 0..2]` (verified
  byte-for-byte).
- One **new** test added: `pins the bottom block in place on a small bottom-anchored shrink (no
  jump, no full redraw)` — the editor/footer keep their screen rows across a 1-line chat shrink and
  `fullRedraws` does not increase.

Gate checks: `tsgo` build clean, `biome check` clean on both files.

### Supplementary headless harness (`tui-bottom-pin/`)

`emulator.mjs` (ANSI terminal emulator that tracks cursor/scroll/`\x1b[2K`/clear + scrollback),
`test.mjs` / `edge.mjs` / `integrity.mjs` — drive the real `TUI` and read the *physical screen
row* of `EDITOR_ROW`/`POWERBAR_ROW`/`FOOTER_ROW` sentinels.

```
BEFORE (original):  test FAIL(3)   edge FAIL(3)   integrity FAIL(4)   tui-render 21/23
AFTER  (patched):   test PASS      edge PASS      integrity PASS      tui-render 24/24
```

(`edge.mjs` scenario 1 exercises an *in-viewport* multi-line shrink — an *above*-viewport shrink
correctly full-redraws and is not a jitter case.)

## Vendored locally

This fix is also applied at build time in pi-stack's image (`scripts/patches/`), independent of
upstream, so the sandboxes get it now. Upstreaming lets that vendored patch be dropped.
