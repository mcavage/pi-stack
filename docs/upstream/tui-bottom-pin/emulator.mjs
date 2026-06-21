// Minimal terminal emulator: applies the ANSI byte stream that pi-tui's
// doRender() emits and tracks the physical grid + scrollback so we can read
// back the absolute screen row of any sentinel text.
//
// Supported sequences (the only ones doRender/positionHardwareCursor emit):
//   \x1b[?2026h / \x1b[?2026l   begin/end synchronized output  -> ignored
//   \x1b[2J                     clear visible screen
//   \x1b[H                      cursor home (top-left of visible screen)
//   \x1b[3J                     clear scrollback
//   \r                          carriage return (col -> 0)
//   \n                          line feed (row++, scroll/append if needed)
//   \x1b[NA / \x1b[NB           cursor up / down
//   \x1b[NG                     cursor to absolute column N (1-indexed)
//   \x1b[2K                     clear current line
//   SGR / OSC / APC sequences   treated as zero-width (consumed)
//   printable text              written at the cursor, advancing the column

export class TerminalEmulator {
	constructor(columns, rows) {
		this.columns = columns;
		this.rows = rows; // visible height
		this.lines = [""]; // absolute physical lines (scrollback + screen)
		this.cur = 0; // absolute cursor row (index into this.lines)
		this.col = 0;
	}

	get height() {
		return this.rows;
	}

	// Top of the visible screen in absolute coordinates.
	screenTop() {
		return Math.max(0, this.lines.length - this.rows);
	}

	ensureRow(r) {
		while (this.lines.length <= r) this.lines.push("");
	}

	clampVisible() {
		// keep at most a bounded scrollback so tests stay cheap
		const maxKeep = this.rows + 200;
		if (this.lines.length > maxKeep) {
			const drop = this.lines.length - maxKeep;
			this.lines.splice(0, drop);
			this.cur = Math.max(0, this.cur - drop);
		}
	}

	writeCharsAt(text) {
		this.ensureRow(this.cur);
		let line = this.lines[this.cur];
		// pad with spaces up to col
		if (line.length < this.col) line = line + " ".repeat(this.col - line.length);
		const before = line.slice(0, this.col);
		const after = line.slice(this.col + text.length);
		this.lines[this.cur] = before + text + after;
		this.col += text.length;
	}

	lineFeed() {
		this.cur += 1;
		this.ensureRow(this.cur);
		this.clampVisible();
	}

	// Feed a chunk of bytes written by the renderer.
	write(s) {
		let i = 0;
		const n = s.length;
		let pending = "";
		const flush = () => {
			if (pending) {
				this.writeCharsAt(pending);
				pending = "";
			}
		};
		while (i < n) {
			const ch = s[i];
			if (ch === "\x1b") {
				flush();
				const next = s[i + 1];
				if (next === "[") {
					// CSI: \x1b[ <params> <final letter>
					let j = i + 2;
					let params = "";
					while (j < n && /[0-9;?]/.test(s[j])) {
						params += s[j];
						j++;
					}
					const final = s[j];
					this.handleCSI(params, final);
					i = j + 1;
					continue;
				} else if (next === "]") {
					// OSC: \x1b] ... (BEL | ST)
					let j = i + 2;
					while (j < n && s[j] !== "\x07" && !(s[j] === "\x1b" && s[j + 1] === "\\")) j++;
					if (j < n && s[j] === "\x1b") j++; // skip ST backslash next
					i = j + 1;
					continue;
				} else if (next === "_") {
					// APC: \x1b_ ... (BEL | ST)
					let j = i + 2;
					while (j < n && s[j] !== "\x07" && !(s[j] === "\x1b" && s[j + 1] === "\\")) j++;
					if (j < n && s[j] === "\x1b") j++;
					i = j + 1;
					continue;
				} else {
					// unknown single-char escape; skip ESC + next
					i += 2;
					continue;
				}
			} else if (ch === "\r") {
				flush();
				this.col = 0;
				i++;
			} else if (ch === "\n") {
				flush();
				this.lineFeed();
				i++;
			} else if (ch === "\x07") {
				flush();
				i++;
			} else {
				pending += ch;
				i++;
			}
		}
		flush();
	}

	handleCSI(params, final) {
		const num = (def) => {
			const v = parseInt(params.replace(/[?]/g, ""), 10);
			return Number.isFinite(v) ? v : def;
		};
		switch (final) {
			case "h":
			case "l":
				// mode set/reset (incl ?2026 synchronized output) -> ignore
				return;
			case "A": { // cursor up
				const k = num(1);
				this.cur = Math.max(this.screenTop(), this.cur - k);
				return;
			}
			case "B": { // cursor down
				const k = num(1);
				this.cur = this.cur + k;
				this.ensureRow(this.cur);
				this.clampVisible();
				return;
			}
			case "G": { // cursor to absolute column (1-indexed)
				const k = num(1);
				this.col = Math.max(0, k - 1);
				return;
			}
			case "J": {
				const mode = num(0);
				if (mode === 2) {
					// clear visible screen
					const top = this.screenTop();
					for (let r = top; r < this.lines.length; r++) this.lines[r] = "";
				} else if (mode === 3) {
					// clear scrollback: keep only visible region
					const top = this.screenTop();
					if (top > 0) {
						this.lines.splice(0, top);
						this.cur = Math.max(0, this.cur - top);
					}
				}
				return;
			}
			case "H": {
				// cursor home = top-left of visible screen
				this.cur = this.screenTop();
				this.col = 0;
				return;
			}
			case "K": {
				// clear line (mode 2 / 0) -> clear whole current line for our purposes
				this.ensureRow(this.cur);
				this.lines[this.cur] = "";
				return;
			}
			default:
				return; // ignore others
		}
	}

	// --- inspection helpers ---
	visibleLines() {
		const top = this.screenTop();
		const out = [];
		for (let r = 0; r < this.rows; r++) {
			out.push(this.lines[top + r] ?? "");
		}
		return out;
	}

	// screen row (0-based) of the first visible line containing `needle`, or -1
	rowOf(needle) {
		const vis = this.visibleLines();
		for (let r = 0; r < vis.length; r++) {
			if (vis[r].includes(needle)) return r;
		}
		return -1;
	}
}
