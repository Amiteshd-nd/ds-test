'use client';

/**
 * The forty-minute return. This is the most common entry point into the surface
 * and usually the least designed one, so it gets the largest type on the screen
 * after the plan: where it is, whether to worry, and two clocks — since start and
 * since anything last moved. Those are different numbers, and STALLED is the state
 * that proves it.
 *
 * The phase also lives in a `role="status"` region. State that exists only as a
 * colour and a ring does not exist for a screen-reader user, and the announcement
 * fires at a semantic unit (the phase changed) rather than per token.
 */
import { useEffect, useRef, useState } from 'react';
import { copy } from './copy';
import { orientation, type RunState } from '@/lib/surfaces/coding/reducer';
import styles from './coding.module.css';

function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    // One second is the resolution a person reads a clock at; anything faster is
    // motion for its own sake and this surface has a no-shimmer rule.
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
}

function elapsed(from?: number) {
  if (!from) return '—';
  const s = Math.max(0, Math.round((Date.now() - from) / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export function RunHeader({
  state,
  streaming,
  onStart,
  onStop,
}: {
  state: RunState;
  streaming: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const { where, worry } = orientation(state);
  const phase = copy.phase[state.phase];
  useTicker(streaming);

  // Announce the phase, not the stream. Per-token live regions either say nothing
  // or say everything twice; this is the semantic unit.
  const announced = useRef(state.phase);
  useEffect(() => {
    announced.current = state.phase;
  }, [state.phase]);

  const worryLabel =
    worry === 'now' ? copy.orient.worryNow : worry === 'soon' ? copy.orient.worrySoon : copy.orient.worryNo;

  return (
    <header className={styles.orient}>
      <div className={styles.orientTop}>
        <div>
          <p className={styles.orientPhase}>
            {state.intent ?? copy.orient.idle}
          </p>
          <h1 className={styles.orientWhere}>{where}</h1>
        </div>
        <span className={styles.worry} data-worry={worry}>
          <span className={styles.pip} aria-hidden="true" />
          {worryLabel}
        </span>
      </div>

      <div className={styles.orientClocks}>
        <span className={styles.clock}>
          <span className={styles.clockLabel}>{copy.orient.elapsed}</span>
          <span className={styles.clockValue}>{elapsed(state.startedAt)}</span>
        </span>
        <span className={styles.clock}>
          <span className={styles.clockLabel}>{copy.orient.sinceProgress}</span>
          <span className={styles.clockValue}>{elapsed(state.lastEventAt)}</span>
        </span>
        <span className={styles.clock}>
          <span className={styles.clockLabel}>Run</span>
          <span className={styles.clockValue}>{phase}</span>
        </span>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          data-kind="primary"
          onClick={onStart}
          disabled={streaming}
        >
          {state.runId ? copy.orient.restart : copy.orient.start}
        </button>
        <button type="button" className={styles.button} onClick={onStop} disabled={!streaming}>
          {copy.orient.stop}
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {phase}. {where}.
      </p>
    </header>
  );
}
