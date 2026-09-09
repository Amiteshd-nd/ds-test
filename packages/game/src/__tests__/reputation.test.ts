import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../core/events';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { QuestManager } from '../systems/QuestManager';
import { ReputationManager } from '../systems/ReputationManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { DISTRICTS, NPCS, npcsInDistrict, questsInDistrict, getDistrict, getNpc } from '../data';
import { REPUTATION_TIER_NAMES, SAVE_KEY, SAVE_VERSION } from '../utils/constants';

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
  gameEvents.clear();
  ReputationManager.resetInstance();
  QuestManager.resetInstance();
  DialogueManager.resetInstance();
  InventoryManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
  mem = installLocalStorage();
});

const rep = () => ReputationManager.getInstance();

describe('ReputationManager', () => {
  it('starts every run as an Outsider', () => {
    expect(rep().total).toBe(0);
    expect(rep().tier).toBe(0);
    expect(rep().tierName).toBe('Outsider');
  });

  it('climbs the macro-loop tiers at their thresholds', () => {
    const expected: Array<[number, string]> = [
      [0, 'Outsider'], [50, 'Survivor'], [150, 'Trusted Helper'],
      [400, 'Fixer'], [800, 'Important Player'],
    ];
    for (const [threshold, name] of expected) {
      useGameStore.getState().reset();
      ReputationManager.resetInstance();
      rep().add(threshold);
      expect(rep().tierName).toBe(name);
    }
    expect(REPUTATION_TIER_NAMES).toHaveLength(5);
  });

  it('reports how much is left to the next tier, and null at the top', () => {
    rep().add(20);
    expect(rep().toNextTier).toBe(30); // 50 - 20
    rep().add(800);
    expect(rep().toNextTier).toBeNull();
  });

  it('credits a district gain to both local standing and the global total', () => {
    rep().add(30, 'airport');
    expect(rep().total).toBe(30);
    expect(rep().standingIn('airport')).toBe(30);
    expect(rep().standingIn('whitefield')).toBe(0);
  });

  it('emits reputation:changed, and reputation:tier only on a promotion', () => {
    const changed = vi.fn();
    const promoted = vi.fn();
    gameEvents.on('reputation:changed', changed);
    gameEvents.on('reputation:tier', promoted);

    rep().add(10);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(promoted).not.toHaveBeenCalled();

    rep().add(40); // crosses 50
    expect(promoted).toHaveBeenCalledWith({ tier: 1, tierName: 'Survivor' });
  });

  it('ignores a zero-value change', () => {
    const changed = vi.fn();
    gameEvents.on('reputation:changed', changed);
    rep().add(0);
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('district access', () => {
  it('opens districts with no requirements', () => {
    expect(rep().canEnter('airport')).toBe(true);
  });

  it('gates a district behind its unlocking quest', () => {
    expect(rep().canEnter('starter_neighborhood')).toBe(false);
    useGameStore.getState().setQuests({ active: {}, completed: ['arrival'] });
    expect(rep().canEnter('starter_neighborhood')).toBe(true);
  });

  it('gates a district behind reputation', () => {
    expect(rep().canEnter('small_market')).toBe(false); // needs 50
    rep().add(50);
    expect(rep().canEnter('small_market')).toBe(true);
  });

  it('refuses an unknown district instead of letting it through', () => {
    expect(rep().canEnter('atlantis')).toBe(false);
  });

  it('lists available districts in phase order', () => {
    rep().add(200);
    useGameStore.getState().setQuests({ active: {}, completed: ['arrival'] });
    const phases = rep().availableDistricts().map((d) => d.phase);
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
    expect(rep().availableDistricts().map((d) => d.id)).toContain('whitefield');
  });
});

describe('district + NPC registries', () => {
  it('loads districts and NPCs by id', () => {
    expect(Object.keys(DISTRICTS)).toContain('airport');
    expect(Object.keys(NPCS)).toContain('receptionist');
    expect(getDistrict('airport').name).toBe('Kempegowda International');
    expect(getNpc('receptionist').tier).toBe(2);
  });

  it('queries content by district — the unit of world expansion', () => {
    expect(npcsInDistrict('airport')).toHaveLength(5);
    expect(npcsInDistrict('whitefield')).toEqual([]);
    expect(questsInDistrict('airport').map((q) => q.id)).toEqual(['arrival']);
  });

  it('fails loudly on unknown ids', () => {
    expect(() => getDistrict('narnia')).toThrow(/Unknown district/);
    expect(() => getNpc('nobody')).toThrow(/Unknown NPC/);
  });
});

describe('reputation in the quest loop', () => {
  it('completing arrival grants reputation globally and to its district', () => {
    QuestManager.getInstance().start('arrival');
    const d = DialogueManager.getInstance();
    d.start('receptionist'); d.choose(1); d.end();
    gameEvents.emit('zone:reached', { zoneId: 'zone_exit', sceneKey: 'AirportScene' });

    expect(rep().total).toBe(10);
    expect(rep().standingIn('airport')).toBe(10);
  });

  it('a reputation-gated quest refuses to start until the bar is met', () => {
    const qm = new QuestManager({
      big_job: {
        id: 'big_job', title: 'T', description: '', chapter: 2,
        district: 'airport', type: 'negotiation', reputation_required: 150,
        objectives: [{ id: 'o', text: '', type: 'reach', target: 'z' }],
        rewards: { xp: 0 },
      },
    });
    expect(qm.start('big_job')).toBe(false);
    rep().add(150);
    expect(qm.start('big_job')).toBe(true);
    qm.dispose();
  });
});

describe('save migration', () => {
  it('round-trips reputation', () => {
    rep().add(75, 'airport');
    expect(SaveManager.getInstance().save()).toBe(true);
    useGameStore.getState().reset();
    expect(rep().total).toBe(0);
    expect(SaveManager.getInstance().restore()).toBe(true);
    expect(rep().total).toBe(75);
    expect(rep().standingIn('airport')).toBe(75);
  });

  it('upgrades a 1.0.0 save forward instead of discarding the run', () => {
    mem.set(SAVE_KEY, JSON.stringify({
      version: '1.0.0',
      timestamp: 1,
      player: { name: 'Old', background: 'engineering', homeState: 'Other',
        position: { scene: 'AirportScene', x: 1, y: 2 }, direction: 'down' },
      stats: { energy: 40, stress: 30, money: 1234 },
      skills: { technical: { xp: 0, level: 0 }, soft_skills: { xp: 0, level: 0 },
        city_survival: { xp: 120, level: 1 } },
      inventory: ['water_bottle'],
      quests: { active: {}, completed: ['arrival'] },
      flags: {},
      playtime_seconds: 0,
    }));

    const loaded = SaveManager.getInstance().load();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SAVE_VERSION);
    expect(loaded!.reputation).toEqual({ total: 0, byDistrict: {} });

    expect(SaveManager.getInstance().restore()).toBe(true);
    const state = useGameStore.getState();
    expect(state.stats.money).toBe(1234);          // the old run survives
    expect(state.inventory).toEqual(['water_bottle']);
    expect(state.quests.completed).toEqual(['arrival']);
  });

  it('still refuses a version it has no migration for', () => {
    mem.set(SAVE_KEY, JSON.stringify({ version: '0.5.0', stats: {} }));
    expect(SaveManager.getInstance().load()).toBeNull();
  });
});

describe('single-currency economy', () => {
  it('tracks lifetime earnings without counting spending', () => {
    const stats = StatsManager.getInstance();
    stats.adjustMoney(500);   // income
    stats.adjustMoney(-200);  // spend
    stats.adjustMoney(100);   // income
    const state = useGameStore.getState();
    expect(state.stats.money).toBe(5400);   // 5000 + 500 - 200 + 100
    expect(state.totalEarned).toBe(600);    // income only
  });
});
