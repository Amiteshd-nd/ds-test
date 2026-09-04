/**
 * The rhythm aggregate's honesty rules: smoothing, suppression, closed-only,
 * and multi-bucket occupancy. Timestamps are built with local-time Date parts
 * because bucketOf reads local hours — the same convention the app uses.
 */
import { describe, expect, it } from 'vitest';
import { bucketOf, buildRhythm, cellKey, lookup, MIN_DAYS, rhythmSentence } from './aggregate';
import type { BlockageEvent } from '../state/types';

const DAY = 86_400_000;

/** A closed tanker event at local 08:15, `daysAgo` days before `anchor`. */
function closedEvent(anchor: number, daysAgo: number, minutes = 20): BlockageEvent {
  const d = new Date(anchor - daysAgo * DAY);
  d.setHours(8, 15, 0, 0);
  const started_at = d.getTime();
  return {
    id: `e${daysAgo}`,
    segment_id: 'road-a',
    obstruction_type: 'tanker',
    started_at,
    ended_at: started_at + minutes * 60_000,
    effective_gap_m: 1.5,
    severity: 'blocked',
    confirmations: 2,
    clears: 1,
    state: 'cleared',
    awaiting_recheck: false,
    expected_clear_at: null,
    reporters: ['a', 'b'],
    segment_history_n: 0,
  };
}

/** An anchor whose local time is 12:00 today, so buckets are stable. */
const NOW = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
})();

/** The dow and bucket of the 08:15 slot `daysAgo` days back. */
function slotOf(daysAgo: number) {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(8, 15, 0, 0);
  return { dow: d.getDay(), bucket: bucketOf(d), at: d };
}

describe('buildRhythm', () => {
  it('Laplace smoothing keeps one observation away from certainty', () => {
    // Blocked on the same weekday twice, 7 and 14 days ago. Observed days for
    // that (dow, bucket) cell: days 0..14 with matching dow → 3 days (0, 7, 14).
    const rhythm = buildRhythm([closedEvent(NOW, 7), closedEvent(NOW, 14)], NOW);
    const { dow, bucket } = slotOf(7);
    const cell = rhythm.get(cellKey('road-a', dow, bucket))!;
    expect(cell.blocked_days).toBe(2);
    expect(cell.n_days).toBe(3);
    expect(cell.p_blocked).toBeCloseTo((2 + 1) / (3 + 2), 5); // 0.6, never 2/3 raw → smoothed
    expect(cell.p_blocked).toBeLessThan(1);
  });

  it('an open event is not yet evidence', () => {
    const open = { ...closedEvent(NOW, 7), ended_at: null };
    const rhythm = buildRhythm([open], NOW);
    const { dow, bucket } = slotOf(7);
    expect(rhythm.get(cellKey('road-a', dow, bucket))?.blocked_days ?? 0).toBe(0);
  });

  it('a long event occupies every bucket it overlaps, not just the first', () => {
    const rhythm = buildRhythm([closedEvent(NOW, 7, 90)], NOW); // 08:15–09:45
    const { dow } = slotOf(7);
    const nine = new Date(NOW - 7 * DAY);
    nine.setHours(9, 30, 0, 0);
    const cell = rhythm.get(cellKey('road-a', dow, bucketOf(nine)));
    expect(cell?.blocked_days).toBe(1);
  });
});

describe('suppression', () => {
  it('lookup refuses to answer below MIN_DAYS of evidence', () => {
    const rhythm = buildRhythm([closedEvent(NOW, 7)], NOW);
    const { at } = slotOf(7);
    // Only ~2 matching weekdays observed — under MIN_DAYS.
    expect(MIN_DAYS).toBeGreaterThan(2);
    expect(lookup(rhythm, 'road-a', at)).toBeNull();
  });

  it('the sentence for a suppressed cell says "not enough", never a number', () => {
    const s = rhythmSentence(null, new Date(NOW));
    expect(s).toMatch(/not enough/i);
    expect(s).not.toMatch(/%/);
  });

  it('with weeks of history the cell speaks, and names its sample size', () => {
    const events = [7, 14, 21, 28, 35, 42].map((d) => closedEvent(NOW, d));
    const rhythm = buildRhythm(events, NOW);
    const { at } = slotOf(7);
    const cell = lookup(rhythm, 'road-a', at);
    expect(cell).not.toBeNull();
    expect(cell!.n_days).toBeGreaterThanOrEqual(MIN_DAYS);
    expect(rhythmSentence(cell, at)).toMatch(/\d+ of \d+ days seen/);
  });
});
