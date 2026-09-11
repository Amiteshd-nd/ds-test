/**
 * The approval gate (invariant **I7**).
 *
 * An agent's multi-commit operation surfaces here before anything is applied. Two things
 * make this more than a confirm dialog:
 *
 *  - It shows the *commands*, in the same vocabulary the UI's own palette uses, because
 *    they are literally the same registry (I3). A reviewer is not asked to trust a prose
 *    summary of what the agent intends.
 *  - Nothing is applied until `APPROVE` fires. The Rust layer refuses agent writes
 *    without an approved plan, so this is not the only line of defence — but it is where
 *    the human actually decides.
 */
import type { Plan } from './doc'

interface Props {
  plan: Plan
  state: 'proposed' | 'approved' | 'failed'
  applied: string[]
  error: string | null
  onApprove: () => void
  onReject: () => void
  onDone: () => void
}

export function PlanApproval({ plan, state, applied, error, onApprove, onReject, onDone }: Props) {
  const total = plan.steps.reduce((n, s) => n + s.commands.length, 0)

  return (
    <div className="plan" data-testid="plan-approval" data-state={state}>
      <header>
        <span className="badge">{state === 'proposed' ? 'needs approval' : state}</span>
        <strong>{plan.summary}</strong>
      </header>

      <p className="meta">
        {plan.agent} proposes {plan.steps.length} step{plan.steps.length === 1 ? '' : 's'} ·{' '}
        {total} command{total === 1 ? '' : 's'}
      </p>

      <ol className="steps">
        {plan.steps.map((s, i) => (
          <li key={i}>
            <code>{s.message}</code>
            {applied[i] && <span className="applied"> ✓ {applied[i].slice(0, 8)}</span>}
          </li>
        ))}
      </ol>

      {error && <p className="error">{error}</p>}

      <div className="actions">
        {state === 'proposed' && (
          <>
            <button className="primary" onClick={onApprove} data-testid="approve">
              Approve and apply
            </button>
            <button onClick={onReject} data-testid="reject">
              Reject
            </button>
          </>
        )}
        {state === 'approved' && (
          <>
            <span className="running">
              applying… {applied.length}/{plan.steps.length}
            </span>
            <button onClick={onReject}>Stop</button>
          </>
        )}
        {state === 'failed' && <button onClick={onDone}>Dismiss</button>}
      </div>

      <p className="note">
        Nothing is written until you approve. Every commit this plan produces is tagged
        with plan <code>{plan.id}</code> and can be found later in the history.
      </p>
    </div>
  )
}
