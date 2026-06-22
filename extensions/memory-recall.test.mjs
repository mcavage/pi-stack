// Proves the auto-recall logic without a running pi: seed a store, then for a
// couple of prompts show the exact block the injector would append to the system
// prompt. Run: node extensions/memory-recall.test.mjs
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryStore } from "../mcp/memory/store.ts";
import { embed, embedderAvailable } from "../mcp/memory/embeddings.ts";
import { buildRecallBlock } from "./memory-recall.ts";

const db = join(tmpdir(), `pi-recall-test-${process.pid}.db`);
const hasEmb = await embedderAvailable();
console.log(hasEmb ? "vector search ON" : "vector search OFF (full-text only)");
const store = new MemoryStore(db, hasEmb ? { embedder: embed } : {});

await store.remember({ content: "Mark prefers `main` as the default working branch, no long-lived feature branches.", durability: "durable", confidence: 0.95, tags: ["preference", "git"] });
await store.remember({ content: "Apply the repo's anti-slop and write-like-mark skills on any doc; no em-dashes, no 'load-bearing'.", durability: "durable", confidence: 0.95, tags: ["feedback", "writing"] });
await store.remember({ content: "The memory server is TypeScript on Node's built-in node:sqlite, no native deps.", durability: "durable", confidence: 0.9, tags: ["decision"] });
await store.remember({ content: "Reviewing PR #482 today for the recall injector.", durability: "perishable", ttlDays: 3, confidence: 0.6 });

for (const prompt of ["what git branch should I use here", "help me write the design doc", "what should I name a variable"]) {
	console.log(`\n=== before_agent_start, user prompt: "${prompt}" ===`);
	const block = await buildRecallBlock(store, prompt);
	console.log(block ?? "(no injection — nothing relevant)");
}

store.close();
