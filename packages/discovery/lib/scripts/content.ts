/**
 * The content surface's cases, one per interesting state in
 * projects/content/states.md. Same shape as the other two.
 */
import { scripts, type FaultKind, type Script } from '../agent-runtime';

export type ContentCase = {
  id: string;
  state: string;
  shows: string;
  script: Script;
  faults: FaultKind[];
};

const base = scripts.dubJob;

export const contentCases: ContentCase[] = [
  {
    id: 'clean',
    state: 'GENERATED · BACK_TRANSLATION_MATCHES · BACK_TRANSLATION_DIVERGES · TERM_VIOLATION · REGISTER_MISMATCH · NO_ACCEPTED_TERM · SUBTITLE_OVERFLOW',
    shows: 'The base job: nine languages, one fluent-and-unfaithful Tamil dub (formal when code-mixed was asked for), a clean Hindi one, and an honest gap in Kannada.',
    script: base,
    faults: [],
  },
  {
    id: 'clause-dropped',
    state: 'CLAUSE_DROPPED',
    shows: 'A regulated exclusion simply is not in the Telugu dub. The legal failure, not a tone note.',
    script: base,
    faults: ['clause_dropped'],
  },
  {
    id: 'pronunciation',
    state: 'PRONUNCIATION_SUSPECT · TRANSLITERATION_MISMATCH',
    shows: 'The brand name is wrong in Malayalam. She cannot hear it, so it comes back written in two scripts she reads.',
    script: base,
    faults: ['pronunciation_wrong'],
  },
  {
    id: 'voice-drift',
    state: 'VOICE_INCONSISTENT',
    shows: 'The cloned voice changes partway through the Bengali dub. Where, not "somewhere".',
    script: base,
    faults: ['voice_drifts'],
  },
  {
    id: 'timing',
    state: 'TIMING_OVERRUN',
    shows: 'The dub is longer than the shot it has to fit — text expansion in the time dimension.',
    script: base,
    faults: ['timing_overrun'],
  },
  {
    id: 'consent-missing',
    state: 'CONSENT_MISSING',
    shows: 'No consent record for the cloned voice. By decision the tool warns and allows, so the warning carries the weight.',
    script: base,
    faults: ['consent_missing'],
  },
  {
    id: 'consent-expired',
    state: 'CONSENT_EXPIRED',
    shows: 'Granted once, for something else, and lapsed. The most likely real case.',
    script: base,
    faults: ['consent_expired'],
  },
  {
    id: 'typography',
    state: 'SUBTITLE_OVERFLOW · CLIPPED_DESCENDER · SCRIPT_FALLBACK',
    shows: 'The Malayalam subtitle overflows its safe area, clips its descenders, and hits a glyph the font lacks.',
    script: base,
    faults: ['subtitle_clipped', 'script_fallback'],
  },
  {
    id: 'review-timeout',
    state: 'NATIVE_REVIEW_TIMED_OUT',
    shows: 'The native reviewer never came back. Guaranteed to happen, designed for nowhere.',
    script: base,
    faults: ['native_review_timeout'],
  },
  {
    id: 'unsupported',
    state: 'LANGUAGE_UNSUPPORTED',
    shows: 'The language works for speech-to-text and not for this voice. Say it before she waits.',
    script: base,
    faults: ['unsupported_combination'],
  },
  {
    id: 'drift-planted',
    state: 'detection experiment',
    shows: 'One variant — Marathi, which she does not read — says the opposite of the source and reads perfectly. If she misses this, the mirror has not earned its place.',
    script: base,
    faults: ['planted_drift_one'],
  },
  {
    id: 'everything',
    state: 'compound',
    shows: 'A missing clause, a mispronounced brand, a drifting voice and no consent record at once.',
    script: base,
    faults: ['clause_dropped', 'pronunciation_wrong', 'voice_drifts', 'consent_missing'],
  },
];

export const contentCaseById = (id: string) => contentCases.find((c) => c.id === id);
