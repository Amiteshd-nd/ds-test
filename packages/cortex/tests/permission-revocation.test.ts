// Addendum C5 item 4 — permission revoked mid-run.
//
// Retrieval filters on permission, and then a few milliseconds pass before the model
// starts writing. Someone leaves a team in those milliseconds. This asserts what the
// system does about it, and — just as importantly — pins the edge of the guarantee so
// nobody later assumes it extends further than it does.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { PolicyAdapter } from '../src/core/adapters/policy.ts';
import { createCortex, loadConfig, openDb, RunStore } from '../src/core/index.ts';
import { createAtlasAdapters, hostName, principalById } from '../adapters-host/index.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';
import fs from 'node:fs';
import path from 'node:path';

/** Wraps the host's policy and revokes everything after the Nth canRead call. */
function revokingPolicy(inner: PolicyAdapter, afterCalls: number): PolicyAdapter {
  let calls = 0;
  return {
    async canRead(principal, refs) {
      calls++;
      if (calls > afterCalls) return refs.map(() => false);
      return inner.canRead(principal, refs);
    },
    canInvoke: inner.canInvoke.bind(inner),
    redact: inner.redact.bind(inner),
  };
}

function harness(name: string, wrap: (p: PolicyAdapter) => PolicyAdapter) {
  const dbFile = path.join(PACKAGE_ROOT, '.cortex', `test-${name}.db`);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
  const config = { ...loadConfig(), storage: { dsn: `file:${dbFile}` } };
  const store = new RunStore(openDb(config.storage.dsn));
  const adapters = createAtlasAdapters(store, config);
  const wrapped = { ...adapters, policy: wrap(adapters.policy) };
  const cortex = createCortex({ adapters: wrapped, hostName, config, store });
  return { cortex, adapters: wrapped, store };
}

test('a run whose permissions are revoked after retrieval fails instead of answering', async () => {
  // The retrieval filter is the first canRead of the run; everything after it is revoked.
  const h = harness('revocation', (p) => revokingPolicy(p, 1));
  const principal = principalById('ananya');
  assert.ok(principal);

  const run = await h.cortex.engine.start({
    agentId: 'atlas-guide',
    principal,
    surface: 'chat',
    threadId: h.cortex.engine.newThreadId(principal),
    text: 'Why is the ingestion v2 rollout stuck?',
  });

  let failure: { kind: string; message: string } | null = null;
  let tokens = '';
  for await (const { event } of h.adapters.transport.subscribe(run.id, 0)) {
    if (event.type === 'token') tokens += event.text;
    if (event.type === 'run_failed') failure = event.error;
  }

  assert.ok(failure, 'the run should have failed');
  assert.equal(failure.kind, 'permission_denied');
  assert.equal(tokens, '', 'not one token of an answer built on revoked records should be emitted');
  assert.equal(h.store.getRun(run.id)?.status, 'failed');

  const trace = h.store.traces(run.id).find((t) => t.kind === 'permission_revoked_mid_run');
  assert.ok(trace, 'the revocation is recorded in the trace, not just in the error');
});

test('the guarantee stops where the stream starts, and that limit is deliberate', async () => {
  // Revoking only after compose has re-checked (call 3+) leaves the run to finish. This
  // is not a bug being papered over: it is the documented edge. Once tokens are moving,
  // the run completes with the context it had, and the next turn's memory read is where
  // PolicyAdapter.redact catches up. Pinning it here means a future change that widens
  // the window has to change this test on purpose.
  const h = harness('revocation-late', (p) => revokingPolicy(p, 10));
  const principal = principalById('ananya');
  assert.ok(principal);

  const run = await h.cortex.engine.start({
    agentId: 'atlas-guide',
    principal,
    surface: 'chat',
    threadId: h.cortex.engine.newThreadId(principal),
    text: 'Why is the ingestion v2 rollout stuck?',
  });
  for await (const { event } of h.adapters.transport.subscribe(run.id, 0)) {
    if (event.type === 'run_completed') break;
  }
  assert.equal(h.store.getRun(run.id)?.status, 'succeeded');
});
