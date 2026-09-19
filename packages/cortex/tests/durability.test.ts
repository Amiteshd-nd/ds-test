// The M1 Definition of Done, as a test: "killing the process mid-run and restarting
// resumes it." PRD §19 M1, §6.3, §9.3.
//
// This spawns a real child process, SIGKILLs it while the model step is streaming — no
// shutdown hook, no chance to flush anything — and then brings up a fresh engine over
// the same database and asks it to recover.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCortex, loadConfig, openDb, RunStore } from '../src/core/index.ts';
import { createAtlasAdapters, hostName } from '../adapters-host/index.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

test('a run killed mid-flight resumes after a restart', async (t) => {
  const dbFile = path.join(PACKAGE_ROOT, '.cortex', 'test-durability.db');
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });

  // -- act one: a process that dies while composing --------------------------
  const child = spawn(process.execPath, [path.join(HERE, 'fixtures/start-and-hang.ts'), dbFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  const runId = await new Promise<string>((resolve, reject) => {
    let buf = '';
    let id = '';
    const timer = setTimeout(() => reject(new Error(`child never reached the compose step: ${buf}`)), 20_000);
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      const m = /RUN (\S+)/.exec(buf);
      if (m) id = m[1];
      if (buf.includes('COMPOSING') && id) {
        clearTimeout(timer);
        child.kill('SIGKILL'); // no cleanup, no flush, no final status write
        resolve(id);
      }
    });
    child.stderr.on('data', (d: Buffer) => (buf += d.toString()));
    child.on('exit', () => { if (!id) { clearTimeout(timer); reject(new Error(`child exited early: ${buf}`)); } });
  });
  await new Promise((r) => child.on('exit', r));

  // -- act two: a fresh process over the same database -----------------------
  const config = { ...loadConfig(), storage: { dsn: `file:${dbFile}` } };
  const store = new RunStore(openDb(config.storage.dsn));

  const before = store.getRun(runId);
  assert.ok(before, 'the run survived the kill as a durable row');
  assert.equal(before.status, 'running', 'the killed process left the run marked running');
  const checkpoint = store.readCheckpoint(runId);
  assert.ok(checkpoint, 'a checkpoint was written before the process died');

  const adapters = createAtlasAdapters(store, config);
  const cortex = createCortex({ adapters, hostName, config, store });
  const resumed = await cortex.engine.recover();
  assert.equal(resumed, 1, 'recover() picked up exactly the stranded run');

  const deadline = Date.now() + 20_000;
  let status = store.getRun(runId)?.status;
  while (status !== 'succeeded' && status !== 'failed' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    status = store.getRun(runId)?.status;
  }
  assert.equal(status, 'succeeded', 'the resumed run ran to completion in the new process');

  // The answer is in the event log, which is what a reconnecting client would read.
  const events = store.eventsAfter(runId, 0);
  assert.ok(events.some((e) => e.event.type === 'token'), 'the resumed run produced answer tokens');
  assert.ok(events.some((e) => e.event.type === 'run_completed'), 'and a terminal event');
  t.diagnostic(`resumed at node "${checkpoint.node}" after ${events.length} durable events`);
});
