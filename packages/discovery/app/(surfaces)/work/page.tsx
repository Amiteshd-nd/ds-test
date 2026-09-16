'use client';

/**
 * Work Agents — the morning brief and the action ledger.
 *
 * Left: the brief as a document, resumable in fifteen-minute gaps, then the ledger.
 * Right: the envelope, the admin ceiling above it, what it can reach, and the ask to
 * stop asking.
 *
 * Everything in the ledger was done in his name. The recipient is told nothing, by
 * decision — so this screen is the only place the truth lives.
 */
import { useEffect } from 'react';
import { FaultBar, WORK_FAULTS } from '@/components/dev/FaultBar';
import { copy } from '@/components/surfaces/work/copy';
import { Ledger } from '@/components/surfaces/work/Ledger';
import {
  Access,
  Brief,
  Ceiling,
  Envelope,
  Handoffs,
  NonFindings,
  Taper,
} from '@/components/surfaces/work/Panels';
import { useAgentStream } from '@/lib/grammar/useAgentStream';
import { briefSummary, initialWorkState, reduceAllWork } from '@/lib/surfaces/work/reducer';
import styles from '@/components/surfaces/work/work.module.css';

export default function WorkSurface() {
  const { state, status, start, stop, apply } = useAgentStream({
    script: 'morningBrief',
    initial: initialWorkState,
    reduceAll: reduceAllWork,
  });
  const streaming = status === 'streaming';
  const summary = briefSummary(state);

  useEffect(() => stop, [stop]);

  return (
    <>
      <div className={styles.surface}>
        <main className={styles.main}>
          <header className={styles.head}>
            <h1 className={styles.headTitle}>
              {state.brief ? copy.brief.heading(state.brief.date) : copy.surface.role}
            </h1>
            {state.brief && (
              <span className={styles.counts}>
                <span className={styles.count}>{copy.brief.did(summary.did)}</span>
                {summary.needsYou > 0 && (
                  <span className={styles.countNeeds}>{copy.brief.needsYou(summary.needsYou)}</span>
                )}
                {summary.asHim > 0 && (
                  <span className={styles.countAsHim}>{copy.brief.asHim(summary.asHim)}</span>
                )}
                {summary.broken > 0 && (
                  <span className={styles.countBroken}>{copy.brief.broken(summary.broken)}</span>
                )}
                {summary.total > 0 && (
                  <span className={styles.count}>{copy.brief.read(summary.read, summary.total)}</span>
                )}
              </span>
            )}
            <span className={styles.actions}>
              <button
                type="button"
                className={styles.button}
                data-kind="primary"
                onClick={() => start()}
                disabled={streaming}
              >
                {state.runId ? copy.brief.again : copy.brief.start}
              </button>
              <button type="button" className={styles.button} onClick={stop} disabled={!streaming}>
                {copy.brief.stop}
              </button>
            </span>
          </header>

          <Brief state={state} onEvents={apply} />
          <Ledger state={state} onEvents={apply} />
          <Handoffs state={state} />
          <NonFindings state={state} />
        </main>

        <aside className={styles.side}>
          <Ceiling state={state} />
          <Envelope state={state} />
          <Taper state={state} onEvents={apply} />
          <Access state={state} />
        </aside>
      </div>

      {process.env.NEXT_PUBLIC_HIDE_DEV_CHROME !== '1' && (
        <FaultBar
          options={WORK_FAULTS}
          streaming={streaming}
          onReplay={({ faults, speed, seed }) => start({ faults, speed, seed })}
        />
      )}
    </>
  );
}
