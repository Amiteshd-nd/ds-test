import { create } from 'zustand';
import {
  MAX_ENERGY,
  MAX_STRESS,
  SKILL_XP_THRESHOLDS,
  STARTING_ENERGY,
  STARTING_MONEY,
  STARTING_STRESS,
  DEFAULT_PLAYER_NAME,
} from './utils/constants';
import type {
  PlayerSkills,
  PlayerStats,
  ReputationState,
  SkillBranchName,
} from './utils/types';

// Central game state shared between Phaser scenes and the React HUD.
//
// The v1.0 architecture note calls for singleton managers (StatsManager,
// QuestManager, …). Here those managers live in src/systems and delegate to
// this store, so Phaser and React read one source of truth instead of two.
// Managers own the rules; the store owns the data.

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const emptySkills = (): PlayerSkills => ({
  technical: { xp: 0, level: 0 },
  soft_skills: { xp: 0, level: 0 },
  city_survival: { xp: 0, level: 0 },
});

// Highest tier whose XP threshold has been met.
const levelForXp = (xp: number): number => {
  let level = 0;
  for (let i = 0; i < SKILL_XP_THRESHOLDS.length; i++) {
    if (xp >= SKILL_XP_THRESHOLDS[i]) level = i;
  }
  return level;
};

export interface QuestState {
  /** quest id -> ids of completed objectives. */
  active: Record<string, string[]>;
  completed: string[];
}

export interface GameState {
  /**
   * Lifetime ₹ earned. The spendable balance is stats.money; this is the
   * cumulative figure a leaderboard would rank on.
   */
  totalEarned: number;
  playerName: string;
  botCount: number;
  /** Key of the scene currently on screen — drives what the React HUD shows. */
  activeScene: string | null;
  stats: PlayerStats;
  skills: PlayerSkills;
  reputation: ReputationState;
  /** Item ids; stackables appear once per unit, matching SaveData.inventory. */
  inventory: string[];
  quests: QuestState;
  flags: Record<string, boolean>;

  setBotCount: (botCount: number) => void;
  setPlayerName: (playerName: string) => void;
  setActiveScene: (activeScene: string | null) => void;

  adjustEnergy: (delta: number) => void;
  adjustStress: (delta: number) => void;
  adjustMoney: (delta: number) => void;

  addXp: (branch: SkillBranchName, amount: number) => void;
  setFlag: (key: string, value: boolean) => void;

  /** Wholesale replacement — InventoryManager/QuestManager own the rules. */
  setInventory: (inventory: string[]) => void;
  setQuests: (quests: QuestState) => void;

  hydrate: (partial: Partial<GameState>) => void;
  reset: () => void;
}

const initialStats = (): PlayerStats => ({
  energy: STARTING_ENERGY,
  stress: STARTING_STRESS,
  money: STARTING_MONEY,
});

const initialQuests = (): QuestState => ({ active: {}, completed: [] });

const initialReputation = (): ReputationState => ({ total: 0, byDistrict: {} });

export const useGameStore = create<GameState>((set) => ({
  totalEarned: 0,
  playerName: DEFAULT_PLAYER_NAME,
  botCount: 0,
  activeScene: null,
  stats: initialStats(),
  skills: emptySkills(),
  reputation: initialReputation(),
  inventory: [],
  quests: initialQuests(),
  flags: {},

  setBotCount: (botCount) => set({ botCount }),
  setPlayerName: (playerName) => set({ playerName }),
  setActiveScene: (activeScene) => set({ activeScene }),

  adjustEnergy: (delta) =>
    set((state) => ({
      stats: { ...state.stats, energy: clamp(state.stats.energy + delta, 0, MAX_ENERGY) },
    })),

  adjustStress: (delta) =>
    set((state) => ({
      stats: { ...state.stats, stress: clamp(state.stats.stress + delta, 0, MAX_STRESS) },
    })),

  adjustMoney: (delta) =>
    set((state) => ({
      stats: { ...state.stats, money: state.stats.money + delta },
      // Only income accumulates; spending must not inflate lifetime earnings.
      totalEarned: delta > 0 ? state.totalEarned + delta : state.totalEarned,
    })),

  addXp: (branch, amount) =>
    set((state) => {
      const xp = state.skills[branch].xp + amount;
      return {
        skills: { ...state.skills, [branch]: { xp, level: levelForXp(xp) } },
      };
    }),

  setFlag: (key, value) =>
    set((state) => ({ flags: { ...state.flags, [key]: value } })),

  setInventory: (inventory) => set({ inventory }),
  setQuests: (quests) => set({ quests }),

  hydrate: (partial) => set(partial),

  reset: () =>
    set({
      totalEarned: 0,
      stats: initialStats(),
      skills: emptySkills(),
      reputation: initialReputation(),
      inventory: [],
      quests: initialQuests(),
      flags: {},
    }),
}));
