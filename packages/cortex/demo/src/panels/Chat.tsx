// The chat surface, rendered entirely in Atlas's own components.
//
// Every state in §13.4 that this slice can reach has a rendering here: empty with
// suggestions, first-token skeleton, streaming, tool-running by human name, citations,
// permission-filtered, no-answer, fallback-model-used, budget-exceeded, rate-limited,
// awaiting approval, and failure with a retry.

import { useEffect, useRef, useState } from 'react';
import { motion, staggerChildren } from '@cloud-march/motion/react';
import { useAgentThread } from '../../../src/ui-headless/index.ts';
import type { CortexClient } from '../../../src/sdk/client.ts';
import { AnswerText, Bubble, BlockRenderer, CitationChip, EmptyState, ErrorState, NoticeLine, Skeleton, StreamingCursor, WorkingState, ApprovalPrompt } from '../design/adapter.tsx';

export function Chat({ client, agentId, agentName, canComment }: { client: CortexClient; agentId: string; agentName: string; canComment: boolean }) {
  const thread = useAgentThread({ client, agentId, context: { agentName } });
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<Record<string, 'up' | 'down'>>({});
  // The propose-a-comment form. Picking arguments for a write out of free prose is a
  // model's job and the offline provider cannot do it, so the surface proposes the
  // action instead — which is how a real product would do it anyway. Proposing is not
  // authorising: it goes through the same gate as anything a model chose.
  const [proposal, setProposal] = useState<{ ref: string; body: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread.messages.length, thread.status]);

  const busy = thread.status !== 'idle' && thread.status !== 'error';

  async function submit(text: string, context?: Record<string, unknown>) {
    if (!text.trim() || busy) return;
    setDraft('');
    await thread.send(text, context);
  }

  async function proposeComment() {
    if (!proposal || busy) return;
    const { ref, body } = proposal;
    setProposal(null);
    await submit(`Leave this comment on ${ref}.`, { proposeSkill: 'docs.comment', args: { ref, body } });
  }

  async function rate(runId: string, verdict: 'up' | 'down') {
    setSent((s) => ({ ...s, [runId]: verdict }));
    await client.feedback(runId, verdict);
  }

  return (
    <>
      {thread.messages.length === 0 ? (
        <EmptyState agentName={agentName} suggestions={thread.suggestions} onPick={(p) => void submit(p)} />
      ) : (
        <motion.div className="thread" variants={staggerChildren(thread.messages.length)} initial="hidden" animate="visible">
          {thread.messages.map((m) => (
            <Bubble key={m.id} role={m.role} agentName={agentName} modelNote={m.done ? undefined : undefined}>
              {m.role === 'assistant' && m.text === '' && !m.error && m.blocks.length === 0 ? <Skeleton /> : null}
              {m.text ? (
                <>
                  <AnswerText text={m.text} citations={m.citations} />
                  {!m.done && thread.status === 'streaming' ? <StreamingCursor /> : null}
                </>
              ) : null}

              {m.blocks.map((b, i) => <BlockRenderer key={i} block={b} />)}

              {m.notices.map((n, i) => <NoticeLine key={i} notice={n} />)}

              {m.error ? <ErrorState kind={m.error.kind} message={m.error.message} onRetry={() => void submit(thread.messages.find((x) => x.id === m.id.replace(':a', ''))?.text ?? '')} /> : null}

              {m.role === 'assistant' && m.citations.length > 0 ? (
                <details>
                  <summary className="byline" style={{ cursor: 'pointer' }}>{m.citations.length} source{m.citations.length === 1 ? '' : 's'} read</summary>
                  <div className="chips" style={{ marginTop: 8 }}>
                    {m.citations.map((c) => <CitationChip key={c.sourceId} citation={c} />)}
                  </div>
                </details>
              ) : null}

              {/* §13.5 — a persistent "this was wrong" control, writing to the eval corpus. */}
              {m.role === 'assistant' && m.done && m.runId ? (
                <div className="byline">
                  <button className="btn-quiet" type="button" disabled={Boolean(sent[m.runId])} onClick={() => void rate(m.runId as string, 'up')}>
                    {sent[m.runId] === 'up' ? 'thanks' : 'useful'}
                  </button>
                  <button className="btn-quiet" type="button" disabled={Boolean(sent[m.runId])} onClick={() => void rate(m.runId as string, 'down')}>
                    {sent[m.runId] === 'down' ? 'logged for triage' : 'this was wrong'}
                  </button>
                </div>
              ) : null}
            </Bubble>
          ))}

          {thread.approval ? (
            <ApprovalPrompt
              action={thread.approval.action}
              human={thread.approval.human}
              args={thread.approval.args}
              costUsd={thread.approval.costUsd}
              onApprove={(edited) => void thread.approve(edited)}
              onReject={(reason) => void thread.reject(reason)}
            />
          ) : null}

          {thread.activeLabel ? <WorkingState label={thread.activeLabel} /> : null}
          <div ref={endRef} />
        </motion.div>
      )}

      {canComment ? (
        <div className="propose">
          {proposal ? (
            <form
              onSubmit={(e) => { e.preventDefault(); void proposeComment(); }}
            >
              <label className="field">
                <span className="field-label">record</span>
                <input value={proposal.ref} onChange={(e) => setProposal({ ...proposal, ref: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">comment</span>
                <textarea rows={2} value={proposal.body} onChange={(e) => setProposal({ ...proposal, body: e.target.value })} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={busy || !proposal.body.trim()}>Propose it</button>
                <button className="btn" type="button" onClick={() => setProposal(null)}>Cancel</button>
              </div>
              <p className="footnote" style={{ marginTop: 8 }}>
                Proposing does not write anything. It goes to the same approval gate a model's
                own choice would, and you can edit the wording there.
              </p>
            </form>
          ) : (
            <button className="btn" type="button" onClick={() => setProposal({ ref: 'doc:runbook-ingestion', body: 'The dead letter topic is drained by hand on purpose.' })}>
              Leave a comment on a record…
            </button>
          )}
        </div>
      ) : null}

      <div className="composer">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(draft);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={busy ? 'Working…' : `Ask ${agentName} something`}
            aria-label={`Ask ${agentName} something`}
            disabled={busy}
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !draft.trim()}>Ask</button>
          {busy ? <button className="btn" type="button" onClick={() => void thread.cancel()}>Stop</button> : null}
        </form>
      </div>
    </>
  );
}
