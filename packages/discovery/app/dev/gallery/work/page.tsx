'use client';

/** The state gallery for work. Every case in lib/scripts/work.ts, side by side. */
import { useEffect, useState } from 'react';
import { collectRun } from '@/lib/agent-runtime';
import { workCases } from '@/lib/scripts/work';
import { briefSummary, initialWorkState, reduceAllWork, type WorkState } from '@/lib/surfaces/work/reducer';
import { Ledger } from '@/components/surfaces/work/Ledger';
import { Access, Brief, Ceiling, Handoffs, NonFindings, Taper } from '@/components/surfaces/work/Panels';
import styles from '../coding/gallery.module.css';

const noop = () => {};

export default function WorkGallery() {
  const [states, setStates] = useState<Record<string, WorkState>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const collected: Record<string, WorkState> = {};
      for (const testCase of workCases) {
        const events = await collectRun(testCase.script, { seed: 1, faults: testCase.faults });
        collected[testCase.id] = reduceAllWork(initialWorkState, events);
      }
      if (!cancelled) setStates(collected);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.gallery} data-product="work">
      <header className={styles.head}>
        <h1 className={styles.title}>work — every state, one page</h1>
        <p className={styles.lede}>
          {workCases.length} cases from <code>lib/scripts/work.ts</code>. State names match{' '}
          <code>projects/work/states.md</code>. Everything in these ledgers was done in his name.
        </p>
      </header>

      {workCases.map((testCase) => {
        const state = states[testCase.id];
        const summary = state ? briefSummary(state) : null;
        return (
          <section className={styles.case} key={testCase.id} aria-labelledby={`w-${testCase.id}`}>
            <div className={styles.caseHead}>
              <h2 className={styles.caseTitle} id={`w-${testCase.id}`}>
                {testCase.state}
              </h2>
              <span className={styles.caseId}>{testCase.id}</span>
              <span className={styles.caseFaults}>
                {testCase.faults.length ? testCase.faults.join(' + ') : 'no faults'}
              </span>
            </div>
            <p className={styles.caseShows}>{testCase.shows}</p>

            {!state ? (
              <p className={styles.pending}>collecting…</p>
            ) : (
              <div className={styles.caseBody}>
                <p className={styles.orientLine} data-worry={summary && summary.needsYou ? 'now' : 'no'}>
                  {summary?.did} done, {summary?.needsYou} need you, {summary?.asHim} in your name,{' '}
                  {summary?.broken} half-finished
                </p>
                <Ceiling state={state} />
                <Brief state={state} onEvents={noop} />
                <Ledger state={state} onEvents={noop} />
                <Taper state={state} onEvents={noop} />
                <Access state={state} />
                <Handoffs state={state} />
                <NonFindings state={state} />
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
