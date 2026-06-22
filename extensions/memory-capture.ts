// pi-stack — capture (client side).
//
// When a prompt finishes, hand the exchange to the host memory service, which
// runs the watcher and decides what's worth remembering. The agent never chooses
// to remember; this just forwards the turn. Fire-and-forget and defensive: it
// must never delay or break a turn, and if the service is down it does nothing.
//
//   MEMORY_URL  default http://host.docker.internal:11435

import { basename } from "node:path";

const MEMORY_URL = process.env.MEMORY_URL ?? "http://host.docker.internal:11435";

const safe = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
	try {
		return await fn();
	} catch {
		return undefined;
	}
};

let rpcId = 0;
function notify(method: string, params: any): void {
	// Fire-and-forget: don't await, don't let errors surface.
	void fetch(MEMORY_URL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
		signal: AbortSignal.timeout(15000), // the watcher runs a local model; give it room
	}).catch(() => {});
}

function currentProject(ctx: any): string | null {
	const cwd = (typeof ctx?.cwd === "string" && ctx.cwd) || process.cwd();
	const name = basename(cwd);
	return name && name !== "/" ? name : null;
}

// Pull the latest user prompt and the agent's final reply out of session history.
function lastExchange(ctx: any): { user: string; assistant: string } {
	const hist =
		(typeof ctx?.sessionManager?.history === "function"
			? ctx.sessionManager.history()
			: ctx?.sessionManager?.entries) ?? [];
	const text = (e: any): string =>
		typeof e?.content === "string" ? e.content : (e?.text ?? "");
	const isRole = (e: any, r: string) => e?.role === r || e?.type === r;
	const rev = [...hist].reverse();
	const user = text(rev.find((e: any) => isRole(e, "user")));
	const assistant = text(rev.find((e: any) => isRole(e, "assistant")));
	return { user, assistant };
}

export default function (pi: any) {
	// agent_end = the whole prompt is done (one capture per exchange, not per
	// internal agent loop iteration).
	pi.on("agent_end", async (_event: any, ctx: any) =>
		safe(async () => {
			const { user, assistant } = lastExchange(ctx);
			if (!user || user.trim().length < 12) return; // skip trivial
			if (user.trim().startsWith("/")) return; // skip slash commands
			notify("observe", { user, assistant, project: currentProject(ctx) });
		}),
	);
}
