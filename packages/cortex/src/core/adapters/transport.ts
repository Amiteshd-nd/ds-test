import type { Notification, RunEvent } from './types.ts';

/**
 * Adapter 7 of 8 — delivery and durability. PRD §5.3.
 *
 * `subscribe` takes an optional `afterSeq` so a client that dropped can resume from
 * where it stopped rather than replaying from zero or losing the gap. That is the whole
 * requirement behind SSE `Last-Event-ID` in §15, and it is why events are persisted
 * rather than only fanned out.
 */
export interface TransportAdapter {
  emit(runId: string, event: RunEvent): Promise<void>;
  subscribe(runId: string, afterSeq?: number): AsyncIterable<{ seq: number; event: RunEvent }>;
  notify(principalId: string, notification: Notification): Promise<void>;

  /**
   * Everything sent to one principal, from `afterId` onwards, as it arrives.
   *
   * §12's cross-device requirement lives here: the subscription is to the person rather
   * than to the session, so a run started in one client reaches every other client that
   * person has open. Like `inspect` above, this was an undeclared extension the service
   * relied on until a second host made it visible.
   */
  notifications(principalId: string, afterId?: string): AsyncIterable<{ id: string; notification: Notification & { id: string; createdAt: string } }>;
}
