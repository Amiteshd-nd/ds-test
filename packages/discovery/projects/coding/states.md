# coding — the state list

The spec that the components are built against, per `docs/build-workflow.md` §3. Written before any
screen. Every state below has a case in `lib/scripts/coding.ts` or is reachable from one, and the
state gallery at `/dev/gallery/coding` renders them side by side.

Thirty-one states. The happy path is three of them.

## Run

| State | Reached by | What the interface owes |
|---|---|---|
| `IDLE` | nothing started | One action. No configuration. |
| `PLANNING` | `run.start` before `plan` | Say that a plan is coming; don't show an empty graph. |
| `RUNNING` | any node running | Where it is, without reading. |
| `PLAN_REVISED` | `plan.revise` | An event, never a silent update. What was added, dropped, kept — and why. |
| `AWAITING_STEERING` | `ask` with `blocking: 'run'` | The question, and what happens to in-flight work either way. |
| `STEERING_APPLIED` | `steering.applied` | Kept and discarded, explicitly, as a fact rather than a proposal. |
| `DIVERGED` | `divergence` | Loud. Nothing has failed, so nothing else on screen will say this. |
| `STALLED` | node `stalled` | Distinguish from running. Elapsed since last progress, not since start. |
| `SUCCEEDED` | `run.end` success | Collapse the run to its boundaries. |
| `PARTIAL` | `run.end` partial | Name what didn't land. |
| `FAILED` | `run.end` failed, or a non-retryable `error` | The cause, typed — auth reads differently from rate limit. |
| `CANCELLED` | `run.end` cancelled | What survived the cancel. |

## Step

| State | Reached by | What the interface owes |
|---|---|---|
| `QUEUED` | `plan` | Position, not a spinner. |
| `RUNNING` | `node.state` | Progress if it has any; otherwise elapsed. |
| `DONE` | `node.state succeeded` | Collapse. Success is not information. |
| `SKIPPED` | `plan.revise` dropping it | Say it was dropped and by which revision. |
| `FAILED` | `node.state failed` | Retain inputs. A failure you can't retry is a dead end. |
| `RETRYING` | `node.state retrying` | Attempt count, and what changed between attempts. |
| `BLOCKED_ON_PERMISSION` | `node.state blocked_on_permission` | The reserved attention channel. Exactly what it wants to touch. |
| `SPECULATIVE` | `node.state speculative` | Provisional treatment — lighter and less committed, not a colour swap. |
| `PARTIALLY_SUCCEEDED` | `node.state partially_succeeded` | What part. |
| `BLOCKED_ON_UPSTREAM` | `node.state blocked_on_upstream` | Which upstream, so waiting is legible as waiting. |

## Change

| State | Reached by | What the interface owes |
|---|---|---|
| `PROPOSED` | `change state: proposed` | Not yet applied. Reviewable before it lands. |
| `APPLIED` | `change state: applied` | Diffable against the previous boundary. |
| `APPLIED_UNREVIEWED` | `change state: applied_unreviewed` | Landed under the envelope without him looking. Must be findable later. |
| `REVERTED` | `change.state reverted` | Why, and whether anything downstream depended on it. |
| `CONFLICTS_WITH_MANUAL_EDIT` | `change.state conflicts_with_manual_edit` | Both versions exist and neither is authoritative. Do not pick for him. |

## Checkpoint

| State | Reached by | What the interface owes |
|---|---|---|
| `CHECKPOINT_CLEAN` | `checkpoint.state clean` | A valid stopping point. Accept-up-to must be one action. |
| `CHECKPOINT_PARTIAL` | `checkpoint.state partial` | Which change inside it is provisional. |
| `CHECKPOINT_RESTORED` | `checkpoint.state restored` | What was rolled back, and what the run is now. |

## Envelope and capability

| State | Reached by | What the interface owes |
|---|---|---|
| `ENVELOPE_SET` | `envelope` | The scope in his words. The raw confidence floor lives here and nowhere else. |
| `ENVELOPE_BREACH` | `envelope.breach` | Loud, and logged. The agent may never widen its own envelope. |
| `EDGE_ONLY` / `OFFLINE` | `capability` | What still works, not an apology. |

## Non-finding

| State | Reached by | What the interface owes |
|---|---|---|
| `NONFINDING` | `nonfinding` | Same weight as a finding, and the search boundary named. |

---

## Notes taken while writing this

- `AWAITING_STEERING` and `BLOCKED_ON_PERMISSION` are both "it needs you", but only the second is
  the agent asking for authority. They deserve the same channel and different words.
- `DIVERGED` has no visual precedent in the run: every other state is either progress or failure,
  and this one is neither. It's the reason the plan view needs a diff against the stated plan, not
  just a list of steps.
- `CONFLICTS_WITH_MANUAL_EDIT` cannot be resolved by the interface. The only honest design is to
  show both and refuse to choose.
- Elapsed-since-last-progress is a different number from elapsed-since-start, and `STALLED` is the
  state that proves it. Both belong on screen.
