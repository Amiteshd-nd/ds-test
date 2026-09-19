// Addendum C1 — the trace store, and the one guarantee in §8 that is about it:
// "no production trace payload written without passing through redact".

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TraceStore, TraceExporter, FileBlobStore, openDb, RunStore, loadConfig, createCortex } from '../src/core/index.ts';
import { record, newSpanId } from '../src/core/telemetry/trace.ts';
import type { PolicyAdapter } from '../src/core/adapters/policy.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';
import { createAtlasAdapters, hostName, principalById } from '../adapters-host/index.ts';

function db(name: string) {
  const file = path.join(PACKAGE_ROOT, '.cortex', `test-${name}.db`);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  return { file, handle: openDb(`file:${file}`) };
}

const principal = principalById('ananya')!;

/** A policy that redacts everything, so a leak is unmistakable. */
const redactEverything: PolicyAdapter = {
  async canRead(_p, refs) { return refs.map(() => true); },
  async canInvoke() { return { outcome: 'allow', reason: 'ok' }; },
  async redact(_p, doc) { return { ...doc, title: '[redacted]', body: '[redacted]' }; },
};

test('production payloads pass through redact before they are written', async () => {
  const { handle } = db('telemetry-prod');
  const traces = new TraceStore(handle);
  const blobs = new FileBlobStore(fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-blobs-')));
  const exporter = new TraceExporter({ traces, blobs, mode: 'production', policy: redactEverything, retentionDays: 7 });
  const stop = exporter.start();

  exporter.begin('run-prod', principal, 'atlas-guide', 1, 'chat');
  record({
    name: 'compose', runId: 'run-prod', kind: 'model', spanId: newSpanId(),
    startedAt: Date.now() - 5, endedAt: Date.now(), status: 'ok', attrs: {},
    payload: {
      prompt: 'SOURCES\nthe restricted salary band is 42',
      chunks: [{ ref: 'doc:comp-bands-2026', title: 'Compensation bands 2026', text: 'the midpoint is 42' }],
    },
  });
  await exporter.flush();
  stop();

  const stored = traces.get('run-prod');
  const ref = stored?.spans[0].payloadRef;
  assert.ok(ref, 'the payload was written to the blob store');
  const payload = (await blobs.get(ref)) as { prompt: string; chunks: { title: string; text: string }[] };

  assert.ok(!payload.prompt.includes('restricted salary band'), 'the rendered prompt is not stored verbatim in production');
  assert.equal(payload.chunks[0].text, '[redacted]', 'chunk bodies go through the host redactor');
  assert.equal(payload.chunks[0].title, '[redacted]');
  const raw = JSON.stringify(payload);
  assert.ok(!raw.includes('midpoint is 42'), `restricted content survived into the trace: ${raw}`);
});

test('development payloads are kept whole, because that is what a dev trace is for', async () => {
  const { handle } = db('telemetry-dev');
  const traces = new TraceStore(handle);
  const blobs = new FileBlobStore(fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-blobs-')));
  const exporter = new TraceExporter({ traces, blobs, mode: 'development', policy: redactEverything, retentionDays: 30 });
  const stop = exporter.start();

  exporter.begin('run-dev', principal, 'atlas-guide', 1, 'chat');
  record({
    name: 'compose', runId: 'run-dev', kind: 'model', spanId: newSpanId(),
    startedAt: Date.now() - 5, endedAt: Date.now(), status: 'ok', attrs: {},
    payload: { prompt: 'the whole prompt', chunks: [{ ref: 'doc:a', title: 'A', text: 'the whole chunk' }] },
  });
  await exporter.flush();
  stop();

  const ref = traces.get('run-dev')?.spans[0].payloadRef;
  const payload = (await blobs.get(ref as string)) as { prompt: string };
  assert.equal(payload.prompt, 'the whole prompt');
});

test('a span row never carries a raw principal id', async () => {
  const { handle } = db('telemetry-hash');
  const traces = new TraceStore(handle);
  const exporter = new TraceExporter({ traces, mode: 'production', policy: redactEverything, retentionDays: 7 });
  exporter.begin('run-hash', principal, 'atlas-guide', 1, 'chat');
  const stored = traces.get('run-hash');
  assert.ok(stored);
  assert.ok(!JSON.stringify(stored.trace).includes(principal.id), 'the principal id is hashed, per §16.1');
  assert.match(stored.trace.principalHash, /^p_[0-9a-f]{16}$/);
});

test('retention drops raw spans and keeps the aggregates', async () => {
  const { handle } = db('telemetry-retention');
  const traces = new TraceStore(handle);
  const old = new Date(Date.now() - 40 * 864e5).toISOString();

  traces.openTrace({ traceId: 'old', runId: 'old', agentId: 'atlas-guide', agentVersion: 1, principalHash: 'p_x', surface: 'chat', startedAt: old });
  traces.addSpan({ spanId: 's1', traceId: 'old', parentSpanId: null, kind: 'model', name: 'compose', startedAt: old, durationMs: 100, status: 'ok', attributes: {}, payloadRef: null });
  traces.closeTrace('old', 'succeeded', 100, 0.02, 10, 20);

  const result = traces.sweep(30);
  assert.equal(result.tracesDropped, 1, 'the trace past retention is gone');
  assert.equal(result.spansDropped, 1, 'and so are its spans');
  assert.equal(traces.get('old'), null);

  const stats = traces.dailyStats('atlas-guide');
  assert.equal(stats.length, 1, 'the daily aggregate survives the sweep');
  assert.equal((stats[0] as { runs: number }).runs, 1);
  assert.equal((stats[0] as { cost_usd: number }).cost_usd, 0.02);
});

test('a real run produces a waterfall with a payload on the model span', async () => {
  const file = path.join(PACKAGE_ROOT, '.cortex', 'test-telemetry-e2e.db');
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  const config = { ...loadConfig(), storage: { dsn: `file:${file}` } };
  const store = new RunStore(openDb(config.storage.dsn));
  const adapters = createAtlasAdapters(store, config);
  const cortex = createCortex({ adapters, hostName, config, store });

  const run = await cortex.engine.start({
    agentId: 'atlas-guide', principal, surface: 'chat',
    threadId: cortex.engine.newThreadId(principal), text: 'Who owns the ingestion pipeline?',
  });
  for await (const { event } of adapters.transport.subscribe(run.id, 0)) {
    if (event.type === 'run_completed' || event.type === 'run_failed') break;
  }
  await cortex.exporter.flush();

  const stored = cortex.traces.get(run.id);
  assert.ok(stored, 'the run has a trace');
  assert.equal(stored.trace.status, 'succeeded');
  assert.ok(stored.spans.length >= 3, `expected several spans, got ${stored.spans.length}`);
  assert.ok(stored.spans.some((s) => s.kind === 'retrieval'));
  const model = stored.spans.find((s) => s.name === 'compose');
  assert.ok(model, 'there is a model span');
  assert.ok(model.payloadRef, 'and it carries the prompt and chunks by reference, not inline');
  assert.ok(!JSON.stringify(model.attributes).includes('SOURCES'), 'the prompt is not inlined into the span row');

  cortex.exporter.stop();
});
