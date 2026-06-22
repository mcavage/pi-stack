// The watcher: a small local model that reads one finished exchange and decides
// what, if anything, is worth remembering. This is the capture half of the loop,
// and the point is that it runs without the agent (or you) having to choose to
// remember anything.
//
// It runs on the host (next to the store) against the host's Ollama, so the
// model never ships in the image and the sandbox never has to reach it. Model is
// an env knob (default gemma4), chosen by bake-off, not pinned from memory.

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const WATCHER_MODEL = process.env.MEMORY_WATCHER_MODEL ?? "gemma4";

export interface WatchResult {
	facts: string[]; // durable facts/preferences/decisions the user stated
	corrections: string[]; // lessons from the user correcting the agent
	valence: number; // -1 frustrated .. 0 neutral .. 1 pleased
}

const SYSTEM = `You watch ONE finished turn between a user and their coding agent and extract only what is worth remembering for future sessions.

Be very conservative. Most turns contain nothing worth saving. Saving noise is worse than saving nothing.

Return JSON:
- "facts": durable facts, preferences, or decisions the USER stated about themselves, their tools, or how they want to work. Each self-contained and reusable weeks from now.
- "corrections": lessons where the user corrected the agent ("don't do X", "do Y instead"). Phrase each as a durable rule.
- "valence": -1 (frustrated) to 1 (pleased), how the user felt about the agent's work. 0 if neutral or unclear.

Hard rules:
- NEVER extract a fact about the user's mood, satisfaction, or feelings. That is what valence is for. "The user was happy" is not a fact.
- Acknowledgments and reactions ("thanks", "great", "cool", "that works", "perfect") contain NO facts and NO corrections. Return empty arrays.
- Questions, task-specific details, code, file names, and the agent's own statements are NOT facts.
- If something is a correction, put it only in corrections, not also in facts.
- When in doubt, leave it out. Empty arrays are the common, correct answer.

Examples:
User: "thanks, that works great" / Agent: "glad it helped" => {"facts":[],"corrections":[],"valence":1}
User: "always squash before merging" / Agent: "ok" => {"facts":["The user wants commits squashed before merging."],"corrections":[],"valence":0}
User: "no, don't hardcode the port, read it from env" / Agent: "fixed" => {"facts":[],"corrections":["Read the port from the environment; do not hardcode it."],"valence":-0.3}

Output only the JSON.`;

const SCHEMA = {
	type: "object",
	properties: {
		facts: { type: "array", items: { type: "string" } },
		corrections: { type: "array", items: { type: "string" } },
		valence: { type: "number" },
	},
	required: ["facts", "corrections", "valence"],
};

export async function watch(user: string, assistant: string): Promise<WatchResult | null> {
	try {
		const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: WATCHER_MODEL,
				stream: false,
				format: SCHEMA,
				options: { temperature: 0 },
				messages: [
					{ role: "system", content: SYSTEM },
					{ role: "user", content: `User said:\n${user}\n\nAgent replied:\n${assistant}` },
				],
			}),
		});
		if (!res.ok) return null;
		const j = (await res.json()) as { message?: { content?: string } };
		const content = j?.message?.content;
		if (!content) return null;
		const p = JSON.parse(content);
		const strs = (v: unknown): string[] =>
			Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
		return {
			facts: strs(p.facts),
			corrections: strs(p.corrections),
			valence: typeof p.valence === "number" ? Math.max(-1, Math.min(1, p.valence)) : 0,
		};
	} catch {
		return null;
	}
}
