/**
 * agent-runtime.ts
 * ---------------------------------------------------------------------------
 * A deterministic, replayable, fault-injectable fake agent.
 * Shared by all five projects: voice, doc, work, content, coding.
 *
 * WHY THIS EXISTS
 *
 * You cannot design an error state you cannot reproduce. Real agents fail
 * unpredictably, which means if you build against a live API you will spend
 * your time waiting for a failure to occur naturally instead of designing
 * the failure. This runtime inverts that: every state in your state list
 * becomes a script you can replay on demand, identically, for every user
 * test participant.
 *
 * It also means your interview demo does not depend on a network.
 *
 * WHAT IT IS NOT
 *
 * Not a mock API. Use MSW for HTTP shapes. This models the *event stream* an
 * agent emits over time — which is the thing your UI actually renders.
 *
 * USAGE
 *
 *   const run = createRun(scripts.dutyStatusChange, {
 *     seed: 42,
 *     speed: 1,
 *     faults: ['asr_low_confidence'],
 *   });
 *
 *   for await (const event of run) {
 *     store.apply(event);
 *   }
 *
 * Same seed + same faults = byte-identical stream. Always.
 */

/* =========================================================================
   EVENT MODEL
   -------------------------------------------------------------------------
   These event types ARE the design grammar, expressed as data. If a pattern
   in grammar/patterns.md has no corresponding event here, either the
   pattern isn't real or the model is incomplete. Keep them in sync.
   ====================================================================== */

export type ConfidenceBand = 'committed' | 'check' | 'failed';

export type Capability = 'online_full' | 'edge_only' | 'offline';

export interface Provenance {
  sourceId: string;
  /** Region, not document. "Page 4" is not provenance. */
  region?: { page: number; x: number; y: number; w: number; h: number };
  /** For audio sources: millisecond span. */
  span?: { startMs: number; endMs: number };
  /**
   * How precisely it can point. Added for projects/doc: the pattern assumes a
   * region exists, and on a photograph of a photocopy it often doesn't. The
   * degenerate case is the design problem, so it has to be representable.
   */
  precision?: 'region' | 'page' | 'none';
}

export type AgentEvent =
  /* ---- lifecycle ---- */
  | { t: 'run.start'; runId: string; at: number; intent: string }
  | { t: 'run.end'; runId: string; at: number; outcome: 'success' | 'partial' | 'failed' | 'cancelled' }

  /* ---- planning: the taskgraph arrives as a graph, not a list ---- */
  | { t: 'plan'; nodes: PlanNode[]; edges: [string, string][] }
  | { t: 'node.state'; nodeId: string; state: NodeState; at: number }
  | { t: 'node.progress'; nodeId: string; done: number; total: number }

  /* ---- streaming output ---- */
  | { t: 'token'; nodeId: string; text: string }
  | { t: 'ttft'; nodeId: string; ms: number }   // time to first token, tracked separately

  /* ---- tool use ---- */
  | { t: 'tool.call'; nodeId: string; tool: string; args: Record<string, unknown> }
  | { t: 'tool.result'; nodeId: string; tool: string; ms: number; ok: boolean }

  /* ---- values with epistemics attached ---- */
  | {
      t: 'value';
      nodeId: string;
      field: string;
      value: string | number | null;
      band: ConfidenceBand;
      /** Raw score. Surface this ONLY in the delegation-envelope control. */
      score: number;
      /** Extracted from a source, or inferred from other values. Must render differently. */
      origin: 'extracted' | 'inferred';
      provenance?: Provenance;
      /** Ranked alternates, for the Repair Loop pattern. */
      alternates?: { value: string; score: number }[];
      /**
       * BCP-47 tag for the value's own script, added for projects/doc. Every Indic
       * text node has to carry `lang` or per-script line heights don't key off it and
       * Devanagari renders with Latin leading — so the value has to know its language,
       * not just the surface it lands on.
       */
      lang?: string;
      /** Print and handwriting fail differently, so they can't share a treatment. */
      medium?: 'print' | 'handwriting';
    }
  | { t: 'value.conflict'; field: string; candidates: { value: string; provenance: Provenance }[] }

  /* ---- the absence of a result is a result ---- */
  | {
      t: 'nonfinding';
      nodeId: string;
      looked_for: string;
      kind: 'absent' | 'inaccessible' | 'ambiguous' | 'illegible';
      /** Name the search boundary. An unbounded null result is meaningless. */
      boundary: { corpus: string; languages?: string[]; timeRange?: string };
    }

  /* ---- handing control back ---- */
  | {
      t: 'ask';
      nodeId: string;
      /** Narrowest possible question. One span at a time. */
      question: string;
      about?: { field: string; span?: [number, number] };
      options?: string[];
      /** Does this block the whole run or just this branch? */
      blocking: 'run' | 'branch';
    }
  | { t: 'ask.answered'; nodeId: string; answer: string; at: number }

  /* ---- commit boundaries: semantic, not temporal ---- */
  | { t: 'checkpoint'; id: string; label: string; at: number; restorable: true }

  /* ---- capability envelope ---- */
  | { t: 'capability'; from: Capability; to: Capability; at: number }
  | { t: 'queued'; count: number; oldestAt: number }

  /* ---- voice-specific ---- */
  | { t: 'asr.partial'; text: string; lang: string }
  | { t: 'asr.final'; text: string; lang: string; spans: AsrSpan[] }
  | { t: 'echo.start'; utterance: string; facts: string[] }
  | { t: 'echo.interrupted'; atMs: number }
  | { t: 'tts.start'; ms: number } | { t: 'tts.end' }

  /* ---- failure ---- */
  | {
      t: 'error';
      nodeId?: string;
      /** Typed by cause, because cause determines the UI. */
      kind: 'auth' | 'rate_limit' | 'timeout' | 'unsupported' | 'network'
          | 'parse_failed' | 'language_mismatch' | 'out_of_scope' | 'stalled';
      message: string;
      retryable: boolean;
      retryAfterMs?: number;
    }

  /* ---- authoring: the Behaviour Spec ---- */
  | {
      t: 'spec.version';
      id: string;
      /** Hard constraints and soft guidance fail differently. Keep them apart. */
      hard: { id: string; rule: string; tested: boolean }[];
      soft: { id: string; guidance: string }[];
      examples: { id: string; input: string; expected: string; pinning: boolean }[];
    }
  | { t: 'spec.contradiction'; specLineId: string; exampleId: string; note: string }

  /* ---- evaluation: the Simulation Sweep ---- */
  | { t: 'sweep.start'; sweepId: string; specId: string; runs: number }
  | { t: 'sweep.progress'; done: number; total: number }
  | {
      t: 'sweep.distribution';
      /** Shape, not score. Never lead with a single pass rate. */
      outcomes: Record<
        'resolved' | 'escalated' | 'abandoned' | 'looped' | 'timed_out'
        | 'constraint_breached' | 'off_script_but_fine',
        number
      >;
    }
  | {
      t: 'sweep.cluster';
      id: string;
      /** Named in the author's vocabulary, not the system's. Grouped by CAUSE. */
      cause: string;
      count: number;
      /** Which spec line governs this. A failure you can't trace is a dead end. */
      specLineId?: string;
      exemplarRunIds: string[];
      /** Delta vs the previous sweep. Negative = regression. Must be loud. */
      deltaVsLast?: number;
    }
  | {
      t: 'sweep.caveat';
      /** What the simulation CANNOT tell you. Synthetic callers are more patient,
          fluent and cooperative than real ones. A sweep is evidence, not a promise. */
      kind: 'unrepresentative_population' | 'clean_audio_only' | 'constraint_never_exercised'
          | 'sample_too_small';
      detail: string;
    }
  | { t: 'sweep.end'; sweepId: string; regressed: boolean }

  /* ---- fleets: the seams are the objects ---- */
  | {
      t: 'handoff';
      from: string;
      to: string;
      carried: string[];
      /** What was dropped at the seam. Most fleet failures live here. */
      dropped: string[];
      inferred: string[];
    }
  | { t: 'memory.conflict'; key: string; writers: string[]; values: string[] }

  /* ---- content: generation across languages ---- */
  | {
      t: 'variant';
      lang: string;
      text: string;
      /** Fluency and fidelity are DIFFERENT axes. Never collapse them. */
      fluency: ConfidenceBand;
      fidelity: ConfidenceBand;
      register: 'formal' | 'modern-colloquial' | 'classic-colloquial' | 'code-mixed';
      /** Width relative to the source, for the expansion-overflow state. */
      expansion: number;
    }
  | {
      t: 'backtranslation';
      lang: string;
      text: string;
      /** Sentence-aligned drift. Marks change only; agreement isn't information. */
      drift: { sentenceIdx: number; kind: 'added' | 'removed' | 'moved' | 'held'; note?: string }[];
    }
  | { t: 'term.violation'; lang: string; term: string; renderedAs: string }
  | { t: 'script.fallback'; lang: string; codepoint: string }
  | { t: 'overflow'; lang: string; container: string; overBy: number }

  /* ---- coding: long runs, steering, checkpoints, file changes ----
     Added for projects/coding — the eight patterns that brief must earn had no
     events here, and per the note at the top of the event model that means the
     model was incomplete, not that the patterns weren't real.
     See grammar/log/2026-09-09-coding-events.md. */

  /** A plan change is an EVENT, not a silent update. The highest-information
      moment in a run, and the one most tools render as a diff nobody sees. */
  | {
      t: 'plan.revise';
      at: number;
      /** In the agent's own words, in the developer's vocabulary. */
      because: string;
      added: PlanNode[];
      dropped: string[];
      kept: string[];
    }

  /** The work no longer matches the stated plan and nothing has failed.
      Distinct from failure and more dangerous, because it all looks fine. */
  | { t: 'divergence'; at: number; expected: string; observed: string; evidence: string[] }

  /** Steering, in two halves. The preview must exist before the commit:
      the person is agreeing to what gets discarded, not just to a redirect. */
  | { t: 'steering.preview'; instruction: string; kept: string[]; discarded: string[]; requeued: string[] }
  | {
      t: 'steering.applied';
      at: number;
      instruction: string;
      kept: string[];
      discarded: string[];
      requeued: string[];
    }

  /** One file change. `speculative` work rests on an assumption not yet
      confirmed, and is the work most likely to be thrown away. */
  | {
      t: 'change';
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
  | { t: 'change.state'; id: string; state: ChangeState; at: number; note?: string }

  /** Checkpoints carry state of their own: a boundary can be partial. */
  | { t: 'checkpoint.state'; id: string; state: 'clean' | 'partial' | 'restored'; at: number; note?: string }

  /** The Delegation Envelope as data. `confidenceFloor` is the one place in the
      whole system where a raw score is allowed in front of a person. */
  | {
      t: 'envelope';
      at: number;
      may: string[];
      mustAsk: string[];
      confidenceFloor: number;
      /** Consequence preview for the current setting — a policy control without
          one is a guess dressed as a setting. */
      consequence?: { autoApplied: number; asks: number; expectedWrong: number };
    }

  /** Latency, segmented by the developer's decision vocabulary. One sample for
      this run; the distribution separately, because one run is not a claim. */
  | {
      t: 'latency.sample';
      nodeId?: string;
      ttftMs: number;
      totalMs: number;
      segments: { kind: 'network' | 'queue' | 'model' | 'synthesis'; ms: number }[]
    }
  | {
      t: 'latency.distribution';
      label: string;
      n: number;
      ttft: { p50: number; p95: number };
      total: { p50: number; p95: number };
      /** Where the numbers came from. Never let a scripted number read as measured. */
      source: 'measured' | 'placeholder';
    }

  /* ---- doc: extraction review, provenance, and the audit trail ----
     Added for projects/doc. Same reasoning as the coding block: five of the states
     in projects/doc/states.md had no event, so the model was short, not the states.
     See grammar/log/2026-09-09-doc-decisions.md. */

  /** The document being reviewed, and how well it can be pointed at. */
  | {
      t: 'source';
      sourceId: string;
      label: string;
      pages: number;
      /** Rotated, blurred, cut off — provenance still has to work. */
      degraded?: ('rotated' | 'blurred' | 'cut_off')[];
      /** Print, hand-filled, or a hand-filled form on a printed one. */
      medium: 'print' | 'handwriting' | 'mixed';
      languages: string[];
    }

  /** One glyph, two readings. Distinct from `value.conflict`, which is two SOURCES
      disagreeing: this one is a script problem, that one is a document problem, and
      the next action differs (zoom in versus reconcile). Kept separate deliberately
      and flagged in the decision log — testing could collapse them. */
  | {
      t: 'value.confusable';
      field: string;
      value: string;
      /** The competing readings, with the glyphs that make them ambiguous. */
      readings: { value: string; glyph: string; score: number }[];
      lang: string;
    }

  /** Struck through on the page: two values, one of them void. */
  | {
      t: 'value.struck_through';
      field: string;
      /** What was crossed out, and what replaced it. Both are on the paper. */
      voided: string;
      current: string;
      provenance?: Provenance;
    }

  /** Read correctly, and impossible. Confidence and correctness are different axes,
      and no band catches this one. Three hardcoded rules; not a validation engine. */
  | {
      t: 'value.out_of_range';
      field: string;
      value: string | number;
      rule: 'date_plausibility' | 'amount_against_total' | 'id_format';
      explanation: string;
    }

  /** The human half of the trail. The auditor reads these, not the reviewer. */
  | { t: 'field.reviewed'; field: string; by: string; at: number }
  | {
      t: 'field.corrected';
      field: string;
      from: string | number | null;
      to: string;
      by: string;
      at: number;
      /** Picking a ranked alternate is not the same act as typing a new value. */
      via: 'alternate' | 'typed';
    }

  /** Repair Loop, capped at two attempts per the pattern. */
  | { t: 'repair.offered'; field: string; alternates: { value: string; score: number }[] }
  | { t: 'repair.exhausted'; field: string; attempts: number }

  /** The correction that reveals a systematic error — hard moment #3. */
  | {
      t: 'systematic.suspected';
      field: string;
      documentType: string;
      documentsAffected: number;
      sinceIso: string;
    }

  /** Document-level review state, including the honest one. */
  | {
      t: 'doc.state';
      state:
        | 'unreviewed'
        | 'in_review'
        | 'accepted'
        | 'accepted_partially_verified'
        | 'rejected'
        | 'escalated';
      at: number;
      /** For a partial accept: what was actually looked at. */
      verified?: { checked: number; total: number };
      note?: string;
    }

  /** Export — where the agent's output becomes someone's file. */
  | { t: 'export.ready'; formats: ('json' | 'csv' | 'markdown' | 'docx')[] }
  | {
      t: 'export.lossy';
      format: 'json' | 'csv' | 'markdown' | 'docx';
      /** Said before she picks, not after. */
      loses: string[];
    }
  | { t: 'export.blocked'; reason: string; fields: string[] }

  /* ---- content: dubbing across nine languages ----
     Added for projects/content. `variant`, `backtranslation`, `term.violation`,
     `script.fallback` and `overflow` already existed; these are the states that had
     no event — the job across nine languages, time-aligned segments, pronunciation
     she cannot hear, cloned-voice consent, and aiming a native reviewer.
     See grammar/log/2026-09-09-content-decisions.md. */

  | {
      t: 'dub.job';
      jobId: string;
      sourceId: string;
      /** The source is fixed and central; every variant is a claim about it. */
      durationMs: number;
      languages: string[];
      voiceId: string;
      /**
       * The register asked for, **per language**. One register across nine is the
       * modelling error the brief warns about — the same warmth reads as respectful
       * in Tamil and presumptuous in Bengali, so it does not transfer. Without this
       * per-language, "register mismatch" is the interface assuming its own default.
       */
      registers: Record<string, 'formal' | 'modern-colloquial' | 'classic-colloquial' | 'code-mixed'>;
    }

  /** Time is the primary axis, so a dub arrives as segments, not a blob of text.
      `sourceStartMs` is the Provenance Link in the time dimension: which source
      segment produced this one. Without it the timeline is decoration. */
  | {
      t: 'segment';
      lang: string;
      index: number;
      startMs: number;
      endMs: number;
      sourceStartMs?: number;
      sourceEndMs?: number;
      text: string;
      /** Text expansion in the time dimension — the constraint unique to this medium. */
      timing: 'fits' | 'overrun' | 'underrun';
      overByMs?: number;
    }

  /** A clause that went missing. In a regulated category this is the legal failure,
      not a rephrasing, so it is not just a `removed` mark on a back-translation. */
  | {
      t: 'clause.dropped';
      lang: string;
      clause: string;
      atMs: number;
      regulated: boolean;
    }

  /** The most common real failure, and invisible in a transcript. Both scripts are
      carried on purpose: Latin travels, Kannada keeps the distinctions that break
      brand names, and Priya and the native reviewer need different ones. */
  | {
      t: 'pronunciation.suspect';
      lang: string;
      term: string;
      atMs: number;
      expected: { latin: string; kannada?: string };
      /** What it actually said, written back into a script she reads. */
      actual: { latin: string; kannada?: string };
    }

  /** The cloned voice drifts. Where in the four minutes, not "somewhere". */
  | { t: 'voice.drift'; lang: string; fromMs: number; toMs: number; note: string }

  /** Cloned-voice consent. The interface warns and allows (see the decision log),
      so this event has to carry enough for the warning to be specific. */
  | {
      t: 'consent';
      voiceId: string;
      voiceName: string;
      state: 'on_file' | 'missing' | 'expired' | 'scope_exceeded';
      grantedFor?: string;
      untilIso?: string;
      note?: string;
    }
  /** Proceeding anyway, attributed. An unattributed override is not a record. */
  | { t: 'consent.acknowledged'; voiceId: string; by: string; at: number; scope: string }

  /** A subtitle whose line box clips its own descenders — the per-script line-height
      failure. Detected by measurement rather than claimed by the model, so the event
      exists to make the state reachable in the gallery. */
  | { t: 'script.clipped'; lang: string; container: string }

  /** Aiming a scarce reviewer: one question, one timecode, one clause. */
  | {
      t: 'review.request';
      lang: string;
      question: string;
      atMs?: number;
      clause?: string;
    }
  | {
      t: 'review.result';
      lang: string;
      by: string;
      verdict: 'approved' | 'rejected';
      reason?: string;
      at: number;
    }
  | { t: 'review.timeout'; lang: string; sinceIso: string }

  /** Approval, and whether she could actually check it. */
  | { t: 'variant.approved'; lang: string; verified: boolean; by: string; at: number }
  | { t: 'publish.blocked'; reason: string; langs: string[] }

  /** Repair without regenerating four minutes of audio. */
  | { t: 'term.pinned'; lang: string; term: string; renderAs: string }
  | { t: 'segment.regenerated'; lang: string; index: number }

  /* ---- envelope breach: log it loudly ---- */
  | { t: 'envelope.breach'; nodeId: string; attempted: string; allowed: string };

/** File-change lifecycle. `applied_unreviewed` landed under the envelope without
    anyone looking; `conflicts_with_manual_edit` is the person editing a file the
    agent was working on — guaranteed to happen, almost never designed for. */
export type ChangeState =
  | 'proposed'
  | 'applied'
  | 'applied_unreviewed'
  | 'reverted'
  | 'conflicts_with_manual_edit';

export type NodeState =
  | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  | 'partially_succeeded'
  | 'blocked_on_human'      // reserve your loudest treatment for this
  | 'blocked_on_upstream'
  | 'retrying'
  | 'stalled'               // running, no progress. Looks healthy everywhere. It isn't.
  | 'speculative'           // done on an assumption not yet confirmed. Render provisional.
  | 'blocked_on_permission';// wants to touch something outside its envelope.

export interface PlanNode {
  id: string;
  label: string;            // person's domain vocabulary, not the system's
  state: NodeState;
}

export interface AsrSpan {
  text: string;
  score: number;
  /** Proper nouns and numbers are where ASR fails — flag them for echoing. */
  kind?: 'proper_noun' | 'number' | 'time' | 'ordinary';
  alternates?: { text: string; score: number }[];
}

/* =========================================================================
   SCRIPTS
   -------------------------------------------------------------------------
   A script is a list of [delayMs, event]. Delays are the design material —
   get them from real API measurements, then keep them fixed so every test
   participant sees the same timing.
   ====================================================================== */

export type ScriptStep = [delayMs: number, event: AgentEvent];
export type Script = ScriptStep[];

/** Faults you can inject. Each maps to a state in a project's state list. */
export type FaultKind =
  | 'asr_low_confidence'      // → PARSED_PARTIAL → AWAITING_REPAIR
  | 'asr_wrong_language'      // → LANGUAGE_MISMATCH
  | 'asr_proper_noun_miss'    // the realistic one: right intent, wrong place name
  | 'network_drop'            // → EDGE_ONLY mid-run
  | 'slow_ttft'               // 4s to first token
  | 'stalled_node'            // running, no progress, no error
  | 'rate_limited'
  | 'auth_failed'
  | 'unsupported_combination' // language works for STT, not TTS
  | 'conflicting_values'
  | 'planted_error'           // confidently wrong output — for the appropriate-distrust test
  | 'meaning_drift'           // fluent output, wrong meaning — content's central failure
  | 'protected_term_translated'
  | 'script_fallback'         // font can't render a glyph; invisible to a non-reader
  /* coding */
  | 'plan_revised'            // the agent rewrites its own plan mid-run
  | 'diverged_run'            // work drifts from the plan, nothing fails
  | 'manual_edit_conflict'    // he edited a file the agent was working on
  | 'permission_block'        // wants to run something outside its envelope
  | 'speculative_discard'     // the assumption was wrong; provisional work is dropped
  | 'awaiting_steering'       // paused, asking which direction to take — blocks the whole run
  | 'retrying_step'           // second attempt, and what changed between them
  | 'upstream_blocked'        // waiting on an earlier step, which is not the same as idle
  | 'partial_step'            // the step half-worked
  | 'envelope_breach'         // tried to act outside its authority. Loud, and logged
  | 'cancelled_midrun'        // stopped by hand; what survived matters
  /* doc */
  | 'confusable_glyph'        // one mark, two readings — a script problem, not a confidence one
  | 'struck_through'          // the applicant crossed it out and wrote another
  | 'out_of_range'            // read correctly, and impossible
  | 'provenance_unavailable'  // no coordinates: the value may be right, the verification isn't
  | 'source_degraded'         // rotated, blurred, cut off — provenance still has to work
  | 'systematic_error'        // the same field wrong across every document of this type
  | 'repair_exhausted'        // two attempts on one field, then stop guessing
  | 'provenance_page_only'    // it knows the page, not the place on it
  /* content */
  | 'clause_dropped'          // an exclusion goes missing in a regulated claim
  | 'pronunciation_wrong'     // the brand name comes out wrong in a language she can't hear
  | 'voice_drifts'            // the cloned voice changes halfway through
  | 'timing_overrun'          // the dub is longer than the shot it has to fit
  | 'consent_missing'         // no consent record for the cloned voice
  | 'consent_expired'         // granted once, for something else, last year
  | 'subtitle_clipped'        // per-script line height clips its own descenders
  | 'native_review_timeout'   // the reviewer never came back
  | 'planted_drift_one';      // ONE variant is fluent and wrong — the real experiment

export interface RunOptions {
  /** Same seed = identical stream. Required for comparable user tests. */
  seed?: number;
  /** Time multiplier. 0 = instant (for unit tests), 1 = real, 0.25 = demo speed. */
  speed?: number;
  faults?: FaultKind[];
  /** Jitter as a fraction of each delay. 0 for tests, 0.15 for a lifelike demo. */
  jitter?: number;
  signal?: AbortSignal;
}

/* =========================================================================
   DETERMINISTIC RNG (mulberry32)
   ====================================================================== */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    // Check the flag before arming the listener. An abort that lands *between*
    // two events — a consumer cancelling right after receiving one, which is what
    // React unmounting and an SSE client disconnecting both look like — would
    // otherwise be missed, and the run would play on to the end with nobody
    // listening. Found by the cancellation test in agent-runtime.test.ts.
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    if (ms <= 0) return resolve();
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });

/* =========================================================================
   FAULT APPLICATION
   -------------------------------------------------------------------------
   Faults transform the script before playback. Deterministic, so a
   fault-injected run is as reproducible as a clean one.
   ====================================================================== */

/** Splice steps in just before the run ends.
    `out.push(...)` puts a fault *after* `run.end`, which is fine for a terminal
    error but nonsense for anything that describes work in flight — a divergence or
    a manual-edit conflict in a finished run is not a state anyone can act on. */
function insertBeforeEnd(out: Script, steps: Script): Script {
  const end = out.findIndex(([, e]) => e.t === 'run.end');
  if (end < 0) return [...out, ...steps];
  return [...out.slice(0, end), ...steps, ...out.slice(end)];
}

function applyFaults(script: Script, faults: FaultKind[], rand: () => number): Script {
  let out = [...script];

  for (const fault of faults) {
    switch (fault) {
      case 'asr_low_confidence':
        out = out.map(([d, e]) =>
          e.t === 'value'
            ? [d, { ...e, band: 'check' as ConfidenceBand, score: 0.41 + rand() * 0.15 }]
            : [d, e]
        );
        break;

      case 'asr_proper_noun_miss':
        // The realistic failure: intent is right, the place name is wrong.
        out = out.flatMap(([d, e]) => {
          if (e.t === 'asr.final') {
            const spans = e.spans.map(s =>
              s.kind === 'proper_noun'
                ? { ...s, score: 0.38, alternates: s.alternates ?? [
                    { text: 'Nagaur', score: 0.36 },
                    { text: 'Nagpur', score: 0.34 },
                  ] }
                : s
            );
            return [[d, { ...e, spans }] as ScriptStep];
          }
          return [[d, e] as ScriptStep];
        });
        break;

      case 'slow_ttft':
        out = out.map(([d, e]) =>
          e.t === 'ttft' ? [d + 3600, { ...e, ms: e.ms + 3600 }] : [d, e]
        );
        break;

      case 'network_drop': {
        // Insert a capability transition one third of the way in.
        const at = Math.floor(out.length / 3);
        out.splice(at, 0,
          [200, { t: 'capability', from: 'online_full', to: 'edge_only', at: Date.now() }],
          [50,  { t: 'queued', count: 1, oldestAt: Date.now() }],
        );
        break;
      }

      case 'stalled_node': {
        const node = out.find(([, e]) => e.t === 'node.state' && e.state === 'running');
        if (node) {
          const nodeId = (node[1] as Extract<AgentEvent, { t: 'node.state' }>).nodeId;
          out.push([45_000, { t: 'node.state', nodeId, state: 'stalled', at: Date.now() }]);
        }
        break;
      }

      case 'rate_limited':
        out.push([300, {
          t: 'error', kind: 'rate_limit',
          message: 'Rate limit reached. 40 requests per minute on this key.',
          retryable: true, retryAfterMs: 12_000,
        }]);
        break;

      case 'auth_failed':
        // The most-hit error in any API product, universally under-designed.
        out = [[120, {
          t: 'error', kind: 'auth',
          message: 'Key not recognised. This request used the key from SARVAM_API_KEY in .env.local.',
          retryable: false,
        }]];
        break;

      case 'unsupported_combination':
        out = [[80, {
          t: 'error', kind: 'unsupported',
          message: 'Malayalam is available for speech-to-text but not for this text-to-speech model.',
          retryable: false,
        }]];
        break;

      case 'conflicting_values':
        out.push([400, {
          t: 'value.conflict',
          field: 'applicant_name',
          candidates: [
            { value: 'K. Subramanian', provenance: { sourceId: 'pan_card', region: { page: 1, x: .21, y: .34, w: .38, h: .05 } } },
            { value: 'Subramanian Krishnan', provenance: { sourceId: 'bank_stmt', region: { page: 1, x: .08, y: .11, w: .44, h: .04 } } },
          ],
        }]);
        break;

      case 'planted_error':
        // Confidently wrong. Used ONLY for the appropriate-distrust metric.
        // If participants accept this, your confidence signalling has failed
        // even when your usability numbers look excellent. See docs/research-and-eval.md.
        out = out.map(([d, e]) =>
          e.t === 'value' && e.field === 'amount'
            ? [d, { ...e, value: 41_500, band: 'committed' as ConfidenceBand, score: 0.97 }]
            : [d, e]
        );
        break;

      case 'meaning_drift':
        // The central content failure: reads beautifully, says something else.
        // Fluency stays high; fidelity drops. This is what the Back-translation
        // Mirror exists to surface, and the experiment that measures it.
        out = out.map(([d, e]) =>
          e.t === 'variant'
            ? [d, { ...e, fluency: 'committed' as ConfidenceBand, fidelity: 'check' as ConfidenceBand }]
            : e.t === 'backtranslation'
            ? [d, { ...e, drift: [
                { sentenceIdx: 1, kind: 'moved' as const,
                  note: 'exclusion clause became a condition' },
              ] }]
            : [d, e]
        );
        break;

      case 'protected_term_translated':
        out.push([260, { t: 'term.violation', lang: 'ta-IN',
                         term: 'cashless', renderedAs: 'பணமில்லாத' }]);
        break;

      case 'script_fallback':
        out.push([180, { t: 'script.fallback', lang: 'ml-IN', codepoint: 'U+0D7B' }]);
        break;

      /* ---- coding ---- */

      case 'plan_revised': {
        // Lands after the third node starts, so there is already work to keep or drop.
        const at = out.findIndex(([, e]) => e.t === 'checkpoint');
        const step: ScriptStep = [1200, {
          t: 'plan.revise', at: 0,
          because: 'Config lives in two places; the second one has to be migrated too',
          added: [{ id: 'migrate-runtime-config', label: 'Migrate the runtime config', state: 'queued' }],
          dropped: ['delete-legacy-shim'],
          kept: ['read-callsites', 'extract-adapter', 'rewrite-callsites'],
        }];
        out.splice(at < 0 ? out.length : at + 1, 0, step);
        break;
      }

      case 'diverged_run': {
        out = insertBeforeEnd(out, [[2400, {
          t: 'divergence', at: 0,
          expected: 'Adapter behind the existing interface, callsites untouched',
          observed: 'Callsites are being rewritten to a new interface',
          evidence: ['src/billing/invoice.ts', 'src/billing/refund.ts', 'src/billing/plan.ts'],
        }]]);
        break;
      }

      case 'manual_edit_conflict': {
        const change = out.find(([, e]) => e.t === 'change');
        if (change) {
          const id = (change[1] as Extract<AgentEvent, { t: 'change' }>).id;
          out = insertBeforeEnd(out, [[1800, {
            t: 'change.state', id, state: 'conflicts_with_manual_edit', at: 0,
            note: 'You edited this file at 14:12; the agent last wrote it at 14:09',
          }]]);
        }
        break;
      }

      case 'permission_block': {
        const node = out.find(([, e]) => e.t === 'node.state' && e.state === 'running');
        const nodeId = node
          ? (node[1] as Extract<AgentEvent, { t: 'node.state' }>).nodeId
          : 'rewrite-callsites';
        out = insertBeforeEnd(out, [
          [900, { t: 'node.state', nodeId, state: 'blocked_on_permission', at: 0 }],
          [0, {
            t: 'ask', nodeId,
            question: 'Run the migration against the staging database?',
            options: ['Allow once', 'Allow for this run', 'Skip this step'],
            blocking: 'branch',
          }],
        ]);
        break;
      }

      case 'speculative_discard': {
        const spec = out.find(([, e]) => e.t === 'change' && e.speculative);
        if (spec) {
          const id = (spec[1] as Extract<AgentEvent, { t: 'change' }>).id;
          out = insertBeforeEnd(out, [[1500, {
            t: 'change.state', id, state: 'reverted', at: 0,
            note: 'The assumption it rested on turned out to be wrong',
          }]]);
        }
        break;
      }

      case 'awaiting_steering': {
        // blocking: 'run' — the whole run waits. Distinct from a permission ask,
        // which blocks one branch, and the words have to carry that difference.
        out = insertBeforeEnd(out, [
          [1400, { t: 'node.state', nodeId: 'rewrite-callsites', state: 'blocked_on_human', at: 0 }],
          [0, {
            t: 'ask', nodeId: 'rewrite-callsites',
            question: 'The adapter could keep the old signature or take an options object. Which?',
            options: ['Keep the old signature', 'Options object', 'Stop and let me look'],
            blocking: 'run',
          }],
        ]);
        break;
      }

      case 'retrying_step': {
        out = insertBeforeEnd(out, [
          [800, { t: 'node.state', nodeId: 'run-tests', state: 'running', at: 0 }],
          [1200, { t: 'error', nodeId: 'run-tests', kind: 'timeout',
                   message: 'The billing tests timed out after 60s. Retrying with the suite split in two.',
                   retryable: true }],
          [200, { t: 'node.state', nodeId: 'run-tests', state: 'retrying', at: 0 }],
          [900, { t: 'node.progress', nodeId: 'run-tests', done: 1, total: 2 }],
        ]);
        break;
      }

      case 'upstream_blocked': {
        out = insertBeforeEnd(out, [
          [600, { t: 'node.state', nodeId: 'delete-legacy-shim', state: 'blocked_on_upstream', at: 0 }],
        ]);
        break;
      }

      case 'partial_step': {
        out = insertBeforeEnd(out, [
          [700, { t: 'node.progress', nodeId: 'rewrite-callsites', done: 3, total: 4 }],
          [100, { t: 'node.state', nodeId: 'rewrite-callsites', state: 'partially_succeeded', at: 0 }],
        ]);
        break;
      }

      case 'envelope_breach': {
        out = insertBeforeEnd(out, [
          [1100, { t: 'envelope.breach', nodeId: 'rewrite-callsites',
                   attempted: 'edit migrations/0043_add_plan_id.sql',
                   allowed: 'edit src/billing/**' }],
        ]);
        break;
      }

      case 'cancelled_midrun': {
        const end = out.findIndex(([, e]) => e.t === 'run.end');
        const runId = end >= 0
          ? (out[end][1] as Extract<AgentEvent, { t: 'run.end' }>).runId
          : 'run_8f21';
        // Replace the ending rather than appending one: a cancelled run does not
        // also finish, and two terminal events is a state nobody can render.
        out = [
          ...out.slice(0, end < 0 ? out.length : end),
          [400, { t: 'node.state', nodeId: 'rewrite-callsites', state: 'cancelled', at: 0 }],
          [0, { t: 'run.end', runId, at: 0, outcome: 'cancelled' }],
        ];
        break;
      }

      /* ---- doc ---- */

      case 'confusable_glyph': {
        // One mark, two readings. The score stays high on purpose: the model is
        // confident and the glyph is still ambiguous, which is the whole point.
        out = insertBeforeEnd(out, [[900, {
          t: 'value.confusable', field: 'pincode', value: '600004', lang: 'ta-IN',
          readings: [
            { value: '600004', glyph: '௪', score: 0.52 },
            { value: '600001', glyph: '௧', score: 0.44 },
          ],
        }]]);
        break;
      }

      case 'struck_through': {
        out = insertBeforeEnd(out, [[1100, {
          t: 'value.struck_through', field: 'employer_name',
          voided: 'ஸ்ரீ வேங்கடேஸ்வரா ஸ்டோர்ஸ்',
          current: 'ஸ்ரீ வேங்கடேஸ்வரா டிரேடர்ஸ்',
          provenance: { sourceId: 'app_4471', precision: 'region',
                        region: { page: 2, x: .30, y: .18, w: .44, h: .036 } },
        }]]);
        break;
      }

      case 'out_of_range': {
        out = insertBeforeEnd(out, [[820, {
          t: 'value.out_of_range', field: 'date_of_birth', value: '1987-03-12',
          rule: 'date_plausibility',
          explanation: 'Read correctly, and it makes the applicant 39 while the income proof says 27.',
        }]]);
        break;
      }

      case 'provenance_unavailable':
        // The value may well be right. What's lost is the ability to check it,
        // which is a different failure and needs different words.
        out = out.map(([d, e]) =>
          e.t === 'value' && e.provenance
            ? [d, { ...e, provenance: { sourceId: e.provenance.sourceId, precision: 'none' as const } }]
            : [d, e]
        );
        break;

      case 'source_degraded':
        out = out.map(([d, e]) =>
          e.t === 'source'
            ? [d, { ...e, degraded: ['rotated', 'blurred'] as ('rotated' | 'blurred' | 'cut_off')[] }]
            : [d, e]
        );
        break;

      case 'systematic_error': {
        out = insertBeforeEnd(out, [[1600, {
          t: 'systematic.suspected', field: 'existing_emi',
          documentType: 'IOB statement, Mylapore branch',
          documentsAffected: 34,
          sinceIso: '2026-08-24',
        }]]);
        break;
      }

      case 'repair_exhausted': {
        // Two attempts is the Repair Loop's cap. The third guess is a design
        // failure, not the reviewer's, so the run stops offering and says so.
        out = insertBeforeEnd(out, [
          [600, { t: 'repair.offered', field: 'address', alternates: [
            { value: '14/2, தெற்கு மாட வீதி, மயிலாப்பூர், சென்னை 600014', score: 0.21 },
            { value: '14/2, தெற்கு மாட வீதி, மயிலாப்பூர், சென்னை 600041', score: 0.11 },
          ] }],
          [900, { t: 'repair.exhausted', field: 'address', attempts: 2 }],
        ]);
        break;
      }

      case 'provenance_page_only':
        // "Page 4" is not provenance. The region is dropped and the precision says
        // so, rather than the UI drawing a box it cannot justify.
        out = out.map(([d, e]) =>
          e.t === 'value' && e.provenance?.region
            ? [d, { ...e, provenance: {
                sourceId: e.provenance.sourceId,
                region: { page: e.provenance.region.page, x: 0, y: 0, w: 0, h: 0 },
                precision: 'page' as const,
              } }]
            : [d, e]
        );
        break;

      /* ---- content ---- */

      case 'clause_dropped': {
        // The legal one. An exclusion that simply is not in the dub.
        out = insertBeforeEnd(out, [[900, {
          t: 'clause.dropped', lang: 'te-IN',
          clause: 'Pre-existing conditions are excluded for the first 24 months',
          atMs: 41_000, regulated: true,
        }]]);
        break;
      }

      case 'pronunciation_wrong': {
        // Both scripts, because Priya and the native reviewer need different ones.
        // UNVERIFIED: these transliterations are invented and are the evidence a
        // reviewer would act on. They need checking by someone who reads the script.
        out = insertBeforeEnd(out, [[1100, {
          t: 'pronunciation.suspect', lang: 'ml-IN', term: 'Aarogya Setu Plus', atMs: 12_400,
          expected: { latin: 'aa-ROH-gya SEH-tu plus', kannada: 'ಆರೋಗ್ಯ ಸೇತು ಪ್ಲಸ್' },
          actual: { latin: 'aa-ROH-gya SET-tu ploos', kannada: 'ಆರೋಗ್ಯ ಸೆಟ್ಟು ಪ್ಲೂಸ್' },
        }]]);
        break;
      }

      case 'voice_drifts': {
        out = insertBeforeEnd(out, [[1300, {
          t: 'voice.drift', lang: 'bn-IN', fromMs: 96_000, toMs: 148_000,
          note: 'Pitch and pace shift after the mid-roll; sounds like a second speaker',
        }]]);
        break;
      }

      case 'timing_overrun':
        // Text expansion in the time dimension: the dub does not fit the shot.
        out = out.map(([d, e]) =>
          e.t === 'segment' && e.lang === 'ml-IN'
            ? [d, { ...e, timing: 'overrun' as const, overByMs: 2400 }]
            : [d, e]
        );
        break;

      case 'consent_missing':
        out = out.map(([d, e]) =>
          e.t === 'consent'
            ? [d, { ...e, state: 'missing' as const, grantedFor: undefined, untilIso: undefined,
                    note: 'No consent record for this voice. Nothing here has been cleared.' }]
            : [d, e]
        );
        break;

      case 'consent_expired':
        out = out.map(([d, e]) =>
          e.t === 'consent'
            ? [d, { ...e, state: 'expired' as const, untilIso: '2025-11-30',
                    note: 'Granted for a 2025 IVR project. This is an explainer, and the grant has lapsed.' }]
            : [d, e]
        );
        break;

      case 'subtitle_clipped': {
        out = insertBeforeEnd(out, [[700, {
          t: 'script.clipped', lang: 'ml-IN', container: 'subtitle_line_2',
        }]]);
        break;
      }

      case 'native_review_timeout': {
        out = insertBeforeEnd(out, [[1500, {
          t: 'review.timeout', lang: 'ta-IN', sinceIso: '2026-09-05',
        }]]);
        break;
      }

      case 'planted_drift_one': {
        // The bundle's `meaning_drift` marks every variant, which makes the
        // detection experiment trivial: nine flags and she cannot miss them.
        // Planting in exactly one — and one she cannot read — is the experiment
        // the measurement targets actually describe.
        const lang = 'mr-IN';
        out = out.map(([d, e]) =>
          e.t === 'variant' && e.lang === lang
            ? [d, { ...e, fluency: 'committed' as ConfidenceBand, fidelity: 'check' as ConfidenceBand }]
            : [d, e]
        );
        out = insertBeforeEnd(out, [[700, {
          t: 'backtranslation', lang,
          text: 'Cashless treatment at a network hospital, once the paperwork is complete',
          drift: [{ sentenceIdx: 0, kind: 'moved',
                    note: '"with no paperwork" became "once the paperwork is complete" — the opposite' }],
        }]]);
        break;
      }

      case 'asr_wrong_language':
        out.unshift([150, {
          t: 'error', kind: 'language_mismatch',
          message: 'Detected Marathi; this session is configured for Hindi.',
          retryable: true,
        }]);
        break;
    }
  }

  return out;
}

/* =========================================================================
   THE RUNTIME
   ====================================================================== */

export async function* createRun(
  script: Script,
  opts: RunOptions = {},
): AsyncGenerator<AgentEvent, void, void> {
  const { seed = 1, speed = 1, faults = [], jitter = 0, signal } = opts;
  const rand = rng(seed);
  const steps = applyFaults(script, faults, rand);

  for (const [delay, event] of steps) {
    const j = jitter > 0 ? 1 + (rand() * 2 - 1) * jitter : 1;
    await sleep(delay * speed * j, signal);
    yield event;
  }
}

/** Collect a whole run instantly. For unit tests and snapshot comparisons. */
export async function collectRun(script: Script, opts: RunOptions = {}) {
  const events: AgentEvent[] = [];
  for await (const e of createRun(script, { ...opts, speed: 0, jitter: 0 })) {
    events.push(e);
  }
  return events;
}

/* =========================================================================
   EXAMPLE SCRIPTS
   -------------------------------------------------------------------------
   Delays here are placeholders. Replace them with numbers you measured from
   the real API — that is the single highest-value thing you can do to make
   these prototypes feel true. Measure once, hardcode, then design against it.
   ====================================================================== */

export const scripts = {
  /** voice — a duty status change, happy path. */
  dutyStatusChange: [
    [0,    { t: 'run.start', runId: 'r1', at: 0, intent: 'duty_status_change' }],
    [180,  { t: 'asr.partial', text: 'break le', lang: 'hi-IN' }],
    [220,  { t: 'asr.partial', text: 'break le raha', lang: 'hi-IN' }],
    [340,  { t: 'asr.final', text: 'Nagpur mein break le raha hoon', lang: 'hi-IN', spans: [
      { text: 'Nagpur', score: 0.91, kind: 'proper_noun' },
      { text: 'break',  score: 0.97, kind: 'ordinary' },
    ] }],
    [120,  { t: 'value', nodeId: 'n1', field: 'duty_status', value: 'off_duty',
             band: 'committed', score: 0.96, origin: 'extracted' }],
    [40,   { t: 'value', nodeId: 'n1', field: 'location', value: 'Nagpur',
             band: 'committed', score: 0.91, origin: 'extracted',
             alternates: [{ value: 'Nagaur', score: 0.06 }] }],
    // Echo semantics, capped at the two highest-consequence facts. Grammar §1.
    [200,  { t: 'echo.start', utterance: 'Break shuru, 6:40 shaam',
             facts: ['off_duty', '18:40'] }],
    [1400, { t: 'tts.end' }],
    [300,  { t: 'checkpoint', id: 'c1', label: 'Break started', at: 0, restorable: true }],
    [60,   { t: 'run.end', runId: 'r1', at: 0, outcome: 'success' }],
  ] satisfies Script,

  /** work — a document batch with an exception and a non-finding. */
  documentBatch: [
    [0,   { t: 'run.start', runId: 'b1', at: 0, intent: 'extract_kyc_batch' }],
    [220, { t: 'plan',
            nodes: [
              { id: 'ingest',  label: 'Read uploads',       state: 'queued' },
              { id: 'ocr',     label: 'Recognise text',     state: 'queued' },
              { id: 'extract', label: 'Pull fields',        state: 'queued' },
              { id: 'crosscheck', label: 'Match across docs', state: 'queued' },
            ],
            edges: [['ingest','ocr'],['ocr','extract'],['extract','crosscheck']] }],
    [80,  { t: 'node.state', nodeId: 'ingest', state: 'running', at: 0 }],
    [600, { t: 'node.progress', nodeId: 'ingest', done: 214, total: 214 }],
    [90,  { t: 'node.state', nodeId: 'ingest', state: 'succeeded', at: 0 }],
    [40,  { t: 'node.state', nodeId: 'ocr', state: 'running', at: 0 }],
    [1800,{ t: 'node.progress', nodeId: 'ocr', done: 198, total: 214 }],
    [400, { t: 'nonfinding', nodeId: 'ocr', looked_for: 'Signature on 16 forms',
            kind: 'illegible',
            boundary: { corpus: 'batch b1 (214 docs)', languages: ['ta-IN','hi-IN','en-IN'] } }],
    [200, { t: 'node.state', nodeId: 'ocr', state: 'partially_succeeded', at: 0 }],
    [60,  { t: 'node.state', nodeId: 'extract', state: 'running', at: 0 }],
    [900, { t: 'value', nodeId: 'extract', field: 'amount', value: 415_000,
            band: 'committed', score: 0.94, origin: 'extracted',
            provenance: { sourceId: 'doc_0041',
                          region: { page: 2, x: .62, y: .28, w: .21, h: .03 } } }],
    [120, { t: 'value', nodeId: 'extract', field: 'monthly_income', value: 34_580,
            band: 'check', score: 0.58, origin: 'inferred' }],
    [300, { t: 'checkpoint', id: 'cb1', label: 'Fields pulled from all 214', at: 0, restorable: true }],
    [80,  { t: 'node.state', nodeId: 'crosscheck', state: 'running', at: 0 }],
    [700, { t: 'ask', nodeId: 'crosscheck',
            question: 'PAN and bank statement give different names. Which is the applicant?',
            about: { field: 'applicant_name' },
            options: ['K. Subramanian', 'Subramanian Krishnan', 'Neither — send back'],
            blocking: 'branch' }],
    [0,   { t: 'node.state', nodeId: 'crosscheck', state: 'blocked_on_human', at: 0 }],
  ] satisfies Script,

  /** content — one source, three variants, with a round trip. */
  contentLocalise: [
    [0,   { t: 'run.start', runId: 'c1', at: 0, intent: 'localise_campaign_copy' }],
    [180, { t: 'variant', lang: 'hi-IN', text: 'नेटवर्क अस्पताल में कैशलेस इलाज',
            fluency: 'committed', fidelity: 'committed',
            register: 'code-mixed', expansion: 1.12 }],
    [140, { t: 'variant', lang: 'ta-IN', text: 'வலைப்பிணைய மருத்துவமனையில் பணமில்லா சிகிச்சை',
            fluency: 'committed', fidelity: 'check',
            register: 'formal', expansion: 1.38 }],
    [130, { t: 'variant', lang: 'ml-IN', text: 'നെറ്റ്‌വർക്ക് ആശുപത്രിയിൽ ക്യാഷ്‌ലെസ് ചികിത്സ',
            fluency: 'committed', fidelity: 'committed',
            register: 'code-mixed', expansion: 1.41 }],
    [400, { t: 'backtranslation', lang: 'ta-IN',
            text: 'Moneyless treatment at a web-network hospital',
            drift: [
              { sentenceIdx: 0, kind: 'moved',
                note: '"network" read as web-network; "cashless" translated literally' },
            ] }],
    [90,  { t: 'term.violation', lang: 'ta-IN', term: 'cashless', renderedAs: 'பணமில்லா' }],
    [60,  { t: 'overflow', lang: 'ml-IN', container: 'hero_subhead', overBy: 0.41 }],
    [120, { t: 'ask', nodeId: 'review',
            question: 'Tamil round trip diverges on the cashless clause. Send for native review?',
            options: ['Send for review', 'Fix the term and regenerate', 'Approve anyway'],
            blocking: 'branch' }],
  ] satisfies Script,

  /** doc — one hand-filled loan application, twenty-two fields, reviewed by one person.
      A photograph of a photocopy of a bilingual NBFC form: printed English/Tamil labels,
      hand-written values in Tamil and Devanagari.

      SYNTHETIC, AND THE ASSUMPTIONS ARE LISTED. There is no real form behind this and
      nobody who reads Tamil has checked it — see grammar/log/2026-09-09-doc-decisions.md
      for the four specific things that were guessed. Provenance regions are normalised
      (0-1 of page width and height) exactly as pdf.js would report them, so swapping in
      a real document is a renderer change and not a design change.

      Field states here: confident, uncertain, inferred, illegible, absent, conflicting.
      Confusable, struck-through, out-of-range, missing provenance, a degraded scan and a
      systematic error all arrive as faults, which is how they get designed. */
  docReviewFull: [
    [0,   { t: 'run.start', runId: 'doc_4471', at: 0, intent: 'extract_loan_application' }],
    [60,  { t: 'source', sourceId: 'app_4471', label: 'Loan application, M. Subramanian',
            pages: 3, medium: 'mixed', languages: ['ta-IN', 'hi-IN', 'en-IN'] }],
    [40,  { t: 'doc.state', state: 'unreviewed', at: 0 }],
    [0,   { t: 'ttft', nodeId: 'vision', ms: 940 }],

    /* ---- identity, page 1 ---- */
    [940, { t: 'value', nodeId: 'vision', field: 'applicant_name', value: 'முருகன் சுப்ரமணியன்',
            band: 'committed', score: 0.94, origin: 'extracted', lang: 'ta-IN', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .30, y: .175, w: .38, h: .035 } } }],
    [90,  { t: 'value', nodeId: 'vision', field: 'father_name', value: 'சுப்ரமணியன் கிருஷ்ணன்',
            band: 'committed', score: 0.91, origin: 'extracted', lang: 'ta-IN', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .30, y: .225, w: .38, h: .035 } } }],
    [70,  { t: 'value', nodeId: 'vision', field: 'date_of_birth', value: '1987-03-12',
            band: 'committed', score: 0.88, origin: 'extracted', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .30, y: .275, w: .22, h: .032 } } }],
    [110, { t: 'value', nodeId: 'vision', field: 'address', value: '14/2, தெற்கு மாட வீதி, மயிலாப்பூர், சென்னை 600004',
            band: 'check', score: 0.63, origin: 'extracted', lang: 'ta-IN', medium: 'handwriting',
            alternates: [{ value: '14/2, தெற்கு மாட வீதி, மயிலாப்பூர், சென்னை 600014', score: 0.21 }],
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .30, y: .325, w: .52, h: .06 } } }],
    [60,  { t: 'value', nodeId: 'vision', field: 'pincode', value: '600004',
            band: 'committed', score: 0.9, origin: 'extracted', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .72, y: .325, w: .12, h: .032 } } }],
    [50,  { t: 'value', nodeId: 'vision', field: 'mobile', value: '+91 98407 21133',
            band: 'committed', score: 0.96, origin: 'extracted', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .30, y: .40, w: .28, h: .032 } } }],
    [60,  { t: 'value', nodeId: 'vision', field: 'pan', value: 'AXKPS4412N',
            band: 'committed', score: 0.93, origin: 'extracted', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .30, y: .45, w: .26, h: .032 } } }],
    [80,  { t: 'nonfinding', nodeId: 'vision', looked_for: 'Aadhaar number',
            kind: 'absent',
            boundary: { corpus: 'app_4471, pages 1-3', languages: ['ta-IN', 'hi-IN', 'en-IN'] } }],

    /* ---- the loan, page 1 ---- */
    [90,  { t: 'value', nodeId: 'vision', field: 'loan_amount', value: 415000,
            band: 'committed', score: 0.95, origin: 'extracted', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .62, y: .52, w: .20, h: .034 } } }],
    [70,  { t: 'value', nodeId: 'vision', field: 'loan_purpose', value: 'व्यवसाय विस्तार',
            band: 'committed', score: 0.89, origin: 'extracted', lang: 'hi-IN', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .30, y: .57, w: .34, h: .034 } } }],
    [70,  { t: 'value', nodeId: 'vision', field: 'tenure_months', value: 36,
            band: 'committed', score: 0.92, origin: 'extracted', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 1, x: .62, y: .57, w: .12, h: .034 } } }],
    [120, { t: 'value', nodeId: 'vision', field: 'monthly_income', value: 34580,
            band: 'check', score: 0.58, origin: 'inferred' }],
    [60,  { t: 'value', nodeId: 'vision', field: 'existing_emi', value: 8400,
            band: 'check', score: 0.61, origin: 'extracted', medium: 'handwriting',
            alternates: [{ value: '3400', score: 0.26 }],
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 2, x: .58, y: .31, w: .16, h: .032 } } }],
    [60,  { t: 'value', nodeId: 'vision', field: 'debt_to_income', value: '24%',
            band: 'check', score: 0.55, origin: 'inferred' }],

    /* ---- employment, page 2 ---- */
    [90,  { t: 'value', nodeId: 'vision', field: 'employer_name', value: 'ஸ்ரீ வேங்கடேஸ்வரா டிரேடர்ஸ்',
            band: 'committed', score: 0.87, origin: 'extracted', lang: 'ta-IN', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 2, x: .30, y: .18, w: .44, h: .036 } } }],
    [60,  { t: 'value', nodeId: 'vision', field: 'employment_type', value: 'Self-employed',
            band: 'committed', score: 0.94, origin: 'extracted',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 2, x: .30, y: .23, w: .24, h: .032 } } }],
    [60,  { t: 'value', nodeId: 'vision', field: 'years_in_business', value: 7,
            band: 'check', score: 0.59, origin: 'extracted', medium: 'handwriting',
            alternates: [{ value: '1', score: 0.24 }],
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 2, x: .58, y: .23, w: .08, h: .032 } } }],

    /* ---- banking, page 2 ---- */
    [80,  { t: 'value', nodeId: 'vision', field: 'bank_name', value: 'Indian Overseas Bank, Mylapore',
            band: 'committed', score: 0.93, origin: 'extracted',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 2, x: .30, y: .40, w: .42, h: .034 } } }],
    [90,  { t: 'nonfinding', nodeId: 'vision', looked_for: 'Account number',
            kind: 'illegible',
            boundary: { corpus: 'app_4471, page 2, lower third' } }],
    [70,  { t: 'value', nodeId: 'vision', field: 'ifsc', value: 'IOBA0001234',
            band: 'committed', score: 0.9, origin: 'extracted',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 2, x: .30, y: .50, w: .26, h: .032 } } }],

    /* ---- security, page 3 ---- */
    [90,  { t: 'value', nodeId: 'vision', field: 'property_type', value: 'Residential, self-occupied',
            band: 'check', score: 0.57, origin: 'inferred' }],
    [70,  { t: 'value', nodeId: 'vision', field: 'property_value', value: 2850000,
            band: 'check', score: 0.64, origin: 'extracted', medium: 'handwriting',
            provenance: { sourceId: 'app_4471', precision: 'region',
                          region: { page: 3, x: .58, y: .22, w: .22, h: .034 } } }],

    [160, { t: 'value.conflict', field: 'guarantor_name', candidates: [
              { value: 'கே. சுப்ரமணியன்',
                provenance: { sourceId: 'pan_card', precision: 'region',
                              region: { page: 1, x: .21, y: .34, w: .38, h: .05 } } },
              { value: 'Subramanian Krishnan',
                provenance: { sourceId: 'bank_stmt', precision: 'region',
                              region: { page: 1, x: .08, y: .11, w: .44, h: .04 } } },
            ] }],
    [80,  { t: 'nonfinding', nodeId: 'vision', looked_for: 'Guarantor signature',
            kind: 'illegible', boundary: { corpus: 'app_4471, page 3 footer' } }],

    /* ---- where it can go next ---- */
    [110, { t: 'export.ready', formats: ['json', 'csv', 'markdown', 'docx'] }],
    [40,  { t: 'export.lossy', format: 'csv',
            loses: ['provenance regions', 'the conflict on guarantor_name', 'per-field confidence'] }],
    [30,  { t: 'export.lossy', format: 'docx',
            loses: ['provenance regions', 'machine-readable field names'] }],
    [60,  { t: 'run.end', runId: 'doc_4471', at: 0, outcome: 'partial' }],
  ] satisfies Script,

  /** voice — a simulation sweep over 1,000 synthetic calls, WITH a regression.
      Note the ordering: distribution, then clusters, then caveats. Never a
      single pass rate first. */
  voiceSweep: [
    [0,    { t: 'spec.version', id: 'v4',
             hard: [
               { id: 'h1', rule: 'Never state a penalty amount',        tested: true  },
               { id: 'h2', rule: 'Never confirm a payment as received', tested: false },
             ],
             soft: [
               { id: 's1', guidance: 'Warm, not apologetic' },
               { id: 's2', guidance: 'Use English loanwords where natural' },
             ],
             examples: [
               { id: 'e1', input: 'Caller asks about late fee',
                 expected: 'Defer to the statement, do not quote a number', pinning: true },
             ] }],
    [140,  { t: 'sweep.start', sweepId: 'sw7', specId: 'v4', runs: 1000 }],
    [900,  { t: 'sweep.progress', done: 340, total: 1000 }],
    [1100, { t: 'sweep.progress', done: 1000, total: 1000 }],
    [220,  { t: 'sweep.distribution', outcomes: {
               resolved: 712, escalated: 108, abandoned: 84, looped: 41,
               timed_out: 19, constraint_breached: 6, off_script_but_fine: 30 } }],
    [120,  { t: 'sweep.cluster', id: 'c1',
             cause: 'Caller asks about the late fee and the agent quotes one',
             count: 6, specLineId: 'h1', exemplarRunIds: ['r0412','r0688'],
             deltaVsLast: -4 }],
    [80,   { t: 'sweep.cluster', id: 'c2',
             cause: 'Switches to English mid-call and stays there',
             count: 63, specLineId: 's2', exemplarRunIds: ['r0119'],
             deltaVsLast: +11 }],
    [80,   { t: 'sweep.cluster', id: 'c3',
             cause: 'Caller hangs up during the opening',
             count: 84, exemplarRunIds: ['r0007','r0203'], deltaVsLast: 0 }],
    // Caveats are not a footnote. This is where most eval tooling quietly lies.
    [100,  { t: 'sweep.caveat', kind: 'constraint_never_exercised',
             detail: 'No call reached the payment-confirmation path. h2 is untested.' }],
    [60,   { t: 'sweep.caveat', kind: 'clean_audio_only',
             detail: 'Simulated on clean audio. Production is 8kHz telephony.' }],
    [40,   { t: 'sweep.end', sweepId: 'sw7', regressed: true }],
  ] satisfies Script,

  /** content — one 4-minute health-insurance explainer, dubbed into nine languages.
      Priya reads English and Kannada and speaks Hindi; the other six are opaque to her.

      SYNTHETIC AND UNVERIFIED. Every Indic string here is invented, and the
      transliterations are the dangerous part — they are the *evidence* a reviewer
      would act on, not a label. Nobody who reads these scripts has checked them.
      See grammar/log/2026-09-09-content-decisions.md.

      What lands in the base run: a clean Hindi dub, a Tamil dub that is fluent and
      unfaithful (the exclusion clause moved) with a protected term translated, a
      Malayalam dub whose subtitle overflows, a Kannada non-finding (no accepted term
      exists), and consent on file. The rest arrive as faults. */
  dubJob: [
    [0,    { t: 'run.start', runId: 'dub_2291', at: 0, intent: 'dub_explainer_nine_languages' }],
    [80,   { t: 'dub.job', jobId: 'dub_2291', sourceId: 'explainer_v4',
             durationMs: 252_000, voiceId: 'voice_meera_01',
             // Asked for per language, because register does not transfer: Bengali
             // wants the formal register that would read as cold in Hindi.
             registers: { 'hi-IN': 'code-mixed', 'ta-IN': 'code-mixed', 'te-IN': 'code-mixed',
                          'kn-IN': 'code-mixed', 'ml-IN': 'code-mixed', 'mr-IN': 'code-mixed',
                          'bn-IN': 'formal', 'gu-IN': 'code-mixed', 'en-IN': 'modern-colloquial' },
             languages: ['hi-IN','ta-IN','te-IN','kn-IN','ml-IN','mr-IN','bn-IN','gu-IN','en-IN'] }],
    [60,   { t: 'consent', voiceId: 'voice_meera_01', voiceName: 'Meera (in-house)',
             state: 'on_file', grantedFor: 'Product explainers and IVR', untilIso: '2027-03-31' }],

    /* ---- Hindi: clean, and collapses to one line ---- */
    [1200, { t: 'variant', lang: 'hi-IN', text: 'नेटवर्क हॉस्पिटल में कैशलेस इलाज, बिना कागज़ी कार्यवाही के',
             fluency: 'committed', fidelity: 'committed', register: 'code-mixed', expansion: 1.09 }],
    [180,  { t: 'segment', lang: 'hi-IN', index: 0, startMs: 0, endMs: 8400,
             sourceStartMs: 0, sourceEndMs: 8000,
             text: 'नेटवर्क हॉस्पिटल में कैशलेस इलाज', timing: 'fits' }],
    [40,   { t: 'segment', lang: 'hi-IN', index: 1, startMs: 8400, endMs: 17_600,
             sourceStartMs: 8000, sourceEndMs: 17_000,
             text: 'बिना कागज़ी कार्यवाही के, सीधे अस्पताल में', timing: 'fits' }],
    [220,  { t: 'backtranslation', lang: 'hi-IN',
             text: 'Cashless treatment at a network hospital, with no paperwork',
             drift: [{ sentenceIdx: 0, kind: 'held' }] }],

    /* ---- Tamil: reads beautifully, says something else ---- */
    [400,  { t: 'variant', lang: 'ta-IN', text: 'வலைப்பிணைய மருத்துவமனையில் பணமில்லா சிகிச்சை, ஆவணங்கள் இல்லாமல்',
             fluency: 'committed', fidelity: 'check', register: 'formal', expansion: 1.38 }],
    [140,  { t: 'segment', lang: 'ta-IN', index: 0, startMs: 0, endMs: 9600,
             sourceStartMs: 0, sourceEndMs: 8000,
             text: 'வலைப்பிணைய மருத்துவமனையில் பணமில்லா சிகிச்சை', timing: 'overrun', overByMs: 1600 }],
    [40,   { t: 'segment', lang: 'ta-IN', index: 1, startMs: 9600, endMs: 19_200,
             sourceStartMs: 8000, sourceEndMs: 17_000,
             text: 'ஆவணங்கள் இல்லாமல், நேரடியாக மருத்துவமனையில்', timing: 'overrun', overByMs: 600 }],
    // The mirror: the exclusion became a condition. This is the whole surface.
    [520,  { t: 'backtranslation', lang: 'ta-IN',
             text: 'Moneyless treatment at a web-network hospital, provided documents are not required',
             drift: [
               { sentenceIdx: 0, kind: 'moved',
                 note: '"network" read as web-network; "cashless" translated literally' },
               { sentenceIdx: 1, kind: 'added',
                 note: 'the exclusion became a condition — "provided" is not in the source' },
             ] }],
    [90,   { t: 'term.violation', lang: 'ta-IN', term: 'cashless', renderedAs: 'பணமில்லா' }],
    [70,   { t: 'review.request', lang: 'ta-IN',
             question: 'Does the second sentence turn the exclusion into a condition?',
             atMs: 9600, clause: 'ஆவணங்கள் இல்லாமல்' }],

    /* ---- Malayalam: fits the time, not the safe area ---- */
    [380,  { t: 'variant', lang: 'ml-IN', text: 'നെറ്റ്‌വർക്ക് ആശുപത്രിയിൽ ക്യാഷ്‌ലെസ് ചികിത്സ, രേഖകളില്ലാതെ',
             fluency: 'committed', fidelity: 'committed', register: 'code-mixed', expansion: 1.41 }],
    [120,  { t: 'segment', lang: 'ml-IN', index: 0, startMs: 0, endMs: 8200,
             sourceStartMs: 0, sourceEndMs: 8000,
             text: 'നെറ്റ്‌വർക്ക് ആശുപത്രിയിൽ ക്യാഷ്‌ലെസ് ചികിത്സ', timing: 'fits' }],
    [80,   { t: 'overflow', lang: 'ml-IN', container: 'subtitle_safe_area', overBy: 0.34 }],
    [140,  { t: 'backtranslation', lang: 'ml-IN',
             text: 'Cashless treatment at a network hospital, without documents',
             drift: [{ sentenceIdx: 0, kind: 'held' }] }],

    /* ---- Kannada: the honest gap ---- */
    [300,  { t: 'variant', lang: 'kn-IN', text: 'ನೆಟ್‌ವರ್ಕ್ ಆಸ್ಪತ್ರೆಯಲ್ಲಿ ಕ್ಯಾಶ್‌ಲೆಸ್ ಚಿಕಿತ್ಸೆ, ದಾಖಲೆಗಳಿಲ್ಲದೆ',
             fluency: 'committed', fidelity: 'committed', register: 'code-mixed', expansion: 1.22 }],
    [90,   { t: 'nonfinding', nodeId: 'terms', looked_for: 'An accepted Kannada term for "co-pay"',
             kind: 'absent',
             boundary: { corpus: 'brand glossary v7 and IRDAI Kannada style guide',
                         languages: ['kn-IN'] } }],

    /* ---- the other five, generated and unreviewed ---- */
    [260,  { t: 'variant', lang: 'te-IN', text: 'నెట్‌వర్క్ ఆసుపత్రిలో క్యాష్‌లెస్ చికిత్స, పత్రాలు లేకుండా',
             fluency: 'committed', fidelity: 'committed', register: 'code-mixed', expansion: 1.19 }],
    [120,  { t: 'variant', lang: 'mr-IN', text: 'नेटवर्क हॉस्पिटलमध्ये कॅशलेस उपचार, कागदपत्रांशिवाय',
             fluency: 'committed', fidelity: 'committed', register: 'code-mixed', expansion: 1.14 }],
    [120,  { t: 'variant', lang: 'bn-IN', text: 'নেটওয়ার্ক হাসপাতালে ক্যাশলেস চিকিৎসা, নথিপত্র ছাড়াই',
             fluency: 'committed', fidelity: 'committed', register: 'formal', expansion: 1.16 }],
    [120,  { t: 'variant', lang: 'gu-IN', text: 'નેટવર્ક હોસ્પિટલમાં કેશલેસ સારવાર, દસ્તાવેજો વગર',
             fluency: 'committed', fidelity: 'committed', register: 'code-mixed', expansion: 1.11 }],
    [120,  { t: 'variant', lang: 'en-IN', text: 'Cashless treatment at a network hospital, with no paperwork',
             fluency: 'committed', fidelity: 'committed', register: 'modern-colloquial', expansion: 1 }],
    [80,   { t: 'run.end', runId: 'dub_2291', at: 0, outcome: 'partial' }],
  ] satisfies Script,

  /** voice — a fleet run with a lossy handoff. */
  voiceFleet: [
    [0,   { t: 'run.start', runId: 'f1', at: 0, intent: 'renewal_fleet' }],
    [200, { t: 'handoff', from: 'explainer', to: 'negotiator',
            carried: ['policy_id', 'due_date', 'caller_language'],
            dropped: ['caller_said_they_lost_their_job'],
            inferred: ['willingness_to_pay: high'] }],
    [180, { t: 'memory.conflict', key: 'promised_date',
            writers: ['negotiator', 'closer'],
            values: ['2026-09-18', '2026-09-25'] }],
    [90,  { t: 'run.end', runId: 'f1', at: 0, outcome: 'partial' }],
  ] satisfies Script,

  /** doc — a single document, with a conflict and an illegible field. */
  docReview: [
    [0,   { t: 'run.start', runId: 'd1', at: 0, intent: 'extract_single_doc' }],
    [140, { t: 'ttft', nodeId: 'vision', ms: 720 }],
    [420, { t: 'value', nodeId: 'vision', field: 'applicant_name', value: 'K. Subramanian',
            band: 'committed', score: 0.93, origin: 'extracted',
            provenance: { sourceId: 'doc_0041',
                          region: { page: 1, x: .21, y: .34, w: .38, h: .05 } } }],
    [110, { t: 'value', nodeId: 'vision', field: 'amount', value: 415_000,
            band: 'committed', score: 0.95, origin: 'extracted',
            provenance: { sourceId: 'doc_0041',
                          region: { page: 2, x: .62, y: .28, w: .21, h: .03 } } }],
    [90,  { t: 'value', nodeId: 'vision', field: 'monthly_income', value: 34_580,
            band: 'check', score: 0.58, origin: 'inferred' }],
    [130, { t: 'nonfinding', nodeId: 'vision', looked_for: 'Applicant signature',
            kind: 'illegible',
            boundary: { corpus: 'doc_0041 (3 pages)', languages: ['ta-IN', 'en-IN'] } }],
    [200, { t: 'value.conflict', field: 'applicant_name', candidates: [
              { value: 'K. Subramanian',
                provenance: { sourceId: 'pan_card',
                              region: { page: 1, x: .21, y: .34, w: .38, h: .05 } } },
              { value: 'Subramanian Krishnan',
                provenance: { sourceId: 'bank_stmt',
                              region: { page: 1, x: .08, y: .11, w: .44, h: .04 } } },
            ] }],
    [80,  { t: 'run.end', runId: 'd1', at: 0, outcome: 'partial' }],
  ] satisfies Script,

  /** coding — the forty-minute run, compressed. The plan arrives, the agent works,
      it revises its own plan, it does one thing on an assumption, it checkpoints
      semantically, and it reports what it looked at and left alone.

      DELAYS ARE PLACEHOLDERS. They are shaped like a real run (TTFT dominates the
      first token, tool calls dominate the middle) but nobody has measured this path
      yet — docs/build-workflow.md §2 step 4. `latency.distribution` carries
      source: 'placeholder' so the UI can say so out loud. Replace both together. */
  codingRun: [
    [0,    { t: 'run.start', runId: 'run_8f21', at: 0, intent: 'Extract the billing adapter' }],

    // The envelope is stated up front, because authority granted silently is not granted.
    [40,   { t: 'envelope', at: 0,
             may: ['read any file', 'edit src/billing/**', 'run the unit tests'],
             mustAsk: ['touch migrations', 'run anything against staging', 'edit CI config'],
             confidenceFloor: 0.82,
             consequence: { autoApplied: 18, asks: 2, expectedWrong: 1 } }],

    // Standing instructions for the run — hard rules and soft guidance, kept apart.
    [30,   { t: 'spec.version', id: 'standing',
             hard: [
               { id: 'h1', rule: 'Never edit a file outside src/billing without asking', tested: true },
               { id: 'h2', rule: 'Never commit; leave changes staged',                   tested: true },
             ],
             soft: [
               { id: 's1', guidance: 'Prefer small, reviewable commits over one large one' },
               { id: 's2', guidance: 'Match the surrounding code, not the style guide' },
             ],
             examples: [
               { id: 'e1', input: 'A callsite needs a new argument',
                 expected: 'Add it with a default so existing calls still compile', pinning: true },
             ] }],

    [180,  { t: 'plan',
             nodes: [
               { id: 'read-callsites',    label: 'Read every billing callsite',     state: 'queued' },
               { id: 'extract-adapter',   label: 'Extract the adapter',             state: 'queued' },
               { id: 'rewrite-callsites', label: 'Point callsites at the adapter',  state: 'queued' },
               { id: 'delete-legacy-shim',label: 'Delete the legacy shim',          state: 'queued' },
               { id: 'run-tests',         label: 'Run the billing tests',           state: 'queued' },
             ],
             edges: [
               ['read-callsites', 'extract-adapter'],
               ['extract-adapter', 'rewrite-callsites'],
               ['rewrite-callsites', 'delete-legacy-shim'],
               ['rewrite-callsites', 'run-tests'],
             ] }],

    /* ---- reading ---- */
    [90,   { t: 'node.state', nodeId: 'read-callsites', state: 'running', at: 0 }],
    [120,  { t: 'tool.call', nodeId: 'read-callsites', tool: 'grep', args: { pattern: 'billing\\.' } }],
    [310,  { t: 'tool.result', nodeId: 'read-callsites', tool: 'grep', ms: 310, ok: true }],
    [400,  { t: 'node.progress', nodeId: 'read-callsites', done: 31, total: 31 }],
    // The absence of a result is a result: 12 files looked at and deliberately left alone.
    [140,  { t: 'nonfinding', nodeId: 'read-callsites',
             looked_for: 'Callsites that construct invoices directly',
             kind: 'absent',
             boundary: { corpus: 'src/** (31 files matching billing.), excluding tests' } }],
    [80,   { t: 'node.state', nodeId: 'read-callsites', state: 'succeeded', at: 0 }],

    /* ---- the adapter ---- */
    [60,   { t: 'node.state', nodeId: 'extract-adapter', state: 'running', at: 0 }],
    [0,    { t: 'ttft', nodeId: 'extract-adapter', ms: 880 }],
    [880,  { t: 'token', nodeId: 'extract-adapter', text: 'export interface BillingAdapter {' }],
    [70,   { t: 'token', nodeId: 'extract-adapter', text: ' invoice(id: string)' }],
    [60,   { t: 'token', nodeId: 'extract-adapter', text: ': Promise<Invoice>' }],
    [900,  { t: 'change', id: 'ch1', path: 'src/billing/adapter.ts', kind: 'create',
             state: 'applied', adds: 84, dels: 0, checkpointId: 'cp1' }],
    [120,  { t: 'change', id: 'ch2', path: 'src/billing/index.ts', kind: 'edit',
             state: 'applied_unreviewed', adds: 6, dels: 2, checkpointId: 'cp1',
             note: 'Landed under the envelope — re-export only' }],
    [90,   { t: 'latency.sample', nodeId: 'extract-adapter', ttftMs: 880, totalMs: 3240,
             segments: [
               { kind: 'network', ms: 210 },
               { kind: 'queue', ms: 320 },
               { kind: 'model', ms: 2360 },
               { kind: 'synthesis', ms: 350 },
             ] }],
    [40,   { t: 'latency.distribution', label: 'extract step', n: 10,
             ttft: { p50: 880, p95: 2140 }, total: { p50: 3240, p95: 7180 },
             source: 'placeholder' }],
    [60,   { t: 'node.state', nodeId: 'extract-adapter', state: 'succeeded', at: 0 }],
    // Semantic boundary, named the way he would name it — not '14:09'.
    [200,  { t: 'checkpoint', id: 'cp1', label: 'Adapter extracted, nothing calls it yet',
             at: 0, restorable: true }],
    [0,    { t: 'checkpoint.state', id: 'cp1', state: 'clean', at: 0 }],

    /* ---- rewriting the callsites ---- */
    [80,   { t: 'node.state', nodeId: 'rewrite-callsites', state: 'running', at: 0 }],
    [700,  { t: 'change', id: 'ch3', path: 'src/billing/invoice.ts', kind: 'edit',
             state: 'applied', adds: 12, dels: 9, checkpointId: 'cp2' }],
    [520,  { t: 'change', id: 'ch4', path: 'src/billing/refund.ts', kind: 'edit',
             state: 'applied', adds: 7, dels: 5, checkpointId: 'cp2' }],
    // Done on an assumption. Provisional until the assumption is confirmed.
    [610,  { t: 'change', id: 'ch5', path: 'src/billing/plan.ts', kind: 'edit',
             state: 'proposed', adds: 21, dels: 14, checkpointId: 'cp2',
             speculative: true,
             assumption: 'Plan changes go through the same adapter as invoices' }],
    [0,    { t: 'node.state', nodeId: 'rewrite-callsites', state: 'speculative', at: 0 }],
    [900,  { t: 'node.progress', nodeId: 'rewrite-callsites', done: 3, total: 4 }],
    [400,  { t: 'checkpoint', id: 'cp2', label: 'Invoice and refund moved over',
             at: 0, restorable: true }],
    [0,    { t: 'checkpoint.state', id: 'cp2', state: 'partial', at: 0,
             note: 'plan.ts is still provisional inside this boundary' }],
    [1600, { t: 'run.end', runId: 'run_8f21', at: 0, outcome: 'partial' }],
  ] satisfies Script,

  /** coding — the same work, finished. `codingRun` deliberately stops partway with one
      provisional change, because that's the interesting state; this one exists so
      SUCCEEDED and CHECKPOINT_CLEAN at the end of a run can be seen at all. */
  codingRunComplete: [
    [0,   { t: 'run.start', runId: 'run_8f22', at: 0, intent: 'Extract the billing adapter' }],
    [40,  { t: 'envelope', at: 0,
            may: ['read any file', 'edit src/billing/**', 'run the unit tests'],
            mustAsk: ['touch migrations', 'run anything against staging', 'edit CI config'],
            confidenceFloor: 0.82,
            consequence: { autoApplied: 18, asks: 2, expectedWrong: 1 } }],
    [160, { t: 'plan',
            nodes: [
              { id: 'read-callsites',    label: 'Read every billing callsite',    state: 'queued' },
              { id: 'extract-adapter',   label: 'Extract the adapter',            state: 'queued' },
              { id: 'rewrite-callsites', label: 'Point callsites at the adapter', state: 'queued' },
              { id: 'run-tests',         label: 'Run the billing tests',          state: 'queued' },
            ],
            edges: [
              ['read-callsites', 'extract-adapter'],
              ['extract-adapter', 'rewrite-callsites'],
              ['rewrite-callsites', 'run-tests'],
            ] }],
    [80,  { t: 'node.state', nodeId: 'read-callsites', state: 'running', at: 0 }],
    [520, { t: 'node.state', nodeId: 'read-callsites', state: 'succeeded', at: 0 }],
    [60,  { t: 'node.state', nodeId: 'extract-adapter', state: 'running', at: 0 }],
    [0,   { t: 'ttft', nodeId: 'extract-adapter', ms: 840 }],
    [900, { t: 'change', id: 'ch1', path: 'src/billing/adapter.ts', kind: 'create',
            state: 'applied', adds: 84, dels: 0, checkpointId: 'cp1' }],
    [70,  { t: 'latency.sample', nodeId: 'extract-adapter', ttftMs: 840, totalMs: 3010,
            segments: [
              { kind: 'network', ms: 190 },
              { kind: 'queue', ms: 280 },
              { kind: 'model', ms: 2210 },
              { kind: 'synthesis', ms: 330 },
            ] }],
    [40,  { t: 'latency.distribution', label: 'extract step', n: 10,
            ttft: { p50: 840, p95: 2080 }, total: { p50: 3010, p95: 6940 },
            source: 'placeholder' }],
    [60,  { t: 'node.state', nodeId: 'extract-adapter', state: 'succeeded', at: 0 }],
    [180, { t: 'checkpoint', id: 'cp1', label: 'Adapter extracted, nothing calls it yet', at: 0, restorable: true }],
    [0,   { t: 'checkpoint.state', id: 'cp1', state: 'clean', at: 0 }],
    [80,  { t: 'node.state', nodeId: 'rewrite-callsites', state: 'running', at: 0 }],
    [640, { t: 'change', id: 'ch2', path: 'src/billing/invoice.ts', kind: 'edit',
            state: 'applied', adds: 12, dels: 9, checkpointId: 'cp2' }],
    [480, { t: 'change', id: 'ch3', path: 'src/billing/refund.ts', kind: 'edit',
            state: 'applied', adds: 7, dels: 5, checkpointId: 'cp2' }],
    [520, { t: 'change', id: 'ch4', path: 'src/billing/plan.ts', kind: 'edit',
            state: 'applied', adds: 19, dels: 14, checkpointId: 'cp2' }],
    [120, { t: 'node.state', nodeId: 'rewrite-callsites', state: 'succeeded', at: 0 }],
    [200, { t: 'checkpoint', id: 'cp2', label: 'All three callsites moved over', at: 0, restorable: true }],
    [0,   { t: 'checkpoint.state', id: 'cp2', state: 'clean', at: 0 }],
    [90,  { t: 'node.state', nodeId: 'run-tests', state: 'running', at: 0 }],
    [1400,{ t: 'node.progress', nodeId: 'run-tests', done: 84, total: 84 }],
    [110, { t: 'node.state', nodeId: 'run-tests', state: 'succeeded', at: 0 }],
    [140, { t: 'checkpoint', id: 'cp3', label: 'Billing tests green', at: 0, restorable: true }],
    [0,   { t: 'checkpoint.state', id: 'cp3', state: 'clean', at: 0 }],
    [80,  { t: 'run.end', runId: 'run_8f22', at: 0, outcome: 'success' }],
  ] satisfies Script,

  /** coding — a streaming transcription run, for the latency waterfall. */
  transcriptionRun: [
    [0,   { t: 'run.start', runId: 'p1', at: 0, intent: 'saaras_transcribe' }],
    [60,  { t: 'tool.call', nodeId: 'net', tool: 'upload', args: { bytes: 184_320 } }],
    [340, { t: 'tool.result', nodeId: 'net', tool: 'upload', ms: 340, ok: true }],
    [180, { t: 'node.state', nodeId: 'queue', state: 'running', at: 0 }],
    [120, { t: 'node.state', nodeId: 'queue', state: 'succeeded', at: 0 }],
    [0,   { t: 'ttft', nodeId: 'model', ms: 640 }],
    [90,  { t: 'token', nodeId: 'model', text: 'நாளை ' }],
    [70,  { t: 'token', nodeId: 'model', text: 'காலை ' }],
    [70,  { t: 'token', nodeId: 'model', text: 'வரேன்' }],
    [40,  { t: 'run.end', runId: 'p1', at: 0, outcome: 'success' }],
  ] satisfies Script,
};

/* =========================================================================
   NEXT STEPS
   -------------------------------------------------------------------------
   1. Measure real delays once per API path. Hardcode them here. Everything
      downstream inherits truthful timing without burning credits.
   2. Add one script per state in each project's state list. When your state
      list and your script list match, you have covered the state space —
      that coverage is itself a case-study artifact worth showing.
   3. Wire an SSE route (app/api/agent/route.ts) that plays a script, so the
      client code path is identical for scripted and real runs. Then you can
      swap in the real API with a flag and nothing in the UI changes.
   4. Expose fault injection in a dev toolbar. Being able to trigger any
      failure state in one click, in front of a user, is what makes a
      three-week project produce real findings.
   ====================================================================== */
