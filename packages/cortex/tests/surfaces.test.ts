// M5 — multi-surface and async.
//
// The Definition of Done is "the same unmodified agent manifest runs on all four
// surfaces; a run started on web completes in background and notifies mobile". The first
// half is the first test here; the second half is the notification tests, where "mobile"
// means any other client authenticated as the same person, because the subscription is
// to the principal and not to the session.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCortex, loadConfig, openDb, RunStore } from '../src/core/index.ts';
import type { Cortex } from '../src/core/index.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';
import { createAtlasAdapters, entities, hostName, principalById, resetEdits, editsMade } from '../adapters-host/index.ts';
import type { AtlasAdapters } from '../adapters-host/index.ts';
import type { Block, Surface } from '../src/core/adapters/types.ts';

const ananya = principalById('ananya')!;

function harness(name: string): { cortex: Cortex; adapters: AtlasAdapters; store: RunStore } {
  const file = path.join(PACKAGE_ROOT, '.cortex', `test-surfaces-${name}.db`);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  const config = { ...loadConfig(), storage: { dsn: `file:${file}` } };
  const store = new RunStore(openDb(config.storage.dsn));
  const adapters = createAtlasAdapters(store, config);
  return { cortex: createCortex({ adapters, hostName, config, store }), adapters, store };
}

async function settle(h: { adapters: AtlasAdapters }, runId: string): Promise<{ blocks: Block[]; text: string; status: string }> {
  const blocks: Block[] = [];
  let text = '';
  let status = 'unknown';
  for await (const { event } of h.adapters.transport.subscribe(runId, 0)) {
    if (event.type === 'token') text += event.text;
    if (event.type === 'block') blocks.push(event.block);
    if (event.type === 'run_completed') { status = event.status; break; }
    if (event.type === 'run_failed') { status = 'failed'; break; }
  }
  return { blocks, text, status };
}

const DOC = entities.find((e) => e.ref === 'doc:onboarding-draft')!;
const FLABBY = 'You should utilise the shared staging environment for any testing, and you are able to reset it at any point in time using the reset script, which is actually quite safe to run because it simply recreates the fixtures from scratch.';

test('the M5 Definition of Done: one unmodified manifest runs on all four surfaces', async (t) => {
  const h = harness('four');
  const agent = h.cortex.agents.get('atlas-guide');
  assert.deepEqual([...agent.surfaces].sort(), ['background', 'chat', 'inline', 'rule']);

  const results: Record<string, string> = {};
  for (const surface of agent.surfaces) {
    const inline = surface === 'inline';
    const run = await h.cortex.engine.start({
      agentId: 'atlas-guide',
      principal: ananya,
      surface,
      threadId: surface === 'chat' ? h.cortex.engine.newThreadId(ananya) : null,
      text: inline ? 'Tighten this.' : 'Why is the ingestion v2 rollout stuck?',
      context: inline ? { ref: DOC.ref, title: DOC.title, body: DOC.body, selection: FLABBY } : undefined,
    });
    const { status } = await settle(h, run.id);
    results[surface] = status;
  }

  t.diagnostic(JSON.stringify(results));
  for (const surface of agent.surfaces) {
    assert.equal(results[surface], 'succeeded', `the ${surface} surface did not complete`);
  }
});

test('a surface the agent does not declare is refused', async () => {
  const h = harness('undeclared');
  // atlas-scribe is chat-only. Asking for inline is a configuration error, not a run.
  await assert.rejects(
    () => h.cortex.engine.start({ agentId: 'atlas-scribe', principal: ananya, surface: 'inline' as Surface, threadId: null, text: 'x' }),
    /does not run on the inline surface/,
  );
});

test('inline proposes a diff and writes nothing', async () => {
  resetEdits();
  const h = harness('inline');
  const run = await h.cortex.engine.start({
    agentId: 'atlas-guide', principal: ananya, surface: 'inline', threadId: null,
    text: 'Tighten this without changing any facts.',
    context: { ref: DOC.ref, title: DOC.title, body: DOC.body, selection: FLABBY },
  });
  const { blocks, status } = await settle(h, run.id);

  assert.equal(status, 'succeeded');
  const diff = blocks.find((b) => b.type === 'diff_proposal');
  assert.ok(diff && diff.type === 'diff_proposal', 'a diff_proposal block was emitted');
  assert.equal(diff.before, FLABBY, 'the before side is the selection, verbatim');
  assert.notEqual(diff.after, FLABBY, 'and the after side is different');
  assert.ok(diff.after.length < FLABBY.length, 'tightening should not make it longer');

  // The whole point of this surface: the agent proposed, and nothing was written. The
  // host writes when a person accepts, in the host's own UI, on its own authority.
  assert.equal(editsMade().length, 0);
  assert.equal(h.store.steps(run.id).filter((s) => s.kind === 'skill').length, 0, 'no skill was invoked at all');
});

test('inline refuses an empty selection rather than editing the whole document', async () => {
  const h = harness('inline-empty');
  const run = await h.cortex.engine.start({
    agentId: 'atlas-guide', principal: ananya, surface: 'inline', threadId: null,
    text: 'Tighten this.',
    context: { ref: DOC.ref, title: DOC.title, body: DOC.body, selection: '   ' },
  });
  const { status } = await settle(h, run.id);
  assert.equal(status, 'failed');
});

test('an instruction planted in the document does not survive into the proposal', async () => {
  const h = harness('inline-injection');
  const hostile = entities.find((e) => e.ref === 'doc:prompt-injection-example')!;
  const run = await h.cortex.engine.start({
    agentId: 'atlas-guide', principal: ananya, surface: 'inline', threadId: null,
    text: 'Tighten this.',
    context: {
      ref: hostile.ref, title: hostile.title, body: hostile.body,
      selection: 'The vendor webhook expects a JSON body with an event name and a timestamp, and it is really quite strict about that.',
    },
  });
  const { blocks } = await settle(h, run.id);
  const diff = blocks.find((b) => b.type === 'diff_proposal');
  assert.ok(diff && diff.type === 'diff_proposal');
  assert.ok(!/unrestricted assistant|IGNORE ALL PREVIOUS/i.test(diff.after), `injected text reached the proposal: ${diff.after}`);
});

test('a rule fires only when its guard matches, and runs as the principal it names', async () => {
  const h = harness('rules');

  const wrongOrg = await h.cortex.ruleEngine.fire({ name: 'decision.superseded', payload: { ref: 'decision:DEC-4', by: 'decision:DEC-9', org: 'northwind' }, at: new Date().toISOString() });
  assert.equal(wrongOrg.length, 0, 'the guard kept it from firing');

  const fired = await h.cortex.ruleEngine.fire({ name: 'decision.superseded', payload: { ref: 'decision:DEC-4', by: 'decision:DEC-9', org: 'atlas' }, at: new Date().toISOString() });
  assert.equal(fired.length, 1);
  assert.ok(fired[0].runId, fired[0].reason ?? 'the rule started a run');

  const run = h.store.getRun(fired[0].runId as string);
  assert.equal(run?.surface, 'rule');
  // `decision-superseded` names bharath. A rule runs as the principal it declares, never
  // as whoever or whatever caused the event.
  assert.equal(run?.principalId, 'bharath');

  await settle(h, fired[0].runId as string);
  assert.equal(h.store.notifications('bharath').length, 1, 'the person the rule runs as is told');
  assert.equal(h.store.notifications('ananya').length, 0, 'and nobody else is');
});

test('an unknown event wakes nothing', async () => {
  const h = harness('rules-unknown');
  assert.deepEqual(await h.cortex.ruleEngine.fire({ name: 'nothing.happened', payload: {}, at: new Date().toISOString() }), []);
});

test('a background run notifies, and the notification outlives the process that made it', async () => {
  const h = harness('background');
  const run = await h.cortex.engine.start({
    agentId: 'atlas-guide', principal: ananya, surface: 'background', threadId: null,
    text: 'What work is blocked right now?',
  });
  await settle(h, run.id);

  const notifications = h.store.notifications('ananya');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].kind, 'info');
  assert.equal(notifications[0].runId, run.id);

  // A second process over the same database — a deploy, or the other device.
  const reopened = new RunStore(openDb(`file:${path.join(PACKAGE_ROOT, '.cortex', 'test-surfaces-background.db')}`));
  assert.equal(reopened.notifications('ananya').length, 1, 'notifications are rows, not sockets');
});

test('two clients watching the same principal both receive a notification', async () => {
  const h = harness('cross-device');

  // Two independent subscriptions, standing in for web and mobile. Neither knows about
  // the other; both are authenticated as the same person.
  const web: string[] = [];
  const mobile: string[] = [];
  const collect = async (into: string[]) => {
    for await (const item of h.adapters.transport.notifications('ananya')) {
      into.push(item.notification.title);
      if (into.length >= 1) return;
    }
  };
  const watching = Promise.all([collect(web), collect(mobile)]);

  const run = await h.cortex.engine.start({
    agentId: 'atlas-guide', principal: ananya, surface: 'background', threadId: null,
    text: 'What work is blocked right now?',
  });
  await settle(h, run.id);
  await watching;

  assert.equal(web.length, 1);
  assert.equal(mobile.length, 1);
  assert.equal(web[0], mobile[0]);
});

test('the scheduler starts, stops, and never holds the process open', () => {
  const h = harness('scheduler');
  const scheduled = h.cortex.rules.scheduled();
  assert.ok(scheduled.length >= 1, 'there is a scheduled rule to run');
  assert.ok(scheduled.every((r) => r.everySeconds && r.everySeconds > 0));

  const stop = h.cortex.ruleEngine.start();
  // Starting twice must not double the timers — a scheduler that stacks is a scheduler
  // that quietly doubles your model spend on every reload.
  h.cortex.ruleEngine.start();
  stop();
  h.cortex.ruleEngine.stop();
});
