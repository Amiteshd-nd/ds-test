import { gameEvents } from '../core/events';
import { getItem } from '../data';
import { StatsManager } from './StatsManager';
import { useGameStore } from '../store';

/**
 * InventoryManager — item ownership and stacking rules.
 *
 * State lives in the store (`inventory: string[]`, one entry per unit, matching
 * the SaveData shape); this manager owns the rules: stack limits, non-stackable
 * uniqueness, what "using" an item means. Every mutation announces itself on
 * the event bus, which is how collect-objectives progress without the quest
 * system ever being called directly.
 */
export class InventoryManager {
  private static instance: InventoryManager | null = null;

  static getInstance(): InventoryManager {
    if (!InventoryManager.instance) InventoryManager.instance = new InventoryManager();
    return InventoryManager.instance;
  }

  static resetInstance(): void {
    InventoryManager.instance = null;
  }

  count(itemId: string): number {
    return useGameStore.getState().inventory.filter((id) => id === itemId).length;
  }

  has(itemId: string): boolean {
    return this.count(itemId) > 0;
  }

  /**
   * Add `count` units. All-or-nothing: if the stack limit would be exceeded
   * (or a non-stackable is already owned), nothing is added and false comes
   * back — a half-applied trade is worse than a refused one.
   */
  add(itemId: string, count = 1): boolean {
    const item = getItem(itemId); // throws on unknown id — content bug, be loud
    const current = this.count(itemId);

    const limit = item.stackable ? (item.max_stack ?? Infinity) : 1;
    if (current + count > limit) return false;

    const { inventory, setInventory } = useGameStore.getState();
    setInventory([...inventory, ...Array<string>(count).fill(itemId)]);
    gameEvents.emit('item:added', { itemId, count });
    return true;
  }

  /** Remove `count` units. All-or-nothing, like add. */
  remove(itemId: string, count = 1): boolean {
    getItem(itemId);
    if (this.count(itemId) < count) return false;

    const { inventory, setInventory } = useGameStore.getState();
    const next: string[] = [];
    let toRemove = count;
    for (const id of inventory) {
      if (id === itemId && toRemove > 0) {
        toRemove--;
        continue;
      }
      next.push(id);
    }
    setInventory(next);
    gameEvents.emit('item:removed', { itemId, count });
    return true;
  }

  /**
   * Consume one unit of a consumable: apply its stat effect, remove it.
   * Key items and equipment refuse — they are carried, not eaten.
   */
  use(itemId: string): boolean {
    const item = getItem(itemId);
    if (item.type !== 'consumable' || !this.has(itemId)) return false;

    if (item.effect) {
      // Only the stat portion — an item whose effect granted items would
      // re-enter this manager mid-mutation.
      const { item_add, item_remove, ...statEffect } = item.effect;
      StatsManager.getInstance().applyEffect(statEffect);
    }
    return this.remove(itemId, 1);
  }
}
