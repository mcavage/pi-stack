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

const SYSTEM = `You read ONE message a user sent to their coding agent and extract only what is worth remembering for future sessions, plus the user's sentiment. You see ONLY the user's message, never the agent's reply, so every fact must come from what the user themselves said.

Be very conservative. Most messages contain nothing worth saving. Saving noise is worse than saving nothing.

Return JSON:
- "facts": durable facts, preferences, or decisions the user asserts about themselves, their tools, or how they want to work. Each self-contained and reusable weeks from now.
- "corrections": instructions where the user tells the agent to stop doing something or do it differently ("don't X", "always Y"). Phrase each as a durable rule.
- "valence": -1 (frustrated) to 1 (pleased) reading the user's tone. 0 if neutral.

Hard rules:
- Only what the USER asserts. A QUESTION states no facts ("which branch do I use?" => no facts).
- NEVER a fact about mood or feelings; that is what valence is for.
- Acknowledgments ("thanks", "great", "cool", "that works") => empty facts and corrections.
- Code, file names, and one-off task details are NOT durable facts.
- When in doubt, leave it out. Empty arrays are the common, correct answer.

Examples:
"thanks, that works great" => {"facts":[],"corrections":[],"valence":1}
"which branch should I use, and what machine am I on?" => {"facts":[],"corrections":[],"valence":0}
"always squash before merging" => {"facts":["The user wants commits squashed before merging."],"corrections":[],"valence":0}
"no, don't hardcode the port, read it from env" => {"facts":[],"corrections":["Read the port from the environment; do not hardcode it."],"valence":-0.3}

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

// Only the user's message is read, by design: facts must come from what the user
// says, never from the agent restating something it recalled.
export async function watch(user: string): Promise<WatchResult | null> {
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
					{ role: "user", content: user },
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
