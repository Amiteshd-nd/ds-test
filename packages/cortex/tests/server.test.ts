// The HTTP surface, through a real server process.
//
// Most of this codebase is testable in-process, and is tested that way. These are the
// controls that only exist at the route layer — who may do what — and an untested
// security control is a security control that is one refactor from gone.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';

const PORT = 6183; // outside the 4xxx/5xxx ranges the repo forbids
const BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess;

async function boot(): Promise<void> {
  const dbFile = path.join(PACKAGE_ROOT, '.cortex', 'test-server.db');
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });

  server = spawn(process.execPath, [path.join(PACKAGE_ROOT, 'src/server/main.ts')], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, CORTEX_PORT: String(PORT), CORTEX_DSN: `file:${dbFile}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/v1/ready`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error('the server never became ready');
    await new Promise((r) => setTimeout(r, 150));
  }
}

const as = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

test('server routes', async (t) => {
  await boot();
  t.after(() => server.kill('SIGKILL'));

  await t.test('an unauthenticated request is refused everywhere that matters', async () => {
    for (const route of ['/v1/agents', '/v1/threads', '/v1/memory/me', '/v1/notifications', '/v1/traces']) {
      const res = await fetch(`${BASE}${route}`, { method: route === '/v1/threads' ? 'POST' : 'GET' });
      assert.equal(res.status, 403, `${route} was reachable without a session`);
    }
  });

  await t.test('only the host itself may emit host events', async () => {
    const body = JSON.stringify({ name: 'decision.superseded', payload: { ref: 'decision:DEC-4', by: 'decision:DEC-9', org: 'atlas' } });

    // A rule runs as the principal *it* names — `decision-superseded` runs as a team
    // lead. An events endpoint open to any signed-in member would let a member set
    // someone else's agent to work with someone else's permissions.
    const member = await fetch(`${BASE}/v1/events`, { method: 'POST', headers: as('tok_ananya'), body });
    assert.equal(member.status, 403);
    const denial = (await member.json()) as { error: { kind: string; message: string } };
    assert.equal(denial.error.kind, 'permission_denied');
    assert.match(denial.error.message, /host itself/);

    const host = await fetch(`${BASE}/v1/events`, { method: 'POST', headers: as('tok_service'), body });
    assert.equal(host.status, 202);
    const fired = (await host.json()) as { fired: { ruleId: string; runId: string | null }[] };
    assert.equal(fired.fired.length, 1);
    assert.equal(fired.fired[0].ruleId, 'decision-superseded');
  });

  await t.test('a notification belongs to one principal and nobody else', async () => {
    // The event above started a run as bharath, which notifies bharath.
    const deadline = Date.now() + 15_000;
    let mine: { notifications: unknown[] } = { notifications: [] };
    while (Date.now() < deadline) {
      mine = (await (await fetch(`${BASE}/v1/notifications`, { headers: as('tok_bharath') })).json()) as { notifications: unknown[] };
      if (mine.notifications.length > 0) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(mine.notifications.length > 0, 'the lead was notified');

    const theirs = (await (await fetch(`${BASE}/v1/notifications`, { headers: as('tok_ananya') })).json()) as { notifications: unknown[] };
    assert.equal(theirs.notifications.length, 0, 'and the member who did not run it sees nothing');
  });

  await t.test("one principal cannot read another's run", async () => {
    const thread = (await (await fetch(`${BASE}/v1/threads`, { method: 'POST', headers: as('tok_ananya') })).json()) as { threadId: string };
    const sent = (await (await fetch(`${BASE}/v1/threads/${encodeURIComponent(thread.threadId)}/messages`, {
      method: 'POST', headers: as('tok_ananya'), body: JSON.stringify({ text: 'Who owns the ingestion pipeline?' }),
    })).json()) as { runId: string };

    const stranger = await fetch(`${BASE}/v1/runs/${sent.runId}`, { headers: as('tok_wren') });
    // 404 rather than 403: confirming a run exists is itself a disclosure.
    assert.equal(stranger.status, 404);

    const owner = await fetch(`${BASE}/v1/runs/${sent.runId}`, { headers: as('tok_ananya') });
    assert.equal(owner.status, 200);
  });

  await t.test("one principal cannot post into another's thread", async () => {
    const thread = (await (await fetch(`${BASE}/v1/threads`, { method: 'POST', headers: as('tok_ananya') })).json()) as { threadId: string };
    const intruder = await fetch(`${BASE}/v1/threads/${encodeURIComponent(thread.threadId)}/messages`, {
      method: 'POST', headers: as('tok_bharath'), body: JSON.stringify({ text: 'hello' }),
    });
    assert.equal(intruder.status, 403);
  });

  await t.test('the AG-UI protocol view is available on the same stream', async () => {
    const thread = (await (await fetch(`${BASE}/v1/threads`, { method: 'POST', headers: as('tok_ananya') })).json()) as { threadId: string };
    const sent = (await (await fetch(`${BASE}/v1/threads/${encodeURIComponent(thread.threadId)}/messages`, {
      method: 'POST', headers: as('tok_ananya'), body: JSON.stringify({ text: 'What is our guidance on empty states?' }),
    })).json()) as { runId: string };

    const res = await fetch(`${BASE}/v1/runs/${sent.runId}/events?protocol=ag-ui`, { headers: as('tok_ananya') });
    const body = await res.text();
    assert.match(body, /"type":"RUN_STARTED"/);
    assert.match(body, /"type":"TEXT_MESSAGE_CONTENT"/);
    assert.match(body, /"type":"RUN_FINISHED"/);
    assert.ok(!body.includes('"type":"run_started"'), 'the native names are not mixed into the AG-UI view');
  });
});
