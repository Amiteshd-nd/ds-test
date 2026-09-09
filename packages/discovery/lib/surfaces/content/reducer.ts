/**
 * One reducer for the content surface. Exhaustive, idempotent, same contract as the
 * other two.
 *
 * The interesting part is `suspicion()`. The decision log says fluency and fidelity
 * stay two axes and nothing names their worst corner — so the board's ranking has to
 * be *derived* from the pair plus the flags, not read off a state. That derivation
 * lives here, once, where it can be argued with.
 */
import type { AgentEvent, ConfidenceBand } from '../../agent-runtime';

export type Register = 'formal' | 'modern-colloquial' | 'classic-colloquial' | 'code-mixed';

export interface Segment {
  index: number;
  startMs: number;
  endMs: number;
  sourceStartMs?: number;
  sourceEndMs?: number;
  text: string;
  timing: 'fits' | 'overrun' | 'underrun';
  overByMs?: number;
}

export interface Drift {
  sentenceIdx: number;
  kind: 'added' | 'removed' | 'moved' | 'held';
  note?: string;
}

export interface Pronunciation {
  term: string;
  atMs: number;
  expected: { latin: string; kannada?: string };
  actual: { latin: string; kannada?: string };
}

export interface Variant {
  lang: string;
  /** Copied from the job so a variant can be judged on its own. */
  requestedRegister?: Register;
  text?: string;
  /** Two axes. Never combined, never scored. */
  fluency?: ConfidenceBand;
  fidelity?: ConfidenceBand;
  register?: Register;
  /** Width relative to the source. Over 1 means it needs more room, or more time. */
  expansion?: number;

  segments: Segment[];
  backtranslation?: { text: string; drift: Drift[] };
  termViolations: { term: string; renderedAs: string }[];
  pronunciation: Pronunciation[];
  voiceDrift?: { fromMs: number; toMs: number; note: string };
  overflow?: { container: string; overBy: number };
  clipped?: { container: string };
  scriptFallback?: { codepoint: string };
  clauseDropped?: { clause: string; atMs: number; regulated: boolean };

  review?: {
    question?: string;
    atMs?: number;
    clause?: string;
    by?: string;
    verdict?: 'approved' | 'rejected';
    reason?: string;
    timedOutSince?: string;
  };
  approved?: { verified: boolean; by: string; at: number };
  pinnedTerms: { term: string; renderAs: string }[];
  regenerated: number[];
}

export interface Consent {
  voiceId: string;
  voiceName: string;
  state: 'on_file' | 'missing' | 'expired' | 'scope_exceeded';
  grantedFor?: string;
  untilIso?: string;
  note?: string;
}

export interface ContentNonFinding {
  looked_for: string;
  kind: 'absent' | 'inaccessible' | 'ambiguous' | 'illegible';
  boundary: { corpus: string; languages?: string[] };
}

export interface ContentState {
  runId?: string;
  job?: {
    jobId: string;
    sourceId: string;
    durationMs: number;
    languages: string[];
    voiceId: string;
    /** What was asked for, per language. `REGISTER_MISMATCH` measures against it. */
    registers: Record<string, Register>;
  };
  consent?: Consent;
  /** Proceeding without a consent record, attributed. The only guard there is. */
  consentAck?: { by: string; at: number; scope: string };
  order: string[];
  variants: Record<string, Variant>;
  nonfindings: ContentNonFinding[];
  publishBlocked?: { reason: string; langs: string[] };
  errors: { kind: string; message: string; retryable: boolean }[];
  outcome?: 'success' | 'partial' | 'failed' | 'cancelled';
  applied: number;
  startedAt?: number;
  lastEventAt?: number;
}

export const initialContentState: ContentState = {
  order: [],
  variants: {},
  nonfindings: [],
  errors: [],
  applied: 0,
};

function blank(lang: string): Variant {
  return { lang, segments: [], termViolations: [], pronunciation: [], pinnedTerms: [], regenerated: [] };
}

function patch(state: ContentState, lang: string, change: (v: Variant) => Variant): ContentState {
  const existing = state.variants[lang] ?? blank(lang);
  return {
    ...state,
    order: state.order.includes(lang) ? state.order : [...state.order, lang],
    variants: { ...state.variants, [lang]: change(existing) },
  };
}

export function reduceContent(state: ContentState, event: AgentEvent, now = Date.now()): ContentState {
  const next = apply(state, event, now);
  if (next === state) return state;
  return { ...next, applied: state.applied + 1, lastEventAt: now, startedAt: state.startedAt ?? now };
}

function apply(state: ContentState, e: AgentEvent, now: number): ContentState {
  switch (e.t) {
    case 'run.start':
      return { ...state, runId: e.runId };
    case 'run.end':
      return { ...state, outcome: e.outcome };

    case 'dub.job':
      return {
        ...state,
        job: {
          jobId: e.jobId,
          sourceId: e.sourceId,
          durationMs: e.durationMs,
          languages: e.languages,
          voiceId: e.voiceId,
          registers: e.registers,
        },
        // Every requested language exists from the start, so "not back yet" is a
        // visible state rather than an absence.
        order: e.languages,
        variants: e.languages.reduce<Record<string, Variant>>((all, lang) => {
          all[lang] = { ...(state.variants[lang] ?? blank(lang)), requestedRegister: e.registers[lang] };
          return all;
        }, {}),
      };

    case 'consent':
      return {
        ...state,
        consent: {
          voiceId: e.voiceId,
          voiceName: e.voiceName,
          state: e.state,
          grantedFor: e.grantedFor,
          untilIso: e.untilIso,
          note: e.note,
        },
      };
    case 'consent.acknowledged':
      return { ...state, consentAck: { by: e.by, at: e.at, scope: e.scope } };

    case 'variant':
      return patch(state, e.lang, (v) => ({
        ...v,
        text: e.text,
        fluency: e.fluency,
        fidelity: e.fidelity,
        register: e.register,
        expansion: e.expansion,
      }));

    case 'segment':
      return patch(state, e.lang, (v) => {
        const segment: Segment = {
          index: e.index,
          startMs: e.startMs,
          endMs: e.endMs,
          sourceStartMs: e.sourceStartMs,
          sourceEndMs: e.sourceEndMs,
          text: e.text,
          timing: e.timing,
          overByMs: e.overByMs,
        };
        const exists = v.segments.some((s) => s.index === e.index);
        return {
          ...v,
          segments: exists
            ? v.segments.map((s) => (s.index === e.index ? segment : s))
            : [...v.segments, segment].sort((a, b) => a.index - b.index),
        };
      });

    case 'backtranslation':
      return patch(state, e.lang, (v) => ({ ...v, backtranslation: { text: e.text, drift: e.drift } }));

    case 'term.violation':
      return patch(state, e.lang, (v) =>
        v.termViolations.some((t) => t.term === e.term)
          ? v
          : { ...v, termViolations: [...v.termViolations, { term: e.term, renderedAs: e.renderedAs }] },
      );

    case 'clause.dropped':
      return patch(state, e.lang, (v) => ({
        ...v,
        clauseDropped: { clause: e.clause, atMs: e.atMs, regulated: e.regulated },
      }));

    case 'pronunciation.suspect':
      return patch(state, e.lang, (v) =>
        v.pronunciation.some((p) => p.term === e.term)
          ? v
          : {
              ...v,
              pronunciation: [
                ...v.pronunciation,
                { term: e.term, atMs: e.atMs, expected: e.expected, actual: e.actual },
              ],
            },
      );

    case 'voice.drift':
      return patch(state, e.lang, (v) => ({ ...v, voiceDrift: { fromMs: e.fromMs, toMs: e.toMs, note: e.note } }));

    case 'overflow':
      return patch(state, e.lang, (v) => ({ ...v, overflow: { container: e.container, overBy: e.overBy } }));
    case 'script.clipped':
      return patch(state, e.lang, (v) => ({ ...v, clipped: { container: e.container } }));
    case 'script.fallback':
      return patch(state, e.lang, (v) => ({ ...v, scriptFallback: { codepoint: e.codepoint } }));

    case 'review.request':
      return patch(state, e.lang, (v) => ({
        ...v,
        review: { ...v.review, question: e.question, atMs: e.atMs, clause: e.clause },
      }));
    case 'review.result':
      return patch(state, e.lang, (v) => ({
        ...v,
        review: { ...v.review, by: e.by, verdict: e.verdict, reason: e.reason },
      }));
    case 'review.timeout':
      return patch(state, e.lang, (v) => ({ ...v, review: { ...v.review, timedOutSince: e.sinceIso } }));

    case 'variant.approved':
      return patch(state, e.lang, (v) => ({ ...v, approved: { verified: e.verified, by: e.by, at: e.at } }));
    case 'publish.blocked':
      return { ...state, publishBlocked: { reason: e.reason, langs: e.langs } };

    case 'term.pinned':
      return patch(state, e.lang, (v) => ({
        ...v,
        pinnedTerms: v.pinnedTerms.some((t) => t.term === e.term)
          ? v.pinnedTerms
          : [...v.pinnedTerms, { term: e.term, renderAs: e.renderAs }],
        // Pinning a term resolves that violation without touching the audio.
        termViolations: v.termViolations.filter((t) => t.term !== e.term),
      }));
    case 'segment.regenerated':
      return patch(state, e.lang, (v) => ({
        ...v,
        regenerated: v.regenerated.includes(e.index) ? v.regenerated : [...v.regenerated, e.index],
      }));

    case 'nonfinding': {
      if (state.nonfindings.some((n) => n.looked_for === e.looked_for)) return state;
      return {
        ...state,
        nonfindings: [
          ...state.nonfindings,
          { looked_for: e.looked_for, kind: e.kind, boundary: e.boundary },
        ],
      };
    }

    case 'error': {
      if (state.errors.some((x) => x.message === e.message)) return state;
      return { ...state, errors: [...state.errors, { kind: e.kind, message: e.message, retryable: e.retryable }] };
    }

    /* ---- other surfaces' events ---- */
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
    case 'handoff':
    case 'memory.conflict':
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
      return state;

    default: {
      const unhandled: never = e;
      void unhandled;
      return state;
    }
  }
}

export function reduceAllContent(state: ContentState, events: AgentEvent[], now = Date.now()): ContentState {
  return events.reduce((acc, e) => reduceContent(acc, e, now), state);
}

/* ---------------------------------------------------------------------------
   Derived reads
   ------------------------------------------------------------------------ */

export type Flag =
  | 'clause_dropped'
  | 'fidelity'
  | 'term'
  | 'pronunciation'
  | 'timing'
  | 'voice'
  | 'register'
  | 'typography';

/** Every flag on a variant, worst first. Order is the argument, so it lives here. */
export function flagsOf(variant: Variant): Flag[] {
  const flags: Flag[] = [];
  // A missing exclusion in a regulated claim outranks everything: it is the legal one.
  if (variant.clauseDropped?.regulated) flags.push('clause_dropped');
  // Then meaning. Fidelity below committed is the fluent-and-wrong case, unnamed by
  // decision, so it is ranked rather than labelled.
  if (variant.fidelity && variant.fidelity !== 'committed') flags.push('fidelity');
  if (variant.backtranslation?.drift.some((d) => d.kind !== 'held') && !flags.includes('fidelity')) {
    flags.push('fidelity');
  }
  if (variant.termViolations.length) flags.push('term');
  if (variant.pronunciation.length) flags.push('pronunciation');
  if (variant.segments.some((s) => s.timing !== 'fits')) flags.push('timing');
  if (variant.voiceDrift) flags.push('voice');
  // Measured against what was asked for. Formal is not wrong; formal when
  // code-mixed was requested is, and only the job knows which.
  if (variant.register && variant.requestedRegister && variant.register !== variant.requestedRegister) {
    flags.push('register');
  }
  if (variant.overflow || variant.clipped || variant.scriptFallback) flags.push('typography');
  return flags;
}

const WEIGHT: Record<Flag, number> = {
  clause_dropped: 100,
  fidelity: 60,
  term: 30,
  pronunciation: 25,
  timing: 12,
  voice: 12,
  register: 6,
  typography: 5,
};

/** Rank by suspicion. Derived from the two axes and the flags — never a score shown. */
export function suspicion(variant: Variant): number {
  return flagsOf(variant).reduce((sum, flag) => sum + WEIGHT[flag], 0);
}

export function rankedVariants(state: ContentState): Variant[] {
  return state.order
    .map((lang) => state.variants[lang])
    .filter((v): v is Variant => !!v)
    .sort((a, b) => suspicion(b) - suspicion(a) || a.lang.localeCompare(b.lang));
}

/** Clean variants collapse to one line. Agreement is not information. */
export const isClean = (variant: Variant) => flagsOf(variant).length === 0 && !!variant.text;
export const notBackYet = (variant: Variant) => !variant.text;

/** The shape of the job across nine languages. Counts, never a pass rate. */
export function shape(state: ContentState) {
  const variants = state.order.map((lang) => state.variants[lang]).filter((v): v is Variant => !!v);
  return {
    total: variants.length,
    clean: variants.filter(isClean).length,
    flagged: variants.filter((v) => !isClean(v) && !notBackYet(v)).length,
    waiting: variants.filter(notBackYet).length,
    approved: variants.filter((v) => v.approved).length,
    approvedUnverified: variants.filter((v) => v.approved && !v.approved.verified).length,
    inNativeReview: variants.filter((v) => v.review?.question && !v.review.verdict).length,
  };
}

/** Publishing a regulated claim she cannot evaluate. The gate's own arithmetic. */
export function publishability(state: ContentState) {
  const variants = state.order.map((lang) => state.variants[lang]).filter((v): v is Variant => !!v);
  const blocking = variants.filter(
    (v) => v.clauseDropped?.regulated || (v.fidelity && v.fidelity !== 'committed' && !v.review?.verdict),
  );
  const unverified = variants.filter((v) => v.approved && !v.approved.verified);
  return {
    blocking,
    unverified,
    canPublish: variants.length > 0 && blocking.length === 0,
    consentUnresolved: !!state.consent && state.consent.state !== 'on_file' && !state.consentAck,
  };
}
