import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../core/events';
import { DialogueManager } from '../systems/DialogueManager';
import { InventoryManager } from '../systems/InventoryManager';
import { QuestManager, sceneUnlockedFlag } from '../systems/QuestManager';
import { SaveManager } from '../systems/SaveManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import type { QuestFile } from '../utils/types';

const installLocalStorage = () => {
  const mem = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
};

beforeEach(() => {
  gameEvents.clear();
  QuestManager.resetInstance();
  DialogueManager.resetInstance();
  InventoryManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
  installLocalStorage();
});

const quests = () => useGameStore.getState().quests;

describe('QuestManager', () => {
  it('starts a quest and emits quest:started', () => {
    const started = vi.fn();
    gameEvents.on('quest:started', started);
    expect(QuestManager.getInstance().start('arrival')).toBe(true);
    expect(quests().active.arrival).toEqual([]);
    expect(started).toHaveBeenCalledWith({ questId: 'arrival' });
  });

  it('refuses to start a quest twice', () => {
    const qm = QuestManager.getInstance();
    expect(qm.start('arrival')).toBe(true);
    expect(qm.start('arrival')).toBe(false);
  });

  it('throws loudly on an unknown quest id', () => {
    expect(() => QuestManager.getInstance().start('ghost_quest')).toThrow(/Unknown quest/);
  });

  it('honors prerequisites on an injected quest graph', () => {
    const graph: Record<string, QuestFile> = {
      first: { id: 'first', title: 'A', description: '', chapter: 1,
        district: 'airport', type: 'search',
        objectives: [{ id: 'o', text: '', type: 'reach', target: 'z' }], rewards: { xp: 0 } },
      second: { id: 'second', title: 'B', description: '', chapter: 1,
        district: 'airport', type: 'investigation',
        prerequisite_quests: ['first'],
        objectives: [{ id: 'o', text: '', type: 'reach', target: 'z2' }], rewards: { xp: 0 } },
    };
    const qm = new QuestManager(graph);
    expect(qm.start('second')).toBe(false); // first not completed
    qm.start('first');
    gameEvents.emit('zone:reached', { zoneId: 'z', sceneKey: 'X' }); // completes first
    expect(qm.isCompleted('first')).toBe(true);
    expect(qm.start('second')).toBe(true);
    qm.dispose();
  });

  it('a dialogue objective completes when that conversation ends', () => {
    QuestManager.getInstance().start('arrival');
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    d.choose(1); // straight to farewell
    d.end();     // bus emission progresses the objective
    expect(quests().active.arrival).toContain('greet_reception');
  });

  it('a collect objective completes on pickup, and optionals never block', () => {
    QuestManager.getInstance().start('arrival');
    InventoryManager.getInstance().add('water_bottle');
    expect(quests().active.arrival).toContain('stock_up');
    expect(quests().completed).toEqual([]); // required objectives still open
  });

  it('completes the arrival quest end to end and grants every reward', () => {
    const objective = vi.fn();
    const completed = vi.fn();
    gameEvents.on('quest:objective', objective);
    gameEvents.on('quest:completed', completed);

    QuestManager.getInstance().start('arrival');

    // Objective 1: talk to the receptionist (via the shorter branch).
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    d.choose(1);
    d.end();

    // Optional objective: buy water at the shop (choice effect adds the item).
    d.start('shopkeeper');
    d.choose(0); // -₹20, +water_bottle
    d.advance();
    d.end();

    // Objective 3: reach the exit.
    gameEvents.emit('zone:reached', { zoneId: 'zone_exit', sceneKey: 'AirportScene' });

    const state = useGameStore.getState();
    expect(state.quests.completed).toEqual(['arrival']);
    expect(state.quests.active).toEqual({});
    expect(objective).toHaveBeenCalledTimes(3);
    expect(completed).toHaveBeenCalledWith({ questId: 'arrival' });

    // Rewards: 50 city_survival xp and the degree certificate.
    expect(state.skills.city_survival.xp).toBe(50);
    expect(InventoryManager.getInstance().has('degree_certificate')).toBe(true);

    // Scene unlock recorded as a flag.
    expect(state.flags[sceneUnlockedFlag('PGScene')]).toBe(true);

    // And the shop transaction really happened.
    expect(state.stats.money).toBe(4980);
    expect(InventoryManager.getInstance().has('water_bottle')).toBe(true);
  });

  it('a completed quest cannot be restarted', () => {
    const qm = QuestManager.getInstance();
    qm.start('arrival');
    const d = DialogueManager.getInstance();
    d.start('receptionist'); d.choose(1); d.end();
    gameEvents.emit('zone:reached', { zoneId: 'zone_exit', sceneKey: 'AirportScene' });
    expect(qm.isCompleted('arrival')).toBe(true);
    expect(qm.start('arrival')).toBe(false);
  });

  it('quest progress and inventory survive a save/restore round trip', () => {
    QuestManager.getInstance().start('arrival');
    InventoryManager.getInstance().add('water_bottle');
    const d = DialogueManager.getInstance();
    d.start('receptionist'); d.choose(1); d.end();

    expect(SaveManager.getInstance().save('AirportScene', 1, 2)).toBe(true);
    useGameStore.getState().reset();
    expect(useGameStore.getState().inventory).toEqual([]);

    expect(SaveManager.getInstance().restore()).toBe(true);
    const state = useGameStore.getState();
    expect(state.inventory).toContain('water_bottle');
    expect(state.quests.active.arrival).toEqual(
      expect.arrayContaining(['greet_reception', 'stock_up']),
    );
  });

  it('resetInstance unsubscribes — a dead manager reacts to nothing', () => {
    QuestManager.getInstance().start('arrival');
    QuestManager.resetInstance();
    gameEvents.emit('zone:reached', { zoneId: 'zone_exit', sceneKey: 'AirportScene' });
    // Objective untouched: the store still has the quest active and empty.
    expect(quests().active.arrival).toEqual([]);
  });
});
