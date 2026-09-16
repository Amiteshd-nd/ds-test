'use client';

/** The state gallery for voice. Every case, with the traced cluster already open. */
import { useEffect, useState } from 'react';
import { collectRun } from '@/lib/agent-runtime';
import { voiceCases } from '@/lib/scripts/voice';
import { gate, initialVoiceState, reduceAllVoice, regressions, type VoiceState } from '@/lib/surfaces/voice/reducer';
import { Behaviours, Production, Settings, Tools, Variables } from '@/components/surfaces/voice/Agent';
import { Dirty, Fleet, Gate, Latency, Spec } from '@/components/surfaces/voice/Panels';
import { Sweep } from '@/components/surfaces/voice/Sweep';
import styles from '../coding/gallery.module.css';

const noop = () => {};

export default function VoiceGallery() {
  const [states, setStates] = useState<Record<string, VoiceState>>({});
  const [open, setOpen] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const collected: Record<string, VoiceState> = {};
      for (const testCase of voiceCases) {
        const events = await collectRun(testCase.script, { seed: 1, faults: testCase.faults });
        collected[testCase.id] = reduceAllVoice(initialVoiceState, events);
      }
      if (!cancelled) setStates(collected);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.gallery} data-product="voice">
      <header className={styles.head}>
        <h1 className={styles.title}>voice — every state, one page</h1>
        <p className={styles.lede}>
          {voiceCases.length} cases from <code>lib/scripts/voice.ts</code>. State names match{' '}
          <code>projects/voice/states.md</code>. Hindi and Marathi transcripts are synthetic and
          unchecked; the timings are placeholders and say so.
        </p>
      </header>

      {voiceCases.map((testCase) => {
        const state = states[testCase.id];
        const g = state ? gate(state) : null;
        return (
          <section className={styles.case} key={testCase.id} aria-labelledby={`v-${testCase.id}`}>
            <div className={styles.caseHead}>
              <h2 className={styles.caseTitle} id={`v-${testCase.id}`}>
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
                <p className={styles.orientLine} data-worry={g?.blocked || regressions(state).length ? 'now' : 'no'}>
                  {g?.blocked ? `gate blocked — ${g.blockedReason}` : `cap ${g?.proposedCap}`} ·{' '}
                  {regressions(state).length} worse · {state.untested.length} rules untested
                </p>
                <Spec state={state} />
                <Tools state={state} />
                <Variables state={state} />
                <Settings state={state} />
                <Dirty state={state} />
                <Sweep
                  state={state}
                  openCluster={open[testCase.id] ?? state.clusters[0]?.id}
                  onOpenCluster={(id) => setOpen((s) => ({ ...s, [testCase.id]: id }))}
                />
                <Behaviours state={state} />
                <Production state={state} />
                <Gate state={state} onEvents={noop} />
                <Latency state={state} />
                <Fleet state={state} />
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
