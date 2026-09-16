'use client';

/**
 * The brief itself, and the side column: envelope, admin ceiling, scopes, the taper
 * ask, handoffs, non-findings.
 *
 * Two of these are the surface's argument:
 *
 * - **`EmptyBrief`** — "nothing needed you" is the highest-trust thing this product
 *   can say, and most tools waste it on a blank state. It gets a finding's weight and
 *   states what was checked, because a confident nothing is only trustworthy if you
 *   can see its boundary.
 * - **`Taper`** — earned autonomy as an ask, not a slider. The agent proposes,
 *   showing the record that earned it; he confirms. A slider he forgets to move is
 *   the failure mode the brief names, and the ask is what replaces it.
 */
import { copy } from './copy';
import type { AgentEvent } from '@/lib/agent-runtime';
import { briefSummary, lapsedScopes, type WorkState } from '@/lib/surfaces/work/reducer';
import styles from './work.module.css';

const OWNER = 'Anand M';

export function Brief({
  state,
  onEvents,
}: {
  state: WorkState;
  onEvents: (events: AgentEvent[]) => void;
}) {
  const summary = briefSummary(state);
  if (!state.brief) return null;

  if (summary.empty) {
    return (
      <div className={styles.emptyBrief}>
        <span className={styles.emptyHeading}>{copy.brief.emptyHeading}</span>
        <p className={styles.note}>{copy.brief.emptyBody}</p>
        <span className={styles.sectionAside}>{copy.brief.checked}</span>
        <span className={styles.checked}>
          {state.brief.checked.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
        {state.nonfindings.map((nf) => (
          <span className={styles.nonfindingWhere} key={nf.looked_for}>
            {nf.boundary.corpus}
            {nf.boundary.timeRange ? `, ${nf.boundary.timeRange}` : ''}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.section}>
      {state.brief.segments.map((segment) => {
        const items = state.items.filter((i) => i.segmentId === segment.id);
        if (!items.length) return null;
        return (
          <div className={styles.segment} key={segment.id}>
            <span className={styles.segmentLabel}>{segment.label}</span>
            {items.map((item) => (
              <div className={styles.item} data-needs={item.needs} data-read={String(item.read)} key={item.id}>
                <span className={styles.itemText}>{item.text}</span>
                <span className={styles.itemNeeds}>{copy.needs[item.needs]}</span>
                <span className={styles.itemSources}>
                  {item.sources.map((source) =>
                    source.available ? (
                      <span className={styles.source} key={source.id}>
                        {source.label}
                      </span>
                    ) : (
                      <span key={source.id}>
                        <span className={styles.sourceGone}>{source.label}</span>{' '}
                        <span className={styles.sourceGoneNote}>— {copy.action.sourceGone}</span>
                      </span>
                    ),
                  )}
                  {!item.read && (
                    <button
                      type="button"
                      className={styles.button}
                      data-kind="quiet"
                      onClick={() =>
                        // His action, folded through the same reducer as the agent's —
                        // a brief read in three sittings has to know where he stopped.
                        onEvents([{ t: 'brief.read', id: item.id, at: Date.now() }])
                      }
                    >
                      {copy.brief.markRead}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function Envelope({ state }: { state: WorkState }) {
  const envelope = state.envelope;
  if (!envelope) return null;
  return (
    <section className={styles.section} aria-labelledby="env">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="env">
          {copy.envelope.heading}
        </h2>
      </div>
      <div className={styles.envelope}>
        <span className={styles.sectionAside}>{copy.envelope.may}</span>
        <span className={styles.envelopeList}>
          {envelope.may.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </span>
        <span className={styles.sectionAside}>{copy.envelope.mustAsk}</span>
        <span className={styles.envelopeList} data-kind="mustAsk">
          {envelope.mustAsk.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </span>
        {envelope.consequence && (
          <p className={styles.consequence}>
            {copy.envelope.consequence(
              envelope.consequence.autoApplied,
              envelope.consequence.asks,
              envelope.consequence.expectedWrong,
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/** The admin's ceiling, drawn as a ceiling: above his control, not beside it. */
export function Ceiling({ state }: { state: WorkState }) {
  if (!state.ceiling) return null;
  return (
    <div className={styles.ceiling}>
      <span className={styles.ceilingHead}>{copy.scope.ceiling}</span>
      <span className={styles.ceilingList}>
        {state.ceiling.neverWithoutAdmin.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </span>
      <span className={styles.ceilingNote}>{copy.scope.ceilingNote}</span>
    </div>
  );
}

export function Access({ state }: { state: WorkState }) {
  const lapsed = lapsedScopes(state);
  if (!state.scopes.length && !state.breaches.length && !state.residency.length) return null;
  return (
    <section className={styles.section} aria-labelledby="scope">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="scope">
          {copy.scope.heading}
        </h2>
        {lapsed.length > 0 && <span className={styles.sectionAside}>{lapsed.length} lapsed</span>}
      </div>

      {state.scopes.map((scope) => (
        <div className={styles.scope} data-state={scope.state} key={scope.id}>
          <span>{scope.resource}</span>
          <span className={styles.scopeState}>
            {scope.state === 'granted'
              ? `${copy.scope.granted} ${scope.untilIso ?? '—'}`
              : copy.scope[scope.state]}
          </span>
          <span className={styles.scopeNote}>
            {scope.grantedFor}
            {scope.state === 'expired' ? ` — ${copy.scope.expiredNote}` : ''}
          </span>
        </div>
      ))}

      {state.access
        .filter((a) => a.sensitive)
        .map((a) => (
          <p className={styles.scopeNote} key={a.resource}>
            {copy.scope.sensitive}: {a.resource}
            {a.permitted ? '' : ' — outside its envelope'}
          </p>
        ))}

      {state.breaches.map((breach) => (
        <p className={styles.breach} key={breach.attempted}>
          {copy.scope.breach}: {breach.attempted}. Allowed: {breach.allowed}.
        </p>
      ))}

      {state.residency.map((r) => (
        <div className={styles.residency} key={r.action}>
          <span>{copy.scope.residency(r.region)}</span>
          <span>{r.action}</span>
          <span className={styles.ceilingNote}>{r.rule}</span>
        </div>
      ))}
    </section>
  );
}

export function Taper({
  state,
  onEvents,
}: {
  state: WorkState;
  onEvents: (events: AgentEvent[]) => void;
}) {
  if (!state.tapers.length) return null;
  return (
    <>
      {state.tapers.map((taper) => (
        <div className={styles.taper} key={taper.id}>
          <span className={styles.taperHead}>{copy.taper.heading}</span>
          {/* Evidence first. The ask is only reasonable because of the record. */}
          <span className={styles.taperEvidence}>
            {copy.taper.body(taper.kind, taper.evidence.clean, taper.evidence.sinceIso)}
          </span>
          <span className={styles.taperWiden}>{copy.taper.widen(taper.widenTo)}</span>
          {taper.decided ? (
            <span className={styles.taperDecided}>
              {taper.decided.accepted ? copy.taper.accepted : copy.taper.declined} — {taper.decided.by}
            </span>
          ) : (
            <>
              <span className={styles.actionRow}>
                <button
                  type="button"
                  className={styles.button}
                  data-kind="primary"
                  onClick={() =>
                    onEvents([{ t: 'taper.decided', id: taper.id, accepted: true, by: OWNER, at: Date.now() }])
                  }
                >
                  {copy.taper.accept}
                </button>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() =>
                    onEvents([{ t: 'taper.decided', id: taper.id, accepted: false, by: OWNER, at: Date.now() }])
                  }
                >
                  {copy.taper.decline}
                </button>
              </span>
              <span className={styles.taperNote}>{copy.taper.note}</span>
            </>
          )}
        </div>
      ))}
    </>
  );
}

export function Handoffs({ state }: { state: WorkState }) {
  if (!state.handoffs.length) return null;
  return (
    <section className={styles.section} aria-labelledby="handoff">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="handoff">
          {copy.handoff.heading}
        </h2>
      </div>
      {state.handoffs.map((handoff) => (
        <div className={styles.handoff} key={`${handoff.from}-${handoff.to}`}>
          <span className={styles.handoffSeam}>
            {handoff.from} → {handoff.to}
          </span>
          <span>
            {copy.handoff.carried}: {handoff.carried.join(', ')}
          </span>
          {handoff.dropped.length > 0 && (
            <span className={styles.handoffDropped}>
              {copy.handoff.dropped}: {handoff.dropped.join(', ')}
            </span>
          )}
          {handoff.inferred.length > 0 && (
            <span className={styles.nonfindingWhere}>
              {copy.handoff.inferred}: {handoff.inferred.join(', ')}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}

export function NonFindings({ state }: { state: WorkState }) {
  const summary = briefSummary(state);
  if (!state.nonfindings.length || summary.empty) return null;
  return (
    <section className={styles.section} aria-labelledby="wnf">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="wnf">
          {copy.nonfinding.heading}
        </h2>
      </div>
      {state.nonfindings.map((nf) => (
        <div className={styles.nonfinding} key={nf.looked_for}>
          <span className={styles.nonfindingWhat}>{nf.looked_for}</span>
          <span className={styles.nonfindingWhere}>
            {copy.nonfinding.where}: {nf.boundary.corpus}
            {nf.boundary.timeRange ? `, ${nf.boundary.timeRange}` : ''}
          </span>
        </div>
      ))}
    </section>
  );
}
