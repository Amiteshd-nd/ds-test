/**
 * Fabricated report histories, for demonstrating the state engine.
 *
 * Corroboration needs two people. Phase 2 stores reports on the device, so one
 * phone can only ever produce one reporter_id and the `confirmed` state is
 * unreachable — see MANUAL.md §6. Until the server is on, this stands in.
 *
 * Two rules keep it honest:
 *
 *   1. Seeded reports are never written to IndexedDB. They live in memory and
 *      are merged at read time, so they cannot leak into a real queue, cannot
 *      sync, and vanish on reload unless demo mode is on.
 *   2. Every reporter id starts with `demo-`, and the UI says so wherever a
 *      seeded event is shown. Fabricated data that is not labelled as
 *      fabricated is just a lie with a timestamp.
 */
import type { LocalReport, ObstructionType, ReportKind, ReportSource } from '../report/types';
import type { SegmentFacts } from './types';

const MIN = 60_000;

export const DEMO_KEY = 'gully.demo_events';

export const demoEnabled = () => localStorage.getItem(DEMO_KEY) === 'on';
export const setDemo = (on: boolean) =>
  on ? localStorage.setItem(DEMO_KEY, 'on') : localStorage.removeItem(DEMO_KEY);

export const isSeeded = (reporterId: string) => reporterId.startsWith('demo-');

interface Spec {
  minutesAgo: number;
  segment: number; // index into the chosen segments
  kind: ReportKind;
  type: ObstructionType | null;
  reporter: string;
  source: ReportSource;
}

/**
 * One of each state the engine can reach, so the panel can be read against the
 * rules rather than against whatever happened to be on the street today.
 *
 * Timings assume the placeholder dwell priors: tanker p50 14 min / p90 25 min,
 * mixer 50/90, garbage 7/12.
 */
const SCRIPT: Spec[] = [
  // confirmed, live, still inside its expected dwell: two people, 3 min apart
  { minutesAgo: 11, segment: 0, kind: 'obstruction', type: 'tanker', reporter: 'demo-ravi', source: 'photo' },
  { minutesAgo: 8, segment: 0, kind: 'obstruction', type: 'tanker', reporter: 'demo-meena', source: 'voice' },

  // possible: one person, nobody has backed it
  { minutesAgo: 25, segment: 1, kind: 'obstruction', type: 'mixer', reporter: 'demo-suresh', source: 'photo' },

  // confirmed but past p90 — the engine asks before expiring it
  { minutesAgo: 46, segment: 2, kind: 'obstruction', type: 'tanker', reporter: 'demo-ravi', source: 'photo' },
  { minutesAgo: 43, segment: 2, kind: 'obstruction', type: 'tanker', reporter: 'demo-anita', source: 'photo' },

  // cleared: reported, then somebody drove through and said so
  { minutesAgo: 40, segment: 3, kind: 'obstruction', type: 'garbage', reporter: 'demo-meena', source: 'photo' },
  { minutesAgo: 34, segment: 3, kind: 'clear', type: null, reporter: 'demo-ravi', source: 'tap' },

  // expired: a lone report nobody backed, left to lapse
  { minutesAgo: 200, segment: 1, kind: 'obstruction', type: 'tanker', reporter: 'demo-suresh', source: 'photo' },

  // history on segment 0, so "past stops here" is a count and not a flourish
  { minutesAgo: 60 * 26, segment: 0, kind: 'obstruction', type: 'tanker', reporter: 'demo-ravi', source: 'photo' },
  { minutesAgo: 60 * 26 + 4, segment: 0, kind: 'obstruction', type: 'tanker', reporter: 'demo-meena', source: 'photo' },
  { minutesAgo: 60 * 50, segment: 0, kind: 'obstruction', type: 'tanker', reporter: 'demo-anita', source: 'photo' },
  { minutesAgo: 60 * 74, segment: 0, kind: 'obstruction', type: 'tanker', reporter: 'demo-ravi', source: 'voice' },
  { minutesAgo: 60 * 98, segment: 0, kind: 'obstruction', type: 'tanker', reporter: 'demo-meena', source: 'photo' },
];

/**
 * Pick the segments the script plays out on: narrowest first, because a tanker
 * on a 9 m road is not a story. Deterministic, so the demo is the same twice.
 */
export function demoSegments(
  all: SegmentFacts[],
  wellConnected?: (id: string) => boolean,
): SegmentFacts[] {
  // Narrow first — a tanker on a 9 m road is not a story — but only among roads
  // that actually join the network. The narrowest segments in an OSM layout are
  // often two-metre driveway stubs, and a demo staged on those cannot show a
  // route being pushed onto a different cross.
  const ranked = [...all].sort((a, b) => a.width_m - b.width_m || a.id.localeCompare(b.id));
  const joined = wellConnected ? ranked.filter((s) => wellConnected(s.id)) : ranked;
  return (joined.length >= 4 ? joined : ranked).slice(0, 4);
}

/**
 * Weeks of weekday mornings, so the rhythm layer has a pattern to find.
 *
 * A forecast built from eleven reports is not a forecast. This generates the
 * kind of history Phase 0 plus a month of pilot use would produce: a tanker
 * that comes to the same block most weekday mornings around 08:15, a mixer on
 * roughly one morning in four, and nothing at all at the weekend.
 *
 * Deterministic — a small LCG rather than Math.random — so the heat map is the
 * same every reload and a screenshot means something.
 */
const HISTORY_WEEKS = 8;

function rng(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function seedHistory(picked: SegmentFacts[], now: number): LocalReport[] {
  const out: LocalReport[] = [];
  const DAY = 86_400_000;
  let n = 0;

  for (let back = 1; back <= HISTORY_WEEKS * 7; back++) {
    const day = new Date(now - back * DAY);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // the tanker keeps office hours

    const rand = rng(back * 7919);

    // The morning tanker: most weekdays, around 08:15, give or take.
    if (rand() < 0.62) {
      const start = new Date(day);
      start.setHours(8, 5 + Math.floor(rand() * 25), 0, 0);
      const t = start.getTime();
      out.push(
        row(n++, 'obstruction', 'tanker', 'demo-ravi', 'photo', picked[0].id, t),
        row(n++, 'obstruction', 'tanker', 'demo-meena', 'photo', picked[0].id, t + 3 * 60_000),
        // Somebody drives through afterwards and says it has gone.
        row(n++, 'clear', null, 'demo-ravi', 'tap', picked[0].id, t + (14 + rand() * 10) * 60_000),
      );
    }

    // The mixer: rarer, longer, and it turns up in the evening.
    if (rand() < 0.24) {
      const start = new Date(day);
      start.setHours(17, Math.floor(rand() * 40), 0, 0);
      const t = start.getTime();
      out.push(
        row(n++, 'obstruction', 'mixer', 'demo-suresh', 'photo', picked[1].id, t),
        row(n++, 'obstruction', 'mixer', 'demo-anita', 'voice', picked[1].id, t + 5 * 60_000),
        row(n++, 'clear', null, 'demo-suresh', 'tap', picked[1].id, t + (50 + rand() * 30) * 60_000),
      );
    }
  }
  return out;
}

function row(
  i: number,
  kind: ReportKind,
  type: ObstructionType | null,
  reporter: string,
  source: ReportSource,
  segment_id: string,
  created_at: number,
): LocalReport {
  return {
    id: `demo-h${i}`,
    kind,
    created_at,
    segment_id,
    obstruction_type: type,
    source,
    classifier_conf: null,
    reporter_id: reporter,
    lat: 0,
    lng: 0,
    accuracy_m: 12,
    snap_distance_m: 5,
    heading_deg: null,
    photo_key: null,
    redaction: null,
    capture_ms: 3200,
    corrected: false,
    synced: false,
  };
}

export function seedReports(
  all: SegmentFacts[],
  now: number,
  wellConnected?: (id: string) => boolean,
): LocalReport[] {
  const picked = demoSegments(all, wellConnected);
  if (picked.length < 4) return [];

  const scripted = SCRIPT.map((s, i) => {
    const seg = picked[s.segment];
    return {
      id: `demo-${i}`,
      kind: s.kind,
      created_at: now - s.minutesAgo * MIN,
      segment_id: seg.id,
      obstruction_type: s.type,
      source: s.source,
      classifier_conf: null,
      reporter_id: s.reporter,
      lat: 0,
      lng: 0,
      accuracy_m: 12,
      snap_distance_m: 5,
      heading_deg: null,
      photo_key: null,
      redaction: null,
      capture_ms: 3200,
      corrected: false,
      synced: false,
    } satisfies LocalReport;
  });

  return [...scripted, ...seedHistory(picked, now)];
}
