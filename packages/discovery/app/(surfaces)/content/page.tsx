'use client';

/**
 * Content Agents — the multi-language review board.
 *
 * The source sits fixed at the top because every variant is a claim about it. Below,
 * nine variants ranked by suspicion, clean ones folded to one line. Opening one
 * shows the evidence: the mirror first (it's the only way she can see meaning move),
 * then the timeline, then the flags in the order the reducer ranks them.
 *
 * Nothing plays. That's stated on the surface rather than implied by a dead button.
 */
import { useEffect, useState } from 'react';
import { CONTENT_FAULTS, FaultBar } from '@/components/dev/FaultBar';
import { Board } from '@/components/surfaces/content/Board';
import { copy } from '@/components/surfaces/content/copy';
import { Mirror } from '@/components/surfaces/content/Mirror';
import {
  ApproveVariant,
  ClauseDropped,
  ConsentPanel,
  Errors,
  Escalation,
  NonFindings,
  Pronunciation,
  PublishGate,
  SubtitleProof,
  TermViolations,
  TimingFlags,
  VoiceDrift,
} from '@/components/surfaces/content/Panels';
import { Timeline } from '@/components/surfaces/content/Timeline';
import { useAgentStream } from '@/lib/grammar/useAgentStream';
import { initialContentState, reduceAllContent, shape } from '@/lib/surfaces/content/reducer';
import styles from '@/components/surfaces/content/content.module.css';

/** The source line the whole job is a claim about. */
const SOURCE_TEXT = 'Cashless treatment at a network hospital, with no paperwork.';

export default function ContentSurface() {
  const { state, status, start, stop, apply } = useAgentStream({
    script: 'dubJob',
    initial: initialContentState,
    reduceAll: reduceAllContent,
  });
  const [open, setOpen] = useState('');
  const [expandClean, setExpandClean] = useState(false);
  const [segment, setSegment] = useState<number | undefined>();
  const streaming = status === 'streaming';
  const counts = shape(state);

  useEffect(() => stop, [stop]);

  return (
    <>
      <div className={styles.surface}>
        <header className={styles.sourceBar}>
          <div>
            <p className={styles.sourceText}>{SOURCE_TEXT}</p>
            <p className={styles.sourceMeta}>
              {state.job && <span>{copy.head.duration(state.job.durationMs)}</span>}
              {counts.total > 0 && <span>{copy.head.languages(counts.total)}</span>}
              {counts.flagged > 0 && <em>{copy.head.flagged(counts.flagged)}</em>}
              {counts.clean > 0 && <span>{copy.head.clean(counts.clean)}</span>}
              {counts.waiting > 0 && <span>{copy.head.waiting(counts.waiting)}</span>}
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              data-kind="primary"
              onClick={() => start()}
              disabled={streaming}
            >
              {state.runId ? copy.head.again : copy.head.start}
            </button>
            <button type="button" className={styles.button} onClick={stop} disabled={!streaming}>
              {copy.head.stop}
            </button>
          </div>
        </header>

        <div className={styles.body}>
          <main className={styles.main}>
            <Errors state={state} />
            <Board
              state={state}
              open={open}
              onOpen={(lang) => {
                setOpen(lang);
                setSegment(undefined);
              }}
              expandClean={expandClean}
              onExpandClean={setExpandClean}
            >
              {(variant) => (
                <div className={styles.section}>
                  {/* The mirror comes first: it is the only mechanism by which she
                      can see that a fluent dub says something else. */}
                  <Mirror variant={variant} sourceText={SOURCE_TEXT} />
                  {state.job && (
                    <Timeline
                      variant={variant}
                      durationMs={state.job.durationMs}
                      selectedSegment={segment}
                      onSelectSegment={setSegment}
                    />
                  )}
                  <ClauseDropped variant={variant} />
                  <TermViolations variant={variant} onEvents={apply} />
                  <Pronunciation variant={variant} />
                  <VoiceDrift variant={variant} />
                  <TimingFlags variant={variant} />
                  <SubtitleProof variant={variant} />
                  <Escalation variant={variant} onEvents={apply} />
                  <ApproveVariant variant={variant} onEvents={apply} />
                </div>
              )}
            </Board>
          </main>

          <aside className={styles.side}>
            <ConsentPanel state={state} onEvents={apply} />
            <PublishGate state={state} onEvents={apply} onOpen={setOpen} />
            <NonFindings state={state} />
          </aside>
        </div>
      </div>

      {process.env.NEXT_PUBLIC_HIDE_DEV_CHROME !== '1' && (
        <FaultBar
          options={CONTENT_FAULTS}
          streaming={streaming}
          onReplay={({ faults, speed, seed }) => {
            setOpen('');
            start({ faults, speed, seed });
          }}
        />
      )}
    </>
  );
}
