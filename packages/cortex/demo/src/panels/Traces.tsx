// The trace viewer. Addendum C1 item 6 — built into the Playground rather than as a
// separate app, and scoped to debugging and eval triage rather than analytics.
//
// The addendum is blunt that this will be worse than a mature commercial viewer for a
// year, and it is right. What it does do is the four things a debugging session actually
// needs: see the waterfall, see what the model was given, compare two runs on the same
// question, and get back to the playground with that question loaded.

import { useEffect, useState } from 'react';
import type { CortexClient } from '../../../src/sdk/client.ts';
import type { SpanRow, TraceRow } from '../../../src/core/telemetry/store.ts';
import type { CostRow } from '../../../src/sdk/client.ts';

interface Detail {
  trace: TraceRow;
  spans: SpanRow[];
  annotations: { kind: string; at: string; payload: unknown }[];
}

const KIND_ORDER: Record<string, number> = { retrieval: 0, skill: 1, model: 2, gate: 3, subagent: 4, internal: 5 };

export function Traces({ client, onReplay }: { client: CortexClient; onReplay: (question: string) => void }) {
  const [rows, setRows] = useState<TraceRow[]>([]);
  const [stats, setStats] = useState<Record<string, unknown>[]>([]);
  const [cost, setCost] = useState<CostRow[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [compare, setCompare] = useState<Detail | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [filter, setFilter] = useState<{ status?: string; minDuration?: number }>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await client.traces({ ...filter, limit: 40 });
      setRows(res.traces);
      setStats(res.stats);
      setCost(res.dashboard ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => { void load(); }, [client, filter.status, filter.minDuration]);

  async function open(traceId: string, into: 'selected' | 'compare') {
    const detail = await client.traceDetail(traceId);
    if (into === 'selected') { setSelected(detail); setPayload(null); } else setCompare(detail);
  }

  async function showPayload(trace: Detail, ref: string) {
    const res = await client.tracePayload(trace.trace.traceId, ref);
    setPayload(res.payload as Record<string, unknown>);
  }

  async function replay(trace: TraceRow) {
    const run = await client.run(trace.runId);
    onReplay(run.run.trigger.detail);
  }

  return (
    <div>
      <p className="lede">
        Every run, stored here and nowhere else. Span rows hold metadata; prompts and
        retrieved chunks live beside them by reference, redacted in production and dropped
        on a retention schedule. Nothing is exported to anyone.
      </p>

      {error ? <div className="notice notice-alarm" role="alert"><span className="kind">error</span><span>{error}</span></div> : null}

      <div className="tracebar">
        <select aria-label="Status" value={filter.status ?? ''} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value || undefined }))}>
          <option value="">any status</option>
          <option value="succeeded">succeeded</option>
          <option value="failed">failed</option>
          <option value="awaiting_approval">awaiting approval</option>
        </select>
        <select aria-label="Slower than" value={String(filter.minDuration ?? '')} onChange={(e) => setFilter((f) => ({ ...f, minDuration: e.target.value ? Number(e.target.value) : undefined }))}>
          <option value="">any duration</option>
          <option value="500">slower than 500ms</option>
          <option value="1000">slower than 1s</option>
          <option value="3000">slower than 3s</option>
        </select>
        <button className="btn" type="button" onClick={() => void load()}>Refresh</button>
        {stats.length ? (
          <span className="footnote" style={{ marginTop: 0 }}>
            today: {String((stats[0] as { runs: number }).runs)} run(s), p95 {String((stats[0] as { p95_ms: number }).p95_ms)}ms
          </span>
        ) : null}
      </div>

      {cost.length ? (
        <section className="panel" style={{ marginTop: 16 }}>
          <h3>Cost and latency by agent</h3>
          <table className="records">
            <thead>
              <tr><th>day</th><th>agent</th><th>runs</th><th>failed</th><th>cost</th><th>tokens</th><th>p50</th><th>p95</th></tr>
            </thead>
            <tbody>
              {cost.map((c) => (
                <tr key={c.day + c.agentId}>
                  <td className="mono">{c.day}{c.live ? '' : ' *'}</td>
                  <td>{c.agentId}</td>
                  <td className="mono">{c.runs}</td>
                  <td className={`mono ${c.failures ? 'bad' : ''}`}>{c.failures}</td>
                  <td className="mono">${c.costUsd.toFixed(4)}</td>
                  <td className="mono">{c.tokensIn + c.tokensOut}</td>
                  <td className="mono">{c.p50Ms}ms</td>
                  <td className="mono">{c.p95Ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="footnote">
            Days marked <code>*</code> come from the rolled-up aggregate rather than from
            raw spans — the detail behind them has passed its retention window and been
            deleted, which is the point of the window. Costs are zero here because no
            model is configured.
          </p>
        </section>
      ) : null}

      <div className="grid2" style={{ marginTop: 16 }}>
        <section className="panel">
          <h3>Runs</h3>
          <table className="records">
            <thead><tr><th>when</th><th>agent</th><th>status</th><th>ms</th><th /></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.traceId} className={selected?.trace.traceId === t.traceId ? 'row-selected' : undefined}>
                  <td className="mono">{t.startedAt.slice(11, 19)}</td>
                  <td>{t.agentId}<div className="mono">{t.traceId}</div></td>
                  <td className={t.status === 'failed' ? 'bad' : undefined}>{t.status}</td>
                  <td className="mono">{t.durationMs}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-quiet" type="button" onClick={() => void open(t.traceId, 'selected')}>open</button>
                    <button className="btn-quiet" type="button" onClick={() => void open(t.traceId, 'compare')}>compare</button>
                    <button className="btn-quiet" type="button" onClick={() => void replay(t)}>replay</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={5}>No runs yet. Ask the agent something and come back.</td></tr> : null}
            </tbody>
          </table>
        </section>

        <div>
          {selected ? <Waterfall detail={selected} onPayload={(ref) => void showPayload(selected, ref)} /> : (
            <section className="panel"><h3>Waterfall</h3><p className="footnote" style={{ marginTop: 0 }}>Open a run to see its spans.</p></section>
          )}

          {compare && selected ? (
            <section className="panel">
              <h3>Compared with {compare.trace.traceId}</h3>
              <table className="records">
                <thead><tr><th>span</th><th>this</th><th>that</th><th>Δ</th></tr></thead>
                <tbody>
                  {spanNames(selected, compare).map((name) => {
                    const a = selected.spans.find((s) => s.name === name)?.durationMs ?? null;
                    const b = compare.spans.find((s) => s.name === name)?.durationMs ?? null;
                    const delta = a !== null && b !== null ? a - b : null;
                    return (
                      <tr key={name}>
                        <td>{name}</td>
                        <td className="mono">{a ?? '—'}</td>
                        <td className="mono">{b ?? '—'}</td>
                        <td className={`mono ${delta !== null && Math.abs(delta) > 100 ? 'bad' : ''}`}>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}ms`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button className="btn-quiet" type="button" onClick={() => setCompare(null)}>clear comparison</button>
            </section>
          ) : null}

          {payload ? (
            <section className="panel">
              <h3>What the model was given</h3>
              {typeof payload.prompt === 'string' ? <pre className="dump">{payload.prompt as string}</pre> : null}
              {Array.isArray(payload.chunks) ? (
                <>
                  <h3>Sources in context</h3>
                  <table className="records">
                    <tbody>
                      {(payload.chunks as { sourceId: string; ref: string; title: string; via: string }[]).map((c) => (
                        <tr key={c.sourceId + c.ref}><td className="mono">{c.sourceId}</td><td>{c.title}<div className="mono">{c.ref} · {c.via}</div></td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
              {payload.output_raw !== payload.output_released ? (
                <>
                  <h3>Removed by the egress guard</h3>
                  <p className="footnote" style={{ marginTop: 0 }}>
                    The model wrote the first; the second is what was released. The difference is
                    what the guard took out, which is the only place you can see it.
                  </p>
                  <pre className="dump">{String(payload.output_raw)}</pre>
                  <pre className="dump">{String(payload.output_released)}</pre>
                </>
              ) : (
                <>
                  <h3>Output</h3>
                  <pre className="dump">{String(payload.output_released ?? '')}</pre>
                </>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function spanNames(a: Detail, b: Detail): string[] {
  return [...new Set([...a.spans.map((s) => s.name), ...b.spans.map((s) => s.name)])];
}

function Waterfall({ detail, onPayload }: { detail: Detail; onPayload: (ref: string) => void }) {
  const spans = [...detail.spans].sort(
    (x, y) => x.startedAt.localeCompare(y.startedAt) || (KIND_ORDER[x.kind] ?? 9) - (KIND_ORDER[y.kind] ?? 9),
  );
  const t0 = spans.length ? new Date(spans[0].startedAt).getTime() : 0;
  const total = Math.max(detail.trace.durationMs ?? 1, 1);

  return (
    <section className="panel">
      <h3>{detail.trace.agentId} · {detail.trace.durationMs}ms · {detail.trace.status}</h3>
      <div className="waterfall">
        {spans.map((s) => {
          const offset = ((new Date(s.startedAt).getTime() - t0) / total) * 100;
          const width = Math.max(((s.durationMs ?? 0) / total) * 100, 1.5);
          return (
            <div className="wf-row" key={s.spanId}>
              <span className="wf-name" title={s.name}>{s.name}</span>
              <span className="wf-track">
                <span
                  className={`wf-bar wf-${s.kind} ${s.status === 'error' || s.status === 'denied' ? 'wf-bad' : ''}`}
                  style={{ marginLeft: `${Math.min(offset, 98)}%`, width: `${Math.min(width, 100 - Math.min(offset, 98))}%` }}
                />
              </span>
              <span className="wf-ms mono">{s.durationMs}ms</span>
              {s.payloadRef ? (
                <button className="btn-quiet" type="button" onClick={() => onPayload(s.payloadRef as string)}>payload</button>
              ) : <span />}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 20 }}>Annotations</h3>
      <table className="records">
        <tbody>
          {detail.annotations.map((a, i) => (
            <tr key={i}>
              <td className="mono">{a.kind}</td>
              <td className="mono" style={{ wordBreak: 'break-word' }}>{JSON.stringify(a.payload).slice(0, 220)}</td>
            </tr>
          ))}
          {detail.annotations.length === 0 ? <tr><td>nothing recorded</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}
