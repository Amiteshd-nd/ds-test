// The default TransportAdapter: in-process fan-out over a durable event log.
// docs/DECISIONS.md D-4 explains why this is not Redis Streams.
//
// The durable half is the half that matters. Every event is written to `events` before
// any subscriber sees it, so a client that disconnects mid-run reconnects with
// `Last-Event-ID` and gets the gap rather than a fresh start or a hole.

import crypto from 'node:crypto';
import type { Notification, RunEvent } from '../adapters/types.ts';
import type { TransportAdapter } from '../adapters/transport.ts';
import type { RunStore } from './store.ts';

type Waiter = (v: void) => void;

export class InProcessTransport implements TransportAdapter {
  readonly store: RunStore;
  /** Every notification this process sent, for tests. The durable record is the table. */
  readonly sent: { principalId: string; notification: Notification }[] = [];
  #waiters = new Map<string, Set<Waiter>>();
  #closed = new Set<string>();

  constructor(store: RunStore) {
    this.store = store;
  }

  async emit(runId: string, event: RunEvent): Promise<void> {
    this.store.appendEvent(runId, event);
    if (event.type === 'run_completed' || event.type === 'run_failed') this.#closed.add(runId);
    this.#wake(runId);
  }

  async *subscribe(runId: string, afterSeq = 0): AsyncIterable<{ seq: number; event: RunEvent }> {
    let cursor = afterSeq;
    for (;;) {
      const batch = this.store.eventsAfter(runId, cursor);
      for (const item of batch) {
        cursor = item.seq;
        yield item;
        if (item.event.type === 'run_completed' || item.event.type === 'run_failed') return;
      }
      // A run that finished before this subscriber attached has no more events coming,
      // and the terminal event was already replayed above.
      if (batch.length === 0 && this.#closed.has(runId)) return;
      if (batch.length === 0) await this.#sleep(runId);
    }
  }

  /**
   * §12 — delivery for the surfaces that have no stream. A real host hands this to push,
   * email, or its own inbox; here it is written to a durable table and fanned out to any
   * client watching this principal's notification stream.
   *
   * Durable first, then the fan-out. A notification that exists only in a live socket is
   * a notification that does not survive the thing it is telling you about.
   */
  async notify(principalId: string, notification: Notification): Promise<void> {
    const id = `ntf_${crypto.randomUUID().slice(0, 12)}`;
    this.store.addNotification({
      id,
      principalId,
      title: notification.title,
      body: notification.body,
      runId: notification.runId,
      deepLink: notification.deepLink,
      kind: notification.kind,
    });
    this.sent.push({ principalId, notification });
    this.#wake(`notify:${principalId}`);
  }

  /**
   * Every notification for one principal, from `afterId` onwards, as they arrive. This
   * is the cross-device path: a run started in one client notifies every other client
   * that principal has open, because the subscription is to the person and not to the
   * session.
   */
  async *notifications(principalId: string, afterId?: string): AsyncIterable<{ id: string; notification: Notification & { id: string; createdAt: string } }> {
    let cursor = afterId;
    for (;;) {
      const fresh = this.store.notifications(principalId, cursor);
      // Oldest first, so a client that was away sees them in the order they happened.
      for (const row of [...fresh].reverse()) {
        cursor = row.id;
        yield {
          id: row.id,
          notification: {
            id: row.id,
            title: row.title,
            body: row.body,
            runId: row.runId ?? '',
            deepLink: row.deepLink ?? undefined,
            kind: row.kind as Notification['kind'],
            createdAt: row.createdAt,
          },
        };
      }
      await this.#sleep(`notify:${principalId}`);
    }
  }

  #wake(runId: string): void {
    const set = this.#waiters.get(runId);
    if (!set) return;
    for (const w of set) w();
    set.clear();
  }

  #sleep(runId: string): Promise<void> {
    return new Promise((resolve) => {
      let set = this.#waiters.get(runId);
      if (!set) this.#waiters.set(runId, (set = new Set()));
      set.add(resolve);
      // A ceiling, so a subscriber to a run that died without a terminal event
      // eventually re-reads the table instead of hanging forever.
      setTimeout(resolve, 5_000);
    });
  }
}
