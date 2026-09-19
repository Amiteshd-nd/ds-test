// The trace store. Addendum C1.
//
// v1.0 said LangSmith in pre-production and OpenTelemetry in production. v1.1 says
// OpenTelemetry everywhere, exported to a store we own. There was never a LangSmith here
// to disconnect (docs/AUDIT-v1.1.md question 4), so this is the constructive half of C1:
// somewhere for spans to land, a retention policy, and a viewer built on top.
//
// Adjusted from the addendum's Postgres DDL in three places, all forced by SQLite
// (docs/DECISIONS.md D-2) and none of them changing behaviour:
//
//   · `TIMESTAMPTZ` → ISO-8601 TEXT, which sorts correctly and is what the rest of this
//     codebase already stores.
//   · Monthly partitions → a retention sweep. SQLite has no partitions, and `DELETE` with
//     an index on `started_at` does the same job at any volume this will see. If a host
//     moves the store to Postgres, the partitioning advice applies again unchanged.
//   · BRIN index → a plain B-tree on `started_at`. SQLite has no BRIN; the column is
//     append-ordered anyway, which is what BRIN was exploiting.
//
// The span schema itself — the attribute names from v1.0 §16.1 — is untouched, which is
// the regression guard the addendum sets.

import type { Db } from '../runtime/store.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS traces (
  trace_id      TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  agent_version INTEGER NOT NULL,
  principal_hash TEXT NOT NULL,
  surface       TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  duration_ms   INTEGER,
  status        TEXT,
  cost_usd      REAL DEFAULT 0,
  tokens_in     INTEGER DEFAULT 0,
  tokens_out    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS spans (
  span_id        TEXT PRIMARY KEY,
  trace_id       TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
  parent_span_id TEXT,
  kind           TEXT NOT NULL,
  name           TEXT NOT NULL,
  started_at     TEXT NOT NULL,
  duration_ms    INTEGER,
  status         TEXT,
  attributes     TEXT NOT NULL DEFAULT '{}',
  payload_ref    TEXT
);

CREATE INDEX IF NOT EXISTS spans_by_trace ON spans (trace_id, started_at);
CREATE INDEX IF NOT EXISTS traces_by_agent ON traces (agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS traces_by_time ON traces (started_at);

-- Rolled up nightly so dashboards never scan raw spans, per C1 item 5.
CREATE TABLE IF NOT EXISTS trace_daily_stats (
  day           TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  runs          INTEGER NOT NULL,
  failures      INTEGER NOT NULL,
  cost_usd      REAL NOT NULL,
  tokens_in     INTEGER NOT NULL,
  tokens_out    INTEGER NOT NULL,
  p50_ms        INTEGER NOT NULL,
  p95_ms        INTEGER NOT NULL,
  PRIMARY KEY (day, agent_id)
);
`;

export interface TraceRow {
  traceId: string;
  runId: string;
  agentId: string;
  agentVersion: number;
  principalHash: string;
  surface: string;
  startedAt: string;
  durationMs: number | null;
  status: string | null;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

export interface SpanRow {
  spanId: string;
  traceId: string;
  parentSpanId: string | null;
  kind: string;
  name: string;
  startedAt: string;
  durationMs: number | null;
  status: string | null;
  attributes: Record<string, unknown>;
  payloadRef: string | null;
}

export interface TraceFilter {
  agentId?: string;
  status?: string;
  minCostUsd?: number;
  minDurationMs?: number;
  limit?: number;
}

export class TraceStore {
  readonly db: Db;

  constructor(db: Db) {
    this.db = db;
    db.exec(SCHEMA);
  }

  openTrace(t: Omit<TraceRow, 'durationMs' | 'status' | 'costUsd' | 'tokensIn' | 'tokensOut'>): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO traces (trace_id, run_id, agent_id, agent_version, principal_hash, surface, started_at)
         VALUES (@traceId, @runId, @agentId, @agentVersion, @principalHash, @surface, @startedAt)`,
      )
      .run(t);
  }

  closeTrace(traceId: string, status: string, durationMs: number, costUsd: number, tokensIn: number, tokensOut: number): void {
    this.db
      .prepare('UPDATE traces SET status = ?, duration_ms = ?, cost_usd = ?, tokens_in = ?, tokens_out = ? WHERE trace_id = ?')
      .run(status, durationMs, costUsd, tokensIn, tokensOut, traceId);
  }

  addSpan(s: SpanRow): void {
    // A span for a trace that was never opened is dropped rather than orphaned — it
    // means the run started before the exporter was wired, which happens in tests.
    const known = this.db.prepare('SELECT 1 FROM traces WHERE trace_id = ?').get(s.traceId);
    if (!known) return;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO spans (span_id, trace_id, parent_span_id, kind, name, started_at, duration_ms, status, attributes, payload_ref)
         VALUES (@spanId, @traceId, @parentSpanId, @kind, @name, @startedAt, @durationMs, @status, @attributes, @payloadRef)`,
      )
      .run({ ...s, attributes: JSON.stringify(s.attributes) });
  }

  list(filter: TraceFilter = {}): TraceRow[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (filter.agentId) { where.push('agent_id = ?'); args.push(filter.agentId); }
    if (filter.status) { where.push('status = ?'); args.push(filter.status); }
    if (filter.minCostUsd !== undefined) { where.push('cost_usd >= ?'); args.push(filter.minCostUsd); }
    if (filter.minDurationMs !== undefined) { where.push('duration_ms >= ?'); args.push(filter.minDurationMs); }
    const sql = `SELECT * FROM traces ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY started_at DESC LIMIT ?`;
    args.push(filter.limit ?? 50);
    return (this.db.prepare(sql).all(...args) as Record<string, never>[]).map(toTrace);
  }

  get(traceId: string): { trace: TraceRow; spans: SpanRow[] } | null {
    const row = this.db.prepare('SELECT * FROM traces WHERE trace_id = ?').get(traceId) as Record<string, never> | undefined;
    if (!row) return null;
    const spans = (this.db.prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY started_at, rowid').all(traceId) as Record<string, never>[]).map(toSpan);
    return { trace: toTrace(row), spans };
  }

  byRun(runId: string): TraceRow | null {
    const row = this.db.prepare('SELECT * FROM traces WHERE run_id = ? ORDER BY started_at DESC LIMIT 1').get(runId) as Record<string, never> | undefined;
    return row ? toTrace(row) : null;
  }

  /**
   * C1 item 5. Rolls each day's traces into per-agent aggregates, then drops raw spans
   * and traces past retention. Run it nightly; running it twice is harmless.
   */
  sweep(retentionDays: number, now = new Date()): { rolledUp: number; tracesDropped: number; spansDropped: number } {
    const cutoff = new Date(now.getTime() - retentionDays * 864e5).toISOString();

    const days = this.db
      .prepare(`SELECT DISTINCT substr(started_at, 1, 10) AS day, agent_id FROM traces WHERE status IS NOT NULL`)
      .all() as { day: string; agent_id: string }[];

    let rolledUp = 0;
    for (const { day, agent_id } of days) {
      const rows = this.db
        .prepare(`SELECT duration_ms, status, cost_usd, tokens_in, tokens_out FROM traces WHERE agent_id = ? AND substr(started_at, 1, 10) = ?`)
        .all(agent_id, day) as { duration_ms: number; status: string; cost_usd: number; tokens_in: number; tokens_out: number }[];
      if (rows.length === 0) continue;
      const durations = rows.map((r) => r.duration_ms ?? 0).sort((a, b) => a - b);
      const at = (p: number): number => durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)] ?? 0;
      this.db
        .prepare(
          `INSERT INTO trace_daily_stats (day, agent_id, runs, failures, cost_usd, tokens_in, tokens_out, p50_ms, p95_ms)
           VALUES (@day, @agentId, @runs, @failures, @cost, @tokensIn, @tokensOut, @p50, @p95)
           ON CONFLICT(day, agent_id) DO UPDATE SET
             runs = excluded.runs, failures = excluded.failures, cost_usd = excluded.cost_usd,
             tokens_in = excluded.tokens_in, tokens_out = excluded.tokens_out,
             p50_ms = excluded.p50_ms, p95_ms = excluded.p95_ms`,
        )
        .run({
          day, agentId: agent_id, runs: rows.length,
          failures: rows.filter((r) => r.status === 'failed').length,
          cost: rows.reduce((a, r) => a + (r.cost_usd ?? 0), 0),
          tokensIn: rows.reduce((a, r) => a + (r.tokens_in ?? 0), 0),
          tokensOut: rows.reduce((a, r) => a + (r.tokens_out ?? 0), 0),
          p50: at(0.5), p95: at(0.95),
        });
      rolledUp++;
    }

    // The aggregates survive; the raw detail does not. That asymmetry is the whole
    // retention design: dashboards keep working, and member data stops existing.
    const spansDropped = this.db
      .prepare('DELETE FROM spans WHERE trace_id IN (SELECT trace_id FROM traces WHERE started_at < ?)')
      .run(cutoff).changes;
    const tracesDropped = this.db.prepare('DELETE FROM traces WHERE started_at < ?').run(cutoff).changes;
    return { rolledUp, tracesDropped, spansDropped: Number(spansDropped) };
  }

  /**
   * Per-agent cost and latency for the last `days` days. M6's cost dashboard.
   *
   * Computed live from `traces` for days whose detail still exists, and read from
   * `trace_daily_stats` for days the retention sweep has already collapsed. Reading only
   * the rollup would show an empty dashboard until the first nightly sweep — which is
   * exactly when someone is looking, because they just turned tracing on.
   */
  dashboard(days = 14): { day: string; agentId: string; runs: number; failures: number; costUsd: number; tokensIn: number; tokensOut: number; p50Ms: number; p95Ms: number; live: boolean }[] {
    const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

    const live = this.db
      .prepare(
        `SELECT substr(started_at, 1, 10) AS day, agent_id,
                COUNT(*) AS runs,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failures,
                SUM(COALESCE(cost_usd, 0)) AS cost_usd,
                SUM(COALESCE(tokens_in, 0)) AS tokens_in,
                SUM(COALESCE(tokens_out, 0)) AS tokens_out
         FROM traces WHERE substr(started_at, 1, 10) >= ?
         GROUP BY day, agent_id`,
      )
      .all(since) as { day: string; agent_id: string; runs: number; failures: number; cost_usd: number; tokens_in: number; tokens_out: number }[];

    const rows = live.map((r) => {
      // Percentiles need the individual durations, which the aggregate above cannot give.
      const durations = (this.db
        .prepare(`SELECT duration_ms FROM traces WHERE agent_id = ? AND substr(started_at, 1, 10) = ? AND duration_ms IS NOT NULL ORDER BY duration_ms`)
        .all(r.agent_id, r.day) as { duration_ms: number }[]).map((d) => d.duration_ms);
      const at = (p: number): number => (durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * p) - 1)] : 0);
      return {
        day: r.day, agentId: r.agent_id, runs: r.runs, failures: r.failures,
        costUsd: r.cost_usd, tokensIn: r.tokens_in, tokensOut: r.tokens_out,
        p50Ms: at(0.5), p95Ms: at(0.95), live: true,
      };
    });

    const seen = new Set(rows.map((r) => `${r.day}|${r.agentId}`));
    const rolled = this.db
      .prepare('SELECT * FROM trace_daily_stats WHERE day >= ? ORDER BY day DESC')
      .all(since) as { day: string; agent_id: string; runs: number; failures: number; cost_usd: number; tokens_in: number; tokens_out: number; p50_ms: number; p95_ms: number }[];
    for (const r of rolled) {
      if (seen.has(`${r.day}|${r.agent_id}`)) continue;
      rows.push({
        day: r.day, agentId: r.agent_id, runs: r.runs, failures: r.failures,
        costUsd: r.cost_usd, tokensIn: r.tokens_in, tokensOut: r.tokens_out,
        p50Ms: r.p50_ms, p95Ms: r.p95_ms, live: false,
      });
    }

    return rows.sort((a, b) => b.day.localeCompare(a.day) || a.agentId.localeCompare(b.agentId));
  }

  dailyStats(agentId?: string): Record<string, unknown>[] {
    const sql = agentId
      ? 'SELECT * FROM trace_daily_stats WHERE agent_id = ? ORDER BY day DESC LIMIT 30'
      : 'SELECT * FROM trace_daily_stats ORDER BY day DESC LIMIT 30';
    return (agentId ? this.db.prepare(sql).all(agentId) : this.db.prepare(sql).all()) as Record<string, unknown>[];
  }
}

function toTrace(r: Record<string, never>): TraceRow {
  const row = r as unknown as Record<string, string & number>;
  return {
    traceId: row.trace_id, runId: row.run_id, agentId: row.agent_id,
    agentVersion: Number(row.agent_version), principalHash: row.principal_hash,
    surface: row.surface, startedAt: row.started_at,
    durationMs: row.duration_ms ?? null, status: row.status ?? null,
    costUsd: Number(row.cost_usd ?? 0), tokensIn: Number(row.tokens_in ?? 0), tokensOut: Number(row.tokens_out ?? 0),
  };
}

function toSpan(r: Record<string, never>): SpanRow {
  const row = r as unknown as Record<string, string & number>;
  return {
    spanId: row.span_id, traceId: row.trace_id, parentSpanId: row.parent_span_id ?? null,
    kind: row.kind, name: row.name, startedAt: row.started_at,
    durationMs: row.duration_ms ?? null, status: row.status ?? null,
    attributes: JSON.parse(row.attributes ?? '{}'),
    payloadRef: row.payload_ref ?? null,
  };
}
