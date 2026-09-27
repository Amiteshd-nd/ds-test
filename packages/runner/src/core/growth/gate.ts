/**
 * The gate. PRD section 9, Phase 3: "no irreversible action can execute
 * without a logged approval."
 *
 * That sentence is the acceptance criterion for the whole phase, so it is
 * enforced by the type system rather than by everyone remembering.
 *
 * Every provider that can send or publish requires an `ExecutionToken`. The
 * token's brand is a symbol this module does not export, so no other file can
 * construct a value that satisfies the type - not by object literal, not by
 * cast from an object shape, not by accident in a refactor. `execute` below is
 * the only function that mints one, and it mints one only after it has claimed
 * an approval row that is approved and not already executed.
 *
 * The claim is a conditional UPDATE, so two callers racing - a double click, a
 * scheduler tick landing on a manual publish - cannot both proceed. Exactly one
 * gets `changes === 1`.
 *
 * A claimed action that then fails stays claimed, with the error recorded. That
 * is deliberate: retrying a send that may have half-succeeded is worse than
 * leaving it visibly failed for a person to look at.
 */

import type Database from 'better-sqlite3';

import type { Store } from '../db/store.ts';
import { describeAction, type OutwardAction } from './actions.ts';

/* ------------------------------------------------------------------ token */

declare const APPROVED: unique symbol;

/**
 * Proof that an approval was claimed. Cannot be constructed outside this file:
 * the brand is a symbol declared here and never exported.
 */
export interface ExecutionToken {
  readonly [APPROVED]: true;
  readonly approvalId: string;
}

function mint(approvalId: string): ExecutionToken {
  return { approvalId } as unknown as ExecutionToken;
}

/* -------------------------------------------------------------- providers */

export interface SendResult {
  /** Where it ended up, if the provider has a URL for it. */
  url?: string;
  /** The provider's own id, for tracing a complaint back. */
  external_id?: string;
  /** True when nothing actually left this machine. */
  local: boolean;
}

export interface PublishProvider {
  readonly name: string;
  /** The token is not decoration. It is why this cannot be called speculatively. */
  publish(action: Extract<OutwardAction, { kind: 'social_post' }>, token: ExecutionToken): Promise<SendResult>;
}

export interface EmailProvider {
  readonly name: string;
  send(action: Extract<OutwardAction, { kind: 'email' }>, token: ExecutionToken): Promise<SendResult>;
}

export interface GrowthProviders {
  publish: PublishProvider;
  email: EmailProvider;
}

/* ------------------------------------------------------------- the record */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface QueuedAction {
  id: string;
  task_id: string;
  project_id: string | null;
  action_type: string;
  payload_json: string;
  status: ApprovalStatus;
  scheduled_for: string | null;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
  result_json: string | null;
  error: string | null;
}

export function actionOf(row: QueuedAction): OutwardAction {
  return JSON.parse(row.payload_json) as OutwardAction;
}

/* ----------------------------------------------------------- the only door */

export interface ExecuteOutcome {
  ok: boolean;
  /** Why it did not run, in words a person can act on. */
  reason?: string;
  result?: SendResult;
}

/**
 * Execute one approved action. The only path to a provider.
 *
 * Takes the raw database handle as well as the store because the claim has to
 * be one statement against the same connection, and the store deliberately does
 * not expose conditional updates.
 */
export async function execute(
  approvalId: string,
  deps: { store: Store; db: Database.Database; providers: GrowthProviders },
): Promise<ExecuteOutcome> {
  const { db, providers } = deps;

  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as
    | QueuedAction
    | undefined;
  if (!row) return { ok: false, reason: 'there is no such action' };

  if (row.status !== 'approved') {
    return {
      ok: false,
      reason:
        row.status === 'pending'
          ? 'that has not been approved yet'
          : 'that was rejected, so it will not be sent',
    };
  }
  if (row.executed_at) return { ok: false, reason: 'that has already gone out' };

  if (row.scheduled_for && Date.parse(row.scheduled_for) > Date.now()) {
    return { ok: false, reason: `that is scheduled for ${row.scheduled_for}` };
  }

  // Claim it. Conditional on the same two facts checked above, so the check and
  // the claim cannot disagree under a race.
  const claimed = db
    .prepare(
      `UPDATE approvals SET executed_at = ?
        WHERE id = ? AND status = 'approved' AND executed_at IS NULL`,
    )
    .run(new Date().toISOString(), approvalId);

  if (claimed.changes !== 1) return { ok: false, reason: 'that has already gone out' };

  const action = actionOf(row);
  const token = mint(approvalId);

  try {
    const result =
      action.kind === 'social_post'
        ? await providers.publish.publish(action, token)
        : await providers.email.send(action, token);

    db.prepare('UPDATE approvals SET result_json = ?, error = NULL WHERE id = ?').run(
      JSON.stringify(result),
      approvalId,
    );
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Stays claimed. See the note at the top of the file.
    db.prepare('UPDATE approvals SET error = ? WHERE id = ?').run(message, approvalId);
    return { ok: false, reason: `${describeAction(action)} failed: ${message}` };
  }
}
