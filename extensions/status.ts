// pi-stack — live agent status.
//
// Replaces the opaque "working..." indicator with what the agent is ACTUALLY
// doing: model · phase (awaiting model vs running <tool>) · elapsed · a stall
// warning when nothing has happened for 60s+. Plus a `/status` command and a
// Ctrl+Alt+S shortcut for an on-demand dump.
//
// Defensive by design: every pi API touch is guarded so a payload/shape
// mismatch degrades gracefully and never breaks startup.
export default function (pi: any) {
	let turnStart: number | null = null;
	let toolName: string | null = null;
	let toolStart = 0;
	let lastActivity = Date.now();
	let ui: any = null;
	let ticker: any = null;
	let ctxRef: any = null;
	let aborted = false;

	// Stall watchdog: a turn with no model output (no token/tool event) for this
	// long is a dead stream, not slow thinking — warn, then auto-cancel. Tune via
	// PI_STATUS_STALL_ABORT_MS (0 disables auto-cancel; warning still shows).
	const STALL_WARN_MS = 60000;
	const STALL_ABORT_MS = Number(
		(typeof process !== "undefined" &&
			process.env &&
			process.env.PI_STATUS_STALL_ABORT_MS) ||
			180000,
	);

	// Tools that SHOULD return quickly — a long stall here is a dead network call,
	// safe to auto-cancel fast. Long-running tools (Agent/subagents, bash, builds)
	// are deliberately NOT listed: they get the warning + Esc only, so the watchdog
	// never kills legitimate long work.
	const FAST_TOOLS = new Set(["web_search", "web_fetch", "fetch"]);
	const FAST_TOOL_ABORT_MS = 90000;

	const fmt = (ms: number) => {
		const s = Math.max(0, Math.floor(ms / 1000));
		return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
	};

	// The visible working line is EVENT-DRIVEN (changes only when the tool/phase
	// changes or a stall warning appears), NOT refreshed every second. A live
	// per-second elapsed counter repaints the bottom UI block every tick, which
	// reflows/bounces the powerbar while working. Live elapsed is still available
	// on demand via `/status`. (Was: `awaiting model · 0:01` updated each second.)
	let lastShown: string | null = null;
	const setMsg = (text: string) => {
		if (!ui || text === lastShown) return;
		lastShown = text;
		ui.setWorkingMessage?.(text);
	};
	const renderMsg = (idle: number) => {
		// While stalled, REPLACE (not append) with a short single-line warning. A
		// long appended string can wrap to 2 lines on a narrow terminal, which would
		// flap the loader's height by a line — the one jitter an extension can cause.
		if (idle > STALL_WARN_MS) return `⚠ stalled ${fmt(idle)} · Esc`;
		return toolName ? `running ${toolName}` : "awaiting model";
	};

	// Watchdog only: runs every second to DETECT stalls, but only touches the UI
	// when the displayed text actually changes (stall warning crossing), so a
	// quiet turn produces no per-second repaint.
	const tick = () => {
		try {
			if (!ui || turnStart == null) return;
			const now = Date.now();
			const idle = now - lastActivity;
			// Refresh the stall-warning text only while stalled (no churn when healthy:
			// renderMsg is stable and setMsg dedupes).
			if (idle > STALL_WARN_MS) setMsg(renderMsg(idle));

			// Watchdog: auto-cancel a stall. Model streams and fast network tools get
			// finite thresholds; long tools (Agent/subagents, bash, builds) get
			// abortAt=0 → warning + Esc only, so legit long work is never killed.
			const abortAt =
				STALL_ABORT_MS <= 0
					? 0
					: toolName
						? FAST_TOOLS.has(toolName)
							? FAST_TOOL_ABORT_MS
							: 0
						: STALL_ABORT_MS;
			if (!aborted && abortAt > 0 && idle > abortAt) {
				aborted = true;
				const what = toolName
					? `Tool "${toolName}" returned no output for ${fmt(idle)} (dead network call?)`
					: `Model stream stalled for ${fmt(idle)}`;
				try {
					ctxRef?.ui?.notify?.(
						`⚠ ${what} — auto-cancelling. Resend to retry. (tune PI_STATUS_STALL_ABORT_MS; 0 disables)`,
						"error",
					);
				} catch {
					/* best-effort; must not break the agent */
				}
				try {
					ctxRef?.abort?.();
				} catch {
					/* best-effort; must not break the agent */
				}
			}
		} catch {
			/* best-effort; must not break the agent */
		}
	};

	const start = (ctx: any) => {
		ui = ctx?.ui ?? ui;
		ctxRef = ctx ?? ctxRef;
		turnStart = Date.now();
		lastActivity = Date.now();
		toolName = null;
		aborted = false;
		lastShown = null;
		// Pin a STATIC indicator (no animation). An animated spinner repaints the
		// working row continuously, which also bounces the powerbar while working.
		try {
			ui?.setWorkingIndicator?.({
				frames: [ui.theme?.fg?.("accent", "●") ?? "●"],
			});
		} catch {
			/* best-effort */
		}
		if (!ticker) ticker = setInterval(tick, 1000);
		setMsg(renderMsg(0));
	};
	const stop = () => {
		turnStart = null;
		toolName = null;
		if (ticker) {
			clearInterval(ticker);
			ticker = null;
		}
	};

	const on = (name: string, fn: (e: any, ctx: any) => void) => {
		try {
			pi.on(name, async (e: any, ctx: any) => {
				try {
					fn(e, ctx);
				} catch {
					/* best-effort; must not break the agent */
				}
			});
		} catch {
			/* best-effort; must not break the agent */
		}
	};

	on("turn_start", (_e, ctx) => start(ctx));
	on("turn_end", () => stop());
	on("tool_execution_start", (e) => {
		toolName = e?.toolName ?? e?.name ?? "tool";
		toolStart = Date.now();
		lastActivity = Date.now();
		setMsg(renderMsg(0));
	});
	on("tool_execution_update", () => {
		lastActivity = Date.now();
	});
	on("tool_execution_end", () => {
		toolName = null;
		lastActivity = Date.now();
		setMsg(renderMsg(0));
	});
	on("message_update", () => {
		lastActivity = Date.now();
	});
	on("after_provider_response", () => {
		lastActivity = Date.now();
	});
	on("session_shutdown", () => stop());

	const report = (ctx: any) => {
		const now = Date.now();
		const L: string[] = [];
		if (turnStart == null) {
			L.push("● idle — no active turn");
		} else {
			L.push(`● working · ${fmt(now - turnStart)}`);
			L.push(
				toolName
					? `  tool: ${toolName} · ${fmt(now - toolStart)}`
					: "  phase: awaiting model response",
			);
		}
		try {
			const m = ctx?.model;
			if (m) L.push(`  model: ${m.provider}/${m.id}`);
		} catch {
			/* best-effort; must not break the agent */
		}
		L.push(`  last activity: ${fmt(now - lastActivity)} ago`);
		try {
			const u = ctx?.getContextUsage?.();
			if (u?.tokens != null) L.push(`  context: ~${u.tokens} tokens`);
		} catch {
			/* best-effort; must not break the agent */
		}
		if (turnStart != null && now - lastActivity > 60000)
			L.push(
				"  ⚠ no activity for 60s+ — the model/stream looks stalled. Press Esc to cancel and resend.",
			);
		return L.join("\n");
	};

	try {
		pi.registerCommand("status", {
			description:
				"What is the agent doing right now? (model · phase · elapsed · stall warning)",
			handler: async (_args: any, ctx: any) => {
				try {
					ctx.ui.notify(report(ctx), "info");
				} catch {
					/* best-effort; must not break the agent */
				}
			},
		});
	} catch {
		/* best-effort; must not break the agent */
	}

	try {
		pi.registerShortcut("ctrl+alt+s", {
			description: "Agent status",
			handler: async (ctx: any) => {
				try {
					ctx.ui.notify(report(ctx), "info");
				} catch {
					/* best-effort; must not break the agent */
				}
			},
		});
	} catch {
		/* best-effort; must not break the agent */
	}
}
