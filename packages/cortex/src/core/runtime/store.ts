// Durable run state. PRD §6.3: "Runs are durable. A process restart must resume an
// `awaiting_approval` run days later. Store in Postgres; never hold run state only in
// memory."
//
// SQLite rather than Postgres — docs/DECISIONS.md D-2. The property the PRD asks for is
// durability, and this is the only file in core that knows SQL, so the swap is local.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { PACKAGE_ROOT } from '../config/config.ts';
import type { Run, RunEvent, RunStatus, Step } from '../adapters/types.ts';

export interface NotificationRow {
  id: string;
  principalId: string;
  title: string;
  body: string;
  runId: string | null;
  deepLink: string | null;
  kind: string;
  createdAt: string;
  readAt: string | null;
}

/** What `requestApproval` stores, and what a resumed run reads back. */
export interface ApprovalRecord {
  action: string;
  args: Record<string, unknown>;
  human: string;
  reasoning: string;
  costUsd: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL, agent_version INTEGER NOT NULL,
  principal_id TEXT NOT NULL, surface TEXT NOT NULL,
  thread_id TEXT, status TEXT NOT NULL, trigger_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0, tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0, parent_run_id TEXT
);
CREATE INDEX IF NOT EXISTS runs_by_principal ON runs(principal_id, created_at);
CREATE INDEX IF NOT EXISTS runs_by_status ON runs(status);

CREATE TABLE IF NOT EXISTS steps (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, seq INTEGER NOT NULL,
  kind TEXT NOT NULL, name TEXT NOT NULL, input_digest TEXT NOT NULL,
  status TEXT NOT NULL, latency_ms INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0, model_id TEXT
);
CREATE INDEX IF NOT EXISTS steps_by_run ON steps(run_id, seq);

-- Events are persisted, not only fanned out: SSE Last-Event-ID resumption reads here.
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL, at TEXT NOT NULL, json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_run ON events(run_id, seq);

-- One checkpoint per run: the orchestrator writes it after every node, and reads it to
-- resume. This is what makes "kill the process mid-run" a recoverable event.
CREATE TABLE IF NOT EXISTS checkpoints (
  run_id TEXT PRIMARY KEY, node TEXT NOT NULL,
  state_json TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- Run annotations: prompt hashes, quality metrics, guardrail findings, feedback.
-- Called annotations rather than traces since addendum C1, which gives the name traces
-- to the OTel-shaped span store in telemetry/store.ts. RunStore.trace()/traces() keep
-- their method names, so nothing that calls them changed.
CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL, step_id TEXT, at TEXT NOT NULL,
  kind TEXT NOT NULL, payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS annotations_by_run ON annotations(run_id, id);

CREATE TABLE IF NOT EXISTS approvals (
  step_id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
  requested_at TEXT NOT NULL, payload_json TEXT NOT NULL,
  decision TEXT, edited_args_json TEXT, reason TEXT, decided_at TEXT,
  -- Set once the approved action has actually run. Without it, a run resumed twice —
  -- a restart during the resume, say — would execute the approved action twice, and
  -- "approved once, sent twice" is the failure the whole gate exists to prevent.
  executed_at TEXT
);

-- Per-principal daily spend. §8.3 budgets, third level.
CREATE TABLE IF NOT EXISTS ledger (
  principal_id TEXT NOT NULL, day TEXT NOT NULL,
  cost_usd REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (principal_id, day)
);

-- §12 — the rule and background surfaces have no stream to write to. A notification is
-- their only delivery, so it has to be as durable as the run that produced it: a run that
-- finishes while nobody is looking must still reach the person when they come back.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  run_id TEXT,
  deep_link TEXT,
  kind TEXT NOT NULL DEFAULT 'info',
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS notifications_by_principal ON notifications(principal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memory (
  id TEXT PRIMARY KEY, principal_id TEXT NOT NULL, thread_id TEXT,
  type TEXT NOT NULL, key TEXT, value TEXT NOT NULL,
  provenance_json TEXT NOT NULL, at TEXT NOT NULL, expires_at TEXT,
  vector BLOB
);
CREATE INDEX IF NOT EXISTS memory_by_thread ON memory(thread_id, at);
CREATE INDEX IF NOT EXISTS memory_by_principal ON memory(principal_id, type);

-- Skill invocations, for idempotency windows and per-day rate limits.
CREATE TABLE IF NOT EXISTS invocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  principal_id TEXT NOT NULL, skill_id TEXT NOT NULL,
  idem_key TEXT, at TEXT NOT NULL, result_json TEXT
);
CREATE INDEX IF NOT EXISTS invocations_by_idem ON invocations(skill_id, idem_key, at);
CREATE INDEX IF NOT EXISTS invocations_by_principal ON invocations(principal_id, skill_id, at);
`;

export type Db = InstanceType<typeof Database>;

function resolveDsn(dsn: string): string {
  const file = dsn.startsWith('file:') ? dsn.slice('file:'.length) : dsn;
  const abs = path.isAbsolute(file) ? file : path.join(PACKAGE_ROOT, file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

/**
 * Schema version, for the handful of migrations this will ever need. Bump it and add a
 * branch; `IF NOT EXISTS` alone cannot rename a table, and a database that predates a
 * rename fails at INSERT rather than at startup, which is the worst time to find out.
 */
const SCHEMA_VERSION = 3;

function migrate(db: Db): void {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  if (current >= SCHEMA_VERSION) return;

  // v1 → v2: the old `traces` table (run annotations) becomes `annotations`, freeing the
  // name for the span store added by addendum C1.
  const legacy = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'traces'`)
    .get() as { name: string } | undefined;
  if (legacy) {
    const columns = db.prepare('PRAGMA table_info(traces)').all() as { name: string }[];
    const isLegacyShape = columns.some((c) => c.name === 'payload_json');
    if (isLegacyShape) {
      db.exec('DROP INDEX IF EXISTS traces_by_run');
      db.exec('ALTER TABLE traces RENAME TO annotations');
    }
  }
  // v2 → v3: approvals learn whether they have been executed.
  const approvals = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'approvals'`)
    .get() as { name: string } | undefined;
  if (approvals) {
    const columns = db.prepare('PRAGMA table_info(approvals)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'executed_at')) {
      db.exec('ALTER TABLE approvals ADD COLUMN executed_at TEXT');
    }
  }

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

export function openDb(dsn: string): Db {
  const db = new Database(resolveDsn(dsn));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  db.exec(SCHEMA);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  return db;
}

const nowIso = () => new Date().toISOString();

export class RunStore {
  // No parameter properties anywhere in this package: Node runs the TypeScript by
  // stripping types, and a parameter property is syntax, not a type.
  readonly db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  // -- runs ----------------------------------------------------------------

  createRun(run: Run): Run {
    this.db
      .prepare(
        `INSERT INTO runs (id, agent_id, agent_version, principal_id, surface, thread_id,
          status, trigger_json, created_at, updated_at, cost_usd, tokens_in, tokens_out, parent_run_id)
         VALUES (@id, @agentId, @agentVersion, @principalId, @surface, @threadId, @status,
          @triggerJson, @createdAt, @updatedAt, @costUsd, @tokensIn, @tokensOut, @parentRunId)`,
      )
      .run({ ...run, triggerJson: JSON.stringify(run.trigger) });
    return run;
  }

  getRun(id: string): Run | null {
    const r = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Record<string, never> | undefined;
    return r ? rowToRun(r) : null;
  }

  listRuns(status: RunStatus): Run[] {
    return (this.db.prepare('SELECT * FROM runs WHERE status = ? ORDER BY created_at').all(status) as Record<string, never>[]).map(rowToRun);
  }

  setStatus(id: string, status: RunStatus): void {
    this.db.prepare('UPDATE runs SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
  }

  addCost(runId: string, principalId: string, costUsd: number, tokensIn: number, tokensOut: number): void {
    this.db
      .prepare('UPDATE runs SET cost_usd = cost_usd + ?, tokens_in = tokens_in + ?, tokens_out = tokens_out + ?, updated_at = ? WHERE id = ?')
      .run(costUsd, tokensIn, tokensOut, nowIso(), runId);
    const day = nowIso().slice(0, 10);
    this.db
      .prepare(
        `INSERT INTO ledger (principal_id, day, cost_usd) VALUES (?, ?, ?)
         ON CONFLICT(principal_id, day) DO UPDATE SET cost_usd = cost_usd + excluded.cost_usd`,
      )
      .run(principalId, day, costUsd);
  }

  spentToday(principalId: string): number {
    const row = this.db
      .prepare('SELECT cost_usd FROM ledger WHERE principal_id = ? AND day = ?')
      .get(principalId, nowIso().slice(0, 10)) as { cost_usd: number } | undefined;
    return row?.cost_usd ?? 0;
  }

  // -- steps ---------------------------------------------------------------

  addStep(step: Step): void {
    this.db
      .prepare(
        `INSERT INTO steps (id, run_id, seq, kind, name, input_digest, status, latency_ms, cost_usd, model_id)
         VALUES (@id, @runId, @seq, @kind, @name, @inputDigest, @status, @latencyMs, @costUsd, @modelId)`,
      )
      .run(step);
  }

  finishStep(id: string, status: Step['status'], latencyMs: number, costUsd = 0, modelId: string | null = null): void {
    this.db
      .prepare('UPDATE steps SET status = ?, latency_ms = ?, cost_usd = ?, model_id = COALESCE(?, model_id) WHERE id = ?')
      .run(status, latencyMs, costUsd, modelId, id);
  }

  steps(runId: string): Step[] {
    return (this.db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY seq').all(runId) as Record<string, never>[]).map(rowToStep);
  }

  // -- events --------------------------------------------------------------

  appendEvent(runId: string, event: RunEvent): number {
    const info = this.db
      .prepare('INSERT INTO events (run_id, at, json) VALUES (?, ?, ?)')
      .run(runId, nowIso(), JSON.stringify(event));
    return Number(info.lastInsertRowid);
  }

  eventsAfter(runId: string, afterSeq: number): { seq: number; event: RunEvent }[] {
    const rows = this.db
      .prepare('SELECT seq, json FROM events WHERE run_id = ? AND seq > ? ORDER BY seq')
      .all(runId, afterSeq) as { seq: number; json: string }[];
    return rows.map((r) => ({ seq: r.seq, event: JSON.parse(r.json) as RunEvent }));
  }

  // -- checkpoints ---------------------------------------------------------

  checkpoint(runId: string, node: string, state: unknown): void {
    this.db
      .prepare(
        `INSERT INTO checkpoints (run_id, node, state_json, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET node = excluded.node, state_json = excluded.state_json, updated_at = excluded.updated_at`,
      )
      .run(runId, node, JSON.stringify(state), nowIso());
  }

  readCheckpoint(runId: string): { node: string; state: unknown } | null {
    const row = this.db.prepare('SELECT node, state_json FROM checkpoints WHERE run_id = ?').get(runId) as
      | { node: string; state_json: string }
      | undefined;
    return row ? { node: row.node, state: JSON.parse(row.state_json) } : null;
  }

  // -- traces --------------------------------------------------------------

  trace(runId: string, stepId: string | null, kind: string, payload: unknown): void {
    this.db
      .prepare('INSERT INTO annotations (run_id, step_id, at, kind, payload_json) VALUES (?, ?, ?, ?, ?)')
      .run(runId, stepId, nowIso(), kind, JSON.stringify(payload));
  }

  traces(runId: string): { kind: string; at: string; payload: unknown; stepId: string | null }[] {
    const rows = this.db.prepare('SELECT step_id, at, kind, payload_json FROM annotations WHERE run_id = ? ORDER BY id').all(runId) as {
      step_id: string | null; at: string; kind: string; payload_json: string;
    }[];
    return rows.map((r) => ({ kind: r.kind, at: r.at, stepId: r.step_id, payload: JSON.parse(r.payload_json) }));
  }

  // -- notifications -------------------------------------------------------

  addNotification(n: { id: string; principalId: string; title: string; body: string; runId?: string; deepLink?: string; kind?: string }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO notifications (id, principal_id, title, body, run_id, deep_link, kind, created_at)
         VALUES (@id, @principalId, @title, @body, @runId, @deepLink, @kind, @createdAt)`,
      )
      .run({
        id: n.id, principalId: n.principalId, title: n.title, body: n.body,
        runId: n.runId ?? null, deepLink: n.deepLink ?? null, kind: n.kind ?? 'info',
        createdAt: nowIso(),
      });
  }

  notifications(principalId: string, afterId?: string): NotificationRow[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications WHERE principal_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50')
      .all(principalId) as Record<string, never>[];
    const all = rows.map(toNotification);
    // `afterId` is how a polling or reconnecting client asks for "anything since this
    // one" without replaying a list it has already seen.
    if (!afterId) return all;
    const idx = all.findIndex((n) => n.id === afterId);
    return idx < 0 ? all : all.slice(0, idx);
  }

  markNotificationRead(id: string, principalId: string): boolean {
    return this.db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND principal_id = ?').run(nowIso(), id, principalId).changes > 0;
  }

  // -- approvals -----------------------------------------------------------

  requestApproval(runId: string, stepId: string, payload: unknown): void {
    this.db
      .prepare('INSERT OR REPLACE INTO approvals (step_id, run_id, requested_at, payload_json) VALUES (?, ?, ?, ?)')
      .run(stepId, runId, nowIso(), JSON.stringify(payload));
  }

  decideApproval(stepId: string, decision: string, editedArgs: unknown, reason: string | null): void {
    this.db
      .prepare('UPDATE approvals SET decision = ?, edited_args_json = ?, reason = ?, decided_at = ? WHERE step_id = ?')
      .run(decision, editedArgs ? JSON.stringify(editedArgs) : null, reason, nowIso(), stepId);
  }

  /**
   * Approvals a human has answered but the run has not yet acted on. This is what a
   * resumed run reads instead of re-deciding: the gate was the question, and it has
   * been answered — asking it again would loop forever.
   */
  decidedApprovals(runId: string): { stepId: string; decision: string; editedArgs: Record<string, unknown> | null; payload: ApprovalRecord }[] {
    const rows = this.db
      .prepare(
        `SELECT step_id, decision, edited_args_json, payload_json FROM approvals
         WHERE run_id = ? AND decision IS NOT NULL AND executed_at IS NULL ORDER BY requested_at`,
      )
      .all(runId) as { step_id: string; decision: string; edited_args_json: string | null; payload_json: string }[];
    return rows.map((r) => ({
      stepId: r.step_id,
      decision: r.decision,
      editedArgs: r.edited_args_json ? (JSON.parse(r.edited_args_json) as Record<string, unknown>) : null,
      payload: JSON.parse(r.payload_json) as ApprovalRecord,
    }));
  }

  markApprovalExecuted(stepId: string): void {
    this.db.prepare('UPDATE approvals SET executed_at = ? WHERE step_id = ?').run(nowIso(), stepId);
  }

  approvalFor(stepId: string): ApprovalRecord | null {
    const row = this.db.prepare('SELECT payload_json FROM approvals WHERE step_id = ?').get(stepId) as { payload_json: string } | undefined;
    return row ? (JSON.parse(row.payload_json) as ApprovalRecord) : null;
  }

  pendingApproval(runId: string): { stepId: string; payload: unknown } | null {
    const row = this.db
      .prepare('SELECT step_id, payload_json FROM approvals WHERE run_id = ? AND decision IS NULL ORDER BY requested_at LIMIT 1')
      .get(runId) as { step_id: string; payload_json: string } | undefined;
    return row ? { stepId: row.step_id, payload: JSON.parse(row.payload_json) } : null;
  }
}

function toNotification(r: Record<string, never>): NotificationRow {
  const row = r as unknown as Record<string, string>;
  return {
    id: row.id, principalId: row.principal_id, title: row.title, body: row.body,
    runId: row.run_id ?? null, deepLink: row.deep_link ?? null, kind: row.kind,
    createdAt: row.created_at, readAt: row.read_at ?? null,
  };
}

function rowToRun(r: Record<string, never>): Run {
  const row = r as unknown as Record<string, string & number>;
  return {
    id: row.id, agentId: row.agent_id, agentVersion: Number(row.agent_version),
    principalId: row.principal_id, surface: row.surface as Run['surface'],
    threadId: row.thread_id ?? null, status: row.status as RunStatus,
    trigger: JSON.parse(row.trigger_json), createdAt: row.created_at, updatedAt: row.updated_at,
    costUsd: Number(row.cost_usd), tokensIn: Number(row.tokens_in), tokensOut: Number(row.tokens_out),
    parentRunId: row.parent_run_id ?? null,
  };
}

function rowToStep(r: Record<string, never>): Step {
  const row = r as unknown as Record<string, string & number>;
  return {
    id: row.id, runId: row.run_id, seq: Number(row.seq), kind: row.kind as Step['kind'],
    name: row.name, inputDigest: row.input_digest, status: row.status as Step['status'],
    latencyMs: Number(row.latency_ms), costUsd: Number(row.cost_usd), modelId: row.model_id ?? null,
  };
}
