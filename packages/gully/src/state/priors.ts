/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  EVERY NUMBER IN THIS FILE IS A PLACEHOLDER.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PRD §6 wants `dwell_priors` seeded from the Phase 0 field survey: 80–150
 * logged obstruction events, bucketed by type, road width and hour of day. That
 * survey has not happened, so what follows is the PRD's own worked estimates
 * plus interpolation.
 *
 * They are quarantined in one file, tagged with provenance, and surfaced in the
 * UI as estimates rather than measurements — because the decide panel's entire
 * argument is cause *and duration*, and a fabricated duration presented as fact
 * is worse than no duration at all.
 *
 * Replace by writing data/dwell-priors.csv from the survey log; see MANUAL.md.
 */
import type { ObstructionType } from '../report/types';
import type { DwellPrior } from './types';

/** Flipped to false the day a real prior table lands. The UI reads this. */
export const PRIORS_ARE_PLACEHOLDERS = true;

export const PRIORS_PROVENANCE =
  'PRD §7 estimates, not field measurements — Phase 0 has not run';

/**
 * p90 values are the decay constants named in PRD §7 Phase 3. p50 is
 * interpolated at 0.55 × p90: obstruction dwell times are right-skewed (a
 * tanker that is still there at 40 minutes has a pump problem), so the median
 * sits well below the tail. That ratio is itself a guess.
 */
const P90_MIN: Record<ObstructionType, number> = {
  tanker: 25,
  garbage: 12,
  mixer: 90,
  construction: 8 * 60,
  event: 4 * 60,
  lorry: 30, // not in the PRD list; loading a lorry ≈ a tanker plus a little
  other: 30, // deliberately pessimistic — an unknown thing gets the benefit of doubt
};

const P50_RATIO = 0.55;

export const dwellP90Min = (t: ObstructionType) => P90_MIN[t] ?? 30;
export const dwellP50Min = (t: ObstructionType) => Math.round(dwellP90Min(t) * P50_RATIO);

/**
 * Widths used by the severity rule in PRD §6. Tanker, mixer and lorry are the
 * PRD's own figures; the rest are estimated from the same body of vehicle.
 */
export const VEHICLE_WIDTH_M: Record<ObstructionType, number> = {
  tanker: 2.5,
  mixer: 2.6,
  lorry: 2.4,
  garbage: 2.4,
  construction: 3.0, // a site spreads wider than the machine on it
  event: 3.5, // pandals and parked cars, not one vehicle
  other: 2.4,
};

/** Below this, OSRM's own car profile refuses to route. PRD §6. */
export const CAR_REFUSAL_GAP_M = 2.2;
export const SQUEEZE_GAP_M = 4.2;

/**
 * The full prior table the app would query if Phase 0 had run. Generated flat
 * across width and hour buckets precisely because there is no evidence for
 * varying them — inventing a morning-peak curve would be inventing a finding.
 */
export function placeholderPriors(): DwellPrior[] {
  const types = Object.keys(P90_MIN) as ObstructionType[];
  const buckets = ['narrow', 'medium', 'wide'] as const;
  return types.flatMap((t) =>
    buckets.flatMap((width_bucket) =>
      Array.from({ length: 24 }, (_, hour_bucket) => ({
        obstruction_type: t,
        width_bucket,
        hour_bucket,
        p50_min: dwellP50Min(t),
        p90_min: dwellP90Min(t),
        n: 0, // n = 0 is the honest field: nothing has been observed
      })),
    ),
  );
}

/**
 * Reporter weighting, PRD §7: "by historical corroboration rate".
 *
 * Below three prior reports there is no rate to speak of, so a new reporter sits
 * at exactly 1.0 — trusted enough to close an event, not trusted enough to
 * outweigh anyone. The curve either side is a placeholder.
 */
export const REPORTER_WEIGHT = {
  min: 0.5,
  max: 1.5,
  neutral: 1.0,
  /** Reports needed before a rate means anything. */
  min_history: 3,
  /** A clear from a reporter at or above this closes an event outright. */
  trusted_clear: 1.0,
};

/** PRD §7: two independent reports inside this window confirm an event. */
export const CONFIRM_WINDOW_MIN = 8;

/**
 * How far past p90 a *confirmed* event is held open while it waits for someone
 * to answer "still there?". PRD §7 says ask before expiring a confirmed event,
 * but an unanswered question cannot hold an event open forever. Two dwells is a
 * placeholder like everything else here.
 */
export const RECHECK_GRACE_MULTIPLE = 2;
