/**
 * Report capture types. The field names deliberately mirror the `reports` table
 * in PRD §6 so moving from the local queue to Postgres is a straight mapping,
 * not a translation layer.
 */

export type ObstructionType =
  | 'tanker'
  | 'mixer'
  | 'garbage'
  | 'construction'
  | 'event'
  | 'lorry'
  | 'other';

/** A clear report is a first-class report, not the absence of one. */
export type ReportKind = 'obstruction' | 'clear';

/**
 * PRD §6 lists photo | voice | passive | official. 'tap' is an addition: the
 * one-tap clear report has neither a photo nor an utterance, and labelling it
 * 'photo' would quietly poison any later analysis of classifier performance.
 */
export type ReportSource = 'photo' | 'voice' | 'passive' | 'official' | 'tap';

export interface Fix {
  lat: number;
  lng: number;
  /** Metres of GPS uncertainty, straight from the Geolocation API. */
  accuracy_m: number;
  /** Degrees from true north, or null when neither compass nor course is available. */
  heading_deg: number | null;
  /** Metres per second, or null. Used only by the safety gate. */
  speed_mps: number | null;
  at: number;
}

export interface SnapResult {
  segment_id: string;
  /** Perpendicular distance from the fix to the segment centreline. */
  snap_distance_m: number;
  /** 0..1 along the segment — the ST_LineLocatePoint equivalent. */
  locate: number;
  /** Bearing of the segment at the snapped point, degrees from north. */
  segment_bearing_deg: number;
  /**
   * How the candidate won: distance alone, or distance plus agreement between
   * the reporter's heading and the segment's bearing.
   */
  decided_by: 'distance' | 'heading';
  /** Runners-up, so the UI can offer a correction without re-snapping. */
  alternatives: { segment_id: string; snap_distance_m: number }[];
}

export interface Classification {
  type: ObstructionType;
  /** 0..1. Zero whenever `by` is 'unavailable' — never a fabricated number. */
  conf: number;
  by: 'model' | 'voice' | 'unavailable';
  /** Full distribution when a model ran, for the case study's error analysis. */
  scores?: Record<string, number>;
}

export interface PhotoRedaction {
  /** Regions blurred before the pixels were ever encoded. */
  faces: number;
  plates: number;
  /**
   * Whether every detector the policy requires actually ran. False means the
   * photo must not leave the device — see redact.ts.
   */
  complete: boolean;
  detectors: string[];
}

export interface LocalReport {
  id: string;
  kind: ReportKind;
  created_at: number;
  segment_id: string;
  obstruction_type: ObstructionType | null;
  source: ReportSource;
  classifier_conf: number | null;
  reporter_id: string;
  lat: number;
  lng: number;
  accuracy_m: number;
  snap_distance_m: number;
  heading_deg: number | null;
  /** Set only once the photo has actually been uploaded. Null while local-only. */
  photo_key: string | null;
  /** Redaction outcome, kept so we can prove why a photo stayed on the phone. */
  redaction: PhotoRedaction | null;
  /** Milliseconds from shutter press (or voice start) to submit. Exit criterion. */
  capture_ms: number;
  /** Whether the reporter overrode the classifier's top-1. Trains the next model. */
  corrected: boolean;
  synced: boolean;
}

export const OBSTRUCTION_LABELS: Record<ObstructionType, string> = {
  tanker: 'Water tanker',
  mixer: 'Concrete mixer',
  lorry: 'Lorry',
  garbage: 'Garbage truck',
  construction: 'Construction',
  event: 'Event or function',
  other: 'Something else',
};

/** Ordered by how often Phase 0 expects to see them, not alphabetically. */
export const OBSTRUCTION_ORDER: ObstructionType[] = [
  'tanker',
  'mixer',
  'garbage',
  'lorry',
  'construction',
  'event',
  'other',
];
