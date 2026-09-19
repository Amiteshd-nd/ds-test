// Addendum C5 — the permission boundary, proved rather than asserted.
//
// The red-team suite covers the phrasings a person thought of. This covers the ones
// nobody thought of: randomised permission matrices, randomised corpora, randomised
// queries, and one invariant — no chunk reaches context assembly that the principal is
// not permitted to read.
//
// The addendum specifies Hypothesis, which has no equivalent here worth a dependency for
// one test file. The generator below is seeded and about forty lines, so a failure prints
// a seed that reproduces it exactly, which is the property that actually matters.

import test from 'node:test';
import assert from 'node:assert/strict';
import { GroundingPipeline, PermissionBoundaryViolation, assertPermissionBoundary, LocalRetrieval, loadConfig } from '../src/core/index.ts';
import type { Document, EntityRef, Principal } from '../src/core/adapters/types.ts';
import type { PolicyAdapter } from '../src/core/adapters/policy.ts';

/** mulberry32 — small, seeded, and good enough to shuffle permissions with. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = 'ingestion pipeline rollback schema migration gateway quota tenant onboarding retry consumer offset lag decision owner approval roster budget latency index shard replica'.split(' ');

interface Scenario {
  docs: Document[];
  /** ref → the label required to read it. */
  labels: Map<EntityRef, string>;
  principals: { principal: Principal; canSee: Set<string> }[];
  queries: string[];
}

function scenario(seed: number): Scenario {
  const r = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const allLabels = ['public', 'team-a', 'team-b', 'restricted'];

  const docs: Document[] = [];
  const labels = new Map<EntityRef, string>();
  const docCount = 8 + Math.floor(r() * 8);
  for (let i = 0; i < docCount; i++) {
    const ref = `doc:${seed}-${i}`;
    const body = Array.from({ length: 3 }, () =>
      Array.from({ length: 12 }, () => pick(WORDS)).join(' ') + '.',
    ).join('\n\n');
    docs.push({ ref, type: 'doc', title: `${pick(WORDS)} ${pick(WORDS)}`, body });
    labels.set(ref, pick(allLabels));
  }

  const principals = Array.from({ length: 3 }, (_, i) => {
    const canSee = new Set<string>();
    for (const label of allLabels) if (r() > 0.45) canSee.add(label);
    return {
      principal: { id: `p${seed}-${i}`, type: 'member', orgId: 'o', locale: 'en', tz: 'UTC' } as Principal,
      canSee,
    };
  });

  const queries = Array.from({ length: 4 }, () =>
    Array.from({ length: 2 + Math.floor(r() * 4) }, () => pick(WORDS)).join(' '),
  );

  return { docs, labels, principals, queries };
}

function policyFor(s: Scenario): PolicyAdapter {
  return {
    async canRead(principal, refs) {
      const who = s.principals.find((p) => p.principal.id === principal.id);
      return refs.map((ref) => {
        const label = s.labels.get(ref);
        return Boolean(label && who?.canSee.has(label));
      });
    },
    async canInvoke() {
      return { outcome: 'allow', reason: 'ok' };
    },
    async redact(_principal, doc) {
      return doc;
    },
  };
}

test('property: no unauthorised chunk ever reaches context assembly', async (t) => {
  const config = loadConfig();
  let cases = 0;
  let nonEmpty = 0;

  // 84 corpora × 3 principals × 4 queries = 1,008 cases, over the addendum's 1,000 floor.
  for (let seed = 1; seed <= 84; seed++) {
    const s = scenario(seed);
    const pipeline = new GroundingPipeline(new LocalRetrieval(s.docs), policyFor(s), config);

    for (const { principal, canSee } of s.principals) {
      for (const question of s.queries) {
        cases++;
        const result = await pipeline.run({
          question,
          principal,
          runId: `prop-${seed}`,
          sources: ['doc'],
          maxContextTokens: 4000,
        });
        if (result.chunks.length) nonEmpty++;

        for (const chunk of result.chunks) {
          const label = s.labels.get(chunk.ref);
          assert.ok(
            label && canSee.has(label),
            `seed ${seed}: principal ${principal.id} (sees ${[...canSee].join('/') || 'nothing'}) ` +
              `received ${chunk.ref} labelled "${label}". Reproduce with scenario(${seed}).`,
          );
        }
      }
    }
  }

  assert.ok(cases >= 1000, `expected at least 1000 cases, ran ${cases}`);
  // A suite where retrieval always returns nothing would pass this invariant trivially.
  assert.ok(nonEmpty > cases * 0.2, `only ${nonEmpty}/${cases} cases retrieved anything — the invariant is not being exercised`);
  t.diagnostic(`${cases} cases, ${nonEmpty} with a non-empty context`);
});

test('property: a principal who can see nothing receives nothing, whatever they ask', async () => {
  const config = loadConfig();
  for (let seed = 200; seed < 215; seed++) {
    const s = scenario(seed);
    const blind: Principal = { id: 'blind', type: 'member', orgId: 'o', locale: 'en', tz: 'UTC' };
    const policy: PolicyAdapter = {
      async canRead(_p, refs) { return refs.map(() => false); },
      async canInvoke() { return { outcome: 'allow', reason: 'ok' }; },
      async redact(_p, doc) { return doc; },
    };
    const pipeline = new GroundingPipeline(new LocalRetrieval(s.docs), policy, config);
    for (const question of s.queries) {
      const result = await pipeline.run({ question, principal: blind, runId: 'blind', sources: ['doc'], maxContextTokens: 4000 });
      assert.equal(result.chunks.length, 0, `seed ${seed}: a principal with no permissions received ${result.chunks.length} chunk(s)`);
    }
  }
});

test('the boundary assertion fails the run rather than logging', () => {
  const chunks = [
    { sourceId: 's1', ref: 'doc:allowed', title: 'A', text: 'a', score: 1 },
    { sourceId: 's2', ref: 'doc:sneaked-in', title: 'B', text: 'b', score: 1 },
  ];
  // The shape of the bug this exists to catch: a chunk appended after the filter ran.
  assert.throws(
    () => assertPermissionBoundary(chunks, new Set(['doc:allowed'])),
    (err: unknown) => err instanceof PermissionBoundaryViolation && err.refs.includes('doc:sneaked-in'),
  );
  assert.doesNotThrow(() => assertPermissionBoundary(chunks, new Set(['doc:allowed', 'doc:sneaked-in'])));
});
