'use client';

/**
 * The fault toolbar. Per docs/build-workflow.md §4 this is a design tool, not
 * product UI, and it is deliberately styled to be unmistakable for one: fixed to
 * the bottom, monospace, inverted, no product tokens.
 *
 * It exists because otherwise you wait for a real failure, and a real failure
 * arrives while you're mid-thought about something else. It also makes user tests
 * comparable — same seed, same fault, same moment, every participant.
 */
import { useState } from 'react';
import type { FaultKind } from '@/lib/agent-runtime';
import styles from './faultbar.module.css';

export type FaultOption = { kind: FaultKind; label: string };

/** coding's faults. A toolbar offering another surface's faults is a toolbar that
    does nothing when you click it, which is worse than no toolbar. */
export const CODING_FAULTS: FaultOption[] = [
  { kind: 'plan_revised', label: 'plan revised mid-run' },
  { kind: 'diverged_run', label: 'diverged from the plan' },
  { kind: 'manual_edit_conflict', label: 'you edited the same file' },
  { kind: 'permission_block', label: 'blocked on permission' },
  { kind: 'speculative_discard', label: 'provisional work discarded' },
  { kind: 'awaiting_steering', label: 'asking which direction' },
  { kind: 'retrying_step', label: 'retrying a step' },
  { kind: 'upstream_blocked', label: 'blocked on an earlier step' },
  { kind: 'partial_step', label: 'step half-worked' },
  { kind: 'envelope_breach', label: 'acted outside its envelope' },
  { kind: 'cancelled_midrun', label: 'cancelled mid-run' },
  { kind: 'stalled_node', label: 'stalled (no progress)' },
  { kind: 'slow_ttft', label: 'slow first token' },
  { kind: 'rate_limited', label: 'rate limited' },
  { kind: 'auth_failed', label: 'auth failed' },
  { kind: 'network_drop', label: 'network drop' },
  { kind: 'unsupported_combination', label: 'unsupported combination' },
];

/** doc's faults. `planted_error` is here on purpose: it is the appropriate-distrust
    measurement, and it belongs in the toolbar so a session can be run with it. */
export const DOC_FAULTS: FaultOption[] = [
  { kind: 'confusable_glyph', label: 'one mark, two readings' },
  { kind: 'struck_through', label: 'crossed out and rewritten' },
  { kind: 'out_of_range', label: 'read right, impossible' },
  { kind: 'provenance_unavailable', label: 'no location for values' },
  { kind: 'source_degraded', label: 'rotated + blurred scan' },
  { kind: 'systematic_error', label: 'same field wrong everywhere' },
  { kind: 'repair_exhausted', label: 'two tries, then stop' },
  { kind: 'provenance_page_only', label: 'page known, place not' },
  { kind: 'conflicting_values', label: 'extra conflicting value' },
  { kind: 'planted_error', label: 'confidently wrong amount' },
  { kind: 'script_fallback', label: 'glyph the font lacks' },
  { kind: 'rate_limited', label: 'rate limited' },
  { kind: 'auth_failed', label: 'auth failed' },
];

/* The runtime's `speed` multiplies each delay, so 0.25 plays four times faster and
   4 plays four times slower. Labelled by what it does, not by the number: a slider
   marked "4×" next to a stopwatch is the kind of thing that makes a test session
   unreproducible. */
const SPEEDS: { value: number; label: string }[] = [
  { value: 0.25, label: '4× faster' },
  { value: 1, label: 'real time' },
  { value: 4, label: '4× slower' },
];

/** content's faults. */
export const CONTENT_FAULTS: FaultOption[] = [
  { kind: 'clause_dropped', label: 'a clause goes missing' },
  { kind: 'pronunciation_wrong', label: 'brand name mispronounced' },
  { kind: 'voice_drifts', label: 'cloned voice drifts' },
  { kind: 'timing_overrun', label: 'does not fit the shot' },
  { kind: 'consent_missing', label: 'no consent record' },
  { kind: 'consent_expired', label: 'consent expired' },
  { kind: 'subtitle_clipped', label: 'subtitle clipped' },
  { kind: 'script_fallback', label: 'glyph the font lacks' },
  { kind: 'native_review_timeout', label: 'reviewer never replied' },
  { kind: 'planted_drift_one', label: 'plant drift in one language' },
  { kind: 'meaning_drift', label: 'drift in every language' },
  { kind: 'unsupported_combination', label: 'language unsupported' },
  { kind: 'rate_limited', label: 'rate limited' },
];

/** work's faults. */
export const WORK_FAULTS: FaultOption[] = [
  { kind: 'failed_midway', label: 'half-finished across systems' },
  { kind: 'unknown_leg', label: 'no answer from one system' },
  { kind: 'scope_expired_work', label: 'a grant lapsed' },
  { kind: 'scope_breach', label: 'tried to go outside its envelope' },
  { kind: 'residency_block', label: 'data cannot leave the region' },
  { kind: 'source_unavailable', label: 'the source message is gone' },
  { kind: 'empty_brief', label: 'nothing needed you' },
  { kind: 'planted_wrong_action', label: 'plausible and wrong, already sent' },
  { kind: 'attribution_disputed', label: 'he says he did not send it' },
  { kind: 'rate_limited', label: 'rate limited' },
];

/** voice's faults. */
export const VOICE_FAULTS: FaultOption[] = [
  { kind: 'spec_dirty', label: 'spec edited since the sweep' },
  { kind: 'constraint_untested', label: 'a rule no call exercised' },
  { kind: 'sweep_regressed', label: 'worse than last time' },
  { kind: 'sweep_partial', label: 'budget ran out' },
  { kind: 'cluster_unnameable', label: 'a group with no cause' },
  { kind: 'live_diverging', label: 'production unlike the simulation' },
  { kind: 'handoff_lossy_voice', label: 'context dropped at a seam' },
  { kind: 'interruption_misfire', label: 'stops talking on a noisy line' },
  { kind: 'held_on_hold', label: 'parked on hold music' },
  { kind: 'tool_too_slow', label: 'a tool over its budget' },
  { kind: 'rate_limited', label: 'rate limited' },
  { kind: 'auth_failed', label: 'auth failed' },
];

export function FaultBar({
  onReplay,
  streaming,
  options = CODING_FAULTS,
}: {
  onReplay: (options: { faults: FaultKind[]; speed: number; seed: number }) => void;
  streaming: boolean;
  /** The faults this surface can actually show. */
  options?: FaultOption[];
}) {
  const [faults, setFaults] = useState<FaultKind[]>([]);
  const [speed, setSpeed] = useState(1);
  const [seed, setSeed] = useState(1);

  const toggle = (kind: FaultKind) =>
    setFaults((current) => (current.includes(kind) ? current.filter((f) => f !== kind) : [...current, kind]));

  return (
    <aside className={styles.bar} aria-label="Fault injection (development only)">
      <span className={styles.badge}>faults</span>

      <div className={styles.faults}>
        {options.map((fault) => (
          <label className={styles.fault} key={fault.kind} data-on={faults.includes(fault.kind)}>
            <input
              type="checkbox"
              checked={faults.includes(fault.kind)}
              onChange={() => toggle(fault.kind)}
            />
            {fault.label}
          </label>
        ))}
      </div>

      <label className={styles.control}>
        speed
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.control}>
        seed
        <input
          type="number"
          min={1}
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value) || 1)}
        />
      </label>

      <button
        type="button"
        className={styles.replay}
        onClick={() => onReplay({ faults, speed, seed })}
      >
        {streaming ? 'restart' : 'replay'}
      </button>
    </aside>
  );
}
