import { beforeEach, describe, expect, it } from 'vitest';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { SAVE_KEY } from '../utils/constants';

/** jsdom is not configured for this package; a tiny shim is all these need. */
const installLocalStorage = () => {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  return mem;
};

let mem: Map<string, string>;

beforeEach(() => {
  mem = installLocalStorage();
  SaveManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
});

describe('StatsManager', () => {
  it('applies a compound effect in one pass', () => {
    StatsManager.getInstance().applyEffect({
      money: -350, energy: -25, stress: 15, xp: 120, xp_branch: 'city_survival',
    });
    const s = useGameStore.getState();
    expect(s.stats).toMatchObject({ energy: 45, stress: 35, money: 4650 });
    expect(s.skills.city_survival).toEqual({ xp: 120, level: 1 });
  });

  it('clamps energy and stress to their bounds', () => {
    const stats = StatsManager.getInstance();
    stats.adjustEnergy(-999);
    stats.adjustStress(999);
    expect(useGameStore.getState().stats.energy).toBe(0);
    expect(useGameStore.getState().stats.stress).toBe(100);
  });

  it('lets money go negative — debt is a survival mechanic, not a bug', () => {
    StatsManager.getInstance().adjustMoney(-6000);
    expect(useGameStore.getState().stats.money).toBe(-1000);
  });

  it('crosses skill tiers at the documented thresholds', () => {
    const stats = StatsManager.getInstance();
    const level = () => useGameStore.getState().skills.technical.level;
    stats.addXp('technical', 99);
    expect(level()).toBe(0);
    stats.addXp('technical', 1);
    expect(level()).toBe(1);
    stats.addXp('technical', 900);
    expect(level()).toBe(4);
  });
});

describe('SaveManager', () => {
  it('round-trips stats and skills through a reset', () => {
    StatsManager.getInstance().applyEffect({ money: -350, xp: 120, xp_branch: 'city_survival' });
    expect(SaveManager.getInstance().save('AirportScene', 128, 256)).toBe(true);

    useGameStore.getState().reset();
    expect(useGameStore.getState().stats.money).toBe(5000);

    expect(SaveManager.getInstance().restore()).toBe(true);
    const s = useGameStore.getState();
    expect(s.stats.money).toBe(4650);
    expect(s.skills.city_survival.level).toBe(1);
  });

  it('records the scene and position it was saved at', () => {
    SaveManager.getInstance().save('AirportScene', 128, 256);
    expect(SaveManager.getInstance().load()!.player.position).toEqual({
      scene: 'AirportScene', x: 128, y: 256,
    });
  });

  it('refuses a save written by a different format version', () => {
    mem.set(SAVE_KEY, JSON.stringify({ version: '0.9.0', stats: {} }));
    expect(SaveManager.getInstance().load()).toBeNull();
  });

  it('refuses corrupt JSON instead of throwing', () => {
    mem.set(SAVE_KEY, '{not json');
    expect(() => SaveManager.getInstance().load()).not.toThrow();
    expect(SaveManager.getInstance().load()).toBeNull();
  });

  it('reports failure rather than throwing when storage is unavailable', () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    };
    expect(SaveManager.getInstance().save()).toBe(false);
    expect(SaveManager.getInstance().load()).toBeNull();
    expect(SaveManager.getInstance().restore()).toBe(false);
  });

  it('restore() is a no-op when there is nothing saved', () => {
    expect(SaveManager.getInstance().restore()).toBe(false);
  });
});
