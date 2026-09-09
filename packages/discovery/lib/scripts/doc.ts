/**
 * The doc surface's cases, one per interesting state in projects/doc/states.md.
 * Same shape as coding's: one base script plus deterministic fault transforms, so
 * every state arrives identically for every test participant.
 */
import { scripts, type FaultKind, type Script } from '../agent-runtime';

export type DocCase = {
  id: string;
  state: string;
  shows: string;
  script: Script;
  faults: FaultKind[];
};

const base = scripts.docReviewFull;

export const docCases: DocCase[] = [
  {
    id: 'clean',
    state: 'EXTRACTED_CONFIDENT · EXTRACTED_UNCERTAIN · INFERRED · CONFLICTING · ILLEGIBLE · ABSENT',
    shows: 'The base document: 22 fields, four epistemic states on screen at once, plus two non-findings.',
    script: base,
    faults: [],
  },
  {
    id: 'confusable',
    state: 'CONFUSABLE',
    shows: 'One mark, two readings. The score stays high — the model is confident and the glyph is still ambiguous.',
    script: base,
    faults: ['confusable_glyph'],
  },
  {
    id: 'struck-through',
    state: 'STRUCK_THROUGH',
    shows: 'Crossed out on the paper and rewritten. Two values exist; one is void, and both are evidence.',
    script: base,
    faults: ['struck_through'],
  },
  {
    id: 'out-of-range',
    state: 'OUT_OF_RANGE',
    shows: 'Read correctly and impossible. No confidence band catches this, which is the point.',
    script: base,
    faults: ['out_of_range'],
  },
  {
    id: 'no-provenance',
    state: 'PROVENANCE_UNAVAILABLE',
    shows: 'The values may be right; the ability to check them is what is missing. Different failure, different words.',
    script: base,
    faults: ['provenance_unavailable'],
  },
  {
    id: 'degraded',
    state: 'SOURCE_DEGRADED',
    shows: 'Rotated and blurred. Provenance still has to work — the degenerate case is the design problem.',
    script: base,
    faults: ['source_degraded'],
  },
  {
    id: 'systematic',
    state: 'SYSTEMATIC_SUSPECTED',
    shows: 'One correction reveals the same field wrong on 34 documents. Almost no tool has a home for this.',
    script: base,
    faults: ['systematic_error'],
  },
  {
    id: 'planted',
    state: 'appropriate distrust',
    shows: 'A confidently wrong amount, for the distrust measurement. If five of five accept it, the signalling failed.',
    script: base,
    faults: ['planted_error'],
  },
  {
    id: 'script-fallback',
    state: 'SCRIPT_FALLBACK',
    shows: 'A glyph the font cannot render. Invisible to someone who does not read the script, so it must be loud.',
    script: base,
    faults: ['script_fallback'],
  },
  {
    id: 'repair-exhausted',
    state: 'REPAIR_OFFERED · REPAIR_EXHAUSTED',
    shows: 'Two attempts on one field, then it stops guessing and says to send the document back.',
    script: base,
    faults: ['repair_exhausted'],
  },
  {
    id: 'page-only',
    state: 'PROVENANCE_APPROXIMATE',
    shows: 'It knows the page and not the place on it. No box is drawn, because there is none to draw.',
    script: base,
    faults: ['provenance_page_only'],
  },
  {
    id: 'everything',
    state: 'compound',
    shows: 'A degraded scan with a confusable digit, a struck-through employer and a systematic error.',
    script: base,
    faults: ['source_degraded', 'confusable_glyph', 'struck_through', 'systematic_error'],
  },
];

export const docCaseById = (id: string) => docCases.find((c) => c.id === id);
