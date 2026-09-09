'use client';

/**
 * The plan view — this surface's one bold thing.
 *
 * Three rules from the brief drive the whole component:
 *
 * - **Readable cold.** Big labels in his vocabulary, state in words on the right,
 *   one column of spine that carries the state. No legend to learn.
 * - **Collapse success aggressively.** A run of finished steps folds to one line.
 *   Success is not information; the two steps either side of it are.
 * - **Plan revisions are events.** A revision interrupts the spine with what was
 *   added, dropped and why. Most tools render this as a diff nobody sees.
 *
 * Provisional (`speculative`) work is deliberately not a colour: dashed spine,
 * lower contrast, italic state, and the assumption printed underneath. It's the
 * work most likely to be discarded, so it should not look finished.
 */
import { useState } from 'react';
import { copy } from './copy';
import type { PlanRevision, RunState } from '@/lib/surfaces/coding/reducer';
import type { NodeState, PlanNode } from '@/lib/agent-runtime';
import styles from './coding.module.css';

/** Steps that are finished and carry nothing a person needs.
    `partially_succeeded` is deliberately not foldable — the part that didn't land
    is exactly the information a fold would hide. */
const foldable = (s: NodeState) => s === 'succeeded';

type Row =
  | { kind: 'node'; node: PlanNode }
  | { kind: 'folded'; nodes: PlanNode[] }
  | { kind: 'revision'; revision: PlanRevision };

/** Group consecutive finished steps, then splice revisions in at their sequence. */
function toRows(state: RunState, expanded: boolean): Row[] {
  const rows: Row[] = [];
  let run: PlanNode[] = [];

  const flush = () => {
    if (!run.length) return;
    // One finished step is not worth a fold; two or more are.
    if (run.length > 1 && !expanded) rows.push({ kind: 'folded', nodes: run });
    else run.forEach((node) => rows.push({ kind: 'node', node }));
    run = [];
  };

  for (const node of state.nodes) {
    if (foldable(node.state)) run.push(node);
    else {
      flush();
      rows.push({ kind: 'node', node });
    }
  }
  flush();

  // Revisions land after the work they changed, which in practice is the end of
  // the finished section — the honest place for them without faking timestamps.
  state.planRevisions.forEach((revision) => {
    const at = rows.findIndex((r) => r.kind === 'node' && !foldable(r.node.state));
    rows.splice(at < 0 ? rows.length : at, 0, { kind: 'revision', revision });
  });

  return rows;
}

function StepRow({ node, state }: { node: PlanNode; state: RunState }) {
  const progress = state.progress[node.id];
  const stream = state.text[node.id];
  const assumption = state.changes.find((c) => c.speculative && c.assumption)?.assumption;
  const label = copy.step[node.state] ?? node.state;

  return (
    <li className={styles.planRow} data-state={node.state}>
      <span className={styles.spine} aria-hidden="true" />
      <span className={styles.planLabel}>{node.label}</span>
      {/* State is in the accessible name, not implied by the treatment. */}
      <span className={styles.planState}>{label}</span>

      {progress && (
        <span className={styles.planMeta}>
          {progress.done} of {progress.total}
        </span>
      )}
      {node.state === 'speculative' && assumption && (
        <span className={styles.planMeta}>{copy.plan.speculativeNote}: {assumption}</span>
      )}
      {stream && <span className={styles.planStream}>{stream}</span>}
    </li>
  );
}

function Revision({ revision }: { revision: PlanRevision }) {
  return (
    <li className={styles.revision}>
      <span className={styles.revisionHead}>{copy.plan.revisedHeading}</span>
      <span className={styles.revisionBecause}>{revision.because}</span>
      <span className={styles.revisionLists}>
        {revision.added.length > 0 && (
          <span>
            {copy.plan.revisedAdded} <strong>{revision.added.join(', ')}</strong>
          </span>
        )}
        {revision.dropped.length > 0 && (
          <span>
            {copy.plan.revisedDropped} <strong>{revision.dropped.join(', ')}</strong>
          </span>
        )}
      </span>
    </li>
  );
}

export function PlanView({ state }: { state: RunState }) {
  const [expanded, setExpanded] = useState(false);
  const rows = toRows(state, expanded);
  const done = state.nodes.filter((n) => foldable(n.state)).length;

  return (
    <section className={styles.section} aria-labelledby="plan-heading">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="plan-heading">
          {copy.plan.heading}
        </h2>
        {state.nodes.length > 0 && (
          <span className={styles.sectionAside}>
            {done} of {state.nodes.length} done
          </span>
        )}
      </div>

      {state.nodes.length === 0 ? (
        <p className={styles.empty}>{copy.phase[state.phase]}</p>
      ) : (
        <ol className={styles.plan}>
          {rows.map((row, i) => {
            if (row.kind === 'revision') return <Revision key={`rev-${row.revision.seq}`} revision={row.revision} />;
            if (row.kind === 'folded') {
              return (
                <li className={styles.planCollapsed} key={`fold-${i}`}>
                  <span>{copy.plan.collapsed(row.nodes.length)}</span>
                  <button type="button" onClick={() => setExpanded(true)}>
                    {copy.plan.expand}
                  </button>
                </li>
              );
            }
            return <StepRow key={row.node.id} node={row.node} state={state} />;
          })}
        </ol>
      )}

      {expanded && done > 1 && (
        <button type="button" className={styles.button} onClick={() => setExpanded(false)}>
          {copy.plan.collapse}
        </button>
      )}
    </section>
  );
}
