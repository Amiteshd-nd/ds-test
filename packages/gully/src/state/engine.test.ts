/**
 * The state engine's rules, pinned.
 *
 * Every test winds `now` by hand — the engine has no clock of its own, which is
 * the property that makes these tests possible at all.
 */
import { describe, expect, it } from 'vitest';
import { buildEvents, liveEvents, reporterWeights, severityFor } from './engine';
import { CONFIRM_WINDOW_MIN, dwellP90Min, RECHECK_GRACE_MULTIPLE } from './priors';
import type { LocalReport, ObstructionType, ReportKind, ReportSource } from '../report/types';
import type { SegmentFacts } from './types';

const MIN = 60_000;
const T0 = 1_700_000_000_000; // fixed epoch; the engine never reads Date.now()

const SEGMENTS = new Map<string, SegmentFacts>([
  ['road-a', { id: 'road-a', name: '2nd Cross', width_m: 4.0, lanes: null, oneway: false }],
  ['road-b', { id: 'road-b', name: '3rd Cross', width_m: 6.0, lanes: null, oneway: false }],
  ['lane-1', { id: 'lane-1', name: 'oneway lane', width_m: 9.0, lanes: 1, oneway: true }],
]);

let seq = 0;
function report(over: {
  at: number;
  segment?: string;
  reporter?: string;
  kind?: ReportKind;
  type?: ObstructionType | null;
  source?: ReportSource;
}): LocalReport {
  const kind = over.kind ?? 'obstruction';
  return {
    id: `r${seq++}`,
    kind,
    created_at: over.at,
    segment_id: over.segment ?? 'road-a',
    obstruction_type: kind === 'clear' ? null : (over.type ?? 'tanker'),
    source: over.source ?? 'photo',
    classifier_conf: null,
    reporter_id: over.reporter ?? 'ravi',
    lat: 0,
    lng: 0,
    accuracy_m: 10,
    snap_distance_m: 3,
    heading_deg: null,
    photo_key: null,
    redaction: null,
    capture_ms: 3000,
    corrected: false,
    synced: false,
  };
}

const fold = (reports: LocalReport[], now: number) =>
  buildEvents(reports, { now, segments: SEGMENTS });

describe('corroboration', () => {
  it('one report opens a possible event', () => {
    const [ev] = fold([report({ at: T0 })], T0 + 2 * MIN);
    expect(ev.state).toBe('possible');
    expect(ev.confirmations).toBe(1);
  });

  it('a second person inside the window confirms', () => {
    const events = fold(
      [report({ at: T0, reporter: 'ravi' }), report({ at: T0 + 3 * MIN, reporter: 'meena' })],
      T0 + 5 * MIN,
    );
    expect(events).toHaveLength(1);
    expect(events[0].state).toBe('confirmed');
    expect(events[0].reporters).toHaveLength(2);
  });

  it('the same person twice does not confirm — independence means people, not counts', () => {
    const [ev] = fold(
      [report({ at: T0, reporter: 'ravi' }), report({ at: T0 + 3 * MIN, reporter: 'ravi' })],
      T0 + 5 * MIN,
    );
    expect(ev.state).toBe('possible');
    expect(ev.confirmations).toBe(2);
    expect(ev.reporters).toHaveLength(1);
  });

  it('a second person outside the window does not confirm', () => {
    const [ev] = fold(
      [
        report({ at: T0, reporter: 'ravi' }),
        report({ at: T0 + (CONFIRM_WINDOW_MIN + 1) * MIN, reporter: 'meena' }),
      ],
      T0 + (CONFIRM_WINDOW_MIN + 2) * MIN,
    );
    expect(ev.state).toBe('possible');
  });

  it('the window is measured from the FIRST report, not the previous one', () => {
    // Three same-person reports walk time forward; a different person then
    // arrives inside the gap from report #3 but outside it from report #1.
    const [ev] = fold(
      [
        report({ at: T0, reporter: 'ravi' }),
        report({ at: T0 + 4 * MIN, reporter: 'ravi' }),
        report({ at: T0 + 7 * MIN, reporter: 'ravi' }),
        report({ at: T0 + 10 * MIN, reporter: 'meena' }),
      ],
      T0 + 11 * MIN,
    );
    expect(ev.state).toBe('possible');
  });

  it('an official source is confirmed on arrival — nothing to corroborate against', () => {
    const [ev] = fold([report({ at: T0, source: 'official', reporter: 'bwssb:KA01' })], T0 + MIN);
    expect(ev.state).toBe('confirmed');
  });
});

describe('clears', () => {
  it('one clear from a neutral reporter closes the event immediately', () => {
    const events = fold(
      [report({ at: T0 }), report({ at: T0 + 5 * MIN, kind: 'clear', reporter: 'meena' })],
      T0 + 6 * MIN,
    );
    expect(events[0].state).toBe('cleared');
    expect(events[0].ended_at).toBe(T0 + 5 * MIN);
  });

  it('a clear only speaks to its own road', () => {
    const events = fold(
      [
        report({ at: T0, segment: 'road-a' }),
        report({ at: T0 + 1 * MIN, segment: 'road-b', type: 'mixer' }),
        report({ at: T0 + 5 * MIN, kind: 'clear', segment: 'road-b', reporter: 'meena' }),
      ],
      T0 + 6 * MIN,
    );
    const byRoad = new Map(events.map((e) => [e.segment_id, e.state]));
    expect(byRoad.get('road-a')).toBe('possible');
    expect(byRoad.get('road-b')).toBe('cleared');
  });

  it('a new report after a clear opens a NEW event, not a continuation', () => {
    const events = fold(
      [
        report({ at: T0, reporter: 'ravi' }),
        report({ at: T0 + 5 * MIN, kind: 'clear', reporter: 'meena' }),
        report({ at: T0 + 10 * MIN, reporter: 'anita' }),
      ],
      T0 + 11 * MIN,
    );
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.state).sort()).toEqual(['cleared', 'possible']);
  });
});

describe('decay', () => {
  const p90 = dwellP90Min('tanker');

  it('a possible event lapses quietly at p90', () => {
    const [ev] = fold([report({ at: T0 })], T0 + (p90 + 1) * MIN);
    expect(ev.state).toBe('expired');
    expect(ev.ended_at).toBe(T0 + p90 * MIN);
  });

  it('a confirmed event past p90 is asked about, not expired', () => {
    const [ev] = fold(
      [report({ at: T0, reporter: 'ravi' }), report({ at: T0 + 2 * MIN, reporter: 'meena' })],
      T0 + (p90 + 5) * MIN,
    );
    expect(ev.state).toBe('confirmed');
    expect(ev.awaiting_recheck).toBe(true);
    expect(liveEvents([ev])).toHaveLength(1);
  });

  it('an unanswered ask cannot hold the event open past the grace window', () => {
    const [ev] = fold(
      [report({ at: T0, reporter: 'ravi' }), report({ at: T0 + 2 * MIN, reporter: 'meena' })],
      T0 + (p90 * RECHECK_GRACE_MULTIPLE + 1) * MIN,
    );
    expect(ev.state).toBe('expired');
    expect(ev.awaiting_recheck).toBe(false);
  });

  it('decay is per type: a mixer outlives a tanker', () => {
    const at = T0 + (dwellP90Min('tanker') + 5) * MIN; // past tanker p90, inside mixer p90
    const events = fold(
      [report({ at: T0, segment: 'road-a', type: 'tanker' }), report({ at: T0, segment: 'road-b', type: 'mixer' })],
      at,
    );
    const byRoad = new Map(events.map((e) => [e.segment_id, e.state]));
    expect(byRoad.get('road-a')).toBe('expired');
    expect(byRoad.get('road-b')).toBe('possible');
  });
});

describe('severity', () => {
  it('a 4 m road with a 2.5 m tanker blocks — 1.5 m is below the car threshold', () => {
    expect(severityFor(SEGMENTS.get('road-a')!, 'tanker')).toEqual({ gap: 1.5, severity: 'blocked' });
  });

  it('a 6 m road squeezes', () => {
    expect(severityFor(SEGMENTS.get('road-b')!, 'tanker').severity).toBe('squeeze');
  });

  it('a single-lane oneway blocks regardless of width', () => {
    expect(severityFor(SEGMENTS.get('lane-1')!, 'tanker').severity).toBe('blocked');
  });
});

describe('reporter weighting', () => {
  it('a reporter with no history sits at exactly neutral', () => {
    const w = reporterWeights([report({ at: T0 })]);
    expect(w.get('ravi')).toBe(1.0);
  });

  it('a consistently corroborated reporter earns weight above neutral', () => {
    const reports: LocalReport[] = [];
    for (let i = 0; i < 3; i++) {
      const t = T0 + i * 60 * MIN;
      reports.push(report({ at: t, reporter: 'ravi' }), report({ at: t + 2 * MIN, reporter: 'meena' }));
    }
    expect(reporterWeights(reports).get('ravi')!).toBeGreaterThan(1.0);
  });
});
