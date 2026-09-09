'use client';

/**
 * The stream client, promoted.
 *
 * `coding`, `doc` and `content` each had their own copy of this, differing only in
 * which reducer they fold through and which script they ask for. Three uses is the
 * trigger in both house rules — "no abstraction until the third use" and the
 * promotion rule — so it lives here now and the three surfaces share it.
 *
 * Three things in here are load-bearing and were in all three copies:
 *
 * - **`AbortController` on every stream**, aborted on unmount, on navigation and on
 *   restart. A leaked SSE connection per surface visit degrades the app quietly.
 * - **Never one `setState` per event.** Events queue and flush on an animation
 *   frame. A prototype that stutters can't be used to evaluate motion, which is half
 *   of what these are for. (In a hidden tab `requestAnimationFrame` doesn't fire, so
 *   the queue drains in one flush when you look at it — correct, and surprising the
 *   first time you watch it.)
 * - **The person's own actions fold through the same reducer** as the agent's
 *   events, via `apply`. One state machine, not two.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, FaultKind } from '../agent-runtime';

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export interface StartOptions {
  seed?: number;
  speed?: number;
  jitter?: number;
  faults?: FaultKind[];
}

export interface StreamMeta {
  script: string;
  seed: number;
  faults: FaultKind[];
  speed: number;
}

export function useAgentStream<S>({
  script,
  initial,
  reduceAll,
}: {
  /** The script name the SSE route should play. */
  script: string;
  initial: S;
  reduceAll: (state: S, events: AgentEvent[]) => S;
}) {
  const [state, setState] = useState<S>(initial);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [meta, setMeta] = useState<StreamMeta | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const queueRef = useRef<AgentEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const stateRef = useRef<S>(initial);
  const reduceRef = useRef(reduceAll);
  reduceRef.current = reduceAll;

  const flush = useCallback(() => {
    frameRef.current = null;
    const batch = queueRef.current;
    if (!batch.length) return;
    queueRef.current = [];
    stateRef.current = reduceRef.current(stateRef.current, batch);
    setState(stateRef.current);
  }, []);

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(flush);
  }, [flush]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback(
    async (options: StartOptions = {}) => {
      stop();
      const controller = new AbortController();
      abortRef.current = controller;

      queueRef.current = [];
      stateRef.current = initial;
      setState(initial);
      setMeta(null);
      setStatus('streaming');

      try {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script, seed: 1, speed: 1, ...options }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(detail.error ?? `Stream failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // SSE framing by hand: two lines of parsing, and EventSource can't POST.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let split: number;
          while ((split = buffer.indexOf('\n\n')) !== -1) {
            const raw = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const line = raw.startsWith('data: ') ? raw.slice(6) : raw;
            if (!line.trim()) continue;

            const parsed = JSON.parse(line) as AgentEvent | ({ t: 'meta' | 'meta.end' } & Partial<StreamMeta>);
            if (parsed.t === 'meta') {
              const { seed = 0, faults = [], speed = 1 } = parsed as Partial<StreamMeta>;
              setMeta({ script, seed, faults, speed });
              continue;
            }
            if (parsed.t === 'meta.end') continue;

            queueRef.current.push(parsed as AgentEvent);
            schedule();
          }
        }

        flush();
        setStatus('done');
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        flush();
        stateRef.current = reduceRef.current(stateRef.current, [
          { t: 'error', kind: 'network', message: (error as Error).message, retryable: true },
        ]);
        setState(stateRef.current);
        setStatus('error');
      }
    },
    [flush, initial, schedule, script, stop],
  );

  /** Apply events the person caused — answering, correcting, approving. */
  const apply = useCallback((events: AgentEvent[]) => {
    stateRef.current = reduceRef.current(stateRef.current, events);
    setState(stateRef.current);
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return { state, status, meta, start, stop, apply };
}
