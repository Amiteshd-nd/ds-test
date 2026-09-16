/**
 * One reducer for the doc surface. Same two properties as coding's — exhaustive
 * over `AgentEvent` with a `never` default, and idempotent by key — for the same
 * reasons.
 *
 * The one thing worth reading here is `verification()`. Confidence Without Numbers
 * says the band must change *behaviour*, not just appearance: `committed` fields can
 * be accepted in bulk, `check` fields cannot. That rule lives here rather than in a
 * component, because a rule enforced in one of three call sites is decoration.
 */
import type { AgentEvent, ConfidenceBand, Provenance } from '../../agent-runtime';

export type FieldReview = 'unreviewed' | 'reviewed' | 'corrected';

export interface Correction {
  from: string | number | null;
  to: string;
  by: string;
  at: number;
  via: 'alternate' | 'typed';
}

export interface Field {
  name: string;
  value: string | number | null;
  band: ConfidenceBand;
  /** Raw score. Never rendered — it exists for the threshold control, per the pattern. */
  score: number;
  origin: 'extracted' | 'inferred';
  lang?: string;
  medium?: 'print' | 'handwriting';
  provenance?: Provenance;
  alternates?: { value: string; score: number }[];

  review: FieldReview;
  correction?: Correction;
  repairAttempts: number;
  repairExhausted?: boolean;

  /** One mark, two readings — a script problem. */
  confusable?: { readings: { value: string; glyph: string; score: number }[] };
  /** Crossed out on the paper; both values exist, one is void. */
  struckThrough?: { voided: string; current: string };
  /** Read correctly and impossible. Not a confidence problem. */
  outOfRange?: { rule: string; explanation: string };
  /** Two sources disagree — a document problem. No default selection, ever. */
  conflict?: { candidates: { value: string; provenance: Provenance }[]; chosen?: string };
}

export interface DocNonFinding {
  looked_for: string;
  kind: 'absent' | 'inaccessible' | 'ambiguous' | 'illegible';
  boundary: { corpus: string; languages?: string[]; timeRange?: string };
}

export interface SourceDoc {
  sourceId: string;
  label: string;
  pages: number;
  medium: 'print' | 'handwriting' | 'mixed';
  languages: string[];
  degraded?: ('rotated' | 'blurred' | 'cut_off')[];
}

export type DocReviewState =
  | 'unreviewed'
  | 'in_review'
  | 'accepted'
  | 'accepted_partially_verified'
  | 'rejected'
  | 'escalated';

export type ExportFormat = 'json' | 'csv' | 'markdown' | 'docx';

export interface DocState {
  runId?: string;
  source?: SourceDoc;
  fields: Field[];
  nonfindings: DocNonFinding[];
  docState: DocReviewState;
  docNote?: string;
  verifiedAtAccept?: { checked: number; total: number };
  systematic?: { field: string; documentType: string; documentsAffected: number; sinceIso: string };
  exportFormats: ExportFormat[];
  exportLosses: Partial<Record<ExportFormat, string[]>>;
  exportBlocked?: { reason: string; fields: string[] };
  scriptFallbacks: { lang: string; codepoint: string }[];
  errors: { kind: string; message: string; retryable: boolean }[];
  ttftMs?: number;
  outcome?: 'success' | 'partial' | 'failed' | 'cancelled';
  applied: number;
  startedAt?: number;
  lastEventAt?: number;
}

export const initialDocState: DocState = {
  fields: [],
  nonfindings: [],
  docState: 'unreviewed',
  exportFormats: [],
  exportLosses: {},
  scriptFallbacks: [],
  errors: [],
  applied: 0,
};

const REVIEWER = 'Kavitha R';

function upsert(fields: Field[], name: string, patch: Partial<Field>): Field[] {
  const existing = fields.find((f) => f.name === name);
  if (existing) return fields.map((f) => (f.name === name ? { ...f, ...patch } : f));
  return [
    ...fields,
    {
      name,
      value: null,
      band: 'check',
      score: 0,
      origin: 'extracted',
      review: 'unreviewed',
      repairAttempts: 0,
      ...patch,
    },
  ];
}

export function reduceDoc(state: DocState, event: AgentEvent, now = Date.now()): DocState {
  const next = apply(state, event, now);
  if (next === state) return state;
  return {
    ...next,
    applied: state.applied + 1,
    lastEventAt: now,
    startedAt: state.startedAt ?? now,
  };
}

function apply(state: DocState, e: AgentEvent, now: number): DocState {
  switch (e.t) {
    case 'run.start':
      return { ...state, runId: e.runId };
    case 'run.end':
      return { ...state, outcome: e.outcome };
    case 'ttft':
      return { ...state, ttftMs: e.ms };

    case 'source':
      return {
        ...state,
        source: {
          sourceId: e.sourceId,
          label: e.label,
          pages: e.pages,
          medium: e.medium,
          languages: e.languages,
          degraded: e.degraded,
        },
      };

    case 'value':
      return {
        ...state,
        fields: upsert(state.fields, e.field, {
          value: e.value,
          band: e.band,
          score: e.score,
          origin: e.origin,
          lang: e.lang,
          medium: e.medium,
          provenance: e.provenance,
          alternates: e.alternates,
        }),
      };

    case 'value.conflict':
      // No `chosen`. A default selection would be the interface deciding which
      // source governs, which is exactly the judgement it must not make.
      return {
        ...state,
        fields: upsert(state.fields, e.field, {
          value: null,
          band: 'check',
          conflict: { candidates: e.candidates },
        }),
      };

    case 'value.confusable':
      return {
        ...state,
        fields: upsert(state.fields, e.field, {
          confusable: { readings: e.readings },
          lang: e.lang,
        }),
      };

    case 'value.struck_through':
      return {
        ...state,
        fields: upsert(state.fields, e.field, {
          struckThrough: { voided: e.voided, current: e.current },
          value: e.current,
          provenance: e.provenance ?? undefined,
        }),
      };

    case 'value.out_of_range':
      return {
        ...state,
        fields: upsert(state.fields, e.field, {
          outOfRange: { rule: e.rule, explanation: e.explanation },
        }),
      };

    case 'field.reviewed': {
      const field = state.fields.find((f) => f.name === e.field);
      if (!field || field.review === 'corrected') return state;
      return {
        ...state,
        docState: state.docState === 'unreviewed' ? 'in_review' : state.docState,
        fields: upsert(state.fields, e.field, { review: 'reviewed' }),
      };
    }

    case 'field.corrected':
      return {
        ...state,
        docState: state.docState === 'unreviewed' ? 'in_review' : state.docState,
        fields: upsert(state.fields, e.field, {
          value: e.to,
          review: 'corrected',
          band: 'committed',
          correction: { from: e.from, to: e.to, by: e.by, at: e.at, via: e.via },
          conflict: state.fields.find((f) => f.name === e.field)?.conflict
            ? { ...state.fields.find((f) => f.name === e.field)!.conflict!, chosen: e.to }
            : undefined,
        }),
      };

    case 'repair.offered':
      return {
        ...state,
        fields: upsert(state.fields, e.field, { alternates: e.alternates }),
      };

    case 'repair.exhausted':
      return {
        ...state,
        fields: upsert(state.fields, e.field, { repairExhausted: true, repairAttempts: e.attempts }),
      };

    case 'systematic.suspected':
      return {
        ...state,
        systematic: {
          field: e.field,
          documentType: e.documentType,
          documentsAffected: e.documentsAffected,
          sinceIso: e.sinceIso,
        },
      };

    case 'doc.state':
      return {
        ...state,
        docState: e.state,
        docNote: e.note ?? state.docNote,
        verifiedAtAccept: e.verified ?? state.verifiedAtAccept,
      };

    case 'nonfinding': {
      if (state.nonfindings.some((n) => n.looked_for === e.looked_for)) return state;
      return {
        ...state,
        nonfindings: [...state.nonfindings, { looked_for: e.looked_for, kind: e.kind, boundary: e.boundary }],
      };
    }

    case 'export.ready':
      return { ...state, exportFormats: e.formats };
    case 'export.lossy':
      return { ...state, exportLosses: { ...state.exportLosses, [e.format]: e.loses } };
    case 'export.blocked':
      return { ...state, exportBlocked: { reason: e.reason, fields: e.fields } };

    case 'script.fallback': {
      if (state.scriptFallbacks.some((f) => f.codepoint === e.codepoint)) return state;
      return { ...state, scriptFallbacks: [...state.scriptFallbacks, { lang: e.lang, codepoint: e.codepoint }] };
    }

    case 'error': {
      if (state.errors.some((x) => x.message === e.message)) return state;
      return { ...state, errors: [...state.errors, { kind: e.kind, message: e.message, retryable: e.retryable }] };
    }

    /* ---- other surfaces' events, listed so a new one shows up as a decision ---- */
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
    case 'variant':
    case 'backtranslation':
    case 'term.violation':
    case 'overflow':
    /* content's events. */
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
    /* work's events. */
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

export function reduceAllDoc(state: DocState, events: AgentEvent[], now = Date.now()): DocState {
  return events.reduce((acc, e) => reduceDoc(acc, e, now), state);
}

/* ---------------------------------------------------------------------------
   Derived reads
   ------------------------------------------------------------------------ */

/** A field needing a person's eyes before the document can be accepted. */
export function needsEyes(field: Field): boolean {
  if (field.review !== 'unreviewed') return false;
  return (
    field.band === 'check' ||
    !!field.conflict ||
    !!field.confusable ||
    !!field.struckThrough ||
    !!field.outOfRange ||
    field.origin === 'inferred'
  );
}

/**
 * The arithmetic the accept gate runs on. `blocking` is the pattern's behavioural
 * teeth: those fields cannot be cleared by a bulk action, only one at a time.
 */
export function verification(state: DocState) {
  const total = state.fields.length;
  const checked = state.fields.filter((f) => f.review !== 'unreviewed').length;
  const blocking = state.fields.filter(needsEyes);
  const bulkable = state.fields.filter((f) => f.review === 'unreviewed' && !needsEyes(f));
  return {
    total,
    checked,
    blocking,
    bulkable,
    /** Accepting is allowed with unreviewed *committed* fields — and it says so. */
    canAccept: total > 0 && blocking.length === 0,
    partial: checked < total,
  };
}

/** The line the auditor reads first. Honest about what was and wasn't looked at. */
export function auditLine(state: DocState): string {
  const { checked, total } = verification(state);
  if (state.docState === 'accepted_partially_verified' && state.verifiedAtAccept) {
    const v = state.verifiedAtAccept;
    return `Accepted with ${v.checked} of ${v.total} fields verified`;
  }
  if (state.docState === 'accepted') return `Accepted, all ${total} fields verified`;
  if (state.docState === 'rejected') return 'Sent back';
  if (state.docState === 'escalated') return 'Escalated';
  return `${checked} of ${total} fields looked at`;
}

export const correctionsOf = (state: DocState) =>
  state.fields.filter((f) => f.correction).map((f) => ({ field: f.name, ...f.correction! }));
