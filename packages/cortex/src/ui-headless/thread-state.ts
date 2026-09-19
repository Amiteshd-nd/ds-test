// The reducer behind `useAgentThread`. Pure, so it is testable without React and without
// a server — every §13.4 state is a function of the event stream, and this is where that
// function lives.

import type { Block, ErrorKind, EntityRef, NoticeKind, RunEvent } from '../core/adapters/types.ts';

export type ThreadStatus =
  | 'idle'
  | 'thinking'        // run started, nothing retrieved yet
  | 'tool_running'    // a named step is in flight — show its human name
  | 'streaming'       // tokens are arriving
  | 'awaiting_approval'
  | 'error';

export interface Citation { sourceId: string; ref: EntityRef; title: string }
export interface Notice { kind: NoticeKind; message: string }

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  blocks: Block[];
  citations: Citation[];
  notices: Notice[];
  runId?: string;
  done: boolean;
  error?: { kind: ErrorKind; message: string };
}

export interface ThreadState {
  messages: Message[];
  status: ThreadStatus;
  /** The human-readable label of the step in flight: "Searching Atlas". */
  activeLabel: string | null;
  approval: { runId: string; stepId: string; action: string; args: Record<string, unknown>; human: string; reasoning: string; costUsd: number } | null;
  lastSeq: number;
}

export const emptyThread = (): ThreadState => ({ messages: [], status: 'idle', activeLabel: null, approval: null, lastSeq: 0 });

export type ThreadAction =
  | { type: 'user_message'; id: string; text: string }
  | { type: 'run_attached'; id: string; runId: string }
  | { type: 'event'; seq: number; event: RunEvent }
  /** The human answered the gate. Clears the card before the resumed stream arrives. */
  | { type: 'approval_resolved' }
  | { type: 'reset' };

export function threadReducer(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case 'reset':
      return emptyThread();

    case 'user_message':
      return {
        ...state,
        status: 'thinking',
        messages: [
          ...state.messages,
          { id: action.id, role: 'user', text: action.text, blocks: [], citations: [], notices: [], done: true },
          // The assistant turn is created immediately and empty, so the UI has something
          // to attach a skeleton and a step label to before the first token.
          { id: `${action.id}:a`, role: 'assistant', text: '', blocks: [], citations: [], notices: [], done: false },
        ],
      };

    case 'run_attached':
      return { ...state, messages: state.messages.map((m) => (m.id === `${action.id}:a` ? { ...m, runId: action.runId } : m)) };

    case 'approval_resolved':
      return { ...state, approval: null, status: 'thinking' };

    case 'event':
      return applyEvent(state, action.event, action.seq);
  }
}

function applyEvent(state: ThreadState, event: RunEvent, seq: number): ThreadState {
  const patchLast = (patch: (m: Message) => Message): Message[] => {
    const idx = [...state.messages].reverse().findIndex((m) => m.role === 'assistant' && !m.done);
    if (idx < 0) return state.messages;
    const real = state.messages.length - 1 - idx;
    return state.messages.map((m, i) => (i === real ? patch(m) : m));
  };
  const base = { ...state, lastSeq: Math.max(state.lastSeq, seq) };

  switch (event.type) {
    case 'run_started':
      return { ...base, status: 'thinking' };

    case 'step_started':
      // `compose` is not a tool; once it starts, the user is waiting on prose.
      return { ...base, status: event.name === 'compose' ? 'streaming' : 'tool_running', activeLabel: event.label };

    case 'step_completed':
      return { ...base, activeLabel: null };

    case 'token':
      return { ...base, status: 'streaming', messages: patchLast((m) => ({ ...m, text: m.text + event.text })) };

    case 'block':
      return {
        ...base,
        messages: patchLast((m) => {
          // A skill_call block updates in place rather than stacking: one tool call is
          // one card, whose state changes.
          const incoming = event.block;
          if (incoming.type === 'skill_call') {
            const existing = m.blocks.findIndex((b) => b.type === 'skill_call' && b.skill === incoming.skill);
            if (existing >= 0) return { ...m, blocks: m.blocks.map((b, i) => (i === existing ? incoming : b)) };
          }
          return { ...m, blocks: [...m.blocks, event.block] };
        }),
      };

    case 'citation':
      return { ...base, messages: patchLast((m) => (m.citations.some((c) => c.sourceId === event.sourceId) ? m : { ...m, citations: [...m.citations, { sourceId: event.sourceId, ref: event.ref, title: event.title }] })) };

    case 'notice':
      return { ...base, messages: patchLast((m) => ({ ...m, notices: [...m.notices, { kind: event.kind, message: event.message }] })) };

    case 'approval_requested':
      return {
        ...base,
        status: 'awaiting_approval',
        activeLabel: null,
        approval: { runId: event.runId, stepId: event.stepId, ...event.payload },
      };

    case 'progress':
      return { ...base, activeLabel: event.message };

    // A terminal event clears any approval card: whatever it was asking about has been
    // answered, or the run it belonged to is over. Leaving it on screen invites someone
    // to approve an action a second time.
    case 'run_completed':
      return { ...base, status: 'idle', activeLabel: null, approval: null, messages: patchLast((m) => ({ ...m, done: true })) };

    case 'run_failed':
      return { ...base, status: 'error', activeLabel: null, approval: null, messages: patchLast((m) => ({ ...m, done: true, error: event.error })) };

    default:
      return base;
  }
}

/**
 * §13.4 asks for an empty state carrying three to five context-aware prompts, because
 * nobody knows what to type into a blank box. The suggestions come from the surface's
 * context, not from a constant — that is the part that makes them worth reading.
 */
export function suggestionsFor(context: { entityTitle?: string; agentName?: string }): { id: string; label: string; prompt: string }[] {
  const here = context.entityTitle;
  const out = [
    { id: 'owner', label: 'Who owns this area?', prompt: here ? `Who owns ${here}?` : 'Who owns the ingestion pipeline?' },
    { id: 'blocked', label: 'What is blocked, and why?', prompt: 'What work is blocked right now, and what is blocking it?' },
    { id: 'decision', label: 'What changed recently?', prompt: 'Which decisions were superseded, and what replaced them?' },
    { id: 'howto', label: 'How do we handle this?', prompt: 'What do we do when the ingestion pipeline lags?' },
  ];
  return out.slice(0, 4);
}
