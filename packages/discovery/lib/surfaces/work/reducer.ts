/**
 * One reducer for the work surface. Exhaustive, idempotent, same contract.
 *
 * Two things here are the surface's argument rather than its plumbing:
 *
 * - **`attributionOf`** — every action is done as *him*, so who the recipient thinks
 *   sent it is data, not styling. The decision was ledger-only disclosure with a
 *   per-channel opt-in, which means the ledger has to carry the whole weight.
 * - **`legsOf` / `unresolved`** — partial completion across three external systems,
 *   including the leg whose outcome is genuinely unknown. Rendering `unknown` as
 *   failed invites a duplicate; rendering it as done invites a silent gap.
 */
import type { AgentEvent, WorkActionState } from '../../agent-runtime';

export type Attribution = 'as_user' | 'as_agent' | 'ambiguous';

export interface Source {
  kind: string;
  id: string;
  label: string;
  available: boolean;
}

export interface Leg {
  system: string;
  state: 'done' | 'failed' | 'unknown';
  record?: string;
}

export interface Action {
  id: string;
  kind: 'email' | 'slack' | 'crm' | 'calendar' | 'doc';
  summary: string;
  channel: string;
  recipient?: string;
  state: WorkActionState;
  attribution: Attribution;
  reversibleUntilMs?: number;
  sources?: Source[];
  legs?: Leg[];
  compensation?: { system: string; undo: string; possible: boolean }[];
  note?: string;
  /** Client arrival order — the ledger reads newest-last, like a ledger. */
  seq: number;
}

export interface BriefItem {
  id: string;
  segmentId: string;
  text: string;
  sources: Source[];
  needs: 'nothing' | 'decision' | 'permission';
  read: boolean;
}

export interface Scope {
  id: string;
  resource: string;
  grantedFor: string;
  untilIso?: string;
  state: 'granted' | 'expired' | 'revoked';
}

export interface AccessRecord {
  resource: string;
  sensitive: boolean;
  permitted: boolean;
}

export interface TaperProposal {
  id: string;
  kind: string;
  widenTo: string;
  evidence: { clean: number; sinceIso: string; reversed: number };
  decided?: { accepted: boolean; by: string; at: number };
}

export interface WorkState {
  runId?: string;
  brief?: { date: string; segments: { id: string; label: string }[]; checked: string[] };
  items: BriefItem[];
  actions: Action[];
  scopes: Scope[];
  access: AccessRecord[];
  residency: { action: string; region: string; rule: string }[];
  ceiling?: { may: string[]; neverWithoutAdmin: string[] };
  envelope?: {
    may: string[];
    mustAsk: string[];
    confidenceFloor: number;
    consequence?: { autoApplied: number; asks: number; expectedWrong: number };
  };
  tapers: TaperProposal[];
  handoffs: { from: string; to: string; carried: string[]; dropped: string[]; inferred: string[] }[];
  nonfindings: { looked_for: string; kind: string; boundary: { corpus: string; timeRange?: string } }[];
  breaches: { attempted: string; allowed: string }[];
  errors: { kind: string; message: string; retryable: boolean }[];
  outcome?: 'success' | 'partial' | 'failed' | 'cancelled';
  applied: number;
  startedAt?: number;
  lastEventAt?: number;
}

export const initialWorkState: WorkState = {
  items: [],
  actions: [],
  scopes: [],
  access: [],
  residency: [],
  tapers: [],
  handoffs: [],
  nonfindings: [],
  breaches: [],
  errors: [],
  applied: 0,
};

function patchAction(state: WorkState, id: string, change: Partial<Action>): WorkState {
  const exists = state.actions.some((a) => a.id === id);
  if (!exists) return state;
  return { ...state, actions: state.actions.map((a) => (a.id === id ? { ...a, ...change } : a)) };
}

export function reduceWork(state: WorkState, event: AgentEvent, now = Date.now()): WorkState {
  const next = apply(state, event, now);
  if (next === state) return state;
  return { ...next, applied: state.applied + 1, lastEventAt: now, startedAt: state.startedAt ?? now };
}

function apply(state: WorkState, e: AgentEvent, now: number): WorkState {
  switch (e.t) {
    case 'run.start':
      return { ...state, runId: e.runId };
    case 'run.end':
      return { ...state, outcome: e.outcome };

    case 'brief':
      return { ...state, brief: { date: e.date, segments: e.segments, checked: e.checked } };
    case 'brief.item': {
      if (state.items.some((i) => i.id === e.id)) return state;
      return {
        ...state,
        items: [
          ...state.items,
          { id: e.id, segmentId: e.segmentId, text: e.text, sources: e.sources, needs: e.needs, read: false },
        ],
      };
    }

    case 'brief.read':
      return { ...state, items: state.items.map((i) => (i.id === e.id ? { ...i, read: true } : i)) };

    case 'action': {
      const action: Action = {
        id: e.id,
        kind: e.kind,
        summary: e.summary,
        channel: e.channel,
        recipient: e.recipient,
        state: e.state,
        attribution: e.attribution,
        reversibleUntilMs: e.reversibleUntilMs,
        sources: e.sources,
        seq: state.actions.length,
      };
      const exists = state.actions.some((a) => a.id === e.id);
      return {
        ...state,
        actions: exists
          ? state.actions.map((a) => (a.id === e.id ? { ...a, ...action, seq: a.seq } : a))
          : [...state.actions, action],
      };
    }
    case 'action.state':
      return patchAction(state, e.id, { state: e.state, note: e.note });
    case 'action.legs':
      return patchAction(state, e.id, { legs: e.legs });
    case 'compensation':
      return patchAction(state, e.actionId, { compensation: e.offers });

    case 'scope': {
      const scope: Scope = {
        id: e.id,
        resource: e.resource,
        grantedFor: e.grantedFor,
        untilIso: e.untilIso,
        state: e.state,
      };
      const exists = state.scopes.some((s) => s.id === e.id);
      return {
        ...state,
        scopes: exists ? state.scopes.map((s) => (s.id === e.id ? scope : s)) : [...state.scopes, scope],
      };
    }
    case 'access': {
      if (state.access.some((a) => a.resource === e.resource)) return state;
      return { ...state, access: [...state.access, { resource: e.resource, sensitive: e.sensitive, permitted: e.permitted }] };
    }
    case 'residency': {
      if (state.residency.some((r) => r.action === e.action)) return state;
      return { ...state, residency: [...state.residency, { action: e.action, region: e.region, rule: e.rule }] };
    }
    case 'ceiling':
      return { ...state, ceiling: { may: e.may, neverWithoutAdmin: e.neverWithoutAdmin } };
    case 'envelope':
      return {
        ...state,
        envelope: { may: e.may, mustAsk: e.mustAsk, confidenceFloor: e.confidenceFloor, consequence: e.consequence },
      };
    case 'envelope.breach': {
      if (state.breaches.some((b) => b.attempted === e.attempted)) return state;
      return { ...state, breaches: [...state.breaches, { attempted: e.attempted, allowed: e.allowed }] };
    }

    case 'taper.proposal': {
      if (state.tapers.some((t) => t.id === e.id)) return state;
      return {
        ...state,
        tapers: [...state.tapers, { id: e.id, kind: e.kind, widenTo: e.widenTo, evidence: e.evidence }],
      };
    }
    case 'taper.decided':
      return {
        ...state,
        tapers: state.tapers.map((t) =>
          t.id === e.id ? { ...t, decided: { accepted: e.accepted, by: e.by, at: e.at } } : t,
        ),
      };

    case 'handoff': {
      if (state.handoffs.some((h) => h.from === e.from && h.to === e.to)) return state;
      return {
        ...state,
        handoffs: [...state.handoffs, { from: e.from, to: e.to, carried: e.carried, dropped: e.dropped, inferred: e.inferred }],
      };
    }
    case 'memory.conflict':
      return state;

    case 'nonfinding': {
      if (state.nonfindings.some((n) => n.looked_for === e.looked_for)) return state;
      return {
        ...state,
        nonfindings: [
          ...state.nonfindings,
          { looked_for: e.looked_for, kind: e.kind, boundary: { corpus: e.boundary.corpus, timeRange: e.boundary.timeRange } },
        ],
      };
    }

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
    case 'latency.sample':
    case 'latency.distribution':
    case 'token':
    case 'ttft':
    case 'tool.call':
    case 'tool.result':
    case 'ask':
    case 'ask.answered':
    case 'capability':
    case 'queued':
    case 'spec.version':
    case 'spec.contradiction':
    case 'asr.partial':
    case 'asr.final':
    case 'echo.start':
    case 'echo.interrupted':
    case 'tts.start':
    case 'tts.end':
    case 'sweep.start':
    case 'sweep.progress':
    case 'sweep.distribution':
    case 'sweep.cluster':
    case 'sweep.caveat':
    case 'sweep.end':
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
    /* voice's events. */
    case 'spec.dirty':
    case 'spec.untested':
    case 'sweep.exemplar':
    case 'deployment':
    case 'live.signal':
    /* voice's agent-definition events, added after the webinar notes. */
    case 'spec.section':
    case 'spec.tool':
    case 'spec.variable':
    case 'spec.goal':
    case 'spec.behaviour':
    case 'settings':
    case 'production':
      return state;

    default: {
      const unhandled: never = e;
      void unhandled;
      return state;
    }
  }
}

export function reduceAllWork(state: WorkState, events: AgentEvent[], now = Date.now()): WorkState {
  return events.reduce((acc, e) => reduceWork(acc, e, now), state);
}

/* ---------------------------------------------------------------------------
   Derived reads
   ------------------------------------------------------------------------ */

/** Actions that cannot be undone. A sent email is not a draft and must not look like one. */
export const isIrreversible = (action: Action) =>
  action.state === 'irreversible_done' ||
  (action.state === 'auto_executed' && action.kind === 'email' && !action.reversibleUntilMs);

/** Legs whose outcome nobody knows. The honest middle, and the dangerous one. */
export const unresolvedLegs = (action: Action) => (action.legs ?? []).filter((l) => l.state === 'unknown');

export function needsHim(state: WorkState) {
  return state.actions.filter(
    (a) => a.state === 'blocked_on_human' || a.state === 'blocked_on_permission',
  );
}

/**
 * What went out in his name without him seeing it. The count he should know cold.
 *
 * `irreversible_done` counts: it is the same send, just past the window where it
 * could be pulled back. Counting only `auto_executed` made the number *fall* as
 * things became less recoverable, which is precisely backwards — caught by the
 * state gallery, where the disputed-attribution case read "0 in your name".
 */
export function actedAsHimUnreviewed(state: WorkState) {
  return state.actions.filter(
    (a) => a.attribution === 'as_user' && (a.state === 'auto_executed' || a.state === 'irreversible_done'),
  );
}

export function brokenActions(state: WorkState) {
  return state.actions.filter((a) => a.state === 'failed_midway');
}

/** The brief's own summary line: what it did, what it needs, what it left alone. */
export function briefSummary(state: WorkState) {
  const decided = state.actions.filter(
    (a) => a.state === 'auto_executed' || a.state === 'executed_approved',
  ).length;
  return {
    did: decided,
    needsYou: needsHim(state).length,
    asHim: actedAsHimUnreviewed(state).length,
    broken: brokenActions(state).length,
    leftAlone: state.nonfindings.length,
    read: state.items.filter((i) => i.read).length,
    total: state.items.length,
    /** The empty brief is a result, not a blank state. */
    empty: state.items.length === 0 && state.nonfindings.length > 0,
  };
}

/** Scopes that no longer hold. Expired and revoked have different fixes. */
export const lapsedScopes = (state: WorkState) => state.scopes.filter((s) => s.state !== 'granted');
