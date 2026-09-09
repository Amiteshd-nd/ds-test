import { useGameStore } from '../store';
import {
  DEFAULT_DIRECTION,
  DEFAULT_HOME_STATE,
  MIGRATABLE_SAVE_VERSIONS,
  SAVE_KEY,
  SAVE_VERSION,
  SCENE_KEYS,
} from '../utils/constants';
import type { SaveData } from '../utils/types';

/**
 * SaveManager — localStorage serialization of the run.
 *
 * Writes the SaveData shape from the v1.0 spec, including `version`, so a later
 * format change can migrate rather than discard. Every call is guarded: a
 * private-mode or quota-full browser must not take the game down with it.
 */
export class SaveManager {
  private static instance: SaveManager | null = null;

  static getInstance(): SaveManager {
    if (!SaveManager.instance) SaveManager.instance = new SaveManager();
    return SaveManager.instance;
  }

  static resetInstance(): void {
    SaveManager.instance = null;
  }

  save(sceneKey: string = SCENE_KEYS.WHITEFIELD, x = 0, y = 0): boolean {
    const state = useGameStore.getState();

    const data: SaveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      player: {
        name: state.playerName,
        background: 'engineering',
        homeState: DEFAULT_HOME_STATE,
        position: { scene: sceneKey, x, y },
        direction: DEFAULT_DIRECTION,
      },
      stats: state.stats,
      skills: state.skills,
      reputation: state.reputation,
      inventory: state.inventory,
      quests: state.quests,
      flags: state.flags,
      playtime_seconds: 0,
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      // Private browsing or quota exceeded — saving is best-effort.
      return false;
    }
  }

  load(): SaveData | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;

    try {
      const data = JSON.parse(raw) as SaveData;
      if (data.version === SAVE_VERSION) return data;

      // Upgrade a known older format forward. Anything unrecognised is still
      // refused — a half-applied save is worse than a fresh start.
      if ((MIGRATABLE_SAVE_VERSIONS as readonly string[]).includes(data.version)) {
        return SaveManager.migrate(data);
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Fill in fields added since an older format and stamp the new version. */
  private static migrate(data: SaveData): SaveData {
    return {
      ...data,
      version: SAVE_VERSION,
      reputation: data.reputation ?? { total: 0, byDistrict: {} },
      inventory: data.inventory ?? [],
      quests: data.quests ?? { active: {}, completed: [] },
      flags: data.flags ?? {},
    };
  }

  /** Load and push into the store. Returns false when there was nothing to load. */
  restore(): boolean {
    const data = this.load();
    if (!data) return false;

    useGameStore.getState().hydrate({
      playerName: data.player.name,
      stats: data.stats,
      skills: data.skills,
      reputation: data.reputation,
      inventory: data.inventory,
      quests: data.quests,
      flags: data.flags,
    });
    return true;
  }

  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // Nothing to do — the save was unreachable anyway.
    }
  }
}
