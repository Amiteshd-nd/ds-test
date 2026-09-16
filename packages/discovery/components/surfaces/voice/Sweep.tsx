'use client';

/**
 * The Simulation Sweep — the hero, and the most novel object in the program.
 *
 * Four altitudes with a path down and a path back up:
 *
 *   1. **Shape** — how a thousand calls ended, as one bar. No pass rate: the first
 *      thing she sees is a distribution, because a number would stop her reading.
 *   2. **Clusters** — grouped by cause, named in her vocabulary, each carrying its
 *      change since the last run. Regression is computed in the reducer, not noticed.
 *   3. **Exemplar** — one call from the cluster.
 *   4. **The turn** — the exact line, with the breach marked and the spec rule that
 *      governed it. That's the Provenance Link, in a conversation.
 *
 * The caveats are content rather than footnotes, and `evidence` says plainly what a
 * thousand synthetic calls are and are not. That paragraph is the most consequential
 * writing in the surface: it is what stands between a clean sweep and a promise.
 */
import { copy } from './copy';
import {
  exemplarsFor,
  OUTCOME_ORDER,
  regressions,
  totalCalls,
  type CallOutcome,
  type Cluster,
  type VoiceState,
} from '@/lib/surfaces/voice/reducer';
import styles from './voice.module.css';

const at = (ms: number) => `${Math.floor(ms / 1000)}s`;

function Delta({ cluster }: { cluster: Cluster }) {
  const delta = cluster.deltaVsLast;
  if (delta === undefined) return null;
  const dir = delta < 0 ? 'worse' : delta > 0 ? 'better' : 'same';
  return (
    <span className={styles.delta} data-dir={dir}>
      {dir === 'same' ? copy.sweep.same : `${delta > 0 ? '+' : ''}${delta}`}
    </span>
  );
}

export function Sweep({
  state,
  openCluster,
  onOpenCluster,
}: {
  state: VoiceState;
  openCluster?: string;
  onOpenCluster: (id: string) => void;
}) {
  const total = totalCalls(state);
  const worse = regressions(state);
  const stale = !!state.dirty;

  if (!state.outcomes) {
    return (
      <p className={styles.empty}>
        {state.done !== undefined && state.runs
          ? copy.head.running(state.done, state.runs)
          : 'Nothing simulated yet.'}
      </p>
    );
  }

  const ruleFor = (id?: string) =>
    [...state.hard, ...state.soft].find((line) => line.id === id);

  return (
    <div className={`${styles.shape} ${stale ? styles.stale : ''}`}>
      {/* --- altitude 1: the shape --- */}
      <div className={styles.head}>
        <h2 className={styles.headTitle}>{copy.sweep.shape}</h2>
        <span className={styles.headAside}>
          {state.done !== undefined && state.runs && state.done < state.runs
            ? copy.sweep.partial(state.done, state.runs)
            : `${total} calls`}
        </span>
      </div>

      <div
        className={styles.bar}
        role="img"
        aria-label={OUTCOME_ORDER.map(
          (o) => `${copy.sweep.outcomes[o]}: ${state.outcomes?.[o] ?? 0}`,
        ).join(', ')}
      >
        {OUTCOME_ORDER.map((outcome) => {
          const count = state.outcomes?.[outcome] ?? 0;
          if (!count) return null;
          return (
            <span
              key={outcome}
              className={styles.slice}
              data-outcome={outcome}
              style={{ width: `${(count / total) * 100}%` }}
            />
          );
        })}
      </div>

      <div className={styles.legend}>
        {OUTCOME_ORDER.map((outcome) => {
          const count = state.outcomes?.[outcome] ?? 0;
          if (!count) return null;
          return (
            <span className={styles.legendItem} data-outcome={outcome} key={outcome}>
              <span className={styles.swatch} data-outcome={outcome} />
              {copy.sweep.outcomes[outcome]}
              <span className={styles.legendCount}>{count}</span>
            </span>
          );
        })}
      </div>

      {/* Regression is loud, and sits above the clusters rather than inside one. */}
      {worse.length > 0 && (
        <div className={styles.regressed}>
          <span className={styles.regressedHead}>{copy.sweep.regressedHeading}</span>
          {worse.map((cluster) => (
            <span key={cluster.id}>
              {cluster.cause} — {Math.abs(cluster.deltaVsLast ?? 0)} more than last time
            </span>
          ))}
          <span className={styles.note}>{copy.sweep.regressedNote}</span>
        </div>
      )}

      {/* --- altitude 2: clusters by cause --- */}
      <div className={styles.head}>
        <h3 className={styles.headTitle}>{copy.sweep.clusters}</h3>
      </div>
      <ol>
        {[...state.clusters]
          .sort((a, b) => b.count - a.count)
          .map((cluster) => {
            const rule = ruleFor(cluster.specLineId);
            const open = cluster.id === openCluster;
            return (
              <li key={cluster.id}>
                <button
                  type="button"
                  className={styles.cluster}
                  data-open={String(open)}
                  onClick={() => onOpenCluster(open ? '' : cluster.id)}
                  aria-expanded={open}
                >
                  <span className={styles.clusterCount}>{cluster.count}</span>
                  <span className={styles.clusterCause}>{cluster.cause}</span>
                  <Delta cluster={cluster} />
                  {rule ? (
                    <span className={styles.clusterTrace}>
                      {copy.sweep.tracedTo} “{rule.text}”
                    </span>
                  ) : (
                    <span className={styles.clusterUntraced}>{copy.sweep.untraceable}</span>
                  )}
                </button>

                {/* --- altitudes 3 and 4: one call, and the exact turn --- */}
                {open &&
                  exemplarsFor(state, cluster.id).map((exemplar) => (
                    <div className={styles.transcript} key={exemplar.runId}>
                      <span className={styles.specLabel}>
                        {copy.sweep.exemplar} — {exemplar.runId}
                      </span>
                      {exemplar.turns.map((turn, i) => (
                        <div
                          className={styles.turn}
                          data-breach={String(!!turn.flags?.includes('breach'))}
                          key={i}
                        >
                          <span className={styles.turnWho}>{turn.speaker}</span>
                          <span className={styles.turnAt}>{at(turn.atMs)}</span>
                          {/* lang on every node: per-script line height keys off it. */}
                          <span className={styles.turnText} lang={turn.lang}>
                            {turn.text}
                          </span>
                          {turn.flags?.includes('breach') && (
                            <span className={styles.turnFlag}>{copy.sweep.breachHere}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
              </li>
            );
          })}
      </ol>

      {/* --- what the sweep cannot tell her. Content, not a footnote. --- */}
      <div className={styles.caveats}>
        <div className={styles.evidenceNote}>
          <span className={styles.evidenceHead}>{copy.evidence.heading}</span>
          <span className={styles.note}>{copy.evidence.body}</span>
        </div>
        <span className={styles.specLabel}>{copy.sweep.caveats}</span>
        {state.caveats.map((caveat) => (
          <div className={styles.caveat} key={caveat.detail}>
            <span className={styles.caveatKind}>{caveat.kind.replace(/_/g, ' ')}</span>
            <span>{caveat.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
