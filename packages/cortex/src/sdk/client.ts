// The TypeScript client. PRD §18 — "TypeScript SDK + React headless hooks".
//
// It speaks the §15 API and nothing else: no design decisions, no React, no host
// knowledge. `streamRun` is the interesting one — it reconnects with `Last-Event-ID`,
// so a dropped connection resumes the answer rather than restarting or losing the gap.

import type { Run, RunEvent, Step } from '../core/adapters/types.ts';
import type { ContextInspection, PromptDiff } from '../core/playground/playground.ts';
import type { SpanRow, TraceRow } from '../core/telemetry/store.ts';

export interface CostRow {
  day: string; agentId: string; runs: number; failures: number;
  costUsd: number; tokensIn: number; tokensOut: number; p50Ms: number; p95Ms: number; live: boolean;
}

export interface ClientOptions {
  baseUrl: string;
  /** The host's own session token. CORTEX never issues one. */
  token: string;
  fetchImpl?: typeof fetch;
}

export interface AgentSummary {
  id: string; version: number; name: string; description: string;
  surfaces: string[]; formats: string[];
}

export interface ApiError { kind: string; message: string; detail?: Record<string, unknown> }

export class CortexApiError extends Error {
  readonly kind: string;
  readonly detail?: Record<string, unknown>;
  constructor(e: ApiError) {
    super(e.message);
    this.name = 'CortexApiError';
    this.kind = e.kind;
    this.detail = e.detail;
  }
}

export class CortexClient {
  readonly baseUrl: string;
  #token: string;
  #fetch: typeof fetch;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#token = opts.token;
    this.#fetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  setToken(token: string): void {
    this.#token = token;
  }

  async #json<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const res = await this.#fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.#token}`,
        ...(init.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: ApiError };
    if (!res.ok) throw new CortexApiError(body.error ?? { kind: 'internal', message: `HTTP ${res.status}` });
    return body as T;
  }

  agents(surface?: string): Promise<{ agents: AgentSummary[] }> {
    return this.#json(`/v1/agents${surface ? `?surface=${surface}` : ''}`);
  }

  createThread(): Promise<{ threadId: string }> {
    return this.#json('/v1/threads', { method: 'POST' });
  }

  send(threadId: string, text: string, agentId?: string, context?: Record<string, unknown>): Promise<{ runId: string; status: string }> {
    return this.#json(`/v1/threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, agentId, context }),
    });
  }

  invoke(agentId: string, text: string, surface = 'background', context?: Record<string, unknown>): Promise<{ runId: string; status: string }> {
    return this.#json(`/v1/agents/${encodeURIComponent(agentId)}/invoke`, {
      method: 'POST',
      body: JSON.stringify({ text, surface, context }),
    });
  }

  // -- §12's async surfaces ------------------------------------------------

  notifications(): Promise<{ notifications: { id: string; title: string; body: string; runId: string | null; kind: string; createdAt: string; readAt: string | null }[] }> {
    return this.#json('/v1/notifications');
  }

  markNotificationRead(id: string): Promise<{ ok: true }> {
    return this.#json(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  }

  rules(): Promise<{ rules: { id: string; name: string; description: string; on: string; agent: string; surface: string; as: string; enabled: boolean; everySeconds?: number }[] }> {
    return this.#json('/v1/rules');
  }

  /** Atlas's own endpoints, not CORTEX's — the host owns its documents. */
  hostDocuments(): Promise<{ documents: { ref: string; title: string; body: string }[] }> {
    return this.#json('/v1/host/documents');
  }

  hostApplyEdit(ref: string, before: string, after: string): Promise<{ ok: true }> {
    return this.#json(`/v1/host/documents/${encodeURIComponent(ref)}/edit`, { method: 'POST', body: JSON.stringify({ before, after }) });
  }

  run(runId: string): Promise<{ run: Run; steps: Step[]; approval: { stepId: string; payload: unknown } | null }> {
    return this.#json(`/v1/runs/${runId}`);
  }

  trace(runId: string): Promise<{ run: Run; steps: Step[]; traces: { kind: string; at: string; payload: unknown }[] }> {
    return this.#json(`/v1/runs/${runId}/trace`);
  }

  approve(runId: string, stepId: string, decision: 'approve' | 'approve_with_edits' | 'reject_with_reason', editedArgs?: Record<string, unknown>, reason?: string): Promise<{ ok: true }> {
    return this.#json(`/v1/runs/${runId}/approve`, { method: 'POST', body: JSON.stringify({ stepId, decision, editedArgs, reason }) });
  }

  cancel(runId: string): Promise<{ ok: true }> {
    return this.#json(`/v1/runs/${runId}/cancel`, { method: 'POST' });
  }

  memory(): Promise<{ records: { id: string; type: string; key?: string; value: string; provenance: { evidence: string; at: string } }[] }> {
    return this.#json('/v1/memory/me');
  }

  forget(recordId: string): Promise<{ ok: true }> {
    return this.#json(`/v1/memory/me/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
  }

  /** §16.3 — writes into the triage queue that keeps the golden set alive. */
  feedback(runId: string, verdict: 'up' | 'down', comment?: string): Promise<{ ok: true }> {
    return this.#json(`/v1/runs/${runId}/feedback`, { method: 'POST', body: JSON.stringify({ verdict, comment }) });
  }

  traces(filter: { agent?: string; status?: string; minCost?: number; limit?: number } = {}): Promise<{ traces: TraceRow[]; stats: Record<string, unknown>[]; dashboard: CostRow[] }> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v !== undefined) q.set(k, String(v));
    return this.#json(`/v1/traces${q.size ? `?${q.toString()}` : ''}`);
  }

  traceDetail(traceId: string): Promise<{ trace: TraceRow; spans: SpanRow[]; annotations: { kind: string; at: string; payload: unknown }[] }> {
    return this.#json(`/v1/traces/${encodeURIComponent(traceId)}`);
  }

  tracePayload(traceId: string, ref: string): Promise<{ payload: unknown }> {
    return this.#json(`/v1/traces/${encodeURIComponent(traceId)}/payload/${encodeURIComponent(ref)}`);
  }

  playgroundContext(agentId: string, question: string, as?: string): Promise<ContextInspection> {
    const q = new URLSearchParams({ agent: agentId, q: question });
    if (as) q.set('as', as);
    return this.#json(`/v1/playground/context?${q.toString()}`);
  }

  promptDiff(id: string, a: number, b: number): Promise<PromptDiff> {
    return this.#json(`/v1/playground/prompt-diff?id=${encodeURIComponent(id)}&a=${a}&b=${b}`);
  }

  /**
   * Streams a run's events. `EventSource` cannot carry an Authorization header, so this
   * reads the SSE body itself — which also means it owns reconnection, and can resume
   * from the last sequence it saw rather than replaying an answer into a rendered one.
   */
  async *streamRun(runId: string, opts: { signal?: AbortSignal; after?: number } = {}): AsyncIterable<{ seq: number; event: RunEvent }> {
    let after = opts.after ?? 0;
    let attempt = 0;

    for (;;) {
      let res: Response;
      try {
        res = await this.#fetch(`${this.baseUrl}/v1/runs/${runId}/events`, {
          signal: opts.signal,
          headers: { authorization: `Bearer ${this.#token}`, 'last-event-id': String(after) },
        });
      } catch (err) {
        if (opts.signal?.aborted) return;
        if (++attempt > 5) throw err;
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
        continue;
      }

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: ApiError };
        throw new CortexApiError(body.error ?? { kind: 'internal', message: `HTTP ${res.status}` });
      }
      attempt = 0;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let terminal = false;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const id = /^id:\s*(\d+)$/m.exec(frame)?.[1];
            const data = /^data:\s*(.*)$/m.exec(frame)?.[1];
            if (!data) continue;
            const event = JSON.parse(data) as RunEvent;
            if (id) after = Number(id);
            yield { seq: after, event };
            if (event.type === 'run_completed' || event.type === 'run_failed') terminal = true;
          }
          if (terminal) break;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }

      if (terminal || opts.signal?.aborted) return;
      // The server closed without a terminal event — the run is still going, so
      // reconnect from where we stopped.
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
