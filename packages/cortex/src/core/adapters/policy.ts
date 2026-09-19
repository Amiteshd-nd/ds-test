import type { Decision, Document, EntityRef, Principal } from './types.ts';

/**
 * Adapter 2 of 8 — what may they see and do. PRD §5.3.
 *
 * `canRead` is batched because retrieval filters hundreds of candidates per turn, and a
 * per-id call makes the retrieval-time filter slow enough that someone will eventually
 * propose moving it to render time. That move is the end of the security model, so the
 * signature forecloses it: the array in, an aligned array of booleans out.
 */
export interface PolicyAdapter {
  canRead(principal: Principal, refs: EntityRef[]): Promise<boolean[]>;
  canInvoke(principal: Principal, skillId: string, args: Record<string, unknown>): Promise<Decision>;
  /** Applied on memory read too — entitlements can be revoked after a fact was written. */
  redact(principal: Principal, doc: Document): Promise<Document>;
}
