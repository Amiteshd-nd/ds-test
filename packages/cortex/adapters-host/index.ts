// Assembling Atlas's eight adapters. This file and `atlas.ts` are the entire integration
// surface — a different host replaces this directory and changes nothing else.

import type { HostAdapters } from '../src/core/adapters/index.ts';
import type { CortexConfig } from '../src/core/config/config.ts';
import type { RunStore } from '../src/core/runtime/store.ts';
import { InProcessTransport } from '../src/core/runtime/transport.ts';
import { SqliteMemory } from '../src/core/memory/sqlite-memory.ts';
import { LocalRetrieval } from '../src/core/grounding/local-retrieval.ts';
import { documents, graph, hostName, identity, policy, principalById, skills } from './atlas.ts';
import type { Principal } from '../src/core/adapters/index.ts';
import type { ConformanceFixture } from '../tests/conformance/suite.ts';

export interface AtlasAdapters extends HostAdapters {
  transport: InProcessTransport;
  memory: SqliteMemory;
  /** Exposed so an accepted inline edit can be re-indexed rather than going stale. */
  retrieval: LocalRetrieval;
}

export function createAtlasAdapters(store: RunStore, config: CortexConfig): AtlasAdapters {
  const retrieval = new LocalRetrieval(documents);
  return {
    identity,
    policy,
    // Atlas has no search backend, so it takes the default. A host with one wraps it
    // here instead, and nothing downstream changes.
    retrieval,
    graph,
    skills,
    memory: new SqliteMemory(store, {
      turnTtlDays: config.memory.turn_ttl_days,
      minObservations: config.memory.preference_min_observations,
    }),
    transport: new InProcessTransport(store),
  };
}

/**
 * The convention `hosts/registry.ts` looks for: an adapter factory and a conformance
 * fixture. `createAtlasAdapters` stays as the name this host's own entry uses.
 */
export const createAdapters = createAtlasAdapters;

export async function conformanceFixture(): Promise<ConformanceFixture> {
  return {
    principal: principalById('ananya') as Principal,
    otherPrincipal: principalById('bharath') as Principal,
    readableRef: 'doc:runbook-ingestion',
    forbiddenRef: 'doc:comp-bands-2026',
    query: 'ingestion pipeline lag',
    edgeType: 'OWNS',
  };
}

export { hostName };
export { atlasHostRoutes } from './routes.ts';
export * from './atlas.ts';
