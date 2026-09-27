/**
 * Credits, as an append-only ledger.
 *
 * Every write is a row. Nothing is ever a mutable balance, because when someone
 * disputes a bill the question is never "what is the balance" - it is "how did
 * it get there", and an overwritten column cannot answer that.
 *
 * The part worth understanding is the **hold**. A task reserves its budget
 * before it starts and settles the difference when it ends. Without that, a
 * user with fifty cents left could start a task with a two dollar ceiling and
 * end up owing a dollar fifty; and two tasks starting at once could each see
 * the same balance and both spend it. A hold is taken in the same transaction
 * that checks the balance, so neither can happen.
 *
 * A hold that is never settled - a crashed process, a killed container - is
 * recoverable, which is why `kind` distinguishes it from a debit. `release`
 * exists for that, and `staleHolds` finds them.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

import { currentPeriod, planFor, type Plan } from './plans.ts';

export type LedgerKind = 'grant' | 'purchase' | 'hold' | 'debit' | 'release' | 'refund';

export interface LedgerEntry {
  id: string;
  user_id: string;
  task_id: string | null;
  kind: LedgerKind;
  amount_usd: number;
  balance_after: number;
  note: string | null;
  external_ref: string | null;
  created_at: string;
}

export interface Affordable {
  ok: true;
  /** What the task may spend. The lesser of the plan ceiling and the balance. */
  budget_usd: number;
  balance_usd: number;
}

export interface Refused {
  ok: false;
  /** Written to be shown to the owner, not logged. */
  reason: string;
  balance_usd: number;
}

export class Ledger {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  balance(userId: string): number {
    const row = this.db
      .prepare('SELECT balance_after FROM credit_ledger WHERE user_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(userId) as { balance_after: number } | undefined;
    return round(row?.balance_after ?? 0);
  }

  history(userId: string, limit = 50): LedgerEntry[] {
    return this.db
      .prepare('SELECT * FROM credit_ledger WHERE user_id = ? ORDER BY rowid DESC LIMIT ?')
      .all(userId, limit) as LedgerEntry[];
  }

  /**
   * Append one entry and return the new balance.
   *
   * Private and transactional: the balance is read and the row written in one
   * statement pair, so two concurrent writes cannot both compute
   * `balance_after` from the same starting point.
   */
  private append(entry: {
    userId: string;
    taskId?: string | null;
    kind: LedgerKind;
    amount: number;
    note?: string | null;
    externalRef?: string | null;
  }): number {
    const write = this.db.transaction(() => {
      const current = this.balance(entry.userId);
      const next = round(current + entry.amount);

      this.db
        .prepare(
          `INSERT INTO credit_ledger
             (id, user_id, task_id, kind, amount_usd, balance_after, note, external_ref, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          entry.userId,
          entry.taskId ?? null,
          entry.kind,
          round(entry.amount),
          next,
          entry.note ?? null,
          entry.externalRef ?? null,
          new Date().toISOString(),
        );

      return next;
    });

    return write();
  }

  /**
   * The monthly free grant. Safe to call on every request.
   *
   * Idempotent through a unique index on (user_id, note) for grants, so the
   * second call in a month is an insert that fails and is swallowed rather than
   * a check that can race.
   */
  grantMonthly(userId: string, plan: Plan, at = new Date()): number {
    if (plan.monthly_grant_usd <= 0) return this.balance(userId);

    const period = currentPeriod(at);
    try {
      return this.append({
        userId,
        kind: 'grant',
        amount: plan.monthly_grant_usd,
        note: `${plan.id} plan, ${period}`,
      });
    } catch (err) {
      // The unique index did its job: already granted this month.
      if (String(err).includes('UNIQUE')) return this.balance(userId);
      throw err;
    }
  }

  purchase(userId: string, amountUsd: number, externalRef: string): number {
    if (amountUsd <= 0) throw new Error('a purchase has to be for a positive amount');
    return this.append({
      userId,
      kind: 'purchase',
      amount: amountUsd,
      note: 'credit purchase',
      externalRef,
    });
  }

  /**
   * Reserve a task's budget.
   *
   * The check and the hold happen in one transaction, so two tasks starting at
   * the same moment cannot both be told they can afford the last dollar.
   */
  hold(userId: string, taskId: string, plan: Plan): Affordable | Refused {
    const take = this.db.transaction((): Affordable | Refused => {
      const balance = this.balance(userId);

      if (balance <= 0) {
        return {
          ok: false,
          balance_usd: balance,
          reason:
            plan.monthly_grant_usd > 0
              ? `You have used this month's ${money(plan.monthly_grant_usd)} of free credit. ` +
                'It resets at the start of next month, or you can add credit now.'
              : 'You are out of credit. Add some to keep going.',
        };
      }

      // The lesser of what the plan allows for one task and what is left.
      const budget = round(Math.min(plan.max_task_usd, balance));
      this.append({
        userId,
        taskId,
        kind: 'hold',
        amount: -budget,
        note: 'reserved for this task',
      });

      return { ok: true, budget_usd: budget, balance_usd: round(balance - budget) };
    });

    return take();
  }

  /**
   * Close out a task: charge what it used and give back the rest.
   *
   * Idempotent per task, because a retry or a double-finish must not refund
   * twice. Returns the new balance.
   */
  settle(userId: string, taskId: string, actualUsd: number): number {
    const close = this.db.transaction(() => {
      const held = this.heldFor(taskId);
      if (held === 0) return this.balance(userId); // nothing reserved, or already settled

      const spent = round(Math.min(Math.max(actualUsd, 0), held));

      // Give the whole hold back, then charge what was actually used. Two rows
      // rather than one net adjustment, because the history should read the way
      // it happened.
      this.append({ userId, taskId, kind: 'release', amount: held, note: 'hold released' });
      if (spent > 0) {
        this.append({ userId, taskId, kind: 'debit', amount: -spent, note: 'task cost' });
      }
      return this.balance(userId);
    });

    return close();
  }

  /** What is still reserved for a task: holds, less anything already released. */
  heldFor(taskId: string): number {
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN kind = 'hold' THEN -amount_usd ELSE 0 END), 0) AS held,
           COALESCE(SUM(CASE WHEN kind = 'release' THEN amount_usd ELSE 0 END), 0) AS released
         FROM credit_ledger WHERE task_id = ?`,
      )
      .get(taskId) as { held: number; released: number };
    return round(Math.max(0, row.held - row.released));
  }

  /**
   * Holds left behind by a process that died mid-task.
   *
   * Nothing calls this on a timer yet. It is here because the failure is real -
   * a killed container leaves a user's credit reserved against a task that will
   * never finish - and because on a durable runtime this becomes a compensating
   * step rather than a sweeper.
   */
  staleHolds(olderThanMinutes = 60): Array<{ user_id: string; task_id: string; amount: number }> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
    return this.db
      .prepare(
        `SELECT l.user_id, l.task_id, -l.amount_usd AS amount
           FROM credit_ledger l
           JOIN tasks t ON t.id = l.task_id
          WHERE l.kind = 'hold'
            AND l.created_at < ?
            AND t.status IN ('running', 'queued', 'awaiting_user')
            AND NOT EXISTS (
              SELECT 1 FROM credit_ledger r WHERE r.task_id = l.task_id AND r.kind = 'release'
            )`,
      )
      .all(cutoff) as Array<{ user_id: string; task_id: string; amount: number }>;
  }

  release(userId: string, taskId: string, note = 'stale hold released'): number {
    const held = this.heldFor(taskId);
    if (held === 0) return this.balance(userId);
    return this.append({ userId, taskId, kind: 'release', amount: held, note });
  }
}

/** Money, to the cent, without the floating point creeping into a balance. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export const money = (usd: number) =>
  usd >= 1 ? `$${usd.toFixed(2)}` : `${Math.round(usd * 100)}c`;

export { planFor };
