// pi-stack memory service (host side).
//
// One global store, living on the host, that every sandbox talks to. This is
// Option B: the sandbox is a microVM with no arbitrary host bind-mounts, so a
// single shared SQLite file can't just be mounted everywhere. Instead the store
// runs here on the host (single writer, persistent, global) and sandboxes reach
// it over host.docker.internal.
//
// The wire format is JSON-RPC 2.0 over a single HTTP endpoint. Not MCP: the only
// consumer is a pi extension doing fetch(), so MCP's tool-schema layer would add
// nothing. But JSON-RPC IS the format MCP rides on, so if we ever want a
// model-facing surface over this same store, it's a short hop, not a rewrite.
//
// Embeddings run against the host's own Ollama (127.0.0.1:11434 by default).
// Run it: `node mcp/memory/server.ts` (or `make memory-serve`).

import { createServer, type IncomingMessage } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "./store.ts";
import { embed, embedderAvailable } from "./embeddings.ts";

const PORT = Number(process.env.MEMORY_PORT ?? 11435);
// Loopback by default; Docker Desktop forwards host.docker.internal:PORT here.
const BIND = process.env.MEMORY_BIND ?? "127.0.0.1";
const DB = process.env.MEMORY_DB ?? join(homedir(), ".pi-stack", "memory", "memory.db");

const hasEmb = await embedderAvailable();
const store = new MemoryStore(DB, hasEmb ? { embedder: embed } : {});

// JSON-RPC method handlers. Each takes params, returns a result (or throws).
const methods: Record<string, (p: any) => Promise<unknown> | unknown> = {
	health: () => ({ ok: true, vector: hasEmb }),
	stats: () => store.stats(),
	recall: async (p) => {
		const hits = await store.recall(String(p?.query ?? ""), {
			limit: p?.limit,
			charBudget: p?.charBudget,
			project: p?.project ?? null,
			kind: p?.kind,
		});
		return {
			hits: hits.map((h) => ({
				content: h.row.content,
				score: h.score,
				kind: h.row.kind,
				durability: h.row.durability,
				project: h.row.project,
			})),
		};
	},
	remember: (p) =>
		store.remember({
			content: String(p?.content ?? ""),
			kind: p?.kind,
			durability: p?.durability,
			ttlDays: p?.ttlDays,
			confidence: p?.confidence,
			project: p?.project ?? null,
			tags: p?.tags,
			source: p?.source,
		}),
	forget: (p) => ({ ok: store.forget(String(p?.id ?? "")) }),
};

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (c) => {
			data += c;
			if (data.length > 1_000_000) req.destroy();
		});
		req.on("end", () => resolve(data));
		req.on("error", reject);
	});
}

async function handleOne(msg: any): Promise<any> {
	const id = msg?.id ?? null;
	const fn = methods[msg?.method];
	if (typeof msg?.method !== "string" || !fn)
		return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
	try {
		const result = await fn(msg.params ?? {});
		return { jsonrpc: "2.0", id, result };
	} catch (e: any) {
		return { jsonrpc: "2.0", id, error: { code: -32603, message: String(e?.message ?? e) } };
	}
}

const server = createServer(async (req, res) => {
	const reply = (code: number, obj: unknown) => {
		res.writeHead(code, { "content-type": "application/json" });
		res.end(JSON.stringify(obj));
	};
	if (req.method !== "POST") return reply(405, { error: "POST JSON-RPC only" });
	let parsed: any;
	try {
		parsed = JSON.parse(await readBody(req));
	} catch {
		return reply(200, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
	}
	// Single call or JSON-RPC batch.
	const out = Array.isArray(parsed)
		? await Promise.all(parsed.map(handleOne))
		: await handleOne(parsed);
	reply(200, out);
});

server.listen(PORT, BIND, () => {
	console.log(
		`memory service (json-rpc) on http://${BIND}:${PORT}  (db ${DB}, vector ${hasEmb ? "on" : "off"})`,
	);
});
