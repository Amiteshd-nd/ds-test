/**
 * The state engine: reports in, blockage events out.
 *
 * Pure and total — no clock of its own, no storage, no DOM. `now` is a
 * parameter because a state machine you cannot wind forward is a state machine
 * you cannot test, and because the decide panel needs to ask "what would this
 * look like at 08:40" without waiting until 08:40.
 *
 * Rules are PRD §7 Phase 3:
 *   1 report                          -> possible
 *   2 independent reports in 8 min    -> confirmed
 *   decay by obstruction type         -> expired (confirmed events ask first)
 *   1 clear from a weighted reporter  -> cleared, immediately
 */
import type { LocalReport, ObstructionType } from '../report/types';
import {
  CONFIRM_WINDOW_MIN,
  CAR_REFUSAL_GAP_M,
  dwellP50Min,
  dwellP90Min,
  RECHECK_GRACE_MULTIPLE,
  REPORTER_WEIGHT,
  SQUEEZE_GAP_M,
  VEHICLE_WIDTH_M,
} from './priors';
import type { BlockageEvent, SegmentFacts, Severity } from './types';

const MIN = 60_000;

/**
 * Corroboration rate per reporter: of their obstruction reports, how many were
 * independently backed by somebody else inside the confirm window.
 *
 * On a single device every report shares one reporter_id, so nothing is ever
 * independent and every weight sits at neutral. That is not a gap in the maths —
 * it is what one phone can honestly know, and it is why Phase 3 wants a server.
 */
export function reporterWeights(reports: LocalReport[]): Map<string, number> {
  const obstructions = reports.filter((r) => r.kind === 'obstruction');
  const byReporter = new Map<string, { total: number; backed: number }>();

  for (const r of obstructions) {
    const stat = byReporter.get(r.reporter_id) ?? { total: 0, backed: 0 };
    stat.total++;
    const backed = obstructions.some(
      (o) =>
        o.id !== r.id &&
        o.reporter_id !== r.reporter_id &&
        o.segment_id === r.segment_id &&
        o.obstruction_type === r.obstruction_type &&
        Math.abs(o.created_at - r.created_at) <= CONFIRM_WINDOW_MIN * MIN,
    );
    if (backed) stat.backed++;
    byReporter.set(r.reporter_id, stat);
  }

  const weights = new Map<string, number>();
  for (const [id, { total, backed }] of byReporter) {
    if (total < REPORTER_WEIGHT.min_history) {
      weights.set(id, REPORTER_WEIGHT.neutral);
      continue;
    }
    const rate = backed / total;
    const w = REPORTER_WEIGHT.min + rate * (REPORTER_WEIGHT.max - REPORTER_WEIGHT.min);
    weights.set(id, Math.round(w * 100) / 100);
  }
  return weights;
}

/** PRD §6's severity function, generalised past the tanker case. */
export function severityFor(
  seg: SegmentFacts,
  type: ObstructionType,
): { gap: number; severity: Severity } {
  const gap = Math.round((seg.width_m - (VEHICLE_WIDTH_M[type] ?? 2.4)) * 10) / 10;
  if (seg.lanes === 1 && seg.oneway) return { gap, severity: 'blocked' };
  if (gap < CAR_REFUSAL_GAP_M) return { gap, severity: 'blocked' };
  if (gap < SQUEEZE_GAP_M) return { gap, severity: 'squeeze' };
  return { gap, severity: 'clear' };
}

export interface BuildOptions {
  now: number;
  segments: Map<string, SegmentFacts>;
}

/**
 * Fold every report into the set of events it describes.
 *
 * Rebuilt from scratch on each call rather than mutated incrementally. At pilot
 * volumes that is far cheaper than the bugs an incremental cache would buy, and
 * it means the same reports always produce the same events.
 */
export function buildEvents(reports: LocalReport[], opts: BuildOptions): BlockageEvent[] {
  const { now, segments } = opts;
  const weights = reporterWeights(reports);
  const ordered = [...reports].sort((a, b) => a.created_at - b.created_at);

  // One open event per segment+type at a time; a second tanker after the first
  // has cleared is a new event, not a continuation of it.
  const open = new Map<string, BlockageEvent>();
  const done: BlockageEvent[] = [];
  const key = (segment: string, type: string) => `${segment} ${type}`;

  const close = (ev: BlockageEvent, state: 'expired' | 'cleared', at: number) => {
    ev.state = state;
    ev.ended_at = at;
    ev.awaiting_recheck = false;
    open.delete(key(ev.segment_id, ev.obstruction_type));
    done.push(ev);
  };

  for (const r of ordered) {
    // Retire what has lapsed by the time this report lands. A `possible` event
    // just goes; a `confirmed` one is held past p90 so that a later clear can
    // still close it properly — somebody answering "it has gone" should end the
    // event as cleared, not find it already quietly expired behind them.
    for (const ev of [...open.values()]) {
      const dwell = dwellP90Min(ev.obstruction_type) * MIN;
      const limit = ev.started_at + dwell * (ev.state === 'confirmed' ? RECHECK_GRACE_MULTIPLE : 1);
      if (r.created_at > limit) close(ev, 'expired', ev.started_at + dwell);
    }

    if (r.kind === 'clear') {
      // A clear names no type, so it speaks to whatever is open on that road.
      const trusted =
        (weights.get(r.reporter_id) ?? REPORTER_WEIGHT.neutral) >= REPORTER_WEIGHT.trusted_clear;
      for (const ev of [...open.values()]) {
        if (ev.segment_id !== r.segment_id) continue;
        ev.clears++;
        if (trusted) close(ev, 'cleared', r.created_at);
      }
      continue;
    }

    const type = r.obstruction_type;
    if (!type) continue;
    const seg = segments.get(r.segment_id);
    if (!seg) continue; // a report on a road this build no longer draws

    const k = key(r.segment_id, type);
    const existing = open.get(k);

    if (existing) {
      if (!existing.reporters.includes(r.reporter_id)) existing.reporters.push(r.reporter_id);
      existing.confirmations++;
      // Independent means a different person, inside the window measured from
      // the first report — not from the previous one.
      const independent = existing.reporters.length >= 2;
      const inWindow = r.created_at - existing.started_at <= CONFIRM_WINDOW_MIN * MIN;
      if (independent && inWindow) existing.state = 'confirmed';
      continue;
    }

    const { gap, severity } = severityFor(seg, type);
    open.set(k, {
      id: r.id,
      segment_id: r.segment_id,
      obstruction_type: type,
      started_at: r.created_at,
      ended_at: null,
      effective_gap_m: gap,
      severity,
      confirmations: 1,
      clears: 0,
      // PRD §7 Phase 5: a tracked vehicle reporting its own position needs no
      // corroboration. There is nobody to corroborate with, and waiting for a
      // second human to confirm what the tanker already said would be theatre.
      state: r.source === 'official' ? 'confirmed' : 'possible',
      awaiting_recheck: false,
      expected_clear_at: r.created_at + dwellP50Min(type) * MIN,
      reporters: [r.reporter_id],
      segment_history_n: 0,
    });
  }

  // Resolve whatever is still open against the wall clock.
  for (const ev of [...open.values()]) {
    const dwell = dwellP90Min(ev.obstruction_type) * MIN;
    const p90 = ev.started_at + dwell;
    if (now > p90) {
      // A possible event just lapses. A confirmed one is asked about first —
      // expiring somebody's corroborated report behind their back is how a
      // reporting product teaches people that it does not listen — but an
      // unanswered question cannot hold it open indefinitely.
      if (ev.state !== 'confirmed') close(ev, 'expired', p90);
      else if (now > ev.started_at + dwell * RECHECK_GRACE_MULTIPLE) close(ev, 'expired', p90);
      else ev.awaiting_recheck = true;
    }
    if (open.has(key(ev.segment_id, ev.obstruction_type))) done.push(ev);
  }

  const historyBySegment = new Map<string, number>();
  for (const ev of done) {
    historyBySegment.set(ev.segment_id, (historyBySegment.get(ev.segment_id) ?? 0) + 1);
  }
  for (const ev of done) ev.segment_history_n = historyBySegment.get(ev.segment_id) ?? 0;

  return done.sort((a, b) => b.started_at - a.started_at);
}

/** The events a decision should be made from: still open, not yet closed. */
export const liveEvents = (events: BlockageEvent[]) =>
  events.filter((e) => e.state === 'possible' || e.state === 'confirmed');

export function worstSeverity(events: BlockageEvent[]): Severity {
  if (events.some((e) => e.severity === 'blocked')) return 'blocked';
  if (events.some((e) => e.severity === 'squeeze')) return 'squeeze';
  return 'clear';
}
