# Durable execution: what to do about the loop

PRD section 9, Phase 4: *"Evaluate Temporal migration if Inngest limits are
hit."* We never adopted Inngest, so the question in front of us is the earlier
one: the loop runs in-process, and it should not keep doing so.

This is the evaluation. It is a recommendation, not a change.

## What actually breaks today

Not hypotheses. Three failures we have hit while building phases 0 to 4.

**A task does not survive a restart.** `runTask` is a floating promise in the
Next server. Every step is checkpointed to `task_steps`, so the *record*
survives; the work does not. A deploy mid-task leaves a row saying `running`
that never moves again.

**`ask_user` dies with the process.** It is a promise held in memory
(`loop.ts`, `waitForAnswer`). If the server restarts while the owner is deciding,
the answer arrives at a handler nobody is listening to. Phase 3 dodged this by
queueing the *action* rather than the agent (D22), which is the right shape and
does not generalise: an agent genuinely blocked mid-task cannot be turned into a
row.

**The scheduler cannot fire while the server is down.** It is a `setInterval`
started on first request (D26). Anything due overnight goes out late, marked
late. For a social post that is embarrassing; for a time-sensitive email it is
worse.

There is a fourth, quieter one. Credit holds are settled by the same process
that took them, so a killed container leaves credit reserved against a task
that will never finish. `Ledger.staleHolds` finds them and nothing calls it on a
timer, because there is no timer to call it from that is any more durable than
the thing that failed.

## The options

### Stay in-process, add a sweeper

A `setInterval` that releases stale holds and re-fires missed schedules. Perhaps
two hours of work.

It fixes the *fourth* problem and none of the first three, because the sweeper
has exactly the same lifetime as the thing whose failure it is compensating for.
Worth doing only as a stopgap, and worth being honest that it is one.

### Inngest

What the PRD picked (section 5), and for good reasons: no infrastructure to run,
a free tier that covers a product with no users yet, and step functions whose
programming model is close enough to the loop that `runAgent` becomes a sequence
of `step.run` calls rather than a rewrite.

The costs are real but small at this size. It is a hosted dependency in the path
of every task. Local development needs the dev server running alongside. And the
step-level retry semantics need care with an agent loop: a step that half-ran
and is retried must not duplicate a side effect, which for us means the gate's
conditional claim is doing more work than it looks like it is.

### Temporal

More capable and more expensive in every sense. Self-hosting is a cluster;
Temporal Cloud is a bill that starts well above what this costs to run today.

The real cost is the programming model. Temporal's determinism rules require
workflow code to be replayable, and an LLM loop is the least deterministic thing
a person could write: model output varies, tool results vary, and the whole
design of `engine.ts` is to append whatever came back. Every one of those calls
would have to move into an activity, and the workflow would become a thin
coordinator over them. That is a real restructuring, and it is the specific
thing the PRD's own architecture table warns about.

## Recommendation

**Inngest, when there is a second user.**

Not before. The three failures above all have the same shape - a process dies
and something is lost - and the cost of that today is that one developer reruns
one task. The cost of adopting a durable runtime now is a hosted dependency in
the path of work that is still changing shape every phase.

The thing that changes the calculus is somebody other than us losing work.

**Temporal only if Inngest's limits actually bite**, which is what the PRD says
and it is right. The limits that would do it are step-count ceilings on a long
research fan-out, or per-step duration on a slow build. Both are measurable
before migrating rather than after.

## What to do now, in order

1. **Sweep stale holds.** Two hours, fixes a real money bug, and the code is
   already written (`Ledger.staleHolds` and `release`). Call it from the
   scheduler tick.
2. **Make task resumption possible before it is needed.** The step rows already
   record everything; what is missing is a way to rebuild a message list from
   them. Doing it now keeps the loop honest about what it writes, and it is the
   prerequisite for any durable runtime rather than work that competes with one.
3. **Then Inngest**, when the failure stops being ours alone.

## What would have to change

For the record, because the answer is encouragingly small:

- `loop.ts` and `engine.ts` keep their shape. Each model call and each tool call
  becomes a step; the invariants that make that safe - append-only messages,
  checkpoint before the work, results appended rather than thrown - are already
  what Phase 0 chose.
- `waitForAnswer` becomes a durable wait rather than a promise.
- `scheduler.ts` becomes a cron function. `runDue` is unchanged, because the
  scheduler's only job is to call `execute`, and `execute` is where the
  correctness lives.
- The gate does not change at all. Its conditional claim is already what makes a
  retried step safe.
