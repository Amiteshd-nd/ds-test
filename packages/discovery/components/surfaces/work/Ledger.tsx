'use client';

/**
 * The action ledger — the trust surface, and deliberately not an audit dump buried
 * in settings. It is what makes delegation rational, so it gets the typographic care
 * a product surface gets.
 *
 * Three things are structural rather than decorative:
 *
 * - **A sent thing is not a drafted thing.** `irreversible_done` gets a different
 *   container — square, heavy rules, no affordances — because a colour swap would
 *   let him skim past the one row he cannot take back.
 * - **Attribution is on every row.** The decision was ledger-only disclosure with a
 *   per-channel opt-in, which means the recipient is told nothing and this list is
 *   the only place the truth lives. "In your name" is stated plainly, and nothing
 *   implies the recipient knows.
 * - **`unknown` legs render as neither done nor failed.** Retrying could duplicate,
 *   assuming failure could leave a gap, so the row says exactly that and hands him
 *   the check rather than guessing.
 */
import { copy } from './copy';
import type { AgentEvent } from '@/lib/agent-runtime';
import { isIrreversible, unresolvedLegs, type Action, type WorkState } from '@/lib/surfaces/work/reducer';
import styles from './work.module.css';

const OWNER = 'Anand M';

/** States in which something actually reached a recipient. */
const WENT_OUT: Action['state'][] = ['auto_executed', 'executed_approved', 'irreversible_done'];

const KIND_LABEL: Record<Action['kind'], string> = {
  email: 'mail',
  slack: 'slack',
  crm: 'crm',
  calendar: 'cal',
  doc: 'doc',
};

function Sources({ sources }: { sources?: Action['sources'] }) {
  if (!sources?.length) return null;
  return (
    <span className={styles.actionMeta}>
      <span>{copy.action.sources}</span>
      {sources.map((source) =>
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
    </span>
  );
}

function Legs({ action }: { action: Action }) {
  if (!action.legs?.length) return null;
  const unknown = unresolvedLegs(action);
  return (
    <div className={styles.legs}>
      <span className={styles.sectionAside}>{copy.legs.heading}</span>
      {action.legs.map((leg) => (
        <span className={styles.leg} key={leg.system}>
          <span className={styles.legSystem}>{leg.system}</span>
          <span className={styles.legState} data-state={leg.state}>
            {copy.legs[leg.state]}
          </span>
          <span>{leg.record ?? ''}</span>
        </span>
      ))}
      {unknown.length > 0 && <span className={styles.legUnknownNote}>{copy.legs.unknownNote}</span>}
      {action.compensation && (
        <span className={styles.compensation}>
          <span className={styles.sectionAside}>{copy.legs.compensation}</span>
          {action.compensation.map((offer) => (
            <span key={offer.system} className={offer.possible ? undefined : styles.compImpossible}>
              {offer.system}: {offer.undo}
              {offer.possible ? '' : ` — ${copy.legs.impossible}`}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

export function Ledger({
  state,
  onEvents,
}: {
  state: WorkState;
  onEvents: (events: AgentEvent[]) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="ledger">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="ledger">
          {copy.action.heading}
        </h2>
        <span className={styles.sectionAside}>{state.actions.length}</span>
      </div>

      {state.actions.length === 0 ? (
        <p className={styles.empty}>{copy.action.empty}</p>
      ) : (
        <ol className={styles.ledger}>
          {state.actions.map((action) => {
            const irreversible = isIrreversible(action);
            return (
              <li
                className={styles.action}
                data-state={action.state}
                data-irreversible={String(irreversible)}
                key={action.id}
              >
                <span className={styles.actionKind}>{KIND_LABEL[action.kind]}</span>
                <span className={styles.actionSummary}>
                  {action.summary}
                  {action.recipient ? ` — ${action.recipient}` : ''}
                </span>
                <span className={styles.actionState}>{copy.action[action.state]}</span>

                <span className={styles.actionMeta}>
                  <span className={styles.attribution} data-kind={action.attribution}>
                    {copy.attribution[action.attribution]}
                  </span>
                  <span>{action.channel}</span>
                  {action.reversibleUntilMs !== undefined && action.state === 'auto_executed' && (
                    <span>{copy.action.undoWindow(Math.round(action.reversibleUntilMs / 1000))}</span>
                  )}
                  {irreversible && <span>{copy.action.undoGone}</span>}
                </span>

                {/* The blunt line, on exactly the rows where it is true — which means
                    only where something actually went out. On a blocked or drafted
                    action nothing has reached anyone, and saying it has would be the
                    same over-claim in the opposite direction. */}
                {action.attribution === 'as_user' && WENT_OUT.includes(action.state) && (
                  <span className={styles.attributionNote}>{copy.attribution.asUserNote}</span>
                )}
                {action.attribution === 'ambiguous' && (
                  <span className={styles.attributionNote}>{copy.attribution.ambiguousNote}</span>
                )}
                {action.note && <span className={styles.attributionNote}>{action.note}</span>}

                <Sources sources={action.sources} />
                <Legs action={action} />

                {/* Actions available on the row, in the order he would reach for them. */}
                {action.state === 'proposed' && (
                  <span className={styles.actionRow}>
                    <button
                      type="button"
                      className={styles.button}
                      data-kind="primary"
                      onClick={() =>
                        onEvents([
                          { t: 'action.state', id: action.id, state: 'executed_approved', at: Date.now() },
                        ])
                      }
                    >
                      {copy.action.approve}
                    </button>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() =>
                        onEvents([
                          // He edited it, so the trail records both hands.
                          { t: 'action', ...action, attribution: 'ambiguous', state: 'executed_approved' },
                        ])
                      }
                    >
                      {copy.action.edit}
                    </button>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => onEvents([{ t: 'action.state', id: action.id, state: 'reversed', at: Date.now() }])}
                    >
                      {copy.action.reject}
                    </button>
                  </span>
                )}

                {action.state === 'blocked_on_human' && (
                  <span className={styles.actionRow}>
                    <button
                      type="button"
                      className={styles.button}
                      data-kind="attention"
                      onClick={() =>
                        onEvents([
                          { t: 'action.state', id: action.id, state: 'executed_approved', at: Date.now() },
                        ])
                      }
                    >
                      {copy.action.approve}
                    </button>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() => onEvents([{ t: 'action.state', id: action.id, state: 'reversed', at: Date.now() }])}
                    >
                      {copy.action.reject}
                    </button>
                  </span>
                )}

                {action.state === 'auto_executed' && action.reversibleUntilMs !== undefined && (
                  <span className={styles.actionRow}>
                    <button
                      type="button"
                      className={styles.button}
                      onClick={() =>
                        onEvents([
                          {
                            t: 'action.state',
                            id: action.id,
                            state: 'reversed',
                            at: Date.now(),
                            note: `Pulled back by ${OWNER}`,
                          },
                        ])
                      }
                    >
                      {copy.action.undo}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
