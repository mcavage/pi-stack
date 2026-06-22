// Local embeddings via Ollama. Optional and swappable: if no embedder model is
// pulled, the store falls back to full-text search and keeps working. Pinning a
// model here would be wrong (the best small embedder changes); it's an env knob,
// confirmed with `ollama list`, not from anyone's memory.

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const EMBED_MODEL = process.env.MEMORY_EMBED_MODEL ?? "nomic-embed-text";

let disabled = false; // flip off after the first hard failure, so we don't spam

export async function embed(text: string): Promise<number[] | null> {
	if (disabled) return null;
	try {
		const res = await fetch(`${OLLAMA_HOST}/api/embed`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: EMBED_MODEL, input: text }),
		});
		if (!res.ok) {
			disabled = true;
			return null;
		}
		const json = (await res.json()) as { embeddings?: number[][] };
		const vec = json.embeddings?.[0];
		return vec && vec.length ? vec : null;
	} catch {
		disabled = true;
		return null;
	}
}

// Probe once so callers can report whether vector search is live.
export async function embedderAvailable(): Promise<boolean> {
	const v = await embed("probe");
	return v !== null;
}

export const embedModel = EMBED_MODEL;
