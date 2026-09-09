'use client';

/**
 * The state gallery for coding. Every case in lib/scripts/coding.ts, collected
 * instantly through the runtime (`speed: 0`) and rendered with the real components,
 * with no styling beyond the tokens they already carry.
 *
 * This exists because you cannot design states you can't see simultaneously. In a
 * normal product the edge cases are variants of a screen; here they are most of the
 * product, and the only way to give them proportionate attention is to put them
 * side by side before falling in love with the happy path.
 *
 * It is also a coverage check: a state in projects/coding/states.md with no row
 * here is a state nobody has designed.
 */
import { useEffect, useState } from 'react';
import { codingCases } from '@/lib/scripts/coding';
import { collectRun } from '@/lib/agent-runtime';
import { initialRunState, orientation, reduceAll, type RunState } from '@/lib/surfaces/coding/reducer';
import { PlanView } from '@/components/surfaces/coding/PlanView';
import { Waterfall } from '@/components/surfaces/coding/Waterfall';
import {
  Asks,
  Changes,
  Checkpoints,
  Divergence,
  Errors,
  NonFindings,
} from '@/components/surfaces/coding/Panels';
import styles from './gallery.module.css';

const noop = () => {};

export default function CodingGallery() {
  const [states, setStates] = useState<Record<string, RunState>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const collected: Record<string, RunState> = {};
      for (const testCase of codingCases) {
        // speed: 0 — the whole run, instantly, deterministically.
        const events = await collectRun(testCase.script, { seed: 1, faults: testCase.faults });
        collected[testCase.id] = reduceAll(initialRunState, events);
      }
      if (!cancelled) setStates(collected);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.gallery} data-product="coding">
      <header className={styles.head}>
        <h1 className={styles.title}>coding — every state, one page</h1>
        <p className={styles.lede}>
          {codingCases.length} cases from <code>lib/scripts/coding.ts</code>, folded through the real
          reducer and rendered with the real components. Unstyled beyond tokens on purpose. The state
          names match <code>projects/coding/states.md</code>.
        </p>
      </header>

      {codingCases.map((testCase) => {
        const state = states[testCase.id];
        const orient = state ? orientation(state) : null;
        return (
          <section className={styles.case} key={testCase.id} aria-labelledby={`case-${testCase.id}`}>
            <div className={styles.caseHead}>
              <h2 className={styles.caseTitle} id={`case-${testCase.id}`}>
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
                <p className={styles.orientLine} data-worry={orient?.worry}>
                  {orient?.worry === 'now' ? 'needs you' : orient?.worry === 'soon' ? 'worth a look' : 'fine'} —{' '}
                  {orient?.where}
                </p>
                <Errors state={state} />
                <Asks state={state} onAnswer={noop} />
                <Divergence state={state} />
                <PlanView state={state} />
                <Checkpoints state={state} onAct={noop} />
                <Changes state={state} />
                <NonFindings state={state} />
                <Waterfall sample={state.latency} distribution={state.latencyDistribution} />
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
