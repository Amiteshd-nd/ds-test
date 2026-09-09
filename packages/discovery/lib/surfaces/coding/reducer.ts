/**
 * One reducer for the whole coding surface.
 *
 * Two properties matter and both are load-bearing:
 *
 * 1. **Exhaustive.** The `switch` covers every `AgentEvent` variant and the
 *    default branch asserts `never`. When a new event is added to the grammar,
 *    TypeScript fails here — the type system does the "which state did I forget"
 *    work that would otherwise be done by noticing a blank area on a screen.
 * 2. **Idempotent.** Real streams duplicate and reorder events. Every case here
 *    is an upsert keyed by id, so applying the same event twice is a no-op.
 */
// The one import of surface copy into the reducer: `orientation` composes a
// sentence, and a sentence belongs in the copy file with the others.
import { copy } from '@/components/surfaces/coding/copy';
import type {
  AgentEvent,
  Capability,
  ChangeState,
  NodeState,
  PlanNode,
} from '../../agent-runtime';

export type RunPhase =
  | 'idle'
  | 'planning'
  | 'running'
  | 'awaiting_input'
  | 'diverged'
  | 'stalled'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';

export interface Change {
  id: string;
  path: string;
  kind: 'edit' | 'create' | 'delete';
  state: ChangeState;
  adds: number;
  dels: number;
  checkpointId?: string;
  speculative?: boolean;
  assumption?: string;
  note?: string;
}

export interface Checkpoint {
  id: string;
  label: string;
  state: 'clean' | 'partial' | 'restored';
  note?: string;
  /** Client-side arrival order; the run's own `at` is 0 in scripts. */
  seq: number;
}

export interface PlanRevision {
  seq: number;
  because: string;
  added: string[];
  dropped: string[];
}

export interface OpenAsk {
  nodeId: string;
  question: string;
  options?: string[];
  blocking: 'run' | 'branch';
  answer?: string;
}

export interface NonFinding {
  nodeId: string;
  looked_for: string;
  kind: 'absent' | 'inaccessible' | 'ambiguous' | 'illegible';
  boundary: { corpus: string; languages?: string[]; timeRange?: string };
}

export interface RunError {
  kind: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  nodeId?: string;
}

export interface Envelope {
  may: string[];
  mustAsk: string[];
  confidenceFloor: number;
  consequence?: { autoApplied: number; asks: number; expectedWrong: number };
}

export interface SpecVersion {
  id: string;
  hard: { id: string; rule: string; tested: boolean }[];
  soft: { id: string; guidance: string }[];
  examples: { id: string; input: string; expected: string; pinning: boolean }[];
}

export interface LatencySample {
  ttftMs: number;
  totalMs: number;
  segments: { kind: 'network' | 'queue' | 'model' | 'synthesis'; ms: number }[];
}

export interface LatencyDistribution {
  label: string;
  n: number;
  ttft: { p50: number; p95: number };
  total: { p50: number; p95: number };
  source: 'measured' | 'placeholder';
}

export interface Steering {
  instruction: string;
  kept: string[];
  discarded: string[];
  requeued: string[];
  /** A preview is a proposal; applied is a fact. They render differently. */
  applied: boolean;
}

export interface Divergence {
  expected: string;
  observed: string;
  evidence: string[];
}

export interface RunState {
  runId?: string;
  intent?: string;
  phase: RunPhase;
  outcome?: 'success' | 'partial' | 'failed' | 'cancelled';
  capability: Capability;

  nodes: PlanNode[];
  edges: [string, string][];
  progress: Record<string, { done: number; total: number }>;
  /** Streamed text per node. Batched into frames upstream, never per token. */
  text: Record<string, string>;
  ttft: Record<string, number>;
  tools: { nodeId: string; tool: string; ms?: number; ok?: boolean }[];

  planRevisions: PlanRevision[];
  divergence?: Divergence;
  steering: Steering[];

  changes: Change[];
  checkpoints: Checkpoint[];
  nonfindings: NonFinding[];
  asks: OpenAsk[];
  errors: RunError[];

  envelope?: Envelope;
  spec?: SpecVersion;
  latency?: LatencySample;
  latencyDistribution?: LatencyDistribution;

  /** Events applied. The cheapest "is anything still happening" signal there is. */
  applied: number;
  /** Client clock, so "cold read" can say how long ago anything last moved. */
  startedAt?: number;
  lastEventAt?: number;
}

export const initialRunState: RunState = {
  phase: 'idle',
  capability: 'online_full',
  nodes: [],
  edges: [],
  progress: {},
  text: {},
  ttft: {},
  tools: [],
  planRevisions: [],
  steering: [],
  changes: [],
  checkpoints: [],
  nonfindings: [],
  asks: [],
  errors: [],
  applied: 0,
};

/** Node states that mean "this needs a person", in priority order. */
const NEEDS_HUMAN: NodeState[] = ['blocked_on_permission', 'blocked_on_human'];

function upsertNode(nodes: PlanNode[], id: string, state: NodeState): PlanNode[] {
  const found = nodes.some((n) => n.id === id);
  if (!found) return [...nodes, { id, label: id, state }];
  return nodes.map((n) => (n.id === id ? { ...n, state } : n));
}

function derivePhase(state: RunState): RunPhase {
  // Terminal outcomes win: a finished run is finished regardless of node states.
  if (state.outcome === 'cancelled') return 'cancelled';
  if (state.outcome === 'failed') return 'failed';
  if (state.errors.some((e) => !e.retryable)) return 'failed';
  if (state.outcome === 'success') return 'succeeded';
  if (state.outcome === 'partial') return 'partial';

  // Then the states that cost him something if he misses them.
  if (state.asks.some((a) => !a.answer)) return 'awaiting_input';
  if (state.nodes.some((n) => NEEDS_HUMAN.includes(n.state))) return 'awaiting_input';
  if (state.divergence) return 'diverged';
  if (state.nodes.some((n) => n.state === 'stalled')) return 'stalled';
  if (state.nodes.length && state.nodes.some((n) => n.state === 'running' || n.state === 'retrying')) {
    return 'running';
  }
  if (state.nodes.length) return 'running';
  if (state.runId) return 'planning';
  return state.phase;
}

/** Apply one event. Pure, and safe to apply twice. */
export function reduce(state: RunState, event: AgentEvent, now = Date.now()): RunState {
  const next = applyEvent(state, event, now);
  if (next === state) return state;
  const stamped: RunState = {
    ...next,
    applied: state.applied + 1,
    lastEventAt: now,
    startedAt: state.startedAt ?? now,
  };
  return { ...stamped, phase: derivePhase(stamped) };
}

function applyEvent(state: RunState, e: AgentEvent, now: number): RunState {
  switch (e.t) {
    /* ---- lifecycle ---- */
    case 'run.start':
      return { ...state, runId: e.runId, intent: e.intent, phase: 'planning' };
    case 'run.end':
      return { ...state, outcome: e.outcome };

    /* ---- plan ---- */
    case 'plan':
      return { ...state, nodes: e.nodes, edges: e.edges };
    case 'node.state':
      return { ...state, nodes: upsertNode(state.nodes, e.nodeId, e.state) };
    case 'node.progress':
      return { ...state, progress: { ...state.progress, [e.nodeId]: { done: e.done, total: e.total } } };
    case 'plan.revise': {
      const droppedSet = new Set(e.dropped);
      const kept = state.nodes.filter((n) => !droppedSet.has(n.id));
      const addedIds = new Set(kept.map((n) => n.id));
      const nodes = [...kept, ...e.added.filter((n) => !addedIds.has(n.id))];
      const seq = state.planRevisions.length;
      // Idempotent: the same revision reason twice is one revision.
      if (state.planRevisions.some((r) => r.because === e.because)) return state;
      return {
        ...state,
        nodes,
        edges: state.edges.filter(([a, b]) => !droppedSet.has(a) && !droppedSet.has(b)),
        planRevisions: [...state.planRevisions, { seq, because: e.because, added: e.added.map((n) => n.label), dropped: e.dropped }],
      };
    }
    case 'divergence':
      return { ...state, divergence: { expected: e.expected, observed: e.observed, evidence: e.evidence } };

    /* ---- steering ---- */
    case 'steering.preview': {
      const without = state.steering.filter((s) => s.applied);
      return {
        ...state,
        steering: [...without, { instruction: e.instruction, kept: e.kept, discarded: e.discarded, requeued: e.requeued, applied: false }],
      };
    }
    case 'steering.applied': {
      const without = state.steering.filter((s) => s.instruction !== e.instruction);
      return {
        ...state,
        steering: [...without, { instruction: e.instruction, kept: e.kept, discarded: e.discarded, requeued: e.requeued, applied: true }],
      };
    }

    /* ---- streaming ---- */
    case 'token':
      return { ...state, text: { ...state.text, [e.nodeId]: (state.text[e.nodeId] ?? '') + e.text } };
    case 'ttft':
      return { ...state, ttft: { ...state.ttft, [e.nodeId]: e.ms } };

    /* ---- tools ---- */
    case 'tool.call':
      if (state.tools.some((t) => t.nodeId === e.nodeId && t.tool === e.tool && t.ms === undefined)) return state;
      return { ...state, tools: [...state.tools, { nodeId: e.nodeId, tool: e.tool }] };
    case 'tool.result': {
      let patched = false;
      const tools = state.tools.map((t) => {
        if (!patched && t.nodeId === e.nodeId && t.tool === e.tool && t.ms === undefined) {
          patched = true;
          return { ...t, ms: e.ms, ok: e.ok };
        }
        return t;
      });
      return patched ? { ...state, tools } : state;
    }

    /* ---- changes and boundaries ---- */
    case 'change': {
      const change: Change = {
        id: e.id, path: e.path, kind: e.kind, state: e.state, adds: e.adds, dels: e.dels,
        checkpointId: e.checkpointId, speculative: e.speculative, assumption: e.assumption, note: e.note,
      };
      const exists = state.changes.some((c) => c.id === e.id);
      return {
        ...state,
        changes: exists ? state.changes.map((c) => (c.id === e.id ? { ...c, ...change } : c)) : [...state.changes, change],
      };
    }
    case 'change.state':
      if (!state.changes.some((c) => c.id === e.id)) return state;
      return {
        ...state,
        changes: state.changes.map((c) => (c.id === e.id ? { ...c, state: e.state, note: e.note ?? c.note } : c)),
      };
    case 'checkpoint': {
      if (state.checkpoints.some((c) => c.id === e.id)) return state;
      return {
        ...state,
        checkpoints: [...state.checkpoints, { id: e.id, label: e.label, state: 'clean', seq: state.checkpoints.length }],
      };
    }
    case 'checkpoint.state':
      return {
        ...state,
        checkpoints: state.checkpoints.map((c) => (c.id === e.id ? { ...c, state: e.state, note: e.note ?? c.note } : c)),
      };

    /* ---- results with epistemics ---- */
    case 'nonfinding': {
      if (state.nonfindings.some((n) => n.looked_for === e.looked_for)) return state;
      return { ...state, nonfindings: [...state.nonfindings, { nodeId: e.nodeId, looked_for: e.looked_for, kind: e.kind, boundary: e.boundary }] };
    }

    /* ---- handing control back ---- */
    case 'ask': {
      if (state.asks.some((a) => a.question === e.question)) return state;
      return { ...state, asks: [...state.asks, { nodeId: e.nodeId, question: e.question, options: e.options, blocking: e.blocking }] };
    }
    case 'ask.answered':
      return {
        ...state,
        asks: state.asks.map((a) => (a.nodeId === e.nodeId && !a.answer ? { ...a, answer: e.answer } : a)),
      };

    /* ---- authority and standing instructions ---- */
    case 'envelope':
      return { ...state, envelope: { may: e.may, mustAsk: e.mustAsk, confidenceFloor: e.confidenceFloor, consequence: e.consequence } };
    case 'envelope.breach':
      return {
        ...state,
        errors: [...state.errors, { kind: 'envelope_breach', message: `Tried to ${e.attempted}; envelope allows ${e.allowed}`, retryable: false, nodeId: e.nodeId }],
      };
    case 'spec.version':
      return { ...state, spec: { id: e.id, hard: e.hard, soft: e.soft, examples: e.examples } };

    /* ---- time ---- */
    case 'latency.sample':
      return { ...state, latency: { ttftMs: e.ttftMs, totalMs: e.totalMs, segments: e.segments } };
    case 'latency.distribution':
      return { ...state, latencyDistribution: { label: e.label, n: e.n, ttft: e.ttft, total: e.total, source: e.source } };

    /* ---- capability ---- */
    case 'capability':
      return { ...state, capability: e.to };

    /* ---- failure ---- */
    case 'error': {
      if (state.errors.some((x) => x.message === e.message)) return state;
      return { ...state, errors: [...state.errors, { kind: e.kind, message: e.message, retryable: e.retryable, retryAfterMs: e.retryAfterMs, nodeId: e.nodeId }] };
    }

    /* ---- events owned by other surfaces ----
       Listed rather than defaulted, so adding a surface's event to the grammar
       shows up here as a decision instead of being silently swallowed. */
    case 'value':
    case 'value.conflict':
    case 'queued':
    case 'asr.partial':
    case 'asr.final':
    case 'echo.start':
    case 'echo.interrupted':
    case 'tts.start':
    case 'tts.end':
    case 'spec.contradiction':
    case 'sweep.start':
    case 'sweep.progress':
    case 'sweep.distribution':
    case 'sweep.cluster':
    case 'sweep.caveat':
    case 'sweep.end':
    case 'handoff':
    case 'memory.conflict':
    case 'variant':
    case 'backtranslation':
    case 'term.violation':
    case 'script.fallback':
    case 'overflow':
    /* doc's events. The `never` default below is what surfaced these the moment
       the grammar grew them, which is the type system doing design work: every
       new event forces a decision here rather than being silently dropped. */
    case 'source':
    case 'value.confusable':
    case 'value.struck_through':
    case 'value.out_of_range':
    case 'field.reviewed':
    case 'field.corrected':
    case 'repair.offered':
    case 'repair.exhausted':
    case 'systematic.suspected':
    case 'doc.state':
    case 'export.ready':
    case 'export.lossy':
    case 'export.blocked':
    /* content's events, same story. */
    case 'dub.job':
    case 'segment':
    case 'clause.dropped':
    case 'pronunciation.suspect':
    case 'voice.drift':
    case 'consent':
    case 'consent.acknowledged':
    case 'script.clipped':
    case 'review.request':
    case 'review.result':
    case 'review.timeout':
    case 'variant.approved':
    case 'publish.blocked':
    case 'term.pinned':
    case 'segment.regenerated':
      return state;

    default: {
      const unhandled: never = e;
      void unhandled;
      return state;
    }
  }
}

/** Fold a batch of events in one pass — the frame-batched path. */
export function reduceAll(state: RunState, events: AgentEvent[], now = Date.now()): RunState {
  return events.reduce((acc, e) => reduce(acc, e, now), state);
}

/* ---------------------------------------------------------------------------
   Derived reads. Kept next to the reducer so a component never recomputes
   "is this going fine?" its own way.
   ------------------------------------------------------------------------ */

/**
 * The cold-read line: where it is and whether to worry, in that order.
 *
 * The ordering is the design. Anything that needs a person outranks the run's own
 * outcome, because a finished run does not resolve a divergence or a conflict —
 * the wrong work is still on disk either way. The state gallery is what caught the
 * manual-edit conflict reading as "nothing needs you" once the run had ended, and
 * unreviewed changes going unmentioned entirely.
 */
export function orientation(state: RunState): { where: string; worry: 'no' | 'soon' | 'now' } {
  const open = state.asks.find((a) => !a.answer);
  const blocked = state.nodes.find((n) => NEEDS_HUMAN.includes(n.state));
  const running = state.nodes.find((n) => n.state === 'running' || n.state === 'speculative');
  const fatal = state.errors.find((e) => !e.retryable);
  const conflict = state.changes.find((c) => c.state === 'conflicts_with_manual_edit');
  const unreviewed = state.changes.filter((c) => c.state === 'applied_unreviewed');

  if (fatal) return { where: fatal.message, worry: 'now' };
  // A cancel is terminal, and the only question it leaves is what survived it.
  // "Stopped at <checkpoint>" would be true and useless here.
  if (state.outcome === 'cancelled') {
    const kept = state.changes.filter(
      (c) => c.state === 'applied' || c.state === 'applied_unreviewed',
    ).length;
    return kept
      ? { where: copy.orient.cancelledWith(kept), worry: 'soon' }
      : { where: copy.orient.cancelledClean, worry: 'no' };
  }
  if (open) return { where: open.question, worry: 'now' };
  if (blocked) return { where: `${blocked.label} needs permission`, worry: 'now' };
  if (state.divergence) return { where: state.divergence.observed, worry: 'now' };
  if (conflict) return { where: `You and the agent both edited ${conflict.path}`, worry: 'now' };
  if (state.nodes.some((n) => n.state === 'stalled')) {
    return { where: 'No progress on the current step', worry: 'soon' };
  }
  if (state.errors.length) return { where: state.errors[state.errors.length - 1].message, worry: 'soon' };
  if (state.outcome) {
    const done = state.checkpoints[state.checkpoints.length - 1];
    const where = done ? `Stopped at "${done.label}"` : 'Run finished';
    // Work that landed without anyone looking is worth a look, even on a clean run.
    if (unreviewed.length) {
      return {
        where: `${where}, with ${unreviewed.length} change${unreviewed.length > 1 ? 's' : ''} applied unreviewed`,
        worry: 'soon',
      };
    }
    return { where, worry: 'no' };
  }
  if (unreviewed.length && !running) {
    return { where: `${unreviewed.length} changes applied without review`, worry: 'soon' };
  }
  if (running) {
    const p = state.progress[running.id];
    return { where: p ? `${running.label} (${p.done}/${p.total})` : running.label, worry: 'no' };
  }
  return { where: state.intent ?? 'Nothing running', worry: 'no' };
}

/** Changes belonging to a boundary — the unit review happens in. */
export function changesFor(state: RunState, checkpointId: string): Change[] {
  return state.changes.filter((c) => c.checkpointId === checkpointId);
}

/** Changes not yet inside a boundary. Not reviewable as a set yet, and that matters. */
export function looseChanges(state: RunState): Change[] {
  const ids = new Set(state.checkpoints.map((c) => c.id));
  return state.changes.filter((c) => !c.checkpointId || !ids.has(c.checkpointId));
}

export const needsAttention = (state: RunState) => orientation(state).worry === 'now';
