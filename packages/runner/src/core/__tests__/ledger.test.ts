import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { Store } from '../db/store.ts';
import { admit } from '../billing/admission.ts';
import { PLANS, planFor } from '../billing/plans.ts';
import { releaseStaleHolds } from '../growth/scheduler.ts';

/**
 * This is money. The tests that matter are the ones about a task not being
 * able to spend what is not there, and about nothing being charged twice.
 */

function fixture() {
  const store = new Store(path.join(mkdtempSync(path.join(tmpdir(), 'ledger-')), 'r.db'));
  const user = store.upsertUser(`l${Math.random()}@localhost`);
  const project = store.createProject(user.id, 'Ledger');
  return { store, user, project, ledger: store.ledger };
}

const task = (f: ReturnType<typeof fixture>, prompt = 'do a thing') =>
  f.store.createTask(f.project.id, 'general', prompt);

describe('the credit ledger', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });

  it('starts empty', () => {
    expect(f.ledger.balance(f.user.id)).toBe(0);
  });

  it('grants the monthly free credit once', () => {
    const plan = planFor('free');
    expect(f.ledger.grantMonthly(f.user.id, plan)).toBe(plan.monthly_grant_usd);
    // Called again in the same month: the unique index makes it a no-op rather
    // than a second grant.
    expect(f.ledger.grantMonthly(f.user.id, plan)).toBe(plan.monthly_grant_usd);
    expect(f.ledger.grantMonthly(f.user.id, plan)).toBe(plan.monthly_grant_usd);
  });

  it('grants again in a new month', () => {
    const plan = planFor('free');
    f.ledger.grantMonthly(f.user.id, plan, new Date('2026-09-15'));
    const after = f.ledger.grantMonthly(f.user.id, plan, new Date('2026-10-01'));
    expect(after).toBe(plan.monthly_grant_usd * 2);
  });

  it('holds a task budget against the balance', () => {
    const plan = planFor('free');
    f.ledger.grantMonthly(f.user.id, plan);
    const t = task(f);

    const held = f.ledger.hold(f.user.id, t.id, plan);
    expect(held.ok).toBe(true);
    if (!held.ok) return;

    // The plan's per-task ceiling, because the balance is larger than it.
    expect(held.budget_usd).toBe(plan.max_task_usd);
    expect(f.ledger.balance(f.user.id)).toBe(plan.monthly_grant_usd - plan.max_task_usd);
  });

  it('holds only what is left when the balance is smaller than the ceiling', () => {
    const plan = planFor('free');
    f.ledger.purchase(f.user.id, 0.4, 'test');
    const t = task(f);

    const held = f.ledger.hold(f.user.id, t.id, plan);
    expect(held.ok && held.budget_usd).toBe(0.4);
    expect(f.ledger.balance(f.user.id)).toBe(0);
  });

  it('refuses when there is nothing left, with something worth reading', () => {
    const plan = planFor('free');
    const t = task(f);
    const held = f.ledger.hold(f.user.id, t.id, plan);

    expect(held.ok).toBe(false);
    if (held.ok) return;
    expect(held.reason).toMatch(/free credit|out of credit/i);
  });

  it('charges what was used and gives the rest back', () => {
    const plan = planFor('free');
    f.ledger.grantMonthly(f.user.id, plan);
    const t = task(f);
    f.ledger.hold(f.user.id, t.id, plan);

    const after = f.ledger.settle(f.user.id, t.id, 0.35);
    expect(after).toBeCloseTo(plan.monthly_grant_usd - 0.35, 6);
    expect(f.ledger.heldFor(t.id)).toBe(0);
  });

  it('settles only once', () => {
    const plan = planFor('free');
    f.ledger.grantMonthly(f.user.id, plan);
    const t = task(f);
    f.ledger.hold(f.user.id, t.id, plan);

    const first = f.ledger.settle(f.user.id, t.id, 0.5);
    // A retry, or a double finish. It must not refund the hold twice.
    const second = f.ledger.settle(f.user.id, t.id, 0.5);
    expect(second).toBe(first);
  });

  it('never charges more than was held, whatever the task reports', () => {
    const plan = planFor('free');
    f.ledger.purchase(f.user.id, 0.5, 'test');
    const t = task(f);
    const held = f.ledger.hold(f.user.id, t.id, plan);
    expect(held.ok && held.budget_usd).toBe(0.5);

    // A provider mispricing, or a bug in the loop's accounting. The hold is the
    // ceiling either way: a balance must not go negative.
    f.ledger.settle(f.user.id, t.id, 99);
    expect(f.ledger.balance(f.user.id)).toBe(0);
  });

  it('gives everything back when a task spends nothing', () => {
    const plan = planFor('free');
    f.ledger.grantMonthly(f.user.id, plan);
    const t = task(f);
    f.ledger.hold(f.user.id, t.id, plan);
    f.ledger.settle(f.user.id, t.id, 0);
    expect(f.ledger.balance(f.user.id)).toBe(plan.monthly_grant_usd);
  });

  it('two tasks cannot both reserve the last of the balance', () => {
    const plan = planFor('free');
    f.ledger.purchase(f.user.id, 1, 'test');
    const a = task(f, 'first');
    const b = task(f, 'second');

    const first = f.ledger.hold(f.user.id, a.id, plan);
    const second = f.ledger.hold(f.user.id, b.id, plan);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(f.ledger.balance(f.user.id)).toBe(0);
  });

  it('finds a hold left behind by a task that never finished', () => {
    const plan = planFor('free');
    f.ledger.grantMonthly(f.user.id, plan);
    const t = task(f);
    f.store.startTask(t.id);
    f.ledger.hold(f.user.id, t.id, plan);

    expect(f.ledger.staleHolds(60)).toHaveLength(0);
    // Anything older than the cutoff, still running, never released.
    const stale = f.ledger.staleHolds(-1);
    expect(stale).toHaveLength(1);
    expect(stale[0].task_id).toBe(t.id);

    f.ledger.release(f.user.id, t.id);
    expect(f.ledger.balance(f.user.id)).toBe(plan.monthly_grant_usd);
  });

  it('keeps the history, not just the balance', () => {
    const plan = planFor('free');
    f.ledger.grantMonthly(f.user.id, plan);
    const t = task(f);
    f.ledger.hold(f.user.id, t.id, plan);
    f.ledger.settle(f.user.id, t.id, 0.2);

    const kinds = f.ledger.history(f.user.id).map((e) => e.kind);
    // Newest first: debit, release, hold, grant. The release and the debit are
    // separate rows on purpose, so the history reads the way it happened.
    expect(kinds).toEqual(['debit', 'release', 'hold', 'grant']);
  });
});

describe('admission', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });

  it('lets a new user start, on the free grant', () => {
    const t = task(f);
    const decision = admit(f.store, f.user.id, t.id);
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.budget_usd).toBeGreaterThan(0);
  });

  it('refuses a second task while one is running', () => {
    const a = task(f, 'first');
    expect(admit(f.store, f.user.id, a.id).ok).toBe(true);
    f.store.startTask(a.id);

    const b = task(f, 'second');
    const decision = admit(f.store, f.user.id, b.id);
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toMatch(/already running/i);
  });

  it('refuses past the daily limit', () => {
    const plan = PLANS.free;
    // Enough started tasks to exceed the rolling daily count.
    for (let i = 0; i < plan.max_tasks_per_day; i += 1) {
      const t = f.store.createTask(f.project.id, 'general', `t${i}`);
      f.store.startTask(t.id);
      f.store.finishTask(t.id, 'succeeded', null);
    }

    const decision = admit(f.store, f.user.id, task(f).id);
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toMatch(/last day/i);
  });

  it('refuses when the credit is gone, and says what to do', () => {
    // The grant arrives on first admission, so take it before looping on the
    // balance - otherwise the loop sees zero and never runs.
    f.store.ledger.grantMonthly(f.user.id, PLANS.free);
    expect(f.store.ledger.balance(f.user.id)).toBeGreaterThan(0);

    // Spend it down. It takes several tasks, because a single one can never be
    // charged more than its hold - which is the previous test.
    for (let i = 0; i < 10 && f.store.ledger.balance(f.user.id) > 0; i += 1) {
      const t = task(f, `drain ${i}`);
      const held = admit(f.store, f.user.id, t.id);
      if (!held.ok) break;
      f.store.finishTask(t.id, 'succeeded', null);
      f.store.ledger.settle(f.user.id, t.id, held.budget_usd);
    }

    expect(f.store.ledger.balance(f.user.id)).toBe(0);

    const decision = admit(f.store, f.user.id, task(f, 'next').id);
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.reason).toMatch(/resets at the start of next month/i);
  });
});

describe('the stale-hold sweep', () => {
  it('releases a hold from a task that never finished, and leaves live ones alone', () => {
    const f = fixture();
    const plan = PLANS.free;
    f.ledger.grantMonthly(f.user.id, plan);

    const abandoned = task(f, 'abandoned');
    f.store.startTask(abandoned.id);
    f.ledger.hold(f.user.id, abandoned.id, plan);

    const providers = {
      publish: { name: 'x', publish: async () => ({ local: true }) },
      email: { name: 'x', send: async () => ({ local: true }) },
    };

    // Nothing is stale within the hour, however low the balance looks.
    expect(releaseStaleHolds({ store: f.store, providers }, 60)).toBe(0);
    expect(f.ledger.heldFor(abandoned.id)).toBeGreaterThan(0);

    // Past the cutoff, the credit comes back.
    expect(releaseStaleHolds({ store: f.store, providers }, -1)).toBe(1);
    expect(f.ledger.heldFor(abandoned.id)).toBe(0);
    expect(f.ledger.balance(f.user.id)).toBe(plan.monthly_grant_usd);
  });

  it('does not touch a task that settled properly', () => {
    const f = fixture();
    const plan = PLANS.free;
    f.ledger.grantMonthly(f.user.id, plan);

    const done = task(f, 'finished');
    f.store.startTask(done.id);
    f.ledger.hold(f.user.id, done.id, plan);
    f.store.finishTask(done.id, 'succeeded', null);
    f.ledger.settle(f.user.id, done.id, 0.3);

    const providers = {
      publish: { name: 'x', publish: async () => ({ local: true }) },
      email: { name: 'x', send: async () => ({ local: true }) },
    };
    expect(releaseStaleHolds({ store: f.store, providers }, -1)).toBe(0);
    expect(f.ledger.balance(f.user.id)).toBeCloseTo(plan.monthly_grant_usd - 0.3, 6);
  });
});
