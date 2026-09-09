import { gameEvents } from '../core/events';
import { DISTRICTS } from '../data';
import { useGameStore } from '../store';
import { REPUTATION_THRESHOLDS, REPUTATION_TIER_NAMES } from '../utils/constants';
import type { DistrictDef } from '../utils/types';

/**
 * ReputationManager — the macro loop's spine.
 *
 * Outsider → Survivor → Trusted Helper → Fixer → Important Player. Reputation
 * is earned globally and per district: the tier drives the story arc, while
 * local standing is what opens an area's deeper missions. That gives the
 * progression loop somewhere to go — points buy equipment, reputation buys
 * access — without a second currency.
 */
export class ReputationManager {
  private static instance: ReputationManager | null = null;

  static getInstance(): ReputationManager {
    if (!ReputationManager.instance) ReputationManager.instance = new ReputationManager();
    return ReputationManager.instance;
  }

  static resetInstance(): void {
    ReputationManager.instance = null;
  }

  get total(): number {
    return useGameStore.getState().reputation.total;
  }

  /** Highest tier index whose threshold has been reached (0..4). */
  get tier(): number {
    let tier = 0;
    for (let i = 0; i < REPUTATION_THRESHOLDS.length; i++) {
      if (this.total >= REPUTATION_THRESHOLDS[i]) tier = i;
    }
    return tier;
  }

  get tierName(): string {
    return REPUTATION_TIER_NAMES[this.tier];
  }

  /** Reputation still needed for the next tier, or null at the top. */
  get toNextTier(): number | null {
    const next = REPUTATION_THRESHOLDS[this.tier + 1];
    return next === undefined ? null : next - this.total;
  }

  standingIn(districtId: string): number {
    return useGameStore.getState().reputation.byDistrict[districtId] ?? 0;
  }

  /**
   * Credit reputation. A district-scoped gain also counts toward the global
   * total — helping people anywhere makes you known everywhere, just more so
   * where you did it.
   */
  add(amount: number, districtId?: string): void {
    if (amount === 0) return;

    const state = useGameStore.getState();
    const previousTier = this.tier;
    const byDistrict = { ...state.reputation.byDistrict };
    if (districtId) {
      byDistrict[districtId] = (byDistrict[districtId] ?? 0) + amount;
    }

    state.hydrate({
      reputation: { total: state.reputation.total + amount, byDistrict },
    });

    gameEvents.emit('reputation:changed', {
      total: this.total,
      districtId,
      tier: this.tier,
    });

    if (this.tier > previousTier) {
      gameEvents.emit('reputation:tier', { tier: this.tier, tierName: this.tierName });
    }
  }

  /**
   * Whether a district is enterable: its unlocking quest done and its
   * reputation bar met. Districts with neither requirement are always open.
   */
  canEnter(districtId: string): boolean {
    const district = DISTRICTS[districtId];
    if (!district) return false;

    const { quests } = useGameStore.getState();
    if (district.unlocked_by_quest && !quests.completed.includes(district.unlocked_by_quest)) {
      return false;
    }
    return this.total >= (district.reputation_required ?? 0);
  }

  /** Every district the player can currently reach, in phase order. */
  availableDistricts(): DistrictDef[] {
    return Object.values(DISTRICTS)
      .filter((d) => this.canEnter(d.id))
      .sort((a, b) => a.phase - b.phase);
  }
}
