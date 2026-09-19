// Harbor's adapter set. Seven of the eight; there is no graph, on purpose.

import type { HostAdapters } from '../../src/core/adapters/index.ts';
import type { CortexConfig } from '../../src/core/config/config.ts';
import type { RunStore } from '../../src/core/runtime/store.ts';
import { InProcessTransport } from '../../src/core/runtime/transport.ts';
import { SqliteMemory } from '../../src/core/memory/sqlite-memory.ts';
import { LocalRetrieval } from '../../src/core/grounding/local-retrieval.ts';
import { documents, hostName, identity, policy, skills } from './harbor.ts';
import type { Principal } from '../../src/core/adapters/index.ts';
import type { ConformanceFixture } from '../../tests/conformance/suite.ts';

export function createHarborAdapters(store: RunStore, config: CortexConfig): HostAdapters {
  return {
    identity,
    policy,
    retrieval: new LocalRetrieval(documents),
    // No GraphAdapter. Harbor's data is rows with foreign keys, not a semantic graph, and
    // the honest thing is to leave the optional adapter out rather than fake one.
    skills,
    memory: new SqliteMemory(store, {
      turnTtlDays: config.memory.turn_ttl_days,
      minObservations: config.memory.preference_min_observations,
    }),
    transport: new InProcessTransport(store),
  };
}

export const createAdapters = createHarborAdapters;

export async function conformanceFixture(): Promise<ConformanceFixture> {
  return {
    // Rosa is in billing and onboarding; T-1042 is a platform ticket assigned to Theo for
    // a customer Theo manages, so she fails all three of Harbor's read tests for it. That
    // is the row-level equivalent of a record in a bucket you cannot see.
    principal: (await identity.resolvePrincipal('rosa')) as Principal,
    otherPrincipal: (await identity.resolvePrincipal('theo')) as Principal,
    readableRef: 'ticket:T-1041',
    forbiddenRef: 'ticket:T-1042',
    query: 'invoice VAT rate wrong',
  };
}

export { hostName };
export * from './harbor.ts';
