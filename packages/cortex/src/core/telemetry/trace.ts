// Spans. PRD §16.1 — LangSmith in pre-production, OpenTelemetry in production.
//
// Neither is wired to a collector in this slice; what is implemented is the part that
// makes either one useful later: a span shape with the required attributes, and the rule
// that a raw principal id never reaches a production span.

import crypto from 'node:crypto';

export type SpanKind = 'model' | 'skill' | 'retrieval' | 'gate' | 'subagent' | 'internal';

export interface Span {
  name: string;
  runId: string;
  /** OTel span kind, as the trace store's `spans.kind` column (addendum C1). */
  kind: SpanKind;
  spanId: string;
  startedAt: number;
  endedAt?: number;
  attrs: Record<string, string | number | boolean | undefined>;
  status?: 'ok' | 'error' | 'denied' | 'timeout' | 'awaiting';
  /**
   * Anything too large for a span row: rendered prompts, retrieved chunks, model output.
   * The exporter writes these to the blob store and keeps only the key. Never inline.
   */
  payload?: unknown;
  error?: string;
}

const SALT = process.env.CORTEX_SPAN_SALT ?? 'cortex-dev-salt';

/** §16.1 — `principal_id` never appears in a production span. */
export function hashPrincipal(id: string): string {
  return 'p_' + crypto.createHash('sha256').update(SALT + id).digest('hex').slice(0, 16);
}

export type SpanSink = (span: Span) => void;

const sinks: SpanSink[] = [];
export function onSpan(sink: SpanSink): () => void {
  sinks.push(sink);
  return () => void sinks.splice(sinks.indexOf(sink), 1);
}

if (process.env.CORTEX_TRACE === '1') {
  onSpan((s) => {
    const ms = (s.endedAt ?? Date.now()) - s.startedAt;
    process.stderr.write(`  · ${s.name.padEnd(22)} ${String(ms).padStart(5)}ms  ${JSON.stringify(s.attrs)}\n`);
  });
}

/** Span kinds by name prefix, so call sites do not repeat themselves. */
function kindOf(name: string): SpanKind {
  if (name.startsWith('router.') || name.startsWith('model.')) return 'model';
  if (name.startsWith('skill.')) return 'skill';
  if (name.startsWith('grounding') || name.startsWith('retrieval')) return 'retrieval';
  if (name.startsWith('gate')) return 'gate';
  if (name.startsWith('subagent')) return 'subagent';
  return 'internal';
}

let counter = 0;
export const newSpanId = (): string => `sp_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export async function span<T>(
  name: string,
  runId: string,
  attrs: Span['attrs'],
  fn: (set: (more: Span['attrs']) => void, attach: (payload: unknown) => void) => Promise<T>,
): Promise<T> {
  const s: Span = { name, runId, kind: kindOf(name), spanId: newSpanId(), startedAt: Date.now(), attrs: { ...attrs } };
  try {
    const out = await fn(
      (more) => Object.assign(s.attrs, more),
      (payload) => { s.payload = payload; },
    );
    s.status = 'ok';
    return out;
  } catch (err) {
    s.error = err instanceof Error ? err.message : String(err);
    s.status = 'error';
    throw err;
  } finally {
    s.endedAt = Date.now();
    s.attrs.latency_ms = s.endedAt - s.startedAt;
    emit(s);
  }
}

/** For work whose start and end are not one lexical scope — the workflow's steps. */
export function record(s: Span): void {
  emit(s);
}

function emit(s: Span): void {
  for (const sink of sinks) sink(s);
}
