/**
 * Rhythm aggregates — PRD §7 Phase 4.
 *
 *     segment x day-of-week x 15-minute bucket  ->  p_blocked
 *
 * This is the cold-start answer. A crowdsourced reporting product is empty on
 * the morning it launches and empty again on any morning nobody happens to be
 * looking, and "no reports" is not the same as "clear". The rhythm layer is what
 * the app knows when nobody has said anything today: tanker movement is
 * semi-deterministic — same block, same weekday, same rough slot — so the past
 * is a usable prior for the present.
 *
 * Two rules keep it from overclaiming, both from the PRD:
 *
 *   Laplace smoothing, so one observation on one Tuesday cannot read as 100%.
 *   Suppression below n = 5 days, so a thin cell says nothing at all rather
 *   than saying something confidently wrong.
 */
import type { BlockageEvent } from '../state/types';

/** 96 quarter-hours in a day. */
export const BUCKETS_PER_DAY = 96;
export const BUCKET_MINUTES = 15;

/** PRD §7: suppress display below this many distinct days of evidence. */
export const MIN_DAYS = 5;

/**
 * Laplace (add-alpha) smoothing. alpha = 1 is the textbook choice and pulls a
 * 1-of-1 observation to 2/3 rather than leaving it at certainty.
 */
const ALPHA = 1;

export interface RhythmCell {
  segment_id: string;
  dow: number; // 0 = Sunday, matching Date.getDay()
  bucket15: number;
  /** Smoothed probability this segment is blocked in this slot. */
  p_blocked: number;
  /** Distinct days contributing. Below MIN_DAYS the cell is not displayed. */
  n_days: number;
  /** Days in this slot that carried a blockage. Raw, for the evidence line. */
  blocked_days: number;
}

export type Rhythm = Map<string, RhythmCell>;

export const cellKey = (segment_id: string, dow: number, bucket15: number) =>
  `${segment_id}|${dow}|${bucket15}`;

export const bucketOf = (d: Date) => Math.floor((d.getHours() * 60 + d.getMinutes()) / BUCKET_MINUTES);

export function bucketLabel(bucket15: number): string {
  const mins = bucket15 * BUCKET_MINUTES;
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY = 86_400_000;
const dayStamp = (t: number) => Math.floor(t / DAY);

/**
 * Fold closed events into per-slot occupancy.
 *
 * Only events that have ended are counted. A live event is not yet evidence
 * about how long its slot is usually blocked — folding it in early would let
 * this morning's tanker inflate this morning's own forecast.
 */
export function buildRhythm(events: BlockageEvent[], now: number): Rhythm {
  const blockedDays = new Map<string, Set<number>>();
  const seenDays = new Map<string, Set<number>>();

  // Every (segment, dow, bucket) slot needs a denominator: the days we could
  // have observed it at all. Without one, a segment reported twice reads the
  // same as a segment watched for a month and blocked twice.
  const observedFrom = events.length
    ? Math.min(...events.map((e) => e.started_at))
    : now;

  const add = (map: Map<string, Set<number>>, key: string, day: number) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(day);
  };

  const segments = new Set(events.map((e) => e.segment_id));
  for (let day = dayStamp(observedFrom); day <= dayStamp(now); day++) {
    const dow = new Date(day * DAY).getDay();
    for (const segment of segments) {
      for (let b = 0; b < BUCKETS_PER_DAY; b++) add(seenDays, cellKey(segment, dow, b), day);
    }
  }

  for (const ev of events) {
    if (ev.ended_at === null) continue; // still running; not yet evidence
    const start = new Date(ev.started_at);
    const dow = start.getDay();
    const day = dayStamp(ev.started_at);

    // An event occupies every bucket it overlaps, not just the one it began in:
    // a 90-minute mixer blocks six slots, and a forecast that only marks the
    // first would tell you 09:00 is fine when the mixer is still there.
    const firstBucket = bucketOf(start);
    const lastBucket = bucketOf(new Date(ev.ended_at));
    const last = lastBucket < firstBucket ? BUCKETS_PER_DAY - 1 : lastBucket; // clamp at midnight
    for (let b = firstBucket; b <= last; b++) {
      add(blockedDays, cellKey(ev.segment_id, dow, b), day);
    }
  }

  const rhythm: Rhythm = new Map();
  for (const [key, days] of seenDays) {
    const [segment_id, dow, bucket15] = key.split('|');
    const n_days = days.size;
    const blocked = blockedDays.get(key)?.size ?? 0;
    rhythm.set(key, {
      segment_id,
      dow: Number(dow),
      bucket15: Number(bucket15),
      // (blocked + alpha) / (n + 2 alpha) — the two-outcome Laplace form.
      p_blocked: (blocked + ALPHA) / (n_days + 2 * ALPHA),
      n_days,
      blocked_days: blocked,
    });
  }
  return rhythm;
}

/** Null when the cell is too thin to show — the caller must say "not enough data". */
export function lookup(rhythm: Rhythm, segment_id: string, at: Date): RhythmCell | null {
  const cell = rhythm.get(cellKey(segment_id, at.getDay(), bucketOf(at)));
  if (!cell || cell.n_days < MIN_DAYS) return null;
  return cell;
}

/**
 * The sentence the panel says. Deliberately names the window and the sample
 * size: "62% of weekdays" with n hidden is the same mistake as a confidence
 * tier — a number nobody can check.
 */
export function rhythmSentence(cell: RhythmCell | null, at: Date): string {
  if (!cell) return `Not enough history for ${bucketLabel(bucketOf(at))} to say.`;
  const pct = Math.round(cell.p_blocked * 100);
  const when = `${DOW_LABELS[cell.dow]}s around ${bucketLabel(cell.bucket15)}`;
  return `Blocked on ${pct}% of ${when} — ${cell.blocked_days} of ${cell.n_days} days seen.`;
}

/** Worst probability across a stretch, for an exit made of several segments. */
export function worstFor(rhythm: Rhythm, segment_ids: string[], at: Date): RhythmCell | null {
  let worst: RhythmCell | null = null;
  for (const id of segment_ids) {
    const cell = lookup(rhythm, id, at);
    if (cell && (!worst || cell.p_blocked > worst.p_blocked)) worst = cell;
  }
  return worst;
}
