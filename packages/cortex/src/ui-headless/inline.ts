// `useInlineAgent` — PRD §13.2's third hook.
//
// The person selects a passage and asks for a change. The agent proposes; accepting is
// the host's own write, which is why `accept` takes a callback rather than calling
// anything here. This hook owns the state of a proposal, and nothing else.

import { useCallback, useRef, useState } from 'react';
import type { CortexClient } from '../sdk/client.ts';

export interface InlineSelection {
  ref: string;
  title: string;
  body: string;
  selection: string;
}

export type InlineStatus = 'idle' | 'drafting' | 'ready' | 'unchanged' | 'error';

export interface UseInlineAgent {
  status: InlineStatus;
  /** Streams in as the model writes, so the editor can show the edit forming. */
  draft: string;
  proposal: { before: string; after: string } | null;
  error: { kind: string; message: string } | null;
  fallbackUsed: boolean;
  propose: (instruction: string) => Promise<void>;
  /** Hands the accepted text back to the host. The host does the writing. */
  accept: (apply: (before: string, after: string) => Promise<void>) => Promise<void>;
  reject: () => void;
}

export function useInlineAgent(opts: { client: CortexClient; agentId: string; selection: InlineSelection | null }): UseInlineAgent {
  const { client, agentId, selection } = opts;
  const [status, setStatus] = useState<InlineStatus>('idle');
  const [draft, setDraft] = useState('');
  const [proposal, setProposal] = useState<{ before: string; after: string } | null>(null);
  const [error, setError] = useState<{ kind: string; message: string } | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const propose = useCallback(
    async (instruction: string) => {
      if (!selection) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('drafting');
      setDraft('');
      setProposal(null);
      setError(null);
      setFallbackUsed(false);

      try {
        const { runId } = await client.invoke(agentId, instruction, 'inline', {
          ref: selection.ref,
          title: selection.title,
          body: selection.body,
          selection: selection.selection,
        });

        for await (const { event } of client.streamRun(runId, { signal: controller.signal })) {
          if (event.type === 'token') setDraft((d) => d + event.text);
          else if (event.type === 'notice' && event.kind === 'fallback_model_used') setFallbackUsed(true);
          else if (event.type === 'block' && event.block.type === 'diff_proposal') {
            setProposal({ before: event.block.before, after: event.block.after });
            // "Nothing needed changing" is an answer, not a failure — and a UI that
            // shows an empty diff as a proposal makes people accept a no-op.
            setStatus(event.block.before.trim() === event.block.after.trim() ? 'unchanged' : 'ready');
          } else if (event.type === 'run_failed') {
            setError(event.error);
            setStatus('error');
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError({ kind: 'internal', message: err instanceof Error ? err.message : String(err) });
          setStatus('error');
        }
      }
    },
    [agentId, client, selection],
  );

  const accept = useCallback(
    async (apply: (before: string, after: string) => Promise<void>) => {
      if (!proposal) return;
      await apply(proposal.before, proposal.after);
      setProposal(null);
      setDraft('');
      setStatus('idle');
    },
    [proposal],
  );

  const reject = useCallback(() => {
    abortRef.current?.abort();
    setProposal(null);
    setDraft('');
    setStatus('idle');
  }, []);

  return { status, draft, proposal, error, fallbackUsed, propose, accept, reject };
}
