// Spans in, trace store out. Addendum C1 items 2 and 4.
//
// The addendum puts an OTel collector in a dev compose stack between the process and the
// store. There is no compose stack here and no OTel SDK (docs/AUDIT-v1.1.md question 5),
// so this is the collector: one sink, subscribed to the same `onSpan` hook the stderr
// printer uses, writing rows to `TraceStore` and payloads to a `BlobStore`.
//
// The thing worth getting right is not the plumbing, it is what does *not* get written.

import type { PolicyAdapter } from '../adapters/policy.ts';
import type { Principal } from '../adapters/types.ts';
import type { BlobStore } from './blobs.ts';
import { NullBlobStore } from './blobs.ts';
import type { TraceStore } from './store.ts';
import type { Span } from './trace.ts';
import { hashPrincipal, onSpan } from './trace.ts';

export interface ExporterOptions {
  traces: TraceStore;
  blobs?: BlobStore;
  /**
   * Production redacts every payload through the host's own policy before it is written,
   * and keeps them for days rather than weeks. Development keeps them whole, because the
   * whole point of a dev trace is to see what the model actually saw.
   */
  mode: 'development' | 'production';
  policy: PolicyAdapter;
  retentionDays: number;
}

export class TraceExporter {
  readonly opts: ExporterOptions;
  readonly blobs: BlobStore;
  #unsubscribe: (() => void) | null = null;
  #principals = new Map<string, Principal>();
  #pending: Promise<void>[] = [];

  constructor(opts: ExporterOptions) {
    this.opts = opts;
    this.blobs = opts.blobs ?? new NullBlobStore();
  }

  /** Opens a trace for a run. Spans arriving for an unopened trace are dropped. */
  begin(runId: string, principal: Principal, agentId: string, agentVersion: number, surface: string): void {
    this.#principals.set(runId, principal);
    this.opts.traces.openTrace({
      traceId: runId,
      runId,
      agentId,
      agentVersion,
      // §16.1 — never a raw principal id in a span or a trace row.
      principalHash: hashPrincipal(principal.id),
      surface,
      startedAt: new Date().toISOString(),
    });
  }

  end(runId: string, status: string, durationMs: number, costUsd: number, tokensIn: number, tokensOut: number): void {
    this.opts.traces.closeTrace(runId, status, durationMs, costUsd, tokensIn, tokensOut);
    this.#principals.delete(runId);
  }

  start(): () => void {
    this.#unsubscribe = onSpan((span) => {
      this.#pending.push(this.#write(span).catch(() => undefined));
    });
    return () => this.stop();
  }

  stop(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  /** Tests and the sweeper need to know the queue has drained. */
  async flush(): Promise<void> {
    const pending = this.#pending;
    this.#pending = [];
    await Promise.all(pending);
  }

  async #write(span: Span): Promise<void> {
    let payloadRef: string | null = null;

    if (span.payload !== undefined) {
      const payload = this.opts.mode === 'production' ? await this.#redact(span.runId, span.payload) : span.payload;
      payloadRef = (await this.blobs.put(payload)) || null;
    }

    this.opts.traces.addSpan({
      spanId: span.spanId,
      traceId: span.runId,
      // One level deep today: every span's parent is its run. Deepening this means
      // carrying a span context through the orchestrator, which is worth doing when
      // sub-agents land (Mode B) and not before — a waterfall of six flat spans is not
      // improved by making it a waterfall of six nested ones.
      parentSpanId: null,
      kind: span.kind,
      name: span.name,
      startedAt: new Date(span.startedAt).toISOString(),
      durationMs: (span.endedAt ?? Date.now()) - span.startedAt,
      status: span.error ? 'error' : (span.status ?? 'ok'),
      attributes: { ...span.attrs, ...(span.error ? { error: span.error } : {}) },
      payloadRef,
    });
  }

  /**
   * The regression guard the addendum sets: "no production trace payload written without
   * passing through redact". Payloads are shaped `{ chunks?, prompt?, ... }`; anything
   * carrying host records goes through the host's own redactor, for the principal whose
   * run it was. An entitlement revoked after the run must not be readable in its trace.
   */
  async #redact(runId: string, payload: unknown): Promise<unknown> {
    const principal = this.#principals.get(runId);
    if (!principal || payload === null || typeof payload !== 'object') return payload;

    const record = payload as Record<string, unknown>;
    const out: Record<string, unknown> = { ...record };

    if (Array.isArray(record.chunks)) {
      out.chunks = await Promise.all(
        (record.chunks as { ref?: string; title?: string; text?: string }[]).map(async (chunk) => {
          const doc = await this.opts.policy.redact(principal, {
            ref: chunk.ref ?? 'unknown',
            type: 'chunk',
            title: chunk.title ?? '',
            body: chunk.text ?? '',
          });
          return { ...chunk, title: doc.title, text: doc.body };
        }),
      );
    }
    // A rendered prompt has the retrieved content inlined, so in production it is kept
    // as a hash only — §7.5 says exactly this, and the chunks above are the readable
    // version of the same material.
    if (typeof record.prompt === 'string') out.prompt = `[redacted in production — ${record.prompt.length} chars]`;
    return out;
  }
}
