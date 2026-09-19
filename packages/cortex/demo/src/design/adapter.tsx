// Atlas's DesignSystemAdapter — adapter 8 of 8 (PRD §5.3, §13).
//
// This is the host's side of the rendering contract. CORTEX decides *what* to show
// (a bubble, an entity card, a skill call, an approval, a citation, an error state);
// Atlas decides entirely what those look like. Nothing in this file is importable from
// the agent layer, and nothing in the agent layer is styled.
//
// Two UX-database rules are applied here rather than left to taste:
//   · AI-generated content is labelled, every time, with the agent that produced it
//     (ux-guidelines: "Disclaimer", severity High).
//   · Errors and live status are announced, not only coloured (ux-guidelines:
//     "Error Messages", severity High) — hence role="alert" and aria-live below.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { CortexClient } from '../../../src/sdk/client.ts';
import { motion, rise, useMotionSafe } from '@cloud-march/motion/react';
import type { Block, EntityRef } from '../../../src/core/adapters/types.ts';
import type { Citation, Notice } from '../../../src/ui-headless/index.ts';
import { entityByRef } from '../data.ts';

export function Bubble({ role, agentName, modelNote, children }: { role: 'user' | 'assistant'; agentName?: string; modelNote?: string; children: ReactNode }) {
  const variants = useMotionSafe(rise(6));
  return (
    <motion.div className={`bubble bubble-${role}`} variants={variants} initial="hidden" animate="visible">
      <div className="byline">
        {role === 'user' ? (
          <span>You</span>
        ) : (
          <>
            <span className="agent">{agentName ?? 'Agent'}</span>
            <span>·</span>
            <span>AI generated{modelNote ? ` · ${modelNote}` : ''}</span>
          </>
        )}
      </div>
      <div className="bubble-body">{children}</div>
    </motion.div>
  );
}

export function StreamingCursor() {
  return <span className="cursor" aria-hidden="true" />;
}

export function EntityCard({ refId, density, reason }: { refId: EntityRef; density: 'compact' | 'full'; reason?: string }) {
  const entity = entityByRef(refId);
  // A "reason" that just repeats the title tells the reader nothing and makes the card
  // look broken. Drop it rather than render the same line twice.
  const useful = reason && entity && reason.trim().toLowerCase() !== entity.title.trim().toLowerCase() ? reason : undefined;
  // A ref the host does not recognise still renders — as its ref. Never a crash, and
  // never a silently dropped card the user cannot tell was there.
  return (
    <div className={`card entity ${density === 'full' ? 'entity-full' : ''}`}>
      <span className="ref">{refId}</span>
      <span className="title">{entity?.title ?? 'Unknown record'}</span>
      {useful ? <span className="reason">{useful}</span> : null}
      {density === 'full' && entity ? <span className="body">{entity.body.split('\n\n')[0]}</span> : null}
    </div>
  );
}

export function SkillCallCard({ skill, humanName, args, state }: { skill: string; humanName: string; args: Record<string, unknown>; state: string }) {
  return (
    <div className="skillcard">
      <span className="name">{humanName}</span>
      <span className="args">{JSON.stringify(args)}</span>
      <span className={`state ${state === 'error' ? 'bad' : ''}`} title={skill}>
        {state === 'ok' ? 'done' : state === 'error' ? 'not done' : state.replace('_', ' ')}
      </span>
    </div>
  );
}

/**
 * §11.2 — the response carries `[^s3]` markers, and every one of them was verified
 * against what retrieval actually returned before it got here. Atlas renders them as
 * inline marks tied to the source, rather than leaving the raw syntax in the prose.
 */
export function AnswerText({ text, citations }: { text: string; citations: Citation[] }) {
  const byId = new Map(citations.map((c) => [c.sourceId, c]));
  const parts = text.split(/(\[\^[A-Za-z0-9_-]+\])/g);
  return (
    <p>
      {parts.map((part, i) => {
        const m = /^\[\^([A-Za-z0-9_-]+)\]$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const citation = byId.get(m[1]);
        return (
          <sup key={i} className="cite" title={citation ? `${citation.title} · ${citation.ref}` : m[1]}>
            {m[1]}
          </sup>
        );
      })}
    </p>
  );
}

export function CitationChip({ citation }: { citation: Citation }) {
  const entity = entityByRef(citation.ref);
  return (
    <span className="chip" title={entity?.title ?? citation.ref}>
      <span className="n">{citation.sourceId}</span>
      {citation.title}
    </span>
  );
}

/** Every §13.4 state that is not an error, rendered as information rather than alarm. */
export function NoticeLine({ notice }: { notice: Notice }) {
  const alarming = notice.kind === 'permission_filtered' || notice.kind === 'no_answer';
  return (
    <div className={`notice ${alarming ? 'notice-alarm' : ''}`} role="status">
      <span className="kind">{notice.kind.replace(/_/g, ' ')}</span>
      <span>{notice.message}</span>
    </div>
  );
}

export function ErrorState({ kind, message, onRetry }: { kind: string; message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-alarm" role="alert">
      <span className="kind">{kind.replace(/_/g, ' ')}</span>
      <span>
        {message}
        {onRetry ? (
          <>
            {' '}
            <button className="btn-quiet" onClick={onRetry} type="button">Try again</button>
          </>
        ) : null}
      </span>
    </div>
  );
}

/** The tool-running state, by the skill's human name — never by its id. */
export function WorkingState({ label }: { label: string }) {
  return (
    <div className="status" aria-live="polite">
      <span className="dot" />
      <span>{label}…</span>
    </div>
  );
}

export function Skeleton() {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 8, maxWidth: '38ch' }}>
      <div className="skeleton" />
      <div className="skeleton" style={{ width: '80%' }} />
    </div>
  );
}

/**
 * §13.4: "The empty state is the highest-leverage screen in the product." Three to five
 * suggestions drawn from what the person is looking at, not a generic welcome.
 */
export function EmptyState({ suggestions, onPick, agentName }: { suggestions: { id: string; label: string; prompt: string }[]; onPick: (prompt: string) => void; agentName: string }) {
  return (
    <div className="empty">
      <h2>Ask {agentName} about Atlas</h2>
      <p>
        It reads only what you are allowed to read, cites what it used, and says so when it
        finds nothing. Start with one of these:
      </p>
      <ul>
        {suggestions.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.prompt)}>
              {s.label}
              <span className="prompt">{s.prompt}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * §9.2 — three outcomes, and `approve_with_edits` is the one that matters: the arguments
 * are editable, because the common case is a draft that is nearly right. An approval
 * dialog that only says yes or no turns every small wording change into a new turn.
 */
export function ApprovalPrompt({ action, human, args, costUsd, onApprove, onReject }: { action: string; human: string; args: Record<string, unknown>; costUsd: number; onApprove: (edited?: Record<string, unknown>) => void; onReject: (reason: string) => void }) {
  const [draft, setDraft] = useState(args);
  const [reason, setReason] = useState('');
  const edited = JSON.stringify(draft) !== JSON.stringify(args);

  return (
    <div className="card approval" role="alert">
      <div className="byline"><span className="agent">approval needed</span><span>·</span><span>{action}</span></div>
      <p style={{ marginTop: 0 }}>{human}</p>

      {Object.entries(draft).map(([key, value]) => (
        <label className="field" key={key}>
          <span className="field-label">{key}</span>
          {String(value).length > 60 ? (
            <textarea
              rows={3}
              value={String(value)}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
            />
          ) : (
            <input value={String(value)} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} />
          )}
        </label>
      ))}

      <p className="footnote" style={{ marginTop: 8 }}>
        This has not happened yet. Proceeding costs about ${costUsd.toFixed(3)}.
        {edited ? ' Your edits are what will be used.' : ''}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="button" onClick={() => onApprove(edited ? draft : undefined)}>
          {edited ? 'Approve with edits' : 'Approve'}
        </button>
        <input
          className="reason"
          placeholder="reason for rejecting"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason for rejecting"
        />
        <button className="btn" type="button" onClick={() => onReject(reason || 'not right')}>Reject</button>
      </div>
    </div>
  );
}

/** §13.3 — an unregistered block type degrades to text instead of crashing the thread. */
export function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case 'entity_card':
      return <EntityCard refId={block.ref} density={block.density} reason={block.reason} />;
    case 'skill_call':
      return <SkillCallCard skill={block.skill} humanName={humanNameFor(block.skill)} args={block.args} state={block.state} />;
    case 'text':
      return <p>{block.text}</p>;
    case 'diff_proposal':
      return (
        <div className="card">
          <span className="ref">{block.target}</span>
          <div className="diff">
            <div className="removed">{block.before}</div>
            <div className="added">{block.after}</div>
          </div>
        </div>
      );
    case 'choice':
      return (
        <div className="card">
          <p style={{ margin: 0 }}>{block.prompt}</p>
          <div className="chips" style={{ marginTop: 8 }}>
            {block.options.map((o) => <span className="chip" key={o.id}>{o.label}</span>)}
          </div>
        </div>
      );
    default:
      return <p>{JSON.stringify(block)}</p>;
  }
}

/**
 * The notification bell. It holds the live subscription to this principal's notification
 * stream — which is the cross-device path, since the subscription is to the person and
 * not to the session. Open the app twice and both bells ring.
 */
export function Bell({ client, principalId, onOpen }: { client: CortexClient; principalId: string; onOpen: () => void }) {
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await client.notifications();
        if (cancelled) return;
        setUnread(res.notifications.filter((n) => !n.readAt).length);
      } catch {
        // An unreachable inbox is not worth an error state in the chrome.
      }
    })();
    // Poll the count; the panel itself shows the detail. A dedicated SSE connection for
    // a number in the corner is not worth a socket per tab.
    const timer = setInterval(async () => {
      try {
        const res = await client.notifications();
        if (cancelled) return;
        const fresh = res.notifications.filter((n) => !n.readAt);
        setUnread(fresh.length);
        setLatest(fresh[0]?.title ?? null);
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [client, principalId]);

  return (
    <button className={`bell ${unread ? 'bell-unread' : ''}`} type="button" onClick={onOpen} title={latest ?? 'Notifications'}>
      <span aria-hidden="true">●</span>
      <span>{unread ? `${unread} waiting` : 'nothing waiting'}</span>
    </button>
  );
}

const HUMAN_NAMES: Record<string, string> = {
  'people.search': 'Finding people',
  'projects.status': 'Checking project status',
  'decisions.history': 'Tracing a decision',
};

export function humanNameFor(skillId: string): string {
  return HUMAN_NAMES[skillId] ?? skillId;
}
