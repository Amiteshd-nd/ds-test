// Addendum C5 item 3 — the batching SLA.
//
// `PolicyAdapter.canRead` at k=200 must return within 50ms p95. The point is not that
// Atlas is fast; an in-memory Map over 27 records is not an achievement. The point is
// that this test is still running when a host wires this adapter to a real authorization
// service, because slow permission checks are how teams get tempted to skip them — and
// the temptation arrives as a latency graph, not as a design discussion.

import test from 'node:test';
import assert from 'node:assert/strict';
import { entities, policy, principalById } from '../adapters-host/atlas.ts';

const SLA_P95_MS = 50;
const K = 200;

test(`PolicyAdapter.canRead answers k=${K} within ${SLA_P95_MS}ms p95`, async (t) => {
  const principal = principalById('ananya');
  assert.ok(principal);
  const refs = Array.from({ length: K }, (_, i) => entities[i % entities.length].ref);

  for (let i = 0; i < 50; i++) await policy.canRead(principal, refs);

  const samples: number[] = [];
  for (let i = 0; i < 300; i++) {
    const started = process.hrtime.bigint();
    const answers = await policy.canRead(principal, refs);
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
    assert.equal(answers.length, K, 'the answer array must stay aligned with the input');
  }

  samples.sort((a, b) => a - b);
  const at = (p: number): number => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)];
  t.diagnostic(`k=${K}  p50 ${at(0.5).toFixed(3)}ms  p95 ${at(0.95).toFixed(3)}ms  p99 ${at(0.99).toFixed(3)}ms`);
  assert.ok(at(0.95) < SLA_P95_MS, `p95 was ${at(0.95).toFixed(2)}ms, over the ${SLA_P95_MS}ms SLA`);
});

test('canRead cost is roughly linear in k, not quadratic', async (t) => {
  const principal = principalById('ananya');
  assert.ok(principal);
  const time = async (k: number): Promise<number> => {
    const refs = Array.from({ length: k }, (_, i) => entities[i % entities.length].ref);
    for (let i = 0; i < 20; i++) await policy.canRead(principal, refs);
    const started = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) await policy.canRead(principal, refs);
    return Number(process.hrtime.bigint() - started) / 1e6 / 200;
  };

  const small = await time(50);
  const large = await time(800);
  // 16x the refs should not be much worse than 16x the time. A host that joins per ref,
  // or re-fetches an ACL per call, shows up here as a blown ratio long before it shows up
  // as a production incident.
  const ratio = large / Math.max(small, 1e-6);
  t.diagnostic(`k=50 ${small.toFixed(4)}ms · k=800 ${large.toFixed(4)}ms · ratio ${ratio.toFixed(1)}x for 16x the refs`);
  assert.ok(ratio < 48, `scaling looks super-linear: ${ratio.toFixed(1)}x time for 16x refs`);
});
