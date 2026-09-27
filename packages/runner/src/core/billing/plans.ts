/**
 * What a plan allows.
 *
 * PRD section 12 left the free-tier ceiling open; the owner set it at five
 * dollars a month, which is about one landing page with a couple of edits, or
 * one report, or one deck. Enough to see the product work end to end and not
 * enough to run a second business through it.
 *
 * The limits beside it are the rest of PRD section 9's Phase 4 line - "rate
 * limits, abuse prevention, sandbox quotas" - and they exist for a different
 * reason than the money does. A balance stops someone spending more than they
 * have. These stop one account making the product unusable for everyone else
 * while staying inside its balance.
 */

export interface Plan {
  id: string;
  label: string;
  /** Granted once per calendar month. Does not roll over. */
  monthly_grant_usd: number;
  /** Ceiling for one task, whatever the balance. Stops a single runaway. */
  max_task_usd: number;
  /** Tasks running at once. The real resource here is sandboxes. */
  max_concurrent_tasks: number;
  /** Tasks started in a rolling 24 hours. */
  max_tasks_per_day: number;
  /** Wall clock for one task. */
  max_task_seconds: number;
}

export const PLANS: Record<string, Plan> = {
  free: {
    id: 'free',
    label: 'Free',
    monthly_grant_usd: Number(process.env.FREE_TIER_USD ?? 5),
    max_task_usd: 2,
    max_concurrent_tasks: 1,
    max_tasks_per_day: 20,
    max_task_seconds: 10 * 60,
  },
  starter: {
    id: 'starter',
    label: 'Starter',
    monthly_grant_usd: 0,
    max_task_usd: 6,
    max_concurrent_tasks: 3,
    max_tasks_per_day: 200,
    max_task_seconds: 20 * 60,
  },
};

export function planFor(id: string | null | undefined): Plan {
  return PLANS[id ?? 'free'] ?? PLANS.free;
}

/** `2026-09`, which is what makes the monthly grant idempotent. */
export function currentPeriod(at = new Date()): string {
  return at.toISOString().slice(0, 7);
}
