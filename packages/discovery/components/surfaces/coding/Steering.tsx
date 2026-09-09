'use client';

/**
 * Steering — the project. "Actually, use the other library" at minute twelve, with
 * eighteen files already edited.
 *
 * The pattern (Repair Loop, #2) says: never discard the whole turn, repair the part
 * that's wrong and keep the frame. Applied to a run in flight that means the
 * preview is not a nicety — it is the design. He is agreeing to *what gets
 * discarded*, so that list exists before the commit and the commit restates it.
 *
 * What's kept versus discarded is decided by which boundary the work sits behind:
 * anything inside a clean checkpoint survives a redirect, anything still loose or
 * provisional is what a redirect costs. That's a rule a person can predict, which
 * matters more than a cleverer rule they can't.
 */
import { useMemo, useState } from 'react';
import { copy } from './copy';
import { looseChanges, type RunState } from '@/lib/surfaces/coding/reducer';
import type { AgentEvent } from '@/lib/agent-runtime';
import styles from './coding.module.css';

function previewFor(state: RunState, instruction: string) {
  const settled = state.changes.filter((c) => {
    const boundary = state.checkpoints.find((cp) => cp.id === c.checkpointId);
    return boundary?.state === 'clean' && c.state !== 'proposed';
  });
  const loose = looseChanges(state);
  const provisional = state.changes.filter((c) => c.speculative || c.state === 'proposed');

  const discarded = Array.from(new Set(provisional.map((c) => c.path)));
  const requeued = Array.from(new Set(loose.map((c) => c.path))).filter((p) => !discarded.includes(p));
  const kept = Array.from(new Set(settled.map((c) => c.path))).filter(
    (p) => !discarded.includes(p) && !requeued.includes(p),
  );

  return { instruction, kept, discarded, requeued };
}

export function Steering({
  state,
  onApply,
}: {
  state: RunState;
  onApply: (events: AgentEvent[]) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const preview = useMemo(() => previewFor(state, instruction), [state, instruction]);
  const applied = state.steering.filter((s) => s.applied);

  const steerable = state.nodes.some(
    (n) => n.state === 'running' || n.state === 'speculative' || n.state === 'queued',
  );

  return (
    <section className={styles.section} aria-labelledby="steer-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="steer-heading">
          {copy.steer.heading}
        </h2>
      </div>

      {applied.map((s) => (
        <div className={styles.steer} key={s.instruction}>
          <p className={styles.sectionAside}>{copy.steer.applied}</p>
          <p>{s.instruction}</p>
          <div className={styles.steerPreview}>
            <div className={styles.steerCol} data-kind="kept">
              <span className={styles.steerColHead}>{copy.steer.kept}</span>
              <ul>{s.kept.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <div className={styles.steerCol} data-kind="discarded">
              <span className={styles.steerColHead}>{copy.steer.discarded}</span>
              <ul>{s.discarded.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
            <div className={styles.steerCol} data-kind="requeued">
              <span className={styles.steerColHead}>{copy.steer.requeued}</span>
              <ul>{s.requeued.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          </div>
        </div>
      ))}

      {!steerable ? (
        <p className={styles.empty}>{copy.steer.empty}</p>
      ) : (
        <div className={styles.steer}>
          <textarea
            className={styles.steerInput}
            rows={2}
            value={instruction}
            placeholder={copy.steer.placeholder}
            aria-label={copy.steer.heading}
            onChange={(event) => {
              setInstruction(event.target.value);
              setPreviewing(event.target.value.trim().length > 0);
            }}
          />

          {previewing && (
            <>
              <p className={styles.sectionAside}>{copy.steer.preview}</p>
              <div className={styles.steerPreview}>
                <div className={styles.steerCol} data-kind="kept">
                  <span className={styles.steerColHead}>
                    {copy.steer.kept} ({preview.kept.length})
                  </span>
                  <ul>{preview.kept.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
                <div className={styles.steerCol} data-kind="discarded">
                  <span className={styles.steerColHead}>
                    {copy.steer.discarded} ({preview.discarded.length})
                  </span>
                  <ul>{preview.discarded.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
                <div className={styles.steerCol} data-kind="requeued">
                  <span className={styles.steerColHead}>
                    {copy.steer.requeued} ({preview.requeued.length})
                  </span>
                  <ul>{preview.requeued.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.button}
                  data-kind="primary"
                  onClick={() => {
                    // Local application: the person's own action folds through the
                    // same reducer as anything the stream sends.
                    onApply([
                      { t: 'steering.applied', at: Date.now(), ...preview },
                      ...preview.discarded.map(
                        (path): AgentEvent => {
                          const change = state.changes.find((c) => c.path === path);
                          return {
                            t: 'change.state',
                            id: change?.id ?? path,
                            state: 'reverted',
                            at: Date.now(),
                            note: 'Discarded by a change of direction',
                          };
                        },
                      ),
                    ]);
                    setInstruction('');
                    setPreviewing(false);
                  }}
                >
                  {copy.steer.apply}
                </button>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => {
                    setInstruction('');
                    setPreviewing(false);
                  }}
                >
                  {copy.steer.cancel}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
