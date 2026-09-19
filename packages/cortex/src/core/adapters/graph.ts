import type { EntityRef, EntityType, GraphSchema, Subgraph } from './types.ts';

/**
 * Adapter 4 of 8 — the semantic layer. Optional, and worth more than the rest combined
 * when the host's data supports it. PRD §5.3.
 *
 * The failure mode is documented rather than designed around: if ownership is fuzzy and
 * names are inconsistent, the agent inherits the mess. `scripts/doctor.ts` measures that
 * before anyone promises quality (§11.3).
 */
export interface GraphAdapter {
  neighbors(ref: EntityRef, edgeTypes: string[], depth?: number): Promise<Subgraph>;
  resolveMention(text: string, hint?: EntityType): Promise<EntityRef[]>;
  schema(): GraphSchema;
}
