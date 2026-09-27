/**
 * Whether a task is allowed to start.
 *
 * PRD section 9, Phase 4: "rate limits, abuse prevention, sandbox quotas", and
 * section 10: "hard stop + user notice when exceeded". The notice is the part
 * that is easy to skip and worst to get wrong - a task that silently does not
 * run looks like a broken product, so every refusal here carries a sentence
 * written for the owner rather than for a log.
 *
 * Checks run cheapest first, and the balance is checked last because it takes a
 * hold: there is no point reserving credit for a task that is about to be
 * refused for running too many at once.
 */

import type { Store } from '../db/store.ts';
import { money, type Affordable, type Refused } from './ledger.ts';
import { planFor, type Plan } from './plans.ts';

export interface Admitted {
  ok: true;
  plan: Plan;
  /** What this task may spend. Already reserved against the balance. */
  budget_usd: number;
  balance_usd: number;
}

export type Admission = Admitted | Refused;

export function admit(store: Store, userId: string, taskId: string): Admission {
  const user = store.getUser(userId);
  const plan = planFor(user?.plan);
  const ledger = store.ledger;

  // Free credit for the month, if it has not been given yet. Idempotent, so
  // doing it on every admission rather than on a timer costs one indexed
  // insert that usually fails.
  ledger.grantMonthly(userId, plan);

  const running = store.countTasks(userId, 'running');
  if (running >= plan.max_concurrent_tasks) {
    return {
      ok: false,
      balance_usd: ledger.balance(userId),
      reason:
        plan.max_concurrent_tasks === 1
          ? 'Something is already running. Wait for it to finish, or stop it first.'
          : `You already have ${running} tasks running, which is the limit on the ${plan.label} plan.`,
    };
  }

  const today = store.countTasksSince(userId, new Date(Date.now() - 86_400_000).toISOString());
  if (today >= plan.max_tasks_per_day) {
    return {
      ok: false,
      balance_usd: ledger.balance(userId),
      reason:
        `You have started ${today} tasks in the last day, which is the limit on the ` +
        `${plan.label} plan. It frees up as the oldest ones pass 24 hours.`,
    };
  }

  const held = ledger.hold(userId, taskId, plan);
  if (!held.ok) return held;

  return { ok: true, plan, budget_usd: held.budget_usd, balance_usd: held.balance_usd };
}

/** What the owner is told when a task stops because it ran out of money. */
export function exhaustedMessage(plan: Plan, spent: number): string {
  return (
    `This task stopped at ${money(spent)}, which is all it had. ` +
    (plan.monthly_grant_usd > 0
      ? 'Free credit resets at the start of next month, or you can add credit now.'
      : 'Add credit to carry on.')
  );
}

export type { Affordable, Refused };
