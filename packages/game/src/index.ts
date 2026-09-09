// Library entry — what other packages (e.g. personal-doc) import.
export { default as BangaloreTimes } from './BangaloreTimes';
export type { BangaloreTimesProps } from './BangaloreTimes';
export { default as PhaserGame } from './PhaserGame';
export type { PhaserGameProps } from './PhaserGame';

export { useGameStore } from './store';
export type { GameState } from './store';

export { StatsManager } from './systems/StatsManager';
export { SaveManager } from './systems/SaveManager';
export { DialogueManager } from './systems/DialogueManager';
export type { DialogueView, DialogueChoiceView } from './systems/DialogueManager';
export { InventoryManager } from './systems/InventoryManager';
export { QuestManager, sceneUnlockedFlag } from './systems/QuestManager';
export { ReputationManager } from './systems/ReputationManager';
export { gameEvents, EventBus } from './core/events';
export type { GameEvents } from './core/events';
export {
  DIALOGUE, QUESTS, ITEMS, DISTRICTS, NPCS,
  getDialogue, getQuest, getItem, getDistrict, getNpc,
  npcsInDistrict, questsInDistrict,
} from './data';
export { Player } from './entities/Player';

export { BootScene } from './scenes/BootScene';
export { TitleScene } from './scenes/TitleScene';
export { CharacterSelectScene } from './scenes/CharacterSelectScene';
export { AirportScene } from './scenes/AirportScene';
export { WhitefieldScene } from './scenes/WhitefieldScene';

export * from './utils/constants';
export type * from './utils/types';
