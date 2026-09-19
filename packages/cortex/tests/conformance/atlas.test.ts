// Atlas against the conformance suite. A host runs exactly this before writing an agent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from '../helpers.ts';
import { runConformance, summarise } from './suite.ts';
import { principalById } from '../../adapters-host/atlas.ts';

test('the Atlas adapters pass the conformance suite', async () => {
  const h = harness('conformance');
  const results = await runConformance(h.adapters, {
    principal: principalById('ananya')!,
    otherPrincipal: principalById('bharath')!,
    readableRef: 'doc:runbook-ingestion',
    forbiddenRef: 'doc:comp-bands-2026',
    query: 'ingestion pipeline lag',
    edgeType: 'OWNS',
  });

  const summary = summarise(results);
  const report = summary.failures.map((f) => `  ${f.adapter}: ${f.name} — ${f.detail}`).join('\n');
  assert.equal(summary.failed, 0, `${summary.failed} conformance check(s) failed:\n${report}`);
  assert.ok(summary.passed >= 18, `expected at least 18 hard checks, ran ${summary.passed}`);
});
