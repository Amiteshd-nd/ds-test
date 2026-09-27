import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { Store } from '../db/store.ts';
import { execute, type EmailProvider, type ExecutionToken, type GrowthProviders, type PublishProvider, type SendResult } from '../growth/gate.ts';
import type { ColdEmail, SocialPost } from '../growth/actions.ts';

/**
 * PRD section 9, Phase 3: "no irreversible action can execute without a logged
 * approval."
 *
 * That is the whole acceptance criterion for the phase, so these are the tests
 * that matter most in this package. They check the property from both sides:
 * that the gate refuses everything it should, and that nothing else in the
 * codebase has a way round it.
 */

const POST: SocialPost = {
  kind: 'social_post',
  platform: 'x',
  text: 'Hedgelaying season opens in September and closes in March.',
};

const EMAIL: ColdEmail = {
  kind: 'email',
  to: 'someone@example.test',
  subject: 'Hedgerow work on the boundary',
  body: 'I laid forty chains on the neighbouring farm three winters ago and noticed your roadside boundary is gapping at the base. Worth half an hour walking it?',
  from_identity: 'Tom Wexford, Kestrel Hedgelaying.',
  opt_out: 'Reply "no thanks" and I will not write again.',
};

class CountingPublish implements PublishProvider {
  readonly name = 'counting';
  calls = 0;
  tokens: string[] = [];
  async publish(_action: SocialPost, token: ExecutionToken): Promise<SendResult> {
    this.calls += 1;
    this.tokens.push(token.approvalId);
    return { local: true };
  }
}

class FailingEmail implements EmailProvider {
  readonly name = 'failing';
  async send(): Promise<SendResult> {
    throw new Error('the provider is down');
  }
}

function fixture() {
  const store = new Store(path.join(mkdtempSync(path.join(tmpdir(), 'gate-')), 'r.db'));
  const user = store.upsertUser(`g${Math.random()}@localhost`);
  const project = store.createProject(user.id, 'Gate');
  const task = store.createTask(project.id, 'growth', 'draft something');
  const publish = new CountingPublish();
  const providers: GrowthProviders = { publish, email: new FailingEmail() };
  return { store, project, task, publish, providers, db: store.connection };
}

describe('the approval gate', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });

  it('refuses an action nobody has approved', async () => {
    const approval = f.store.createApproval(f.task.id, 'social_post', POST, {
      projectId: f.project.id,
    });

    const outcome = await execute(approval.id, f);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/not been approved/);
    expect(f.publish.calls).toBe(0);
  });

  it('refuses an action that was rejected', async () => {
    const approval = f.store.createApproval(f.task.id, 'social_post', POST, {
      projectId: f.project.id,
    });
    f.store.decideApproval(approval.id, 'rejected');

    const outcome = await execute(approval.id, f);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/rejected/);
    expect(f.publish.calls).toBe(0);
  });

  it('runs an approved action exactly once', async () => {
    const approval = f.store.createApproval(f.task.id, 'social_post', POST, {
      projectId: f.project.id,
    });
    f.store.decideApproval(approval.id, 'approved');

    expect((await execute(approval.id, f)).ok).toBe(true);
    expect(f.publish.calls).toBe(1);

    const second = await execute(approval.id, f);
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/already gone out/);
    expect(f.publish.calls).toBe(1);
  });

  it('survives two callers racing for the same action', async () => {
    // A double click, or the scheduler ticking onto something a person just
    // approved. Exactly one must win the conditional claim.
    const approval = f.store.createApproval(f.task.id, 'social_post', POST, {
      projectId: f.project.id,
    });
    f.store.decideApproval(approval.id, 'approved');

    const outcomes = await Promise.all([
      execute(approval.id, f),
      execute(approval.id, f),
      execute(approval.id, f),
    ]);

    expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
    expect(f.publish.calls).toBe(1);
  });

  it('will not run a scheduled action before its time', async () => {
    const approval = f.store.createApproval(f.task.id, 'social_post', POST, {
      projectId: f.project.id,
      scheduledFor: new Date(Date.now() + 3_600_000).toISOString(),
    });
    f.store.decideApproval(approval.id, 'approved');

    const outcome = await execute(approval.id, f);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/scheduled for/);
    expect(f.publish.calls).toBe(0);
  });

  it('runs a scheduled action once its time has passed', async () => {
    const approval = f.store.createApproval(f.task.id, 'social_post', POST, {
      projectId: f.project.id,
      scheduledFor: new Date(Date.now() - 60_000).toISOString(),
    });
    f.store.decideApproval(approval.id, 'approved');

    expect((await execute(approval.id, f)).ok).toBe(true);
    expect(f.publish.calls).toBe(1);
  });

  it('hands the provider a token naming the approval it came from', async () => {
    const approval = f.store.createApproval(f.task.id, 'social_post', POST, {
      projectId: f.project.id,
    });
    f.store.decideApproval(approval.id, 'approved');
    await execute(approval.id, f);

    // Providers use this as an idempotency key, so it has to be the approval.
    expect(f.publish.tokens).toEqual([approval.id]);
  });

  it('leaves a failed action claimed, with the error recorded', async () => {
    // Deliberate: retrying a send that may have half-succeeded is worse than
    // leaving it visibly failed for a person to look at.
    const approval = f.store.createApproval(f.task.id, 'email', EMAIL, {
      projectId: f.project.id,
    });
    f.store.decideApproval(approval.id, 'approved');

    const outcome = await execute(approval.id, f);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(/provider is down/);

    const row = f.store.getApproval(approval.id)!;
    expect(row.executed_at).not.toBeNull();
    expect(row.error).toMatch(/provider is down/);

    expect((await execute(approval.id, f)).reason).toMatch(/already gone out/);
  });

  it('refuses an approval that does not exist', async () => {
    expect((await execute('nope', f)).reason).toMatch(/no such action/);
  });

  it('cannot be decided after it has gone out', async () => {
    const approval = f.store.createApproval(f.task.id, 'social_post', POST, {
      projectId: f.project.id,
    });
    f.store.decideApproval(approval.id, 'approved');
    await execute(approval.id, f);

    // Rejecting after the fact must not rewrite history into "never approved".
    f.store.decideApproval(approval.id, 'rejected');
    expect(f.store.getApproval(approval.id)!.status).toBe('approved');
  });
});

describe('nothing else can reach a provider', () => {
  /**
   * The architectural half of the guarantee.
   *
   * The `ExecutionToken` brand is a symbol `gate.ts` never exports, so no other
   * module can construct one and therefore no other module can call `publish`
   * or `send` - the compiler stops it. This test is the belt to that braces: it
   * reads the source and checks nobody has added a second door, for instance by
   * loosening the token type or calling a provider through `any`.
   */
  const core = path.join(process.cwd(), 'src', 'core');

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith('.ts') ? [full] : [];
    });
  }

  it('only gate.ts calls publish or send', () => {
    const offenders: string[] = [];

    for (const file of walk(core)) {
      const relative = path.relative(core, file);
      // The gate is the door. The providers define the methods. The tests
      // exercise them through the gate.
      if (relative === 'growth/gate.ts') continue;
      if (relative.startsWith('growth/') && /outbox|postiz|resend/.test(relative)) continue;
      if (relative.startsWith('__tests__/')) continue;

      const source = readFileSync(file, 'utf8');
      for (const [i, line] of source.split('\n').entries()) {
        if (/\.(publish|send)\s*\(/.test(line) && !line.trim().startsWith('*')) {
          offenders.push(`${relative}:${i + 1} ${line.trim().slice(0, 80)}`);
        }
      }
    }

    expect(offenders, 'a second route to a provider has appeared').toEqual([]);
  });

  it('the token brand is not exported', () => {
    const gate = readFileSync(path.join(core, 'growth', 'gate.ts'), 'utf8');
    // `declare const APPROVED: unique symbol` with no `export` in front of it.
    expect(gate).toMatch(/^declare const APPROVED: unique symbol;/m);
    expect(gate).not.toMatch(/export\s+declare\s+const\s+APPROVED/);
    // And exactly one place mints one.
    expect(gate.match(/function mint\(/g)).toHaveLength(1);
  });
});
