'use client';

/**
 * Voice Agents — the flagship. Spec on the left, evidence on the right, and the
 * product is the loop between them.
 */
import { useEffect, useState } from 'react';
import { FaultBar, VOICE_FAULTS } from '@/components/dev/FaultBar';
import { copy } from '@/components/surfaces/voice/copy';
import { Behaviours, Production, Settings, Tools, Variables } from '@/components/surfaces/voice/Agent';
import { Dirty, Fleet, Gate, Latency, Spec } from '@/components/surfaces/voice/Panels';
import { Sweep } from '@/components/surfaces/voice/Sweep';
import { useAgentStream } from '@/lib/grammar/useAgentStream';
import { initialVoiceState, reduceAllVoice } from '@/lib/surfaces/voice/reducer';
import styles from '@/components/surfaces/voice/voice.module.css';

export default function VoiceSurface() {
  const { state, status, start, stop, apply } = useAgentStream({
    script: 'voiceAuthoring',
    initial: initialVoiceState,
    reduceAll: reduceAllVoice,
  });
  const [openCluster, setOpenCluster] = useState('');
  const streaming = status === 'streaming';

  useEffect(() => stop, [stop]);

  return (
    <>
      <div className={styles.surface}>
        <aside className={styles.spec}>
          <Spec state={state} />
          <Tools state={state} />
          <Variables state={state} />
          <Settings state={state} />
          <Dirty state={state} />
        </aside>

        <main className={styles.evidence}>
          <div className={styles.head}>
            <h1 className={styles.headTitle}>{copy.head.sweep}</h1>
            <span className={styles.actions}>
              <button
                type="button"
                className={styles.button}
                data-kind="primary"
                onClick={() => {
                  setOpenCluster('');
                  start();
                }}
                disabled={streaming}
              >
                {state.outcomes ? copy.head.again : copy.head.start}
              </button>
              <button type="button" className={styles.button} onClick={stop} disabled={!streaming}>
                {copy.head.stop}
              </button>
            </span>
          </div>

          <Dirty state={state} />
          <Sweep state={state} openCluster={openCluster} onOpenCluster={setOpenCluster} />
          {/* The second way in: from an assertion that failed, down to the calls. */}
          <Behaviours state={state} onOpenCluster={setOpenCluster} />
          <Production state={state} />
          <Gate state={state} onEvents={apply} />
          <Latency state={state} />
          <Fleet state={state} />
        </main>
      </div>

      {process.env.NEXT_PUBLIC_HIDE_DEV_CHROME !== '1' && (
        <FaultBar
          options={VOICE_FAULTS}
          streaming={streaming}
          onReplay={({ faults, speed, seed }) => {
            setOpenCluster('');
            start({ faults, speed, seed });
          }}
        />
      )}
    </>
  );
}
