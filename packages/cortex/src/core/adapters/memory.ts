import type { MemoryRecord, ProfileMemory, Turn } from './types.ts';

/**
 * Adapter 6 of 8 — persistence for memory. PRD §5.3 and §10.
 *
 * One adapter, two record types, one retrieval call on top of it (`MemoryService`).
 * The PRD's own retrospective is that splitting conversational and experiential memory
 * into two systems cost more than it bought; this takes the retrospective.
 *
 * A host with messaging infrastructure should back `appendTurn`/`recent` with it and get
 * history, ordering, and retries for free.
 */
export interface MemoryAdapter {
  appendTurn(threadId: string, turn: Turn): Promise<void>;
  recent(threadId: string, limit: number): Promise<Turn[]>;
  semantic(threadId: string, q: string, k: number): Promise<Turn[]>;
  getProfile(principalId: string): Promise<ProfileMemory>;
  upsertProfile(principalId: string, patch: Partial<MemoryRecord> & { key: string; value: string }, provenance: string): Promise<void>;
  /** §15 `DELETE /v1/memory/me/{id}` — the user owns what the system remembers. */
  forget(principalId: string, recordId: string): Promise<boolean>;

  /**
   * §15 `GET /v1/memory/me` — everything held about one person, with provenance.
   *
   * Added to the contract when a second host was integrated: the service had been
   * calling this on the default implementation, which happened to have it, so a host
   * that implemented the published interface faithfully would have crashed on that
   * route. A capability the service depends on belongs in the interface.
   */
  inspect(principalId: string): Promise<MemoryRecord[]>;
}
