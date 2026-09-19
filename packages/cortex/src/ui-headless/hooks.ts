// React hooks. PRD §13.2.
//
// These carry state and nothing else. There is not a colour, a class name, or a CSS
// import in this directory, and `pnpm lint` fails the build if one appears — the host's
// design system supplies every pixel (§13.1).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CortexClient } from '../sdk/client.ts';
import type { Run, Step } from '../core/adapters/types.ts';
import { emptyThread, suggestionsFor, threadReducer } from './thread-state.ts';
import type { ThreadState } from './thread-state.ts';

export interface UseAgentThreadOptions {
  client: CortexClient;
  agentId: string;
  /** Surface context, injected into the empty state's suggestions. */
  context?: { entityTitle?: string; agentName?: string };
}

export interface UseAgentThread extends ThreadState {
  threadId: string | null;
  /**
   * `context` is the surface's own contribution to the turn — what the user has
   * selected, or an action the surface is proposing. It reaches the agent as the run's
   * trigger context and is governed like anything else.
   */
  send: (text: string, context?: Record<string, unknown>) => Promise<void>;
  approve: (editedArgs?: Record<string, unknown>) => Promise<void>;
  reject: (reason: string) => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
  suggestions: { id: string; label: string; prompt: string }[];
}

export function useAgentThread(opts: UseAgentThreadOptions): UseAgentThread {
  const { client, agentId } = opts;
  const [state, dispatch] = useReducer(threadReducer, undefined, emptyThread);
  const [threadId, setThreadId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string, context?: Record<string, unknown>) => {
      const id = `m${Date.now()}`;
      dispatch({ type: 'user_message', id, text });

      let thread = threadId;
      if (!thread) {
        thread = (await client.createThread()).threadId;
        setThreadId(thread);
      }

      const { runId } = await client.send(thread, text, agentId, context);
      dispatch({ type: 'run_attached', id, runId });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const { seq, event } of client.streamRun(runId, { signal: controller.signal })) {
          dispatch({ type: 'event', seq, event });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'event',
            seq: 0,
            event: { type: 'run_failed', runId, error: { kind: 'internal', message: err instanceof Error ? err.message : String(err) } },
          });
        }
      }
    },
    [agentId, client, threadId],
  );

  const resumeStream = useCallback(
    async (runId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      for await (const { seq, event } of client.streamRun(runId, { signal: controller.signal, after: state.lastSeq })) {
        dispatch({ type: 'event', seq, event });
      }
    },
    [client, state.lastSeq],
  );

  const approve = useCallback(
    async (editedArgs?: Record<string, unknown>) => {
      if (!state.approval) return;
      const { runId, stepId } = state.approval;
      await client.approve(runId, stepId, editedArgs ? 'approve_with_edits' : 'approve', editedArgs);
      dispatch({ type: 'approval_resolved' });
      await resumeStream(runId);
    },
    [client, resumeStream, state.approval],
  );

  const reject = useCallback(
    async (reason: string) => {
      if (!state.approval) return;
      const { runId, stepId } = state.approval;
      await client.approve(runId, stepId, 'reject_with_reason', undefined, reason);
      dispatch({ type: 'approval_resolved' });
      await resumeStream(runId);
    },
    [client, resumeStream, state.approval],
  );

  const cancel = useCallback(async () => {
    const runId = [...state.messages].reverse().find((m) => m.runId)?.runId;
    if (runId) await client.cancel(runId);
    abortRef.current?.abort();
  }, [client, state.messages]);

  const suggestions = useMemo(() => suggestionsFor(opts.context ?? {}), [opts.context]);

  return {
    ...state,
    threadId,
    send,
    approve,
    reject,
    cancel,
    reset: () => dispatch({ type: 'reset' }),
    suggestions,
  };
}

/** §13.2 — for the rule and background surfaces, which have no thread to attach to. */
export function useAgentRun(client: CortexClient, runId: string | null): { run: Run | null; steps: Step[]; progress: string | null } {
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      const snapshot = await client.run(runId);
      if (cancelled) return;
      setRun(snapshot.run);
      setSteps(snapshot.steps);
      for await (const { event } of client.streamRun(runId, { signal: controller.signal })) {
        if (event.type === 'step_started') setProgress(event.label);
        if (event.type === 'progress') setProgress(event.message);
        if (event.type === 'run_completed' || event.type === 'run_failed') {
          const final = await client.run(runId);
          setRun(final.run);
          setSteps(final.steps);
          setProgress(null);
        }
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [client, runId]);

  return { run, steps, progress };
}
