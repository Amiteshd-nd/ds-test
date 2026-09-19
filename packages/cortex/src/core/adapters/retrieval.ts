import type { Chunk, Document, EntityRef, Principal, Query } from './types.ts';

/**
 * Adapter 3 of 8 — grounding in host truth. PRD §5.3.
 *
 * The principal is passed so a host with a search engine that already understands ACLs
 * can push the filter down into the index. Hosts that cannot are still safe: the
 * pipeline filters again through `PolicyAdapter.canRead` before anything reaches a
 * model (§11.1). Filtering twice is cheap; filtering late is not.
 */
export interface RetrievalAdapter {
  search(q: Query, principal: Principal): Promise<Chunk[]>;
  fetch(refs: EntityRef[], principal: Principal): Promise<Document[]>;
}
