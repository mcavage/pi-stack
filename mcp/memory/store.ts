// pi-stack memory store.
//
// The data layer only: store facts and learnings, score them, hand back a small
// high-signal working set. No loop logic lives here (that's the extensions). No
// dependencies: Node's built-in node:sqlite (SQLite 3.53+, FTS5) does the work.
//
// Two design choices that come straight from auditing the old gm-team store:
//   1. Every record is durable or perishable. A preference is durable. "MCP
//      Gateway rolling out as of Jun 8" is perishable and gets a clock, so it
//      ages out instead of ranking forever.
//   2. Recall is SCORED, not dumped. The old store ranked everything flat
//      (confidence was always 1.0). Here score combines match relevance,
//      confidence, recency, how often a fact's been reaffirmed, and a reward
//      term the watcher will set later.

import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";

export type Kind = "fact" | "learning";
export type Durability = "durable" | "perishable";

export interface RememberInput {
	content: string;
	kind?: Kind; // default "fact"
	durability?: Durability; // default "durable"
	ttlDays?: number; // required-ish for perishable; default 14
	confidence?: number; // 0..1, default 0.8
	source?: string; // "user" | "watcher" | "import" | ...
	tags?: string[];
}

export interface MemoryRow {
	id: string;
	kind: Kind;
	content: string;
	durability: Durability;
	confidence: number;
	frequency: number;
	reward: number;
	access_count: number;
	created_at: string;
	last_accessed: string | null;
	expires_at: string | null;
	source: string;
	tags: string; // JSON array
	embedding: string | null; // JSON number[]
}

export interface Scored {
	row: MemoryRow;
	score: number;
	relevance: number;
}

export interface RecallOptions {
	limit?: number; // default 8
	charBudget?: number; // default 1200 — the working set stays small on purpose
	kind?: Kind;
}

// Embedder is injected so it's swappable and the store works without one.
export type Embedder = (text: string) => Promise<number[] | null>;

const RECENCY_HALFLIFE_DAYS = 90; // durable facts decay slowly; perishable ones hard-expire
const MIN_RELEVANCE = 0.15; // drop weak matches so the working set stays signal, not padding

// Embedding models have a high similarity baseline: nomic-embed-text scores
// unrelated short texts around 0.45 cosine and genuinely-related ones 0.6+. So
// raw cosine can't be used as relevance directly (everything would clear the
// floor). Rescale [VEC_FLOOR..VEC_CEIL] -> [0..1] so unrelated lands near zero.
// These are embedder-specific; revisit when MEMORY_EMBED_MODEL changes.
const VEC_FLOOR = 0.45;
const VEC_CEIL = 0.8;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  rowid       INTEGER PRIMARY KEY,
  id          TEXT UNIQUE NOT NULL,
  kind        TEXT NOT NULL,
  content     TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  durability  TEXT NOT NULL,
  confidence  REAL NOT NULL,
  frequency   INTEGER NOT NULL DEFAULT 1,
  reward      REAL NOT NULL DEFAULT 0,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  last_accessed TEXT,
  expires_at  TEXT,
  source      TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',
  embedding   TEXT,
  deleted_at  TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(content);
`;

function nowIso(): string {
	return new Date().toISOString();
}

function hashContent(s: string): string {
	return createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}

// Build a safe FTS5 MATCH expression: quote each word, OR them together.
function ftsQuery(q: string): string {
	const terms = q
		.toLowerCase()
		.split(/[^a-z0-9]+/i)
		.filter((t) => t.length > 1);
	if (!terms.length) return "";
	return terms.map((t) => `"${t}"`).join(" OR ");
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class MemoryStore {
	private db: DatabaseSync;
	private embed: Embedder | null;

	constructor(path: string, opts: { embedder?: Embedder } = {}) {
		this.db = new DatabaseSync(path);
		this.db.exec("PRAGMA journal_mode = WAL;");
		this.db.exec(SCHEMA);
		this.embed = opts.embedder ?? null;
	}

	close(): void {
		this.db.close();
	}

	// Reaffirm an existing identical memory (bump frequency + confidence) instead
	// of storing a duplicate. Returns the row id if it was a reaffirm, else null.
	private reaffirm(hash: string): string | null {
		const existing = this.db
			.prepare(
				"SELECT id, confidence FROM memories WHERE content_hash = ? AND deleted_at IS NULL",
			)
			.get(hash) as { id: string; confidence: number } | undefined;
		if (!existing) return null;
		const newConf = Math.min(1, existing.confidence + 0.05);
		this.db
			.prepare(
				"UPDATE memories SET frequency = frequency + 1, confidence = ?, last_accessed = ? WHERE id = ?",
			)
			.run(newConf, nowIso(), existing.id);
		return existing.id;
	}

	async remember(input: RememberInput): Promise<{ id: string; reaffirmed: boolean }> {
		const content = input.content.trim();
		const hash = hashContent(content);

		const reaffirmedId = this.reaffirm(hash);
		if (reaffirmedId) return { id: reaffirmedId, reaffirmed: true };

		const kind: Kind = input.kind ?? "fact";
		const durability: Durability = input.durability ?? "durable";
		const confidence = input.confidence ?? 0.8;
		const source = input.source ?? "user";
		const tags = JSON.stringify(input.tags ?? []);
		const created = nowIso();

		let expiresAt: string | null = null;
		if (durability === "perishable") {
			const ttl = input.ttlDays ?? 14;
			expiresAt = new Date(Date.now() + ttl * 86400_000).toISOString();
		}

		let embedding: string | null = null;
		if (this.embed) {
			const vec = await this.embed(content);
			if (vec) embedding = JSON.stringify(vec);
		}

		const id = randomUUID();
		const res = this.db
			.prepare(
				`INSERT INTO memories
         (id, kind, content, content_hash, durability, confidence, source, tags, created_at, expires_at, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				id,
				kind,
				content,
				hash,
				durability,
				confidence,
				source,
				tags,
				created,
				expiresAt,
				embedding,
			);
		this.db
			.prepare("INSERT INTO memories_fts (rowid, content) VALUES (?, ?)")
			.run(Number(res.lastInsertRowid), content);
		return { id, reaffirmed: false };
	}

	async recall(query: string, opts: RecallOptions = {}): Promise<Scored[]> {
		const limit = opts.limit ?? 8;
		const charBudget = opts.charBudget ?? 1200;
		const now = Date.now();

		// Drop expired perishable rows lazily, so recall never returns stale state.
		this.db
			.prepare("UPDATE memories SET deleted_at = ? WHERE expires_at IS NOT NULL AND expires_at < ? AND deleted_at IS NULL")
			.run(nowIso(), nowIso());

		// FTS candidates with raw bm25 (lower = better match).
		const match = ftsQuery(query);
		const ftsHits: { rowid: number; bm25: number }[] = match
			? (this.db
					.prepare(
						"SELECT rowid, rank AS bm25 FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank LIMIT 50",
					)
					.all(match) as any[])
			: [];

		// Optional vector candidates over all active rows.
		let queryVec: number[] | null = null;
		if (this.embed) queryVec = await this.embed(query);

		const kindFilter = opts.kind ? " AND kind = ?" : "";
		const rows = (
			kindFilter
				? this.db
						.prepare(`SELECT * FROM memories WHERE deleted_at IS NULL${kindFilter}`)
						.all(opts.kind)
				: this.db.prepare("SELECT * FROM memories WHERE deleted_at IS NULL").all()
		) as MemoryRow[];
		const byRowidId = new Map<number, MemoryRow>();
		const rowidOf = new Map<string, number>();
		// node:sqlite SELECT * doesn't include rowid unless asked; fetch a map.
		const rowidRows = this.db
			.prepare("SELECT rowid, id FROM memories WHERE deleted_at IS NULL")
			.all() as { rowid: number; id: string }[];
		for (const r of rowidRows) rowidOf.set(r.id, r.rowid);

		// Normalize FTS bm25 within the candidate set into [0,1] (higher = better).
		const ftsScore = new Map<string, number>();
		if (ftsHits.length) {
			const s = ftsHits.map((h) => -h.bm25); // higher = better
			const min = Math.min(...s);
			const max = Math.max(...s);
			const rowidToId = new Map<number, string>();
			for (const [id, rid] of rowidOf) rowidToId.set(rid, id);
			ftsHits.forEach((h, i) => {
				const id = rowidToId.get(h.rowid);
				if (!id) return;
				const norm = max === min ? 1 : (s[i] - min) / (max - min);
				ftsScore.set(id, norm);
			});
		}

		const scored: Scored[] = [];
		for (const row of rows) {
			let relVec = 0;
			let haveVec = false;
			if (queryVec && row.embedding) {
				try {
					const c = cosine(queryVec, JSON.parse(row.embedding));
					relVec = Math.max(0, Math.min(1, (c - VEC_FLOOR) / (VEC_CEIL - VEC_FLOOR)));
					haveVec = true;
				} catch {}
			}
			const relFts = ftsScore.get(row.id) ?? 0;
			const haveFts = ftsScore.has(row.id);

			if (!haveFts && !haveVec) continue; // no signal for this row

			let relevance: number;
			if (haveFts && haveVec) relevance = 0.5 * relFts + 0.5 * relVec;
			else if (haveFts) relevance = relFts;
			else relevance = relVec;

			if (relevance < MIN_RELEVANCE) continue; // weak match, not worth injecting

			const ageDays = (now - Date.parse(row.created_at)) / 86400_000;
			const recency = Math.pow(2, -ageDays / RECENCY_HALFLIFE_DAYS);
			const freqBoost = 1 + Math.log(row.frequency);
			const rewardBoost = 1 + row.reward;
			const score = relevance * row.confidence * recency * freqBoost * rewardBoost;
			scored.push({ row, score, relevance });
		}

		scored.sort((a, b) => b.score - a.score);

		// Apply the char budget so the working set stays small.
		const out: Scored[] = [];
		let used = 0;
		for (const s of scored) {
			if (out.length >= limit) break;
			if (used + s.row.content.length > charBudget && out.length > 0) break;
			out.push(s);
			used += s.row.content.length;
		}

		// Reinforce: recalling a memory counts as using it.
		const touch = this.db.prepare(
			"UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?",
		);
		const ts = nowIso();
		for (const s of out) touch.run(ts, s.row.id);

		return out;
	}

	forget(id: string): boolean {
		const res = this.db
			.prepare("UPDATE memories SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
			.run(nowIso(), id);
		const rid = this.db
			.prepare("SELECT rowid FROM memories WHERE id = ?")
			.get(id) as { rowid: number } | undefined;
		if (rid) this.db.prepare("DELETE FROM memories_fts WHERE rowid = ?").run(rid.rowid);
		return res.changes > 0;
	}

	stats(): Record<string, number> {
		const get = (sql: string, ...p: any[]) =>
			(this.db.prepare(sql).get(...p) as { n: number }).n;
		return {
			active: get("SELECT count(*) n FROM memories WHERE deleted_at IS NULL"),
			durable: get(
				"SELECT count(*) n FROM memories WHERE deleted_at IS NULL AND durability='durable'",
			),
			perishable: get(
				"SELECT count(*) n FROM memories WHERE deleted_at IS NULL AND durability='perishable'",
			),
			facts: get("SELECT count(*) n FROM memories WHERE deleted_at IS NULL AND kind='fact'"),
			learnings: get(
				"SELECT count(*) n FROM memories WHERE deleted_at IS NULL AND kind='learning'",
			),
			deleted: get("SELECT count(*) n FROM memories WHERE deleted_at IS NOT NULL"),
		};
	}
}
