/**
 * The run bus: where a running task's events live between the loop and the SSE
 * endpoint.
 *
 * This is in-process and in-memory, which is exactly as far as Phase 0 needs to
 * go and no further. A restart loses the live stream; the step rows in SQLite
 * survive, so the UI can still reconstruct what happened. When the loop moves
 * behind Inngest (PRD section 5, durable execution), this becomes a Redis
 * pub/sub or the workflow runtime's own event stream, and the `RunBus` shape is
 * what stays.
 *
 * Every event carries a monotonic `seq`, and the buffer is kept, so a client
 * that reconnects sends `Last-Event-ID` and gets everything it missed rather
 * than a gap it cannot detect.
 */

import type { RunEvent, RunEventInput } from '../types.ts';

type Listener = (event: RunEvent) => void;

class Run {
  readonly events: RunEvent[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;
  /** Set when `ask_user` is waiting; resolved by the answer endpoint. */
  pendingQuestion: { question: string; resolve: (answer: string) => void } | null = null;
  done = false;

  emit(event: RunEventInput): RunEvent {
    const full = { ...event, seq: this.seq++, at: new Date().toISOString() } as RunEvent;
    this.events.push(full);
    for (const listener of this.listeners) {
      // One broken listener must not take down the run.
      try {
        listener(full);
      } catch {
        /* ignore */
      }
    }
    return full;
  }

  subscribe(listener: Listener, afterSeq = -1): () => void {
    for (const event of this.events) {
      if (event.seq > afterSeq) listener(event);
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Hung off `globalThis`, not a module-level `const`.
 *
 * Next's dev server compiles each route into its own bundle and reloads them
 * independently, so `/api/tasks` (which starts the loop) and
 * `/api/tasks/[id]/events` (which reads it) can end up holding two different
 * copies of this module — and therefore two different maps. The symptom is an
 * SSE stream that connects, finds no run, closes, and reconnects forever. One
 * object on the global scope is the standard way out, and it costs nothing in
 * production where the bundles are shared anyway.
 */
const globalRuns = globalThis as typeof globalThis & { __runnerRuns?: Map<string, Run> };
const runs: Map<string, Run> = (globalRuns.__runnerRuns ??= new Map<string, Run>());

export function openRun(taskId: string): Run {
  const run = new Run();
  runs.set(taskId, run);
  return run;
}

export function getRun(taskId: string): Run | undefined {
  return runs.get(taskId);
}

export function closeRun(taskId: string): void {
  const run = runs.get(taskId);
  if (!run) return;
  run.done = true;
  // Kept for a while so a client that reconnects after the final event still
  // receives the tail instead of a 404. Nothing here is the source of truth;
  // the step rows are.
  setTimeout(() => runs.delete(taskId), 5 * 60_000).unref?.();
}

export type { Run };
