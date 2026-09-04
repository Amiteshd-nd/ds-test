/**
 * Snapping on a synthetic grid: a north–south road and an east–west road
 * crossing at a junction, built in raw degrees around a fixed point.
 *
 * 1e-4 degrees of latitude ≈ 11.06 m; of longitude at 12.99°N ≈ 10.85 m.
 */
import { describe, expect, it } from 'vitest';
import { buildSnapIndex, snap } from './snap';
import { bearing, closestPointOnLine, headingOffset } from './geo';
import type { LngLat } from './geo';

const LAT = 12.99;
const LNG = 77.669;
const DEG_NS = 1e-4; // ~11 m steps

const northSouth: LngLat[] = [
  [LNG, LAT - 10 * DEG_NS],
  [LNG, LAT + 10 * DEG_NS],
];
const eastWest: LngLat[] = [
  [LNG - 10 * DEG_NS, LAT],
  [LNG + 10 * DEG_NS, LAT],
];

const index = buildSnapIndex([
  { id: 'ns', coordinates: northSouth },
  { id: 'ew', coordinates: eastWest },
]);

describe('geometry', () => {
  it('perpendicular distance is in metres, not degrees', () => {
    // 3e-4 deg of longitude east of the NS road ≈ 32.5 m
    const near = closestPointOnLine([LNG + 3 * DEG_NS, LAT + 2 * DEG_NS], northSouth);
    expect(near.distance_m).toBeGreaterThan(30);
    expect(near.distance_m).toBeLessThan(35);
  });

  it('locate is a fraction of the whole line', () => {
    const near = closestPointOnLine([LNG + DEG_NS, LAT + 5 * DEG_NS], northSouth);
    expect(near.locate).toBeCloseTo(0.75, 1); // 15 of 20 steps from the south end
  });

  it('headingOffset treats the road as undirected', () => {
    expect(headingOffset(0, 180)).toBe(0);
    expect(headingOffset(90, 0)).toBe(90);
    expect(headingOffset(350, 10)).toBe(20);
  });

  it('bearing runs clockwise from north', () => {
    expect(bearing([LNG, LAT], [LNG, LAT + DEG_NS])).toBeCloseTo(0, 0);
    expect(bearing([LNG, LAT], [LNG + DEG_NS, LAT])).toBeCloseTo(90, 0);
  });
});

describe('snap policy', () => {
  it('an unambiguous fix snaps by distance alone', () => {
    // 2 steps east of NS, 8 steps north of EW: NS is clearly nearer
    const got = snap({ lat: LAT + 8 * DEG_NS, lng: LNG + 2 * DEG_NS, heading_deg: null }, index);
    expect(got?.segment_id).toBe('ns');
    expect(got?.decided_by).toBe('distance');
  });

  it('near the junction, heading breaks the tie', () => {
    // Roughly equidistant from both roads; rider is heading east.
    const fix = { lat: LAT + 0.6 * DEG_NS, lng: LNG + 0.5 * DEG_NS, heading_deg: 90 };
    const got = snap(fix, index);
    expect(got?.segment_id).toBe('ew');
    expect(got?.decided_by).toBe('heading');
  });

  it('the same tie with no heading falls back to plain distance', () => {
    const got = snap({ lat: LAT + 0.6 * DEG_NS, lng: LNG + 0.5 * DEG_NS, heading_deg: null }, index);
    expect(got?.segment_id).toBe('ns'); // 0.6 steps of lat > 0.5 steps of lng… nearer road wins
    expect(got?.decided_by).toBe('distance');
  });

  it('heading agreeing with BOTH candidates decides nothing', () => {
    // Two parallel north–south roads, 2 steps apart; fix between them, heading north.
    const parallel = buildSnapIndex([
      { id: 'left', coordinates: northSouth },
      {
        id: 'right',
        coordinates: [
          [LNG + 2 * DEG_NS, LAT - 10 * DEG_NS],
          [LNG + 2 * DEG_NS, LAT + 10 * DEG_NS],
        ],
      },
    ]);
    const got = snap({ lat: LAT, lng: LNG + 0.9 * DEG_NS, heading_deg: 0 }, parallel);
    // Nearer of the two wins, and the win is attributed to distance, not heading.
    expect(got?.segment_id).toBe('left');
    expect(got?.decided_by).toBe('distance');
  });

  it('a fix beyond max_distance refuses rather than guessing', () => {
    expect(snap({ lat: LAT + 100 * DEG_NS, lng: LNG + 100 * DEG_NS, heading_deg: null }, index)).toBeNull();
  });

  it('alternatives carry the runners-up so the UI can offer a correction', () => {
    const got = snap({ lat: LAT + 0.6 * DEG_NS, lng: LNG + 0.5 * DEG_NS, heading_deg: 90 }, index);
    expect(got?.alternatives.map((a) => a.segment_id)).toContain('ns');
  });
});
