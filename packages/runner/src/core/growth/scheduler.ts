/**
 * Firing scheduled actions.
 *
 * A timer inside the Next server, checking every minute for anything approved
 * and due. The honest limitation, stated where anyone touching this will read
 * it: **nothing fires while Runner is not running.** On boot it catches up -
 * everything whose time passed while the process was down goes out then, late.
 *
 * That is the right trade for this phase and the wrong one for production. PRD
 * section 5 puts Inngest here and section 9 revisits it in Phase 4; at that
 * point this file becomes an Inngest function and the rest of the phase does
 * not change, because the scheduler's only job is to call `execute` and
 * `execute` is where all the correctness lives.
 *
 * Every path into a provider goes through the gate, so a tick racing a manual
 * publish cannot double-send: one of them loses the conditional claim.
 */

import { actionOf, execute, type GrowthProviders } from './gate.ts';
import { describeAction } from './actions.ts';
import type { Store } from '../db/store.ts';

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 60_000);

export interface SchedulerDeps {
  store: Store;
  providers: GrowthProviders;
  /** Called for each one, so the app can log or stream it. */
  onFired?: (summary: string, ok: boolean) => void;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Run everything that is due, once.
 *
 * Serial rather than parallel: these are outward-facing sends, the volume is a
 * handful, and a burst of simultaneous posts is more likely to trip a rate
 * limit than to save time worth having.
 */
export async function runDue(deps: SchedulerDeps): Promise<number> {
  // Credit reserved by a task whose process died. Released here because the
  // tick is the only thing that outlives a crashed task, and leaving a user's
  // balance held against work that will never finish is a money bug, not an
  // untidiness. See docs/durable-execution.md.
  releaseStaleHolds(deps);

  const due = deps.store.dueApprovals();
  let fired = 0;

  for (const row of due) {
    const outcome = await execute(row.id, {
      store: deps.store,
      db: deps.store.connection,
      providers: deps.providers,
    });

    const late = row.scheduled_for ? Date.now() - Date.parse(row.scheduled_for) : 0;
    const lateness = late > 90_000 ? ` (${Math.round(late / 60_000)} minutes late)` : '';

    deps.onFired?.(
      `${describeAction(actionOf(row))}${lateness}: ${outcome.ok ? 'sent' : outcome.reason}`,
      outcome.ok,
    );
    if (outcome.ok) fired += 1;
  }

  return fired;
}

/**
 * Give back credit held by tasks that never finished.
 *
 * An hour is deliberately generous: a long research fan-out can legitimately
 * hold its budget for several minutes, and releasing a hold from a task that is
 * still running would let it overspend. Better to reserve too long than to
 * reserve too little.
 */
export function releaseStaleHolds(deps: SchedulerDeps, olderThanMinutes = 60): number {
  const stale = deps.store.ledger.staleHolds(olderThanMinutes);

  for (const hold of stale) {
    deps.store.ledger.release(hold.user_id, hold.task_id, 'task never finished');
    // The task row is left as it is. It really did stop mid-flight, and
    // rewriting it to `failed` would lose that it was running when the process
    // went away.
    deps.onFired?.(
      `released $${hold.amount.toFixed(2)} held by a task that never finished`,
      true,
    );
  }

  return stale.length;
}

/**
 * Start the ticker. Idempotent, because Next's dev server re-evaluates modules
 * and two tickers would each try to claim the same rows.
 */
export function startScheduler(deps: SchedulerDeps): void {
  if (timer) return;

  const tick = () => {
    // Skip rather than queue up: a tick that overruns a minute is a slow
    // provider, and stacking the next one behind it helps nothing.
    if (running) return;
    running = true;
    void runDue(deps)
      .catch(() => {
        /* one bad tick must not stop the timer */
      })
      .finally(() => {
        running = false;
      });
  };

  // The catch-up pass. Anything whose time passed while this was down goes now,
  // and `onFired` says how late it is rather than pretending it was on time.
  tick();

  timer = setInterval(tick, TICK_MS);
  // Do not hold the process open. A CLI script that imports this should still
  // be able to exit.
  timer.unref?.();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/**
 * Start the scheduler from a server component or a route handler.
 *
 * Not from `instrumentation.ts`, which would be the natural home: Next compiles
 * that file for the edge and the client as well as for Node, and webpack
 * resolves a dynamic import inside it regardless of the runtime check guarding
 * it - so `better-sqlite3` ends up in the browser bundle and the app will not
 * compile.
 *
 * The cost is that the catch-up pass runs on the first request after a restart
 * rather than at process start. For an app somebody opens in a browser those
 * are the same moment; for a server sitting idle overnight they are not, and
 * that is one more reason this belongs on a real scheduler in Phase 4.
 *
 * Idempotent, so every caller can just call it.
 */
export async function ensureScheduler(): Promise<void> {
  if (timer) return;

  const [{ getStore }, { growthProviders }] = await Promise.all([
    import('../db/store.ts'),
    import('../providers/registry.ts'),
  ]);

  try {
    startScheduler({
      store: getStore(),
      providers: growthProviders(),
      onFired: (summary, ok) => {
        // The console is the right place: this happens with nobody watching,
        // and it is what you want in the log when something went out at 3am and
        // somebody asks about it the next morning.
        console.log(`[scheduler] ${ok ? 'sent' : 'skipped'} ${summary}`);
      },
    });
  } catch (err) {
    // A misconfigured provider must not stop the app from serving. The
    // scheduler is the only thing that will not work.
    console.error('[scheduler] not started:', err instanceof Error ? err.message : err);
  }
}
