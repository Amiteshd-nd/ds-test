/**
 * Typed event bus — the seam between gameplay systems.
 *
 * Scenes announce what happened; systems react. AirportScene does not know the
 * quest system exists, and QuestManager has never heard of Phaser. That is what
 * keeps a new system (achievements, analytics, the future ghost recorder or
 * multiplayer relay) a subscriber rather than another web of direct calls —
 * recording this stream IS the Stage-0 ghost format.
 *
 * Not Phaser's EventEmitter, deliberately: payloads here are typed per event,
 * and the bus has no engine dependency, so every system that talks through it
 * stays unit-testable in Node.
 */

export interface GameEvents {
  'dialogue:started': { dialogueId: string };
  'dialogue:ended': { dialogueId: string; triggeredQuests: string[] };
  'item:added': { itemId: string; count: number };
  'item:removed': { itemId: string; count: number };
  'entity:interacted': { entityId: string };
  'zone:reached': { zoneId: string; sceneKey: string };
  'quest:started': { questId: string };
  'quest:objective': { questId: string; objectiveId: string };
  'quest:completed': { questId: string };
  'reputation:changed': { total: number; districtId?: string; tier: number };
  'reputation:tier': { tier: number; tierName: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private listeners = new Map<keyof E, Set<Handler<never>>>();

  /** Subscribe. Returns the unsubscribe function, so cleanup is one call. */
  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof E>(event: K, handler: Handler<E[K]>): void {
    this.listeners.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Snapshot so a handler that unsubscribes (or subscribes) mid-emit cannot
    // corrupt iteration.
    for (const handler of [...set]) {
      try {
        (handler as Handler<E[K]>)(payload);
      } catch (err) {
        // One broken listener must not stop the others or kill the frame.
        console.error(`[EventBus] listener for "${String(event)}" threw:`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** The game-wide bus. Tests should clear() it between cases. */
export const gameEvents = new EventBus<GameEvents>();
