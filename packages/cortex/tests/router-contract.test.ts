// Addendum C2 — the provider contract, and specifically the clause with teeth: a
// provider that cannot honour a request's residency or no-training requirement must
// raise rather than ignore it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Router, loadConfig } from '../src/core/index.ts';
import type { Provider, RetentionPosture } from '../src/core/router/types.ts';
import type { Principal } from '../src/core/adapters/types.ts';
import { CortexError } from '../src/core/errors.ts';

function fakeProvider(name: string, opts: { residency?: string[]; posture?: RetentionPosture } = {}): Provider & { served: number } {
  const provider = {
    name,
    served: 0,
    available: () => true,
    async *complete() {
      provider.served++;
      yield { text: `served by ${name}` };
    },
    usage: () => ({ tokensIn: 1, tokensOut: 1, costUsd: 0, modelId: 'm', provider: name, dataHandling: (opts.posture ?? 'unknown') as RetentionPosture }),
    countTokens: () => 4,
    price: () => 0,
    retentionPosture: (opts.posture ?? 'unknown') as RetentionPosture,
    assertCanHonour(req: { residency?: string }) {
      if (opts.residency && req.residency && !opts.residency.includes(req.residency)) {
        throw new CortexError('model_unavailable', `${name} cannot serve residency ${req.residency}`);
      }
    },
  };
  return provider as Provider & { served: number };
}

const principal = (residency: string): Principal => ({
  id: 'p1', type: 'member', orgId: 'o', locale: 'en', tz: 'UTC', org: { data_residency: residency },
});

const ctx = (p: Principal) => ({ principal: p, runId: 'r', surface: 'chat' as const, retryCount: 0, budgetRemainingUsd: 1 });

test('a provider that cannot honour residency is skipped, not used with the requirement dropped', async () => {
  const strict = fakeProvider('anthropic', { residency: ['any', 'us'] });
  const anywhere = fakeProvider('rehearsal');
  const router = new Router(loadConfig(), [strict, anywhere, fakeProvider('local')]);

  const result = await router.complete('reasoning.balanced', { messages: [{ role: 'user', content: 'hi' }] }, ctx(principal('eu-only')));
  for await (const _ of result.stream) void _;

  assert.equal(strict.served, 0, 'the provider that could not honour the requirement was not called');
  assert.equal(anywhere.served, 1, 'the next candidate served instead');
  assert.equal(result.fallbackUsed, true, 'and the run knows it fell back');
});

test('residency comes from the principal, not from the caller remembering to pass it', async () => {
  let seen: string | undefined;
  const probe = fakeProvider('anthropic');
  probe.assertCanHonour = (req: { residency?: string }) => { seen = req.residency; };
  const router = new Router(loadConfig(), [probe, fakeProvider('rehearsal'), fakeProvider('local')]);

  const result = await router.complete('reasoning.balanced', { messages: [{ role: 'user', content: 'hi' }] }, ctx(principal('in')));
  for await (const _ of result.stream) void _;
  assert.equal(seen, 'in');
});

test('no-training defaults to on rather than to whatever the caller forgot', async () => {
  let seen: boolean | undefined;
  const probe = fakeProvider('anthropic');
  probe.assertCanHonour = (req: { noTraining?: boolean }) => { seen = req.noTraining; };
  const router = new Router(loadConfig(), [probe, fakeProvider('rehearsal'), fakeProvider('local')]);
  const result = await router.complete('reasoning.balanced', { messages: [{ role: 'user', content: 'hi' }] }, ctx(principal('any')));
  for await (const _ of result.stream) void _;
  assert.equal(seen, true);
});

test('every provider reports a retention posture and can price its own usage', () => {
  const router = new Router(loadConfig());
  for (const [name, provider] of router.providers) {
    assert.ok(provider.retentionPosture, `${name} has no retention posture`);
    assert.equal(typeof provider.price(1000, 1000, 'claude-sonnet-5'), 'number', `${name} cannot price usage`);
    assert.ok(provider.countTokens([{ role: 'user', content: 'four chars' }]) > 0, `${name} cannot count tokens`);
  }
});

test('the real Anthropic provider prices the models this config names', () => {
  const router = new Router(loadConfig());
  const anthropic = router.providers.get('anthropic');
  assert.ok(anthropic);
  // Sonnet at $3/$15 per million: 1M in and 1M out is $18.
  assert.equal(anthropic.price(1_000_000, 1_000_000, 'claude-sonnet-5'), 18);
  assert.equal(anthropic.retentionPosture, 'no_training');
  assert.throws(
    () => anthropic.assertCanHonour({ messages: [], residency: 'eu' }),
    /cannot guarantee/,
    'an unsupported residency raises rather than being ignored',
  );
});
