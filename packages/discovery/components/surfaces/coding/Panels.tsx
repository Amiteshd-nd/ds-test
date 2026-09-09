'use client';

/**
 * The instrumental half of the surface: asks, divergence, checkpoints, changes,
 * non-findings, the envelope, the standing spec, errors. Quiet by design — the
 * plan view is where the boldness went.
 *
 * They live in one file because each is thirty-odd lines and they're all read
 * together; splitting them would be filing, not structure. None is promoted to
 * components/grammar/ yet — that happens when a second surface needs one.
 */
import { useState } from 'react';
import { copy } from './copy';
import { changesFor, looseChanges, type Change, type RunState } from '@/lib/surfaces/coding/reducer';
import type { AgentEvent } from '@/lib/agent-runtime';
import styles from './coding.module.css';

/* ---------------------------------------------------------------------------
   Asks — the reserved attention channel
   ------------------------------------------------------------------------ */

export function Asks({ state, onAnswer }: { state: RunState; onAnswer: (events: AgentEvent[]) => void }) {
  const open = state.asks.filter((a) => !a.answer);
  const answered = state.asks.filter((a) => a.answer);
  if (!open.length && !answered.length) return null;

  return (
    <>
      {open.map((ask) => (
        <div className={styles.ask} key={ask.question} role="group" aria-label={copy.ask.permission}>
          <span className={styles.askKind}>{copy.ask.permission}</span>
          <p className={styles.askQuestion}>{ask.question}</p>
          <p className={styles.askScope}>
            {ask.blocking === 'run' ? copy.ask.blockingRun : copy.ask.blockingBranch}
          </p>
          {ask.options && (
            <div className={styles.actions}>
              {ask.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.button}
                  data-kind={option.startsWith('Allow') ? 'attention' : undefined}
                  onClick={() =>
                    onAnswer([
                      { t: 'ask.answered', nodeId: ask.nodeId, answer: option, at: Date.now() },
                      {
                        t: 'node.state',
                        nodeId: ask.nodeId,
                        state: option.startsWith('Skip') ? 'cancelled' : 'running',
                        at: Date.now(),
                      },
                    ])
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {answered.map((ask) => (
        <p className={styles.askAnswered} key={ask.question}>
          {copy.ask.answered}: {ask.answer} — {ask.question}
        </p>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Divergence — running, healthy-looking, and off the plan
   ------------------------------------------------------------------------ */

export function Divergence({ state }: { state: RunState }) {
  if (!state.divergence) return null;
  const { expected, observed, evidence } = state.divergence;
  return (
    <div className={styles.diverge} role="group" aria-label={copy.diverge.heading}>
      <span className={styles.divergeHead}>{copy.diverge.heading}</span>
      <dl className={styles.divergeGrid}>
        <dt>{copy.diverge.expected}</dt>
        <dd>{expected}</dd>
        <dt>{copy.diverge.observed}</dt>
        <dd>{observed}</dd>
        <dt>{copy.diverge.evidence}</dt>
        <dd>
          <span className={styles.fileList}>
            {evidence.map((file) => (
              <span key={file}>{file}</span>
            ))}
          </span>
        </dd>
      </dl>
      <p className={styles.divergeNote}>{copy.diverge.note}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Changes — one row per file, state carried on two channels
   ------------------------------------------------------------------------ */

function ChangeRow({ change }: { change: Change }) {
  const label = copy.changes[change.state];
  return (
    <li className={styles.change} data-state={change.state} data-speculative={String(!!change.speculative)}>
      <span className={styles.changePath}>{change.path}</span>
      <span className={styles.changeCount}>
        <span className={styles.changeAdds}>+{change.adds}</span>{' '}
        <span className={styles.changeDels}>−{change.dels}</span>
      </span>
      <span className={styles.changeState}>{label}</span>
      {change.state === 'conflicts_with_manual_edit' && (
        <span className={styles.changeNote}>
          {change.note ? `${change.note}. ` : ''}
          {copy.changes.conflictNote}
        </span>
      )}
      {change.state === 'applied_unreviewed' && (
        <span className={styles.changeNote}>{change.note ?? copy.changes.unreviewedNote}</span>
      )}
      {change.speculative && change.assumption && (
        <span className={styles.changeNote}>{copy.plan.speculativeNote}: {change.assumption}</span>
      )}
    </li>
  );
}

export function Changes({ state }: { state: RunState }) {
  const loose = looseChanges(state);
  return (
    <section className={styles.section} aria-labelledby="changes-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="changes-heading">
          {copy.changes.heading}
        </h2>
        <span className={styles.sectionAside}>{state.changes.length}</span>
      </div>
      {state.changes.length === 0 ? (
        <p className={styles.empty}>{copy.changes.empty}</p>
      ) : (
        <ul>
          {state.changes.map((change) => (
            <ChangeRow key={change.id} change={change} />
          ))}
        </ul>
      )}
      {loose.length > 0 && (
        <p className={styles.sectionAside}>
          {copy.checkpoints.loose}: {loose.length}
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Checkpoints — diffed against the previous boundary, never the origin
   ------------------------------------------------------------------------ */

export function Checkpoints({ state, onAct }: { state: RunState; onAct: (events: AgentEvent[]) => void }) {
  return (
    <section className={styles.section} aria-labelledby="cp-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="cp-heading">
          {copy.checkpoints.heading}
        </h2>
      </div>
      {state.checkpoints.length === 0 ? (
        <p className={styles.empty}>{copy.checkpoints.empty}</p>
      ) : (
        <ul>
          {state.checkpoints.map((cp) => {
            const inside = changesFor(state, cp.id);
            const adds = inside.reduce((n, c) => n + c.adds, 0);
            const dels = inside.reduce((n, c) => n + c.dels, 0);
            return (
              <li className={styles.checkpoint} data-state={cp.state} key={cp.id}>
                <div className={styles.checkpointTop}>
                  <span className={styles.checkpointLabel}>{cp.label}</span>
                  <span className={styles.checkpointState}>{copy.checkpoints[cp.state]}</span>
                </div>
                <span className={styles.checkpointNote}>
                  {copy.checkpoints.diffAgainst}: {inside.length} files, +{adds} −{dels}
                </span>
                {cp.note && <span className={styles.checkpointNote}>{cp.note}</span>}
                <div className={styles.checkpointActions}>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() =>
                      onAct(
                        inside
                          .filter((c) => c.state !== 'reverted')
                          .map((c) => ({ t: 'change.state', id: c.id, state: 'applied', at: Date.now() })),
                      )
                    }
                  >
                    {copy.checkpoints.acceptTo}
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() =>
                      onAct([
                        { t: 'checkpoint.state', id: cp.id, state: 'restored', at: Date.now() },
                        ...state.changes
                          .filter((c) => (c.checkpointId ?? '') > cp.id)
                          .map((c): AgentEvent => ({ t: 'change.state', id: c.id, state: 'reverted', at: Date.now(), note: `Rolled back to "${cp.label}"` })),
                      ])
                    }
                  >
                    {copy.checkpoints.restore}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Non-findings — same weight as a finding, boundary named
   ------------------------------------------------------------------------ */

export function NonFindings({ state }: { state: RunState }) {
  if (!state.nonfindings.length) return null;
  return (
    <section className={styles.section} aria-labelledby="nf-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="nf-heading">
          {copy.nonfinding.heading}
        </h2>
      </div>
      <ul>
        {state.nonfindings.map((nf) => (
          <li className={styles.nonfinding} key={nf.looked_for}>
            <div className={styles.nonfindingTop}>
              <span className={styles.nonfindingWhat}>{nf.looked_for}</span>
              <span className={styles.nonfindingKind}>{copy.nonfinding[nf.kind]}</span>
            </div>
            <span className={styles.nonfindingBoundary}>
              {copy.nonfinding.boundary}: {nf.boundary.corpus}
              {nf.boundary.languages ? ` (${nf.boundary.languages.join(', ')})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Delegation Envelope — the one place a raw score belongs
   ------------------------------------------------------------------------ */

export function EnvelopePanel({ state, onChange }: { state: RunState; onChange: (events: AgentEvent[]) => void }) {
  const envelope = state.envelope;
  const [floor, setFloor] = useState(envelope?.confidenceFloor ?? 0.8);
  if (!envelope) return null;

  // Consequence preview. Linear around the scripted operating point on purpose:
  // a fake curve would imply a calibration nobody has measured.
  const base = envelope.consequence ?? { autoApplied: 0, asks: 0, expectedWrong: 0 };
  const delta = (envelope.confidenceFloor - floor) * 100;
  const consequence = {
    autoApplied: Math.max(0, Math.round(base.autoApplied + delta * 1.6)),
    asks: Math.max(0, Math.round(base.asks - delta * 0.4)),
    expectedWrong: Math.max(0, Math.round((base.expectedWrong + delta * 0.35) * 10) / 10),
  };

  return (
    <section className={styles.section} aria-labelledby="env-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="env-heading">
          {copy.envelope.heading}
        </h2>
      </div>
      <div className={styles.envelope}>
        <div className={styles.envelopeLists}>
          <div>
            <p className={styles.sectionAside}>{copy.envelope.may}</p>
            <ul className={styles.envelopeList} data-kind="may">
              {envelope.may.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className={styles.sectionAside}>{copy.envelope.mustAsk}</p>
            <ul className={styles.envelopeList} data-kind="mustAsk">
              {envelope.mustAsk.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.floor}>
          <div className={styles.floorTop}>
            <label htmlFor="floor">{copy.envelope.floor}</label>
            <span className={styles.floorValue}>{floor.toFixed(2)}</span>
          </div>
          <input
            id="floor"
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={floor}
            onChange={(event) => setFloor(Number(event.target.value))}
          />
          <p className={styles.floorHelp}>{copy.envelope.floorHelp}</p>
        </div>

        <p className={styles.consequence}>
          {copy.envelope.consequence(consequence.autoApplied, consequence.asks, consequence.expectedWrong)}
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={() =>
              onChange([
                {
                  t: 'envelope',
                  at: Date.now(),
                  may: envelope.may,
                  mustAsk: envelope.mustAsk,
                  confidenceFloor: floor,
                  consequence,
                },
              ])
            }
          >
            Set this floor
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() =>
              onChange([
                { t: 'envelope', at: Date.now(), may: [], mustAsk: [...envelope.may, ...envelope.mustAsk], confidenceFloor: 0.99 },
                { t: 'run.end', runId: state.runId ?? 'run', at: Date.now(), outcome: 'cancelled' },
              ])
            }
          >
            {copy.envelope.revoke}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Standing instructions — hard and soft fail differently, so they look different
   ------------------------------------------------------------------------ */

export function StandingSpec({ state }: { state: RunState }) {
  const spec = state.spec;
  if (!spec) return null;
  return (
    <section className={styles.section} aria-labelledby="spec-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="spec-heading">
          {copy.spec.heading}
        </h2>
      </div>
      <div className={styles.specGroup}>
        <p className={styles.sectionAside}>{copy.spec.hard}</p>
        <ul className={styles.specHard}>
          {spec.hard.map((rule) => (
            <li key={rule.id}>
              <span>{rule.rule}</span>
              <span className={rule.tested ? styles.specTested : styles.specUntested}>
                {rule.tested ? copy.spec.tested : copy.spec.untested}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.specGroup}>
        <p className={styles.sectionAside}>{copy.spec.soft}</p>
        <ul className={styles.specSoft}>
          {spec.soft.map((rule) => (
            <li key={rule.id}>{rule.guidance}</li>
          ))}
        </ul>
      </div>
      {spec.examples.map((example) => (
        <div className={styles.specExample} key={example.id}>
          <span className={styles.specExampleLabel}>
            {copy.spec.examples}
            {example.pinning ? ` — ${copy.spec.pinning}` : ''}
          </span>
          <span>{example.input}</span>
          <span>{example.expected}</span>
        </div>
      ))}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Errors and capability
   ------------------------------------------------------------------------ */

export function Errors({ state }: { state: RunState }) {
  if (!state.errors.length && state.capability === 'online_full') return null;
  return (
    <>
      {state.capability !== 'online_full' && (
        <p className={styles.capability}>
          {state.capability === 'edge_only'
            ? 'Network dropped. Reading and planning still work; nothing will be written.'
            : 'Offline. Everything queued.'}
        </p>
      )}
      {state.errors.map((error) => {
        return (
          <div className={styles.error} key={error.message} role="group">
            <span className={styles.errorKind}>{copy.errors.kind[error.kind] ?? error.kind}</span>
            <span className={styles.errorMessage}>{error.message}</span>
            <span className={styles.errorRetry}>
              {error.retryable
                ? error.retryAfterMs
                  ? copy.errors.retryIn(Math.round(error.retryAfterMs / 1000))
                  : copy.errors.retryable
                : copy.errors.notRetryable}
            </span>
          </div>
        );
      })}
    </>
  );
}
