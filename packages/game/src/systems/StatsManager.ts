import { useGameStore } from '../store';
import { InventoryManager } from './InventoryManager';
import type { PlayerStats, SkillBranchName, StatEffect } from '../utils/types';

/**
 * StatsManager — energy, stress, money and skill XP.
 *
 * Singleton via getInstance(), per the v1.0 architecture note. It holds no state
 * of its own: the zustand store is the single source of truth, so the React HUD
 * re-renders whenever a Phaser scene applies an effect.
 */
export class StatsManager {
  private static instance: StatsManager | null = null;

  static getInstance(): StatsManager {
    if (!StatsManager.instance) StatsManager.instance = new StatsManager();
    return StatsManager.instance;
  }

  /** Test seam — drops the cached singleton. */
  static resetInstance(): void {
    StatsManager.instance = null;
  }

  get stats(): PlayerStats {
    return useGameStore.getState().stats;
  }

  adjustEnergy(delta: number): void {
    useGameStore.getState().adjustEnergy(delta);
  }

  adjustStress(delta: number): void {
    useGameStore.getState().adjustStress(delta);
  }

  adjustMoney(delta: number): void {
    useGameStore.getState().adjustMoney(delta);
  }

  addXp(branch: SkillBranchName, amount: number): void {
    useGameStore.getState().addXp(branch, amount);
  }

  /** True when the player can cover a cost. */
  canAfford(cost: number): boolean {
    return this.stats.money >= cost;
  }

  /** Apply a dialogue/quest StatEffect in one go, items included. */
  applyEffect(effect: StatEffect): void {
    if (effect.energy) this.adjustEnergy(effect.energy);
    if (effect.stress) this.adjustStress(effect.stress);
    if (effect.money) this.adjustMoney(effect.money);
    if (effect.xp && effect.xp_branch) this.addXp(effect.xp_branch, effect.xp);

    if (effect.item_add) {
      const added = InventoryManager.getInstance().add(effect.item_add);
      // A full stack is a soft failure the player can see; say so in dev.
      if (!added) console.warn(`[StatsManager] could not add item "${effect.item_add}" (stack full?)`);
    }
    if (effect.item_remove) {
      const removed = InventoryManager.getInstance().remove(effect.item_remove);
      if (!removed) console.warn(`[StatsManager] could not remove item "${effect.item_remove}" (not held)`);
    }
  }
}
