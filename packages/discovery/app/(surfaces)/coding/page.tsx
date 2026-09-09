'use client';

/**
 * Coding Agents — the run supervision surface.
 *
 * Layout follows the brief's three surfaces: the plan (left, bold), and the
 * instruments (right, quiet). Nothing here calls a real API; everything is folded
 * from the SSE stream in app/api/agent/route.ts, which is playing a script from
 * grammar/agent-runtime.ts. The fault bar at the bottom is how failure states get
 * designed at all.
 */
import { useEffect } from 'react';
import { useAgentStream } from '@/lib/grammar/useAgentStream';
import { FaultBar } from '@/components/dev/FaultBar';
import { initialRunState, reduceAll } from '@/lib/surfaces/coding/reducer';
import { PlanView } from '@/components/surfaces/coding/PlanView';
import { RunHeader } from '@/components/surfaces/coding/RunHeader';
import { Steering } from '@/components/surfaces/coding/Steering';
import { Waterfall } from '@/components/surfaces/coding/Waterfall';
import {
  Asks,
  Changes,
  Checkpoints,
  Divergence,
  EnvelopePanel,
  Errors,
  NonFindings,
  StandingSpec,
} from '@/components/surfaces/coding/Panels';
import styles from '@/components/surfaces/coding/coding.module.css';

export default function CodingSurface() {
  const { state, status, start, stop, apply } = useAgentStream({
    script: 'codingRun',
    initial: initialRunState,
    reduceAll,
  });
  const streaming = status === 'streaming';

  // Never on mount: a run is an explicit action, so the surface can be opened cold
  // (which is the forty-minute-return case) without a stream starting behind it.
  useEffect(() => stop, [stop]);

  return (
    <>
      <div className={styles.surface}>
        <div className={styles.column}>
          <RunHeader
            state={state}
            streaming={streaming}
            onStart={() => start({ speed: 1 })}
            onStop={stop}
          />
          <Errors state={state} />
          <Asks state={state} onAnswer={apply} />
          <Divergence state={state} />
          <PlanView state={state} />
          <Waterfall sample={state.latency} distribution={state.latencyDistribution} />
        </div>

        <div className={styles.column}>
          <Steering state={state} onApply={apply} />
          <Checkpoints state={state} onAct={apply} />
          <Changes state={state} />
          <NonFindings state={state} />
          <EnvelopePanel state={state} onChange={apply} />
          <StandingSpec state={state} />
        </div>
      </div>

      {/* The toolbar is a design tool, but docs/build-workflow.md §4 also calls it the
          demo — handing someone the faults and letting them break the interface. So it
          ships by default and hides behind NEXT_PUBLIC_HIDE_DEV_CHROME for a user test
          where a participant poking at it would contaminate the session. */}
      {process.env.NEXT_PUBLIC_HIDE_DEV_CHROME !== '1' && (
        <FaultBar
          streaming={streaming}
          onReplay={({ faults, speed, seed }) => start({ faults, speed, seed })}
        />
      )}
    </>
  );
}
