'use client';

/**
 * The state gallery for content. Every case in lib/scripts/content.ts, with the
 * variant each case is about already open — the evidence lives inside a variant, so
 * a gallery of closed rows would hide most of the state space.
 */
import { useEffect, useState } from 'react';
import { collectRun } from '@/lib/agent-runtime';
import { contentCases } from '@/lib/scripts/content';
import {
  initialContentState,
  reduceAllContent,
  shape,
  type ContentState,
} from '@/lib/surfaces/content/reducer';
import { Board } from '@/components/surfaces/content/Board';
import { Mirror } from '@/components/surfaces/content/Mirror';
import {
  ClauseDropped,
  ConsentPanel,
  Errors,
  NonFindings,
  Pronunciation,
  SubtitleProof,
  TermViolations,
  TimingFlags,
  VoiceDrift,
} from '@/components/surfaces/content/Panels';
import { Timeline } from '@/components/surfaces/content/Timeline';
import styles from '../coding/gallery.module.css';

const SOURCE_TEXT = 'Cashless treatment at a network hospital, with no paperwork.';
const noop = () => {};

/** The variant each case is really about. */
const FOCUS: Record<string, string> = {
  clean: 'ta-IN',
  'clause-dropped': 'te-IN',
  pronunciation: 'ml-IN',
  'voice-drift': 'bn-IN',
  timing: 'ml-IN',
  'consent-missing': 'ta-IN',
  'consent-expired': 'ta-IN',
  typography: 'ml-IN',
  'review-timeout': 'ta-IN',
  unsupported: 'ta-IN',
  'drift-planted': 'ta-IN',
  everything: 'ta-IN',
};

export default function ContentGallery() {
  const [states, setStates] = useState<Record<string, ContentState>>({});
  const [open, setOpen] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const collected: Record<string, ContentState> = {};
      for (const testCase of contentCases) {
        const events = await collectRun(testCase.script, { seed: 1, faults: testCase.faults });
        collected[testCase.id] = reduceAllContent(initialContentState, events);
      }
      if (!cancelled) setStates(collected);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.gallery} data-product="content">
      <header className={styles.head}>
        <h1 className={styles.title}>content — every state, one page</h1>
        <p className={styles.lede}>
          {contentCases.length} cases from <code>lib/scripts/content.ts</code>. State names match{' '}
          <code>projects/content/states.md</code>. Every Indic string here is synthetic and unchecked,
          and the transliterations are the part that matters —{' '}
          <code>grammar/log/2026-09-09-content-decisions.md</code>.
        </p>
      </header>

      {contentCases.map((testCase) => {
        const state = states[testCase.id];
        const openLang = open[testCase.id] ?? FOCUS[testCase.id];
        const counts = state ? shape(state) : null;
        return (
          <section className={styles.case} key={testCase.id} aria-labelledby={`c-${testCase.id}`}>
            <div className={styles.caseHead}>
              <h2 className={styles.caseTitle} id={`c-${testCase.id}`}>
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
                <p className={styles.orientLine} data-worry={counts && counts.flagged ? 'now' : 'no'}>
                  {counts?.flagged} flagged, {counts?.clean} clean, {counts?.waiting} still running
                </p>
                <Errors state={state} />
                <ConsentPanel state={state} onEvents={noop} />
                <Board
                  state={state}
                  open={openLang}
                  onOpen={(lang) => setOpen((s) => ({ ...s, [testCase.id]: lang }))}
                  expandClean={false}
                  onExpandClean={noop}
                >
                  {(variant) => (
                    <div>
                      <Mirror variant={variant} sourceText={SOURCE_TEXT} />
                      {state.job && <Timeline variant={variant} durationMs={state.job.durationMs} />}
                      <ClauseDropped variant={variant} />
                      <TermViolations variant={variant} onEvents={noop} />
                      <Pronunciation variant={variant} />
                      <VoiceDrift variant={variant} />
                      <TimingFlags variant={variant} />
                      <SubtitleProof variant={variant} />
                    </div>
                  )}
                </Board>
                <NonFindings state={state} />
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
