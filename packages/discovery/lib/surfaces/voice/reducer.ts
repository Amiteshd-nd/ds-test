/**
 * One reducer for the voice surface — the flagship, and the one with the most
 * derived reads because the sweep has to be legible at four altitudes.
 *
 * Three things here are the argument rather than the plumbing:
 *
 * - **`staleness`** — `SPEC_DIRTY` means the evidence on screen no longer describes
 *   the agent she has. That fact travels *with* the results rather than sitting in a
 *   corner, which is why it is derived here and not styled in one component.
 * - **`regression`** — an edit that fixes one cluster and breaks another is the
 *   normal case, and hiding it is the single most damaging thing this surface could
 *   do. So it is computed, not noticed.
 * - **`gate`** — going live makes a real phone ring about money somebody owes. The
 *   decision was a call cap rather than a block: an untested rule becomes a bounded
 *   measurement instead of either a blocker or a shrug.
 */
import type { AgentEvent } from '../../agent-runtime';

export type CallOutcome =
  | 'resolved'
  | 'escalated'
  | 'abandoned'
  | 'looped'
  | 'timed_out'
  | 'constraint_breached'
  | 'off_script_but_fine';

export interface SpecLine {
  id: string;
  text: string;
  tested?: boolean;
  /** Hard rules and soft guidance fail differently and are never siblings. */
  kind: 'hard' | 'soft';
}

export interface Example {
  id: string;
  input: string;
  expected: string;
  pinning: boolean;
}

export interface Cluster {
  id: string;
  cause: string;
  count: number;
  specLineId?: string;
  /** The expected behaviour it violated — a stronger trace than a rule. */
  behaviourId?: string;
  exemplarRunIds: string[];
  deltaVsLast?: number;
}

export interface Turn {
  speaker: 'agent' | 'caller';
  text: string;
  lang: string;
  atMs: number;
  flags?: ('breach' | 'drift' | 'loop' | 'off_script')[];
}

export interface Exemplar {
  clusterId: string;
  runId: string;
  turns: Turn[];
}

export interface Section {
  id: string;
  heading: string;
  order: number;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  kind: 'api' | 'system';
  when: 'conversation_start' | 'mid_conversation' | 'conversation_end';
  /** 30s is the hard limit, 3–5s the advice. Over it, the caller hears dead air. */
  budgetMs: number;
  regex?: string;
  sectionId?: string;
}

export interface Variable {
  id: string;
  name: string;
  direction: 'input' | 'output';
  dataType: 'string' | 'enum' | 'number';
  extraction?: string;
  allowed?: string[];
  defaultValue?: string;
}

/** An expected behaviour: the real unit of evaluation, in her words. */
export interface Behaviour {
  id: string;
  text: string;
  sectionId?: string;
  checked?: number;
  held?: number;
}

export interface Settings {
  eagerness: number;
  interruptions: boolean;
  interruptionThreshold: number;
  nudgeAfterMs: number;
  nudgesBeforeHangup: number;
  voicemailDetection: boolean;
  backgroundAmbience?: string;
  speakingRate: number;
}

export interface Production {
  calls: number;
  connectedRate: number;
  goalRate: number;
  shortCallRate: number;
  medianTurnMs: number;
  simulated: { goalRate: number; shortCallRate: number; medianTurnMs: number };
}

export interface Caveat {
  kind: string;
  detail: string;
}

export interface VoiceState {
  runId?: string;
  specId?: string;
  hard: SpecLine[];
  soft: SpecLine[];
  examples: Example[];
  sections: Section[];
  tools: Tool[];
  variables: Variable[];
  behaviours: Behaviour[];
  goal?: { variable: string; equals: string; label: string };
  settings?: Settings;
  production?: Production;
  /** Hard rules no call exercised. Absence as a result. */
  untested: { lineId: string; rule: string }[];
  contradictions: { specLineId: string; exampleId: string; note: string }[];
  dirty?: { sinceSweepId: string; editedLines: string[] };

  sweepId?: string;
  runs?: number;
  done?: number;
  outcomes?: Record<CallOutcome, number>;
  clusters: Cluster[];
  exemplars: Exemplar[];
  caveats: Caveat[];
  regressed?: boolean;

  deployment: {
    state: 'not_deployed' | 'number_pending' | 'live' | 'paused' | 'live_diverging';
    number?: string;
    callCap?: number;
    capUsed?: number;
    note?: string;
  };
  liveSignals: { kind: 'diverging' | 'steady'; detail: string; clusterId?: string }[];

  handoffs: { from: string; to: string; carried: string[]; dropped: string[]; inferred: string[] }[];
  memoryConflicts: { key: string; writers: string[]; values: string[] }[];

  latency?: { ttftMs: number; totalMs: number; segments: { kind: string; ms: number }[] };
  latencyDistribution?: {
    label: string;
    n: number;
    ttft: { p50: number; p95: number };
    total: { p50: number; p95: number };
    source: 'measured' | 'placeholder';
  };

  errors: { kind: string; message: string; retryable: boolean }[];
  outcome?: 'success' | 'partial' | 'failed' | 'cancelled';
  applied: number;
  startedAt?: number;
  lastEventAt?: number;
}

export const initialVoiceState: VoiceState = {
  hard: [],
  soft: [],
  examples: [],
  sections: [],
  tools: [],
  variables: [],
  behaviours: [],
  untested: [],
  contradictions: [],
  clusters: [],
  exemplars: [],
  caveats: [],
  deployment: { state: 'not_deployed' },
  liveSignals: [],
  handoffs: [],
  memoryConflicts: [],
  errors: [],
  applied: 0,
};

export function reduceVoice(state: VoiceState, event: AgentEvent, now = Date.now()): VoiceState {
  const next = apply(state, event);
  if (next === state) return state;
  return { ...next, applied: state.applied + 1, lastEventAt: now, startedAt: state.startedAt ?? now };
}

function apply(state: VoiceState, e: AgentEvent): VoiceState {
  switch (e.t) {
    case 'run.start':
      return { ...state, runId: e.runId };
    case 'run.end':
      return { ...state, outcome: e.outcome };

    case 'spec.version':
      return {
        ...state,
        specId: e.id,
        hard: e.hard.map((h) => ({ id: h.id, text: h.rule, tested: h.tested, kind: 'hard' as const })),
        soft: e.soft.map((s) => ({ id: s.id, text: s.guidance, kind: 'soft' as const })),
        examples: e.examples,
      };
    case 'spec.section': {
      if (state.sections.some((x) => x.id === e.id)) return state;
      return {
        ...state,
        sections: [...state.sections, { id: e.id, heading: e.heading, order: e.order }].sort(
          (a, b) => a.order - b.order,
        ),
      };
    }
    case 'spec.tool': {
      const tool: Tool = {
        id: e.id, name: e.name, description: e.description, kind: e.kind,
        when: e.when, budgetMs: e.budgetMs, regex: e.regex, sectionId: e.sectionId,
      };
      const exists = state.tools.some((x) => x.id === e.id);
      return { ...state, tools: exists ? state.tools.map((x) => (x.id === e.id ? tool : x)) : [...state.tools, tool] };
    }
    case 'spec.variable': {
      if (state.variables.some((x) => x.id === e.id)) return state;
      return {
        ...state,
        variables: [
          ...state.variables,
          { id: e.id, name: e.name, direction: e.direction, dataType: e.dataType,
            extraction: e.extraction, allowed: e.allowed, defaultValue: e.defaultValue },
        ],
      };
    }
    case 'spec.goal':
      return { ...state, goal: { variable: e.variable, equals: e.equals, label: e.label } };
    case 'spec.behaviour': {
      const behaviour: Behaviour = {
        id: e.id, text: e.text, sectionId: e.sectionId, checked: e.checked, held: e.held,
      };
      const exists = state.behaviours.some((x) => x.id === e.id);
      return {
        ...state,
        behaviours: exists ? state.behaviours.map((x) => (x.id === e.id ? behaviour : x)) : [...state.behaviours, behaviour],
      };
    }
    case 'settings':
      return {
        ...state,
        settings: {
          eagerness: e.eagerness, interruptions: e.interruptions,
          interruptionThreshold: e.interruptionThreshold, nudgeAfterMs: e.nudgeAfterMs,
          nudgesBeforeHangup: e.nudgesBeforeHangup, voicemailDetection: e.voicemailDetection,
          backgroundAmbience: e.backgroundAmbience, speakingRate: e.speakingRate,
        },
      };
    case 'production':
      return {
        ...state,
        production: {
          calls: e.calls, connectedRate: e.connectedRate, goalRate: e.goalRate,
          shortCallRate: e.shortCallRate, medianTurnMs: e.medianTurnMs, simulated: e.simulated,
        },
      };

    case 'spec.untested': {
      if (state.untested.some((u) => u.lineId === e.lineId)) return state;
      return { ...state, untested: [...state.untested, { lineId: e.lineId, rule: e.rule }] };
    }
    case 'spec.contradiction': {
      if (state.contradictions.some((c) => c.specLineId === e.specLineId && c.exampleId === e.exampleId)) {
        return state;
      }
      return {
        ...state,
        contradictions: [...state.contradictions, { specLineId: e.specLineId, exampleId: e.exampleId, note: e.note }],
      };
    }
    case 'spec.dirty':
      return { ...state, dirty: { sinceSweepId: e.sinceSweepId, editedLines: e.editedLines } };

    case 'sweep.start':
      return { ...state, sweepId: e.sweepId, runs: e.runs, done: 0 };
    case 'sweep.progress':
      return { ...state, done: e.done, runs: e.total };
    case 'sweep.distribution':
      return { ...state, outcomes: e.outcomes as Record<CallOutcome, number> };
    case 'sweep.cluster': {
      const cluster: Cluster = {
        id: e.id,
        cause: e.cause,
        count: e.count,
        specLineId: e.specLineId,
        behaviourId: e.behaviourId,
        exemplarRunIds: e.exemplarRunIds,
        deltaVsLast: e.deltaVsLast,
      };
      const exists = state.clusters.some((c) => c.id === e.id);
      return {
        ...state,
        clusters: exists ? state.clusters.map((c) => (c.id === e.id ? cluster : c)) : [...state.clusters, cluster],
      };
    }
    case 'sweep.exemplar': {
      if (state.exemplars.some((x) => x.runId === e.runId)) return state;
      return { ...state, exemplars: [...state.exemplars, { clusterId: e.clusterId, runId: e.runId, turns: e.turns }] };
    }
    case 'sweep.caveat': {
      if (state.caveats.some((c) => c.detail === e.detail)) return state;
      return { ...state, caveats: [...state.caveats, { kind: e.kind, detail: e.detail }] };
    }
    case 'sweep.end':
      return { ...state, regressed: e.regressed };

    case 'deployment':
      return {
        ...state,
        deployment: {
          state: e.state,
          number: e.number ?? state.deployment.number,
          callCap: e.callCap ?? state.deployment.callCap,
          capUsed: e.capUsed ?? state.deployment.capUsed,
          note: e.note,
        },
      };
    case 'live.signal': {
      if (state.liveSignals.some((s) => s.detail === e.detail)) return state;
      return { ...state, liveSignals: [...state.liveSignals, { kind: e.kind, detail: e.detail, clusterId: e.clusterId }] };
    }

    case 'handoff': {
      if (state.handoffs.some((h) => h.from === e.from && h.to === e.to)) return state;
      return {
        ...state,
        handoffs: [...state.handoffs, { from: e.from, to: e.to, carried: e.carried, dropped: e.dropped, inferred: e.inferred }],
      };
    }
    case 'memory.conflict': {
      if (state.memoryConflicts.some((m) => m.key === e.key)) return state;
      return { ...state, memoryConflicts: [...state.memoryConflicts, { key: e.key, writers: e.writers, values: e.values }] };
    }

    case 'latency.sample':
      return { ...state, latency: { ttftMs: e.ttftMs, totalMs: e.totalMs, segments: e.segments } };
    case 'latency.distribution':
      return {
        ...state,
        latencyDistribution: { label: e.label, n: e.n, ttft: e.ttft, total: e.total, source: e.source },
      };

    case 'error': {
      if (state.errors.some((x) => x.message === e.message)) return state;
      return { ...state, errors: [...state.errors, { kind: e.kind, message: e.message, retryable: e.retryable }] };
    }

    /* ---- other surfaces ---- */
    case 'plan':
    case 'node.state':
    case 'node.progress':
    case 'plan.revise':
    case 'divergence':
    case 'steering.preview':
    case 'steering.applied':
    case 'change':
    case 'change.state':
    case 'checkpoint':
    case 'checkpoint.state':
    case 'envelope':
    case 'envelope.breach':
    case 'token':
    case 'ttft':
    case 'tool.call':
    case 'tool.result':
    case 'ask':
    case 'ask.answered':
    case 'capability':
    case 'queued':
    case 'asr.partial':
    case 'asr.final':
    case 'echo.start':
    case 'echo.interrupted':
    case 'tts.start':
    case 'tts.end':
    case 'value':
    case 'value.conflict':
    case 'value.confusable':
    case 'value.struck_through':
    case 'value.out_of_range':
    case 'field.reviewed':
    case 'field.corrected':
    case 'repair.offered':
    case 'repair.exhausted':
    case 'systematic.suspected':
    case 'doc.state':
    case 'source':
    case 'nonfinding':
    case 'export.ready':
    case 'export.lossy':
    case 'export.blocked':
    case 'dub.job':
    case 'segment':
    case 'clause.dropped':
    case 'pronunciation.suspect':
    case 'voice.drift':
    case 'consent':
    case 'consent.acknowledged':
    case 'script.clipped':
    case 'script.fallback':
    case 'review.request':
    case 'review.result':
    case 'review.timeout':
    case 'variant':
    case 'variant.approved':
    case 'publish.blocked':
    case 'term.pinned':
    case 'term.violation':
    case 'segment.regenerated':
    case 'backtranslation':
    case 'overflow':
    case 'brief':
    case 'brief.item':
    case 'brief.read':
    case 'action':
    case 'action.state':
    case 'action.legs':
    case 'compensation':
    case 'scope':
    case 'access':
    case 'residency':
    case 'ceiling':
    case 'taper.proposal':
    case 'taper.decided':
      return state;

    default: {
      const unhandled: never = e;
      void unhandled;
      return state;
    }
  }
}

export function reduceAllVoice(state: VoiceState, events: AgentEvent[], now = Date.now()): VoiceState {
  return events.reduce((acc, e) => reduceVoice(acc, e, now), state);
}

/* ---------------------------------------------------------------------------
   Derived reads — the four altitudes and the gate
   ------------------------------------------------------------------------ */

/** Outcome order for the distribution bar: good, then survivable, then the breach. */
export const OUTCOME_ORDER: CallOutcome[] = [
  'resolved',
  'off_script_but_fine',
  'escalated',
  'abandoned',
  'looped',
  'timed_out',
  'constraint_breached',
];

export function totalCalls(state: VoiceState) {
  if (!state.outcomes) return 0;
  return Object.values(state.outcomes).reduce((sum, n) => sum + n, 0);
}

/** Stale evidence: the spec moved after the sweep that produced these results. */
export function staleness(state: VoiceState) {
  if (!state.dirty || !state.sweepId) return null;
  return { since: state.dirty.sinceSweepId, lines: state.dirty.editedLines, stale: state.dirty.sinceSweepId === state.sweepId };
}

/** Clusters that got worse. Computed, because noticing is not a mechanism. */
export function regressions(state: VoiceState) {
  return state.clusters.filter((c) => (c.deltaVsLast ?? 0) < 0);
}
export function improvements(state: VoiceState) {
  return state.clusters.filter((c) => (c.deltaVsLast ?? 0) > 0);
}

/** Behaviours that did not hold everywhere, worst first. The other way into the
    evidence: not "what went wrong" but "which of my assertions failed". */
export function failingBehaviours(state: VoiceState) {
  return state.behaviours
    .filter((b) => b.checked !== undefined && b.held !== undefined && b.held < b.checked)
    .sort((a, b) => (a.held! / a.checked!) - (b.held! / b.checked!));
}

/** Behaviours nothing exercised — the same shape of absence as an untested rule. */
export const unexercisedBehaviours = (state: VoiceState) =>
  state.behaviours.filter((b) => !b.checked);

export const sectionOf = (state: VoiceState, id?: string) =>
  state.sections.find((s) => s.id === id);
export const behaviourOf = (state: VoiceState, id?: string) =>
  state.behaviours.find((b) => b.id === id);

/** Tools over the recommended budget. A slow tool is dead air in a conversation. */
export const RECOMMENDED_TOOL_MS = 5000;
export const HARD_TOOL_LIMIT_MS = 30_000;
export const slowTools = (state: VoiceState) =>
  state.tools.filter((t) => t.budgetMs > RECOMMENDED_TOOL_MS);

/** How production compares with the simulation, per measure, as a ratio. */
export function productionGap(state: VoiceState) {
  const p = state.production;
  if (!p) return null;
  return {
    calls: p.calls,
    goal: { live: p.goalRate, simulated: p.simulated.goalRate },
    shortCalls: { live: p.shortCallRate, simulated: p.simulated.shortCallRate },
    turn: { live: p.medianTurnMs, simulated: p.simulated.medianTurnMs },
    worse:
      p.goalRate < p.simulated.goalRate * 0.9 ||
      p.shortCallRate > p.simulated.shortCallRate * 1.5,
  };
}

/** A cluster no spec line explains — itself a finding. */
export const untraceable = (state: VoiceState) => state.clusters.filter((c) => !c.specLineId);

export const exemplarsFor = (state: VoiceState, clusterId: string) =>
  state.exemplars.filter((x) => x.clusterId === clusterId);

/**
 * The go-live gate. By decision it does not block on an untested constraint —
 * it caps the first calls instead, so an untested rule becomes a measurement.
 */
export function gate(state: VoiceState) {
  const breaches = state.outcomes?.constraint_breached ?? 0;
  const untestedHard = state.untested.length;
  const sweepRan = !!state.outcomes;
  const stale = !!state.dirty;
  return {
    sweepRan,
    stale,
    breaches,
    untestedHard,
    /** A cap is proposed, never a promise that everything is fine. */
    proposedCap: untestedHard > 0 || breaches > 0 ? 25 : 100,
    /** The only hard block: no evidence at all, or evidence that describes a
        different agent than the one she is about to point at customers. */
    blocked: !sweepRan || stale,
    blockedReason: !sweepRan
      ? 'Nothing has been simulated yet.'
      : stale
        ? 'The spec changed after this sweep, so these results describe a different agent.'
        : undefined,
    live: state.deployment.state === 'live' || state.deployment.state === 'live_diverging',
  };
}
