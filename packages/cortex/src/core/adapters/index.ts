// The portability contract. A host implements these eight and nothing else (PRD §5.3).
//
// Orchestration, prompts, routing, guardrails, tracing, and evals are core and are not
// pluggable — §5.4. Resisting requests to make them pluggable is how this stays one
// platform instead of six.

export type * from './types.ts';
export type { IdentityAdapter } from './identity.ts';
export type { PolicyAdapter } from './policy.ts';
export type { RetrievalAdapter } from './retrieval.ts';
export type { GraphAdapter } from './graph.ts';
export type { SkillAdapter } from './skill.ts';
export type { MemoryAdapter } from './memory.ts';
export type { TransportAdapter } from './transport.ts';
export type { DesignSystemAdapter, Suggestion, Source } from './design-system.ts';

import type { IdentityAdapter } from './identity.ts';
import type { PolicyAdapter } from './policy.ts';
import type { RetrievalAdapter } from './retrieval.ts';
import type { GraphAdapter } from './graph.ts';
import type { SkillAdapter } from './skill.ts';
import type { MemoryAdapter } from './memory.ts';
import type { TransportAdapter } from './transport.ts';

/** What a host hands to `createCortex`. `graph` is the one that may be omitted. */
export interface HostAdapters {
  identity: IdentityAdapter;
  policy: PolicyAdapter;
  retrieval: RetrievalAdapter;
  graph?: GraphAdapter;
  skills: SkillAdapter;
  memory: MemoryAdapter;
  transport: TransportAdapter;
}
