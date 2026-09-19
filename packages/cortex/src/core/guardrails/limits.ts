// Rate limits and budgets. PRD §8.3 and §14.5.
//
// Per principal, per agent, per skill, per org. Exceeding one returns a typed error the
// UI renders as a first-class state — never a crash, and never a silent truncation,
// which is worse because the user cannot tell the difference between "there is no more"
// and "you have run out".

import crypto from 'node:crypto';
import type { SkillManifest } from '../adapters/types.ts';
import { CortexError } from '../errors.ts';
import type { RunStore } from '../runtime/store.ts';

export function idempotencyKey(skill: SkillManifest, args: Record<string, unknown>): string | null {
  if (!skill.idempotency) return null;
  const material = skill.idempotency.keyFields.map((f) => JSON.stringify(args[f] ?? null)).join('|');
  return crypto.createHash('sha256').update(`${skill.id}|${material}`).digest('hex').slice(0, 32);
}

export interface LimitCheck { store: RunStore; principalId: string; skill: SkillManifest; args: Record<string, unknown> }

/** Throws `rate_limited`; returns a prior result when inside an idempotency window. */
export function checkLimits({ store, principalId, skill, args }: LimitCheck): { replay?: unknown } {
  const perDay = skill.rateLimit?.perPrincipalPerDay;
  if (perDay !== undefined) {
    const since = new Date(Date.now() - 864e5).toISOString();
    const row = store.db
      .prepare('SELECT COUNT(*) AS n FROM invocations WHERE principal_id = ? AND skill_id = ? AND at > ?')
      .get(principalId, skill.id, since) as { n: number };
    if (row.n >= perDay) {
      throw new CortexError('rate_limited', `${skill.name} is limited to ${perDay} per day, and you have used ${row.n}.`, {
        skillId: skill.id,
        retryAfter: '24h',
      });
    }
  }

  const key = idempotencyKey(skill, args);
  if (key && skill.idempotency) {
    const since = new Date(Date.now() - skill.idempotency.windowMinutes * 60_000).toISOString();
    const prior = store.db
      .prepare('SELECT result_json FROM invocations WHERE skill_id = ? AND idem_key = ? AND at > ? ORDER BY id DESC LIMIT 1')
      .get(skill.id, key, since) as { result_json: string | null } | undefined;
    // The same call inside the window returns the first result rather than doing it
    // twice. For a write skill this is the difference between one message and two.
    if (prior?.result_json) return { replay: JSON.parse(prior.result_json) };
  }
  return {};
}

export function recordInvocation(store: RunStore, principalId: string, skill: SkillManifest, args: Record<string, unknown>, result: unknown): void {
  store.db
    .prepare('INSERT INTO invocations (principal_id, skill_id, idem_key, at, result_json) VALUES (?, ?, ?, ?, ?)')
    .run(principalId, skill.id, idempotencyKey(skill, args), new Date().toISOString(), JSON.stringify(result ?? null));
}

/** §8.3 budgets, level three: per principal, per day. */
export function assertDailyBudget(store: RunStore, principalId: string, capUsd: number): void {
  const spent = store.spentToday(principalId);
  if (spent >= capUsd) {
    throw new CortexError('budget_exceeded', `You have used today's AI budget ($${capUsd.toFixed(2)}). It resets at midnight UTC.`, { spent });
  }
}
