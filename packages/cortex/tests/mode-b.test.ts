// §9.1 Mode B — supervisor and sub-agents.
//
// The PRD's rules for this are specific and each one exists because the alternative is
// expensive: max depth 2, max fan-out 5, a supervisor cannot grant what it lacks, and a
// sub-agent run is a real run with its own trace and its own budget. These are those
// rules, one test each.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCortex, loadConfig, openDb, RunStore, AgentRegistry, SkillRegistry, PromptStore } from '../src/core/index.ts';
import type { Cortex, CortexConfig } from '../src/core/index.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';
import { createAtlasAdapters, hostName, principalById } from '../adapters-host/index.ts';
import type { AtlasAdapters } from '../adapters-host/index.ts';

const principal = principalById('ananya')!;
const QUESTION = 'Who owns ingestion v2, and what decision is holding its rollout?';

function harness(name: string, dynamic: boolean): { cortex: Cortex; adapters: AtlasAdapters; store: RunStore; config: CortexConfig } {
  const file = path.join(PACKAGE_ROOT, '.cortex', `test-modeb-${name}.db`);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  const base = loadConfig();
  const config = {
    ...base,
    storage: { dsn: `file:${file}` },
    features: { ...base.features, 'orchestration.dynamic': dynamic },
  };
  const store = new RunStore(openDb(config.storage.dsn));
  const adapters = createAtlasAdapters(store, config);
  return { cortex: createCortex({ adapters, hostName, config, store }), adapters, store, config };
}

async function run(h: { cortex: Cortex; adapters: AtlasAdapters }, agentId = 'atlas-supervisor'): Promise<string> {
  const started = await h.cortex.engine.start({
    agentId, principal, surface: 'chat',
    threadId: h.cortex.engine.newThreadId(principal), text: QUESTION,
  });
  for await (const { event } of h.adapters.transport.subscribe(started.id, 0)) {
    if (event.type === 'run_completed' || event.type === 'run_failed') break;
  }
  return started.id;
}

const delegations = (store: RunStore, runId: string) =>
  store.traces(runId).filter((t) => t.kind === 'subagent').map((t) => t.payload as { agentId: string; runId: string; status: string; costUsd: number });

test('with the flag off, a supervisor is just an agent', async () => {
  const h = harness('off', false);
  const runId = await run(h);
  assert.equal(delegations(h.store, runId).length, 0, 'nothing was delegated');
  assert.equal(h.store.steps(runId).filter((s) => s.kind === 'subagent').length, 0);
  assert.equal(h.store.getRun(runId)?.status, 'succeeded', 'and it still answered');
});

test('with the flag on, each delegation is a real run with a parent', async () => {
  const h = harness('on', true);
  const runId = await run(h);
  const delegated = delegations(h.store, runId);

  assert.ok(delegated.length >= 1, 'at least one specialist was asked');
  assert.ok(delegated.length <= 5, '§9.1 caps fan-out at five');

  for (const d of delegated) {
    const subRun = h.store.getRun(d.runId);
    assert.ok(subRun, 'the sub-agent run exists as a durable row');
    assert.equal(subRun.parentRunId, runId, 'with its parent recorded');
    assert.equal(subRun.agentId, d.agentId);
    // Independently traceable, which is what makes a sub-agent independently evaluable.
    assert.ok(h.store.steps(d.runId).length > 0, `${d.agentId} has its own steps`);
    assert.ok(h.cortex.traces.get(d.runId), `${d.agentId} has its own trace`);
  }
});

test('a sub-agent cannot delegate again', async () => {
  const h = harness('depth', true);
  const parent = await h.cortex.engine.start({
    agentId: 'atlas-people', principal, surface: 'background', threadId: null, text: QUESTION,
  });
  const child = await h.cortex.engine.start({
    agentId: 'atlas-decisions', principal, surface: 'background', threadId: null, text: QUESTION,
    parentRunId: parent.id,
  });

  // Depth 2 is the cap: parent → child is fine, child → grandchild is not.
  await assert.rejects(
    () => h.cortex.engine.start({
      agentId: 'atlas-people', principal, surface: 'background', threadId: null, text: QUESTION,
      parentRunId: child.id,
    }),
    /capped at one level/,
  );
});

test('a supervisor cannot grant a specialist an entitlement it does not itself have', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-modeb-'));
  fs.writeFileSync(path.join(dir, 'sub.agent.yaml'), manifest('narrow-specialist', { entitlements: ['docs.read', 'hiring.read'], skills: [] }));
  fs.writeFileSync(path.join(dir, 'boss.agent.yaml'), manifest('narrow-boss', { entitlements: ['docs.read'], skills: ['agent:narrow-specialist'] }));

  assert.throws(
    () => AgentRegistry.load(SkillRegistry.load(), dir, new PromptStore()),
    /requires entitlement "hiring.read"/,
    'a supervisor that is visible to someone who cannot use its specialist is a trap',
  );
});

test('a supervisor may not name another supervisor', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-modeb-'));
  fs.writeFileSync(path.join(dir, 'leaf.agent.yaml'), manifest('chain-leaf', { entitlements: ['docs.read'], skills: [] }));
  fs.writeFileSync(path.join(dir, 'mid.agent.yaml'), manifest('chain-mid', { entitlements: ['docs.read'], skills: ['agent:chain-leaf'] }));
  fs.writeFileSync(path.join(dir, 'top.agent.yaml'), manifest('chain-top', { entitlements: ['docs.read'], skills: ['agent:chain-mid'] }));

  assert.throws(
    () => AgentRegistry.load(SkillRegistry.load(), dir, new PromptStore()),
    /itself a supervisor/,
    'the depth cap is enforced at load as well as at runtime',
  );
});

test('fan-out beyond five is refused at load', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-modeb-'));
  const subs: string[] = [];
  for (let i = 0; i < 6; i++) {
    fs.writeFileSync(path.join(dir, `s${i}.agent.yaml`), manifest(`fan-${i}`, { entitlements: ['docs.read'], skills: [] }));
    subs.push(`agent:fan-${i}`);
  }
  fs.writeFileSync(path.join(dir, 'boss.agent.yaml'), manifest('fan-boss', { entitlements: ['docs.read'], skills: subs }));

  assert.throws(() => AgentRegistry.load(SkillRegistry.load(), dir, new PromptStore()), /caps fan-out at 5/);
});

test('a specialist that fails does not fail the supervisor', async () => {
  const h = harness('partial', true);
  // Break one specialist's retrieval only. The supervisor should answer from the other
  // and say that one could not help — §9.3's partial results, one level up.
  const realSearch = h.adapters.retrieval.search.bind(h.adapters.retrieval);
  let calls = 0;
  h.adapters.retrieval.search = async (q, p) => {
    calls++;
    if (calls === 3) throw new Error('retrieval is down for this one');
    return realSearch(q, p);
  };

  const runId = await run(h);
  h.adapters.retrieval.search = realSearch;

  const delegated = delegations(h.store, runId);
  assert.ok(delegated.some((d) => d.status === 'failed'), 'one specialist failed');
  assert.ok(delegated.some((d) => d.status === 'succeeded'), 'and one did not');
  assert.equal(h.store.getRun(runId)?.status, 'succeeded', 'the supervisor still answered');
});

function manifest(id: string, opts: { entitlements: string[]; skills: string[] }): string {
  return `
id: ${id}
version: 1
name: ${id}
description: A manifest built by a test.
owner: tests
surfaces: [chat]
visibility: { entitlements: ${JSON.stringify(opts.entitlements)} }
model_policy: { default: fast.cheap, max_cost_usd_per_run: 0.01 }
prompt: atlas-guide@1
skills: ${JSON.stringify(opts.skills)}
grounding: { sources: [doc], max_context_tokens: 1000 }
memory: { session: { turns: 2, semantic_recall: false }, profile: { read: [], write: [] } }
hitl: { gates: [] }
output: { formats: [text] }
evals: { golden_set: evals/golden/${id}/, min_pass_rate: 0.9 }
`;
}
