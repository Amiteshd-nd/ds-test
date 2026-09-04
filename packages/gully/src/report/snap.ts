/**
 * Snap policy: which segment does this fix belong to?
 *
 * Distance alone is wrong on a layout grid. Standing at a corner, the nearest
 * centreline is often the cross you are not on — GPS in a built-up layout sits
 * 10–20 m off, which is wider than the roads themselves. So distance picks the
 * shortlist and heading breaks the tie, exactly as PRD §7 Phase 2 specifies.
 */
import { bboxOf, closestPointOnLine, headingOffset, withinPadded, type LngLat } from './geo';
import type { Fix, SnapResult } from './types';

export interface SnapCandidateSource {
  id: string;
  coordinates: LngLat[];
}

export interface SnapOptions {
  /** Beyond this the fix is not on any pilot road; refuse rather than guess. */
  max_distance_m?: number;
  /**
   * Two candidates closer together than this are a tie, and heading decides.
   * Set from GPS reality, not from road widths: a 4 m road with a 15 m fix
   * error means the true segment is routinely the second-nearest.
   */
  tie_window_m?: number;
  /** Heading and road bearing must agree within this to count as agreement. */
  heading_tolerance_deg?: number;
}

const DEFAULTS: Required<SnapOptions> = {
  max_distance_m: 40,
  tie_window_m: 14,
  heading_tolerance_deg: 40,
};

interface Scored {
  id: string;
  distance_m: number;
  locate: number;
  bearing_deg: number;
}

/** Prepared segment index. Build once, reuse for every fix. */
export function buildSnapIndex(segments: SnapCandidateSource[]) {
  return segments.map((s) => ({ ...s, bbox: bboxOf(s.coordinates) }));
}

export type SnapIndex = ReturnType<typeof buildSnapIndex>;

export function snap(
  fix: Pick<Fix, 'lat' | 'lng' | 'heading_deg'>,
  index: SnapIndex,
  options: SnapOptions = {},
): SnapResult | null {
  const opts = { ...DEFAULTS, ...options };
  const point: LngLat = [fix.lng, fix.lat];

  const scored: Scored[] = [];
  for (const seg of index) {
    if (!withinPadded(seg.bbox, point, opts.max_distance_m)) continue;
    const near = closestPointOnLine(point, seg.coordinates);
    if (near.distance_m > opts.max_distance_m) continue;
    scored.push({
      id: seg.id,
      distance_m: near.distance_m,
      locate: near.locate,
      bearing_deg: near.bearing_deg,
    });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => a.distance_m - b.distance_m);

  let winner = scored[0];
  let decided_by: SnapResult['decided_by'] = 'distance';

  if (fix.heading_deg !== null) {
    // Everything within the tie window of the nearest is a live candidate.
    const tied = scored.filter((s) => s.distance_m - scored[0].distance_m <= opts.tie_window_m);
    if (tied.length > 1) {
      const agreeing = tied.filter(
        (s) => headingOffset(fix.heading_deg!, s.bearing_deg) <= opts.heading_tolerance_deg,
      );
      // Only override distance when the heading picks out exactly one road. Two
      // parallel candidates both agree, and then heading tells us nothing.
      if (agreeing.length === 1 && agreeing[0].id !== winner.id) {
        winner = agreeing[0];
        decided_by = 'heading';
      } else if (agreeing.length === 1) {
        decided_by = 'heading';
      }
    }
  }

  return {
    segment_id: winner.id,
    snap_distance_m: Math.round(winner.distance_m * 10) / 10,
    locate: Math.round(winner.locate * 1000) / 1000,
    segment_bearing_deg: Math.round(winner.bearing_deg),
    decided_by,
    alternatives: scored
      .filter((s) => s.id !== winner.id)
      .slice(0, 3)
      .map((s) => ({ id: s.id, snap_distance_m: Math.round(s.distance_m * 10) / 10 }))
      .map(({ id, snap_distance_m }) => ({ segment_id: id, snap_distance_m })),
  };
}
