# 2026-09-09 — the event model was missing the coding half

**What changed.** `grammar/agent-runtime.ts` gained a coding block: `plan.revise`,
`divergence`, `steering.preview` / `steering.applied`, `change` / `change.state`,
`checkpoint.state`, `envelope`, `latency.sample` / `latency.distribution`, plus a `ChangeState`
union, two new `NodeState` members (`speculative`, `blocked_on_permission`) and five faults
(`plan_revised`, `diverged_run`, `manual_edit_conflict`, `permission_block`,
`speculative_discard`). Also a `codingRun` script.

**Why.** The header on the event model says that a pattern in `patterns.md` with no corresponding
event means either the pattern isn't real or the model is incomplete. Eight patterns are owed by
`projects/coding` and five of them had nowhere to live: Commit Boundary had `checkpoint` but no
checkpoint *state*, so `CHECKPOINT_PARTIAL` was unrepresentable; Latency Waterfall had `ttft` and
`tool.result` but no distribution, so "p50 and p95 side by side" was unbuildable; the Delegation
Envelope existed only as a breach. The model was incomplete.

**What it cost.** Nothing yet, and that's the risk: these events are shaped by one surface. When
`work` builds its taskgraph at full strength it will want `plan.revise` too, and if its needs
differ the honest move is to widen these rather than add parallel ones. Watch that.

---

## Two bugs the work turned up in the runtime itself

**1. Abort was ignored between events.** `sleep()` armed an `abort` listener but never checked
`signal.aborted` first, so a cancellation landing *between* two events — which is what React
unmounting and an SSE client disconnecting both look like — was missed, and the run played on to
the end with nobody listening. In the browser that's a leaked stream per surface visit, exactly the
failure `CLAUDE.md` warns about. One line, and a test in `agent-runtime.test.ts` that fails without
it (it timed out for five seconds before the fix, which is how it was found).

**2. Injected faults landed after the run ended.** `applyFaults` uses `out.push(...)`, which appends
*after* `run.end`. That's fine for a terminal error and nonsense for anything describing work in
flight: a divergence or a manual-edit conflict in a finished run is not a state anyone can act on.
The coding faults now splice in before the last `run.end` via `insertBeforeEnd`. The bundle's
original faults were left as they were — `rate_limited` and `auth_failed` are terminal and belong
at the end.

---

## What the state gallery caught, before any user saw it

Built the gallery at `/dev/gallery/coding` before designing, per the workflow. Two states read
wrong the moment they were side by side:

- **`CONFLICTS_WITH_MANUAL_EDIT` read as "nothing needs you"** once the run had ended, because the
  orientation line asked the run's outcome before it asked whether anything needed a person. A
  finished run does not resolve a conflict; the file is still ambiguous on disk.
- **`APPLIED_UNREVIEWED` never appeared in the cold-read line at all.** Changes that landed under
  the envelope while he was away are precisely what he needs to know about on returning, and the
  headline said "Stopped at 'Invoice and refund moved over'" as though everything were settled.

Both were ordering mistakes in one function, and both would have been invisible on the happy path.
That's the argument for the gallery in one paragraph.

---

## Deprecation: coding's "bold thing"

`tokens.css` says coding's boldness budget goes to the latency waterfall. `CLAUDE.md`'s surface
table and `projects/coding/BRIEF.md` both say the plan view, with the waterfall surviving as a
component inside it. The build follows the brief — the plan view carries the large type and the
whole spine treatment, the waterfall is instrumental. The comment in `tokens.css` is stale and is
left in place as a deprecation rather than edited away.
