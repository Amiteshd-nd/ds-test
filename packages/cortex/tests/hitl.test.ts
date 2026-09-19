// M4 — write skills and human-in-the-loop gates.
//
// The Definition of Done for this milestone is one sentence: "no write skill can execute
// without a recorded approval". Everything here is a way of trying to make that false.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCortex, loadConfig, openDb, RunStore } from '../src/core/index.ts';
import type { Cortex } from '../src/core/index.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';
import { createAtlasAdapters, hostName, principalById, commentsOn, resetComments } from '../adapters-host/index.ts';
import type { AtlasAdapters } from '../adapters-host/index.ts';
import type { RunEvent } from '../src/core/adapters/types.ts';

const principal = principalById('ananya')!;
const COMMENT = { ref: 'doc:runbook-ingestion', body: 'The dead letter drain is manual on purpose.' };

interface Harness { cortex: Cortex; adapters: AtlasAdapters; store: RunStore; dsn: string }

function harness(name: string, fresh = true): Harness {
  const file = path.join(PACKAGE_ROOT, '.cortex', `test-hitl-${name}.db`);
  if (fresh) for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  const config = { ...loadConfig(), storage: { dsn: `file:${file}` } };
  const store = new RunStore(openDb(config.storage.dsn));
  const adapters = createAtlasAdapters(store, config);
  return { cortex: createCortex({ adapters, hostName, config, store }), adapters, store, dsn: config.storage.dsn };
}

async function proposeComment(h: Harness, args: Record<string, unknown> = COMMENT, agentId = 'atlas-scribe') {
  const run = await h.cortex.engine.start({
    agentId,
    principal,
    surface: 'chat',
    threadId: h.cortex.engine.newThreadId(principal),
    text: 'Leave a note on the ingestion runbook.',
    context: { proposeSkill: 'docs.comment', args },
  });
  let stepId: string | null = null;
  const events: RunEvent[] = [];
  for await (const { event } of h.adapters.transport.subscribe(run.id, 0)) {
    events.push(event);
    if (event.type === 'approval_requested') { stepId = event.stepId; break; }
    if (event.type === 'run_completed' || event.type === 'run_failed') break;
  }
  return { run, stepId, events };
}

async function settle(h: Harness, runId: string): Promise<void> {
  for await (const { event } of h.adapters.transport.subscribe(runId, 0)) {
    if (event.type === 'run_completed' || event.type === 'run_failed') return;
  }
}

test('a write skill stops at the gate and writes nothing', async () => {
  resetComments();
  const h = harness('gate');
  const { run, stepId, events } = await proposeComment(h);

  assert.ok(stepId, 'the run requested approval');
  assert.equal(commentsOn().length, 0, 'nothing was written before a human answered');
  assert.equal(h.store.getRun(run.id)?.status, 'awaiting_approval', 'and the status is durable before the event goes out');

  const requested = events.find((e) => e.type === 'approval_requested');
  assert.ok(requested && requested.type === 'approval_requested');
  // §9.2 — the payload is the exact action, the exact arguments, a readable rendering,
  // the reasoning, and the cost of proceeding.
  assert.equal(requested.payload.action, 'docs.comment');
  assert.deepEqual(requested.payload.args, COMMENT);
  assert.ok(requested.payload.human.length > 10);
  assert.ok(typeof requested.payload.costUsd === 'number');
});

test('approve executes the action exactly as proposed', async () => {
  resetComments();
  const h = harness('approve');
  const { run, stepId } = await proposeComment(h);
  await h.cortex.engine.decide(run.id, stepId as string, 'approve');
  await settle(h, run.id);

  assert.equal(h.store.getRun(run.id)?.status, 'succeeded');
  assert.equal(commentsOn().length, 1);
  assert.equal(commentsOn()[0].body, COMMENT.body);
  assert.equal(commentsOn()[0].authorId, 'ananya', 'written as the principal, not as the agent');
});

test('approve_with_edits executes the human edit, not the proposal', async () => {
  resetComments();
  const h = harness('edits');
  const { run, stepId } = await proposeComment(h);
  await h.cortex.engine.decide(run.id, stepId as string, 'approve_with_edits', {
    ref: COMMENT.ref,
    body: 'Rewritten by the person before it went out.',
  });
  await settle(h, run.id);

  assert.equal(commentsOn().length, 1);
  assert.equal(commentsOn()[0].body, 'Rewritten by the person before it went out.');
});

test('edits that do not fit the schema are refused before anything runs', async () => {
  resetComments();
  const h = harness('bad-edits');
  const { run, stepId } = await proposeComment(h);

  await assert.rejects(
    () => h.cortex.engine.decide(run.id, stepId as string, 'approve_with_edits', { ref: COMMENT.ref, body: 'x'.repeat(600) }),
    /do not fit/,
    'a 600-character body exceeds the manifest maxLength and is caught at the gate',
  );
  await assert.rejects(
    () => h.cortex.engine.decide(run.id, stepId as string, 'approve_with_edits', { ref: COMMENT.ref }),
    /required|do not fit/,
  );
  assert.equal(commentsOn().length, 0);
  assert.equal(h.store.getRun(run.id)?.status, 'awaiting_approval', 'and the run is still waiting, not broken');
});

test('rejection writes nothing, ends the run, and is remembered with its reason', async () => {
  resetComments();
  const h = harness('reject');
  const { run, stepId } = await proposeComment(h);
  await h.cortex.engine.decide(run.id, stepId as string, 'reject_with_reason', undefined, 'wrong document');

  assert.equal(commentsOn().length, 0);
  assert.equal(h.store.getRun(run.id)?.status, 'cancelled');

  const profile = await h.adapters.memory.getProfile('ananya');
  const remembered = [...profile.facts, ...profile.preferences].find((f) => f.value.includes('wrong document'));
  assert.ok(remembered, 'the reason is fed back into memory — a rejection nobody learns from is earned again');
  assert.ok(remembered.value.includes('docs.comment'), 'and it names the action that was rejected');
});

test('an awaiting_approval run survives a restart and is still approvable', async () => {
  resetComments();
  const first = harness('restart');
  const { run, stepId } = await proposeComment(first);
  assert.equal(commentsOn().length, 0);

  // A deploy: a brand-new process over the same database. Nothing is carried across in
  // memory — the run, its checkpoint, and its pending approval are all rows.
  const second = harness('restart', false);
  const reloaded = second.store.getRun(run.id);
  assert.equal(reloaded?.status, 'awaiting_approval');
  assert.ok(second.store.pendingApproval(run.id), 'the pending approval is still there');

  await second.cortex.engine.decide(run.id, stepId as string, 'approve');
  await settle(second, run.id);

  assert.equal(second.store.getRun(run.id)?.status, 'succeeded');
  assert.equal(commentsOn().length, 1, 'the action a human approved days later still runs');
});

test('approving the same action twice does not perform it twice', async () => {
  resetComments();
  const h = harness('double');
  const { run, stepId } = await proposeComment(h);
  await h.cortex.engine.decide(run.id, stepId as string, 'approve');
  await settle(h, run.id);
  assert.equal(commentsOn().length, 1);

  // The run is finished, so a second decision is refused outright — and even if it were
  // not, the approval is marked executed and the idempotency window would absorb it.
  await assert.rejects(() => h.cortex.engine.decide(run.id, stepId as string, 'approve'), /not awaiting approval/);
  assert.equal(h.store.decidedApprovals(run.id).length, 0, 'the approval is marked executed');
  assert.equal(commentsOn().length, 1);
});

test('an identical approved action inside the idempotency window writes once', async () => {
  resetComments();
  const h = harness('idempotent');
  for (const pass of [1, 2]) {
    const { run, stepId } = await proposeComment(h);
    await h.cortex.engine.decide(run.id, stepId as string, 'approve');
    await settle(h, run.id);
    assert.equal(h.store.getRun(run.id)?.status, 'succeeded', `pass ${pass} completed`);
  }
  // Two runs, two approvals, one comment: the manifest's idempotency key is (ref, body)
  // inside ten minutes. For a write skill this is the difference between one comment and
  // two identical ones under a retry.
  assert.equal(commentsOn().length, 1);
});

test('an entitlement lost between proposal and approval stops the write', async () => {
  resetComments();
  const h = harness('revoked-entitlement');
  const { run, stepId } = await proposeComment(h);

  // The approval sat in someone's inbox; in the meantime the person lost the right.
  const original = h.adapters.identity.entitlements.bind(h.adapters.identity);
  h.adapters.identity.entitlements = async (p) => {
    const set = await original(p);
    set.delete('docs.comment');
    return set;
  };

  await h.cortex.engine.decide(run.id, stepId as string, 'approve');
  await settle(h, run.id);
  h.adapters.identity.entitlements = original;

  assert.equal(commentsOn().length, 0, 'a human approving an action does not grant a permission they lack');
});

test('a surface cannot propose a skill outside the agent allow-list', async () => {
  resetComments();
  const h = harness('allow-list');
  // atlas-guide is read-only and does not carry docs.comment. Proposing it anyway is
  // refused: the allow-list is the boundary, not a suggestion.
  const run = await h.cortex.engine.start({
    agentId: 'atlas-guide',
    principal,
    surface: 'chat',
    threadId: h.cortex.engine.newThreadId(principal),
    text: 'comment on the runbook',
    context: { proposeSkill: 'docs.comment', args: COMMENT },
  });
  const notices: string[] = [];
  for await (const { event } of h.adapters.transport.subscribe(run.id, 0)) {
    if (event.type === 'notice') notices.push(event.message);
    if (event.type === 'run_completed' || event.type === 'run_failed') break;
  }
  assert.equal(commentsOn().length, 0);
  assert.ok(notices.some((n) => /not allowed to use/.test(n)), `expected a refusal notice, got ${JSON.stringify(notices)}`);
});
