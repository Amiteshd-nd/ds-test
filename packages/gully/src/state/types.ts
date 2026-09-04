/**
 * Blockage events — PRD §6. One event is a continuous obstruction of one kind
 * on one segment, assembled from the reports that describe it.
 */
import type { ObstructionType } from '../report/types';

/** PRD §6 lists exactly these four. No others are introduced. */
export type EventState = 'possible' | 'confirmed' | 'expired' | 'cleared';

export type Severity = 'blocked' | 'squeeze' | 'clear';

export interface BlockageEvent {
  id: string;
  segment_id: string;
  obstruction_type: ObstructionType;
  started_at: number;
  ended_at: number | null;
  /** Road width minus the obstruction's width. Negative means it overhangs. */
  effective_gap_m: number;
  severity: Severity;
  confirmations: number;
  clears: number;
  state: EventState;

  // ── derived, for the panel ────────────────────────────────────────────────
  /**
   * A confirmed event past its p90 dwell is not silently expired — PRD §7 asks
   * nearby users to confirm first. This is that ask, expressed as a flag rather
   * than a fifth state the schema does not have.
   */
  awaiting_recheck: boolean;
  /** started_at + p50 dwell. The "usually clears by" claim. */
  expected_clear_at: number | null;
  /** Distinct reporters who contributed. Corroboration is about people, not counts. */
  reporters: string[];
  /** How many past events of any kind this segment has carried. Evidence, not decoration. */
  segment_history_n: number;
}

/** PRD §6. Empty until Phase 0 fills it; see priors.ts for what stands in. */
export interface DwellPrior {
  obstruction_type: ObstructionType;
  width_bucket: 'narrow' | 'medium' | 'wide';
  hour_bucket: number;
  p50_min: number;
  p90_min: number;
  n: number;
}

/** PRD §6 ui_stretches: users think in stretches, the router thinks in segments. */
export interface Exit {
  id: string;
  label: string;
  /** The road underneath a directional label, e.g. "service off Main Road". */
  via?: string | null;
  segment_ids: string[];
}

export interface SegmentFacts {
  id: string;
  name: string;
  width_m: number;
  lanes: number | null;
  oneway: boolean;
}
