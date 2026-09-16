'use client';

/**
 * The spec editor (left), and the gate, fleet and latency (right).
 *
 * - **`Spec`** — hard rules and soft guidance are structurally different, not
 *   differently coloured: different container, different weight, different position.
 *   An untested hard rule is marked in the hazard channel, because a rule nothing
 *   exercised is being trusted rather than known.
 * - **`Dirty`** — the staleness notice sits *with* the spec and again with the
 *   evidence, because the failure mode is reading a sweep that describes a different
 *   agent than the one she is about to deploy.
 * - **`Gate`** — by decision it does not block on an untested rule; it caps the
 *   first calls. The only hard block is having no evidence, or evidence that
 *   describes a different agent.
 */
import { copy } from './copy';
import type { AgentEvent } from '@/lib/agent-runtime';
import { gate, type VoiceState } from '@/lib/surfaces/voice/reducer';
import styles from './voice.module.css';

export function Spec({ state }: { state: VoiceState }) {
  if (!state.hard.length && !state.soft.length) return <p className={styles.empty}>No spec yet.</p>;
  const untested = new Set(state.untested.map((u) => u.lineId));

  return (
    <>
      <div className={styles.head}>
        <h2 className={styles.headTitle}>{copy.head.spec}</h2>
        {state.specId && <span className={styles.headAside}>{state.specId}</span>}
      </div>

      <div className={styles.specGroup}>
        <span className={styles.specLabel}>{copy.spec.hard}</span>
        <div className={styles.hardList}>
          {state.hard.map((line) => (
            <span className={styles.hard} key={line.id}>
              {line.text}
              <span className={untested.has(line.id) || line.tested === false ? styles.specUntested : styles.specTested}>
                {untested.has(line.id) || line.tested === false ? copy.spec.untested : copy.spec.tested}
              </span>
            </span>
          ))}
        </div>
        {state.untested.length > 0 && <span className={styles.note}>{copy.spec.untestedNote}</span>}
      </div>

      <div className={styles.specGroup}>
        <span className={styles.specLabel}>{copy.spec.soft}</span>
        {state.soft.map((line) => (
          <span className={styles.soft} key={line.id}>
            {line.text}
          </span>
        ))}
      </div>

      <div className={styles.specGroup}>
        <span className={styles.specLabel}>{copy.spec.examples}</span>
        {state.examples.map((example) => (
          <span className={styles.example} key={example.id}>
            <span>{example.input}</span>
            <span className={styles.note}>{example.expected}</span>
            {example.pinning && <span className={styles.examplePinned}>{copy.spec.pinned}</span>}
          </span>
        ))}
      </div>

      {state.contradictions.map((c) => (
        <p className={styles.gateBlocked} key={`${c.specLineId}-${c.exampleId}`}>
          {copy.spec.contradiction}: {c.note}
        </p>
      ))}
    </>
  );
}

export function Dirty({ state }: { state: VoiceState }) {
  if (!state.dirty) return null;
  return (
    <div className={styles.dirty}>
      <span className={styles.dirtyHead}>{copy.spec.dirty}</span>
      <span className={styles.note}>{copy.spec.dirtyNote(state.dirty.editedLines.join(' and '))}</span>
    </div>
  );
}

export function Gate({
  state,
  onEvents,
}: {
  state: VoiceState;
  onEvents: (events: AgentEvent[]) => void;
}) {
  const g = gate(state);
  const deployment = state.deployment;

  return (
    <section className={styles.gate} aria-labelledby="gate">
      <h2 className={styles.gateHead} id="gate">
        {copy.gate.heading}
      </h2>
      {/* Friction proportional to the consequence, and of a different kind from
          everything around it: this is the only double border in the surface. */}
      <p className={styles.gateConsequence}>{copy.gate.consequence}</p>

      {g.blocked && (
        <p className={styles.gateBlocked}>
          {copy.gate.blocked}. {g.blockedReason}
        </p>
      )}

      {!g.blocked && !g.live && (
        <>
          <span className={styles.specLabel}>{copy.gate.capHeading}</span>
          <p className={styles.gateCap}>{copy.gate.capBody(g.proposedCap, g.untestedHard)}</p>
          {/* The product's own throttles, named — the cap is our addition and says so. */}
          <p className={styles.note}>
            {copy.gate.throttles}: {copy.gate.cps(3)}, {copy.gate.window('10:00', '19:00')},{' '}
            {copy.gate.retries}.
          </p>
          <p className={styles.note}>{copy.gate.capIsOurs}</p>
        </>
      )}

      {deployment.state === 'number_pending' && <p className={styles.note}>{copy.gate.pending}</p>}

      {g.live && (
        <p className={styles.gateLive}>
          {deployment.callCap
            ? copy.gate.liveWithCap(deployment.capUsed ?? 0, deployment.callCap)
            : copy.gate.live}
          {deployment.number ? ` — ${deployment.number}` : ''}
        </p>
      )}

      {deployment.state === 'live_diverging' && (
        <>
          <p className={styles.gateDiverging}>{copy.gate.diverging}</p>
          {state.liveSignals.map((signal) => (
            <p className={styles.note} key={signal.detail}>
              {signal.detail}
            </p>
          ))}
        </>
      )}

      <div className={styles.actions}>
        {!g.live ? (
          <>
            <button
              type="button"
              className={styles.button}
              disabled={g.blocked || deployment.state === 'number_pending'}
              onClick={() =>
                onEvents([{ t: 'deployment', state: 'number_pending' }])
              }
            >
              {copy.gate.rent}
            </button>
            <button
              type="button"
              className={styles.button}
              data-kind="primary"
              disabled={g.blocked || deployment.state !== 'number_pending'}
              onClick={() =>
                onEvents([
                  {
                    t: 'deployment',
                    state: 'live',
                    number: '+91 80 4718 2200',
                    callCap: g.proposedCap,
                    capUsed: 0,
                  },
                ])
              }
            >
              {copy.gate.goLive(g.proposedCap)}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.button}
            onClick={() => onEvents([{ t: 'deployment', state: 'paused' }])}
          >
            {copy.gate.pause}
          </button>
        )}
      </div>
    </section>
  );
}

export function Fleet({ state }: { state: VoiceState }) {
  if (!state.handoffs.length && !state.memoryConflicts.length) return null;
  return (
    <section aria-labelledby="fleet">
      <div className={styles.head}>
        <h2 className={styles.headTitle} id="fleet">
          {copy.fleet.heading}
        </h2>
      </div>
      {state.handoffs.map((handoff) => (
        <div className={styles.handoff} key={`${handoff.from}-${handoff.to}`}>
          <span className={styles.seam}>
            {handoff.from} → {handoff.to}
          </span>
          <span>
            {copy.fleet.carried}: {handoff.carried.join(', ')}
          </span>
          {handoff.dropped.length > 0 && (
            <span className={styles.dropped}>
              {copy.fleet.dropped}: {handoff.dropped.join(', ')}
            </span>
          )}
          {handoff.inferred.length > 0 && (
            <span className={styles.note}>
              {copy.fleet.inferred}: {handoff.inferred.join(', ')}
            </span>
          )}
        </div>
      ))}
      {state.memoryConflicts.map((conflict) => (
        <div className={styles.handoff} key={conflict.key}>
          <span className={styles.dropped}>
            {copy.fleet.conflict}: {conflict.key}
          </span>
          <span>
            {conflict.writers.join(' / ')} — {conflict.values.join(' / ')}
          </span>
        </div>
      ))}
    </section>
  );
}

export function Latency({ state }: { state: VoiceState }) {
  if (!state.latency) return null;
  return (
    <section aria-labelledby="lat">
      <div className={styles.head}>
        <h2 className={styles.headTitle} id="lat">
          {copy.latency.heading}
        </h2>
      </div>
      <div className={styles.latencyRow}>
        <span className={styles.latencyItem}>
          <span className={styles.latencyLabel}>{copy.latency.ttft}</span>
          <span className={styles.latencyValue}>{state.latency.ttftMs}ms</span>
        </span>
        <span className={styles.latencyItem}>
          <span className={styles.latencyLabel}>{copy.latency.total}</span>
          <span className={styles.latencyValue}>{(state.latency.totalMs / 1000).toFixed(2)}s</span>
        </span>
        {state.latencyDistribution && (
          <>
            <span className={styles.latencyItem}>
              <span className={styles.latencyLabel}>{copy.latency.ttft} p95</span>
              <span className={styles.latencyValue}>{state.latencyDistribution.ttft.p95}ms</span>
            </span>
            <span className={styles.latencyItem}>
              <span className={styles.latencyLabel}>{copy.latency.total} p95</span>
              <span className={styles.latencyValue}>
                {(state.latencyDistribution.total.p95 / 1000).toFixed(2)}s
              </span>
            </span>
          </>
        )}
      </div>
      {state.latencyDistribution?.source === 'placeholder' && (
        <p className={styles.note}>{copy.latency.placeholder}</p>
      )}
    </section>
  );
}
