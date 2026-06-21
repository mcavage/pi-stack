# pi-tui: input box + bottom widgets jump up/down during streaming

**Repo:** `earendil-works/pi` · **Package:** `packages/tui` (`@earendil-works/pi-tui`)
**Affected version:** `0.79.8` **and `0.79.9`** (coding-agent + tui) · **Type:** rendering bug + fix (tested)

> `dist/tui.js` is **byte-identical** in 0.79.8 and 0.79.9, so this bug is present in the
> latest release and the patch applies cleanly to both. Note: 0.79.9 fixes two *related but
> distinct* things at the chat-component level — Markdown streaming **code-fence** shrink/flicker
> (#5846) and clearing stale lines when content shrinks **to zero** — neither of which is this
> renderer-level bottom-block reanchor. The jitter from general markdown re-wrap, the
> `Thinking...` spacer, and tool-row collapse remains.

---

## Summary

While the agent is streaming, the **input editor and any `belowEditor` widgets (e.g. a
status/powerbar) jump up and down by a line**. It happens every time content *above* the
editor changes height — live markdown re-wrapping as tokens arrive, the `Thinking...`
spacer toggling, or a tool row collapsing from "running" to a result.

Root cause is in `TUI.doRender()`: on a buffer **shrink above a bottom-anchored viewport**,
the differential repaint re-emits the unchanged bottom block relative to the *old*
`viewportTop`, so it lands one (or more) rows higher. A large shrink only "pins" by doing a
full-screen clear (`fullRender(true)`), which flickers.

This is **not** fixable from an extension: extensions only own the `status` and `aboveEditor`
rows, which are already constant. The churn is in `chatContainer`, rendered entirely by pi.

## Reproduction (headless, deterministic)

A self-contained harness drives the **real** `TUI` class against a fake terminal and an ANSI
emulator that tracks cursor moves / `\r\n` scroll / `\x1b[2K` / clear+home + scrollback, then
reads the *physical screen row* of sentinel `EDITOR_ROW` / `POWERBAR_ROW` / `FOOTER_ROW`
lines. Scenario: render an N-line buffer (bottom-anchored), then render again with the chat
region 1 line shorter and the bottom block unchanged.

**Unpatched result** (`ROWS=12`, 19→18 line buffer):

```
[Frame A] initial:         editor:9  powerbar:10 footer:11   viewportTop=7
[Frame B] chat shrinks 1:  editor:8  powerbar:9  footer:10   viewportTop=7   ← jumped up 1 row
RESULT: FAIL — bottom block moved
```

Integrity check shows the visible window after the shrink is misaligned (history not pulled
down; a blank row accumulates at the bottom):

```
row 8:  got="EDITOR_ROW"   exp="CHAT_14"
row 11: got=""             exp="FOOTER_ROW"
```

## Root cause (line refs vs `packages/tui` `doRender()`)

The early-return paths handle first-render, width change, height change, and the optional
`clearOnShrink`. Everything else falls into the differential pass, which computes
`firstChanged..lastChanged` and repaints **relative to the unchanged `prevViewportTop`**. When
`newLines.length < previousLines.length` and the viewport was glued to the bottom
(`prevViewportTop === previousLines.length - height`), the bottom block's *buffer indices*
shrink while `viewportTop` stays fixed, so each bottom line is emitted at
`index − viewportTop` = a higher screen row. (A shrink large enough that
`firstChanged < prevViewportTop` is only "pinned" via a full clear.)

## Fix

Insert one self-contained branch right after the `clearOnShrink` early-return, before the
differential diff. On a **bottom-anchored shrink**, re-anchor `viewportTop` to
`newLines.length - height` and repaint the visible window *in place* with real buffer content,
so lines that scrolled just out of view above are pulled back down and the bottom block keeps
its exact screen rows — no blanks, no full clear.

Guards keep it strictly scoped: bottom-anchored before **and** after the shrink, no overlays,
`clearOnShrink` off, divergence at/below the new (lower) anchor (`firstDiff >= newViewportTop`,
so the pulled-in history and the scrollback above it already match the terminal), and no kitty
images in the visible window (those use the existing reservation path). 68 lines added, nothing
removed.

> The diff below is against the compiled `dist/tui.js` for byte-exact reproducibility with the
> published package; the change maps directly onto `doRender()` in `packages/tui/src/tui.ts`.

```diff
@@ doRender(), immediately after the clearOnShrink early-return @@
         // Content shrunk below the working area ... clearOnShrink path ...
             fullRender(true);
             return;
         }
+        // Bottom-block pin: when content SHRINKS above a bottom-anchored viewport,
+        // the differential pass below would re-emit the unchanged bottom block
+        // (editor / powerbar / footer) one or more rows higher, so the input box
+        // visibly jumps up during streaming (markdown re-wrap, "Thinking..." spacer
+        // toggling, tool rows collapsing). Instead, re-anchor the viewport to the
+        // new bottom and repaint the visible window in place with the real buffer
+        // content. Lines that scrolled just out of view above are pulled back down
+        // to fill the freed rows, and the bottom block keeps its exact screen rows.
+        //
+        // Guards: bottom-anchored before AND after the shrink, no overlays,
+        // clearOnShrink off (handled above), divergence within the previously-
+        // visible region (so pulled-in history matches scrollback), and no kitty
+        // images in the visible window (those need the reservation path below).
+        if (this.overlayStack.length === 0 &&
+            prevViewportTop > 0 &&
+            prevViewportTop === this.previousLines.length - height &&
+            newLines.length < this.previousLines.length &&
+            newLines.length >= height &&
+            this.previousKittyImageIds.size === 0) {
+            const newViewportTop = newLines.length - height;
+            let firstDiff = 0;
+            const minLen = Math.min(newLines.length, this.previousLines.length);
+            while (firstDiff < minLen && newLines[firstDiff] === this.previousLines[firstDiff]) {
+                firstDiff++;
+            }
+            let visibleImage = false;
+            for (let r = 0; r < height; r++) {
+                if (isImageLine(newLines[newViewportTop + r] ?? "")) {
+                    visibleImage = true;
+                    break;
+                }
+            }
+            if (firstDiff >= newViewportTop && !visibleImage) {
+                let buffer = "\x1b[?2026h";
+                const screenCursorRow = Math.max(0, Math.min(height - 1, hardwareCursorRow - prevViewportTop));
+                if (screenCursorRow > 0) {
+                    buffer += `\x1b[${screenCursorRow}A`;
+                }
+                buffer += "\r";
+                for (let r = 0; r < height; r++) {
+                    if (r > 0)
+                        buffer += "\r\n";
+                    buffer += "\x1b[2K";
+                    buffer += newLines[newViewportTop + r] ?? "";
+                }
+                buffer += "\x1b[?2026l";
+                this.terminal.write(buffer);
+                this.cursorRow = newLines.length - 1;
+                this.hardwareCursorRow = newLines.length - 1;
+                this.maxLinesRendered = Math.max(this.maxLinesRendered, newLines.length);
+                this.previousViewportTop = newViewportTop;
+                this.positionHardwareCursor(cursorPos, newLines.length);
+                this.previousLines = newLines;
+                this.previousKittyImageIds = this.collectKittyImageIds(newLines);
+                this.previousWidth = width;
+                this.previousHeight = height;
+                return;
+            }
+        }
         // Find first and last changed lines
         let firstChanged = -1;
```

**Patched result** — bottom block stays at `9/10/11` across the 1-line shrink (and it
re-anchors `viewportTop 7 → 6` instead of moving the block); the visible window matches the
expected bottom-anchored slice with no blanks.

## Regressions considered (all covered by tests, all green)

- **Growth / steady-state** — branch requires `newLines.length < previousLines.length`; untouched.
- **Fits-on-screen (top-anchored)** — `newLines.length >= height` + `prevViewportTop > 0` guards skip it, so content legitimately moves up (no phantom top blank).
- **Multi-line shrink** — pinned smoothly *without* a full clear (the original needed `fullRender(true)`).
- **Shrink + footer content change** — changed footer repainted at the same row.
- **Overlays / `clearOnShrink` / width+height change / first render** — all return before the branch.
- **Kitty images** — skipped when any image is tracked or visible → existing image-aware path.
- **Scrollback fidelity** — `firstDiff >= newViewportTop` guarantees pulled-in lines (and scrollback above) already match the terminal.

## Test artifacts

`emulator.mjs` (ANSI terminal emulator), `test.mjs` (main repro), `edge.mjs` (regressions),
`integrity.mjs` (content/scrollback fidelity). Each imports the real installed `TUI`.

```
BEFORE (original):  test FAIL(3)   edge FAIL(3)   integrity FAIL(4)
AFTER  (patched):   test PASS      edge PASS      integrity PASS
```
