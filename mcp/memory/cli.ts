// Test/CLI harness for the memory store. Run directly with Node 26 (no build):
//   node cli.ts demo
//   node cli.ts remember "Mark prefers main as the default branch"
//   node cli.ts recall "what branch should I use"
//   node cli.ts stats
//
// Uses ./memory.db next to this file unless MEMORY_DB is set.

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "./store.ts";
import { embed, embedderAvailable, embedModel } from "./embeddings.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const dbPath = process.env.MEMORY_DB ?? join(here, "memory.db");

function fmt(n: number): string {
	return n.toFixed(3);
}

async function main() {
	const [cmd, ...rest] = process.argv.slice(2);
	const arg = rest.join(" ");

	const hasEmbedder = await embedderAvailable();
	const store = new MemoryStore(dbPath, hasEmbedder ? { embedder: embed } : {});
	const vecNote = hasEmbedder
		? `vector search ON (${embedModel})`
		: "vector search OFF (no embedder pulled) — full-text only";

	switch (cmd) {
		case "demo": {
			console.log(`Seeding demo memories. ${vecNote}\n`);
			// A realistic mix: durable preferences/facts + perishable state that
			// should rank lower or expire, mirroring the gm-team audit.
			const seed = [
				{ content: "Mark prefers `main` as the default working branch, no long-lived feature branches.", durability: "durable", confidence: 0.95, tags: ["preference", "git"] },
				{ content: "Mark is moving his daily driver off docker-agent (cagent) to pi; pi's ecosystem is preferred.", durability: "durable", confidence: 0.9, tags: ["preference", "tooling"] },
				{ content: "The memory server is written in TypeScript and runs on Node's built-in node:sqlite, no native deps.", durability: "durable", confidence: 0.9, tags: ["decision", "memory"] },
				{ content: "Apply the repo's anti-slop and write-like-mark skills on any doc; no em-dashes, no 'load-bearing'.", durability: "durable", confidence: 0.95, tags: ["feedback", "writing"] },
				{ content: "CI for the deploy pipeline is flaky as of this week; reran twice to get green.", durability: "perishable", ttlDays: 14, confidence: 0.6, tags: ["state"] },
				{ content: "Reviewing PR #482 today for the recall injector extension.", durability: "perishable", ttlDays: 3, confidence: 0.6, tags: ["state"] },
			] as const;
			for (const s of seed) {
				const r = await store.remember({ content: s.content, durability: s.durability as any, ttlDays: (s as any).ttlDays, confidence: s.confidence, tags: [...s.tags] });
				console.log(`  ${r.reaffirmed ? "reaffirm" : "stored  "} ${s.content.slice(0, 70)}`);
			}
			console.log("\nstats:", JSON.stringify(store.stats()));

			for (const q of ["what git branch should I use", "how should I write the design doc", "is the build broken"]) {
				console.log(`\n? recall: "${q}"`);
				const hits = await store.recall(q, { limit: 3 });
				if (!hits.length) console.log("  (nothing)");
				for (const h of hits) {
					console.log(`  [${fmt(h.score)} rel=${fmt(h.relevance)} ${h.row.durability}] ${h.row.content.slice(0, 72)}`);
				}
			}
			break;
		}
		case "remember": {
			if (!arg) return console.log("usage: remember <text>");
			const r = await store.remember({ content: arg });
			console.log(r.reaffirmed ? `reaffirmed ${r.id}` : `stored ${r.id}`);
			break;
		}
		case "recall": {
			if (!arg) return console.log("usage: recall <query>");
			const hits = await store.recall(arg);
			for (const h of hits) console.log(`[${fmt(h.score)}] ${h.row.content}`);
			if (!hits.length) console.log("(nothing)");
			break;
		}
		case "stats":
			console.log(JSON.stringify(store.stats(), null, 2));
			break;
		default:
			console.log("commands: demo | remember <text> | recall <query> | stats");
	}
	store.close();
}

main();
