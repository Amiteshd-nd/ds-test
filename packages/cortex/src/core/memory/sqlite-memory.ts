// The default MemoryAdapter. PRD §10.3 defaults to Postgres + pgvector; this is the same
// shape on SQLite (docs/DECISIONS.md D-2) with the local embedder for semantic recall.
//
// A host with messaging infrastructure should back `appendTurn`/`recent` with it instead
// and inherit history, ordering, and retries rather than reimplementing them here.

import crypto from 'node:crypto';
import type { MemoryAdapter } from '../adapters/memory.ts';
import type { MemoryRecord, ProfileMemory, Turn } from '../adapters/types.ts';
import type { RunStore } from '../runtime/store.ts';
import { cosine, embedText } from '../router/providers/local.ts';

const vecToBlob = (v: Float32Array): Buffer => Buffer.from(v.buffer.slice(0));
const blobToVec = (b: Buffer): Float32Array => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

export class SqliteMemory implements MemoryAdapter {
  readonly store: RunStore;
  readonly turnTtlDays: number;
  readonly minObservations: number;

  constructor(store: RunStore, opts: { turnTtlDays: number; minObservations: number }) {
    this.store = store;
    this.turnTtlDays = opts.turnTtlDays;
    this.minObservations = opts.minObservations;
  }

  async appendTurn(threadId: string, turn: Turn): Promise<void> {
    const expires = new Date(Date.now() + this.turnTtlDays * 864e5).toISOString();
    this.store.db
      .prepare(
        `INSERT INTO memory (id, principal_id, thread_id, type, key, value, provenance_json, at, expires_at, vector)
         VALUES (?, ?, ?, 'turn', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        turn.id,
        turn.id.split(':')[0] === 'sys' ? 'system' : principalOf(threadId),
        threadId,
        turn.role,
        turn.text,
        JSON.stringify({ runId: turn.runId ?? '', evidence: 'interaction', at: turn.at }),
        turn.at,
        expires,
        vecToBlob(embedText(turn.text)),
      );
  }

  async recent(threadId: string, limit: number): Promise<Turn[]> {
    const rows = this.store.db
      .prepare(`SELECT id, key, value, at FROM memory WHERE thread_id = ? AND type = 'turn' ORDER BY at DESC, rowid DESC LIMIT ?`)
      .all(threadId, limit) as { id: string; key: string; value: string; at: string }[];
    return rows.reverse().map((r) => ({ id: r.id, threadId, role: r.key as Turn['role'], text: r.value, at: r.at }));
  }

  async semantic(threadId: string, q: string, k: number): Promise<Turn[]> {
    const rows = this.store.db
      .prepare(`SELECT id, key, value, at, vector FROM memory WHERE thread_id = ? AND type = 'turn'`)
      .all(threadId) as { id: string; key: string; value: string; at: string; vector: Buffer }[];
    const qv = embedText(q);
    return rows
      .map((r) => ({ turn: { id: r.id, threadId, role: r.key as Turn['role'], text: r.value, at: r.at }, score: cosine(qv, blobToVec(r.vector)) }))
      .filter((x) => x.score > 0.25)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.turn);
  }

  async getProfile(principalId: string): Promise<ProfileMemory> {
    const rows = this.store.db
      .prepare(`SELECT * FROM memory WHERE principal_id = ? AND type IN ('fact','preference') ORDER BY at DESC`)
      .all(principalId) as Record<string, string>[];
    const all = rows.map(rowToRecord);
    return {
      facts: all.filter((r) => r.type === 'fact'),
      preferences: all.filter((r) => r.type === 'preference'),
    };
  }

  /**
   * §10.2 — a preference needs two observations before it is one. One-off phrasing is
   * not a preference, and a system that treats it as one starts confidently getting a
   * person wrong in a way they cannot see or correct.
   */
  async upsertProfile(
    principalId: string,
    patch: Partial<MemoryRecord> & { key: string; value: string },
    provenance: string,
  ): Promise<void> {
    const type = patch.type ?? 'fact';
    const existing = this.store.db
      .prepare(`SELECT id, provenance_json FROM memory WHERE principal_id = ? AND type = ? AND key = ?`)
      .get(principalId, type, patch.key) as { id: string; provenance_json: string } | undefined;

    const prior = existing ? (JSON.parse(existing.provenance_json) as { observations?: number }) : undefined;
    const observations = (prior?.observations ?? 0) + 1;
    if (type === 'preference' && observations < this.minObservations && !existing) {
      // Recorded as a candidate, not yet as a preference.
      this.#write(principalId, 'fact', `candidate:${patch.key}`, patch.value, provenance, observations);
      return;
    }
    if (existing) this.store.db.prepare('DELETE FROM memory WHERE id = ?').run(existing.id);
    this.#write(principalId, type, patch.key, patch.value, provenance, observations);
  }

  async forget(principalId: string, recordId: string): Promise<boolean> {
    const info = this.store.db.prepare('DELETE FROM memory WHERE id = ? AND principal_id = ?').run(recordId, principalId);
    return info.changes > 0;
  }

  /** §15 `GET /v1/memory/me` — everything the system holds, inspectable. */
  async inspect(principalId: string): Promise<MemoryRecord[]> {
    const rows = this.store.db
      .prepare('SELECT * FROM memory WHERE principal_id = ? ORDER BY at DESC')
      .all(principalId) as Record<string, string>[];
    return rows.map(rowToRecord);
  }

  #write(principalId: string, type: string, key: string, value: string, evidence: string, observations: number): void {
    this.store.db
      .prepare(
        `INSERT INTO memory (id, principal_id, thread_id, type, key, value, provenance_json, at, expires_at, vector)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        principalId,
        type,
        key,
        value,
        JSON.stringify({ runId: '', evidence, at: new Date().toISOString(), observations }),
        new Date().toISOString(),
        type === 'preference' ? new Date(Date.now() + 365 * 864e5).toISOString() : null,
        vecToBlob(embedText(`${key} ${value}`)),
      );
  }
}

function rowToRecord(r: Record<string, string>): MemoryRecord {
  return {
    id: r.id,
    principalId: r.principal_id,
    type: r.type as MemoryRecord['type'],
    key: r.key ?? undefined,
    value: r.value,
    provenance: JSON.parse(r.provenance_json),
    expiresAt: r.expires_at ?? undefined,
  };
}

/** Threads are named `<principalId>:<uuid>`; memory scoping depends on it (§10.4). */
function principalOf(threadId: string): string {
  return threadId.split(':')[0];
}
