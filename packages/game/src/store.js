import { create } from 'zustand';

// Central game state shared between Phaser scenes and the React HUD.
export const useGameStore = create((set) => ({
  score: 0,
  playerName: 'You',
  botCount: 0,

  addScore: (amount) => set((state) => ({ score: state.score + amount })),
  setBotCount: (botCount) => set({ botCount }),
  reset: () => set({ score: 0 }),
}));
