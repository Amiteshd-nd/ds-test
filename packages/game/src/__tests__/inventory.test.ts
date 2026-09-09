import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gameEvents } from '../core/events';
import { InventoryManager } from '../systems/InventoryManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';

beforeEach(() => {
  gameEvents.clear();
  InventoryManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
});

const inv = () => InventoryManager.getInstance();

describe('InventoryManager', () => {
  it('adds and counts items', () => {
    expect(inv().add('water_bottle', 2)).toBe(true);
    expect(inv().count('water_bottle')).toBe(2);
    expect(inv().has('water_bottle')).toBe(true);
  });

  it('throws loudly on an unknown item id', () => {
    expect(() => inv().add('vibranium')).toThrow(/Unknown item/);
  });

  it('enforces max_stack all-or-nothing', () => {
    expect(inv().add('water_bottle', 6)).toBe(true);  // max_stack: 6
    expect(inv().add('water_bottle', 1)).toBe(false); // would exceed
    expect(inv().count('water_bottle')).toBe(6);      // nothing half-applied
  });

  it('refuses a second copy of a non-stackable', () => {
    expect(inv().add('sim_card')).toBe(true);
    expect(inv().add('sim_card')).toBe(false);
  });

  it('remove is all-or-nothing too', () => {
    inv().add('water_bottle', 2);
    expect(inv().remove('water_bottle', 3)).toBe(false);
    expect(inv().count('water_bottle')).toBe(2);
    expect(inv().remove('water_bottle', 2)).toBe(true);
    expect(inv().count('water_bottle')).toBe(0);
  });

  it('emits item:added and item:removed on the bus', () => {
    const added = vi.fn();
    const removed = vi.fn();
    gameEvents.on('item:added', added);
    gameEvents.on('item:removed', removed);
    inv().add('water_bottle');
    inv().remove('water_bottle');
    expect(added).toHaveBeenCalledWith({ itemId: 'water_bottle', count: 1 });
    expect(removed).toHaveBeenCalledWith({ itemId: 'water_bottle', count: 1 });
  });

  it('using a consumable applies its effect and removes one unit', () => {
    useGameStore.getState().adjustStress(20); // 20 -> 40
    inv().add('cutting_chai'); // effect: energy +15, stress -5
    expect(inv().use('cutting_chai')).toBe(true);
    const stats = useGameStore.getState().stats;
    expect(stats.energy).toBe(85);
    expect(stats.stress).toBe(35);
    expect(inv().count('cutting_chai')).toBe(0);
  });

  it('refuses to use a key item', () => {
    inv().add('sim_card');
    expect(inv().use('sim_card')).toBe(false);
    expect(inv().has('sim_card')).toBe(true);
  });

  it('StatsManager routes item_add — the effect the old code silently dropped', () => {
    StatsManager.getInstance().applyEffect({ money: -20, item_add: 'water_bottle' });
    expect(useGameStore.getState().stats.money).toBe(4980);
    expect(inv().count('water_bottle')).toBe(1);
  });

  it('StatsManager warns instead of throwing when a stack is full', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    inv().add('sim_card');
    StatsManager.getInstance().applyEffect({ item_add: 'sim_card' });
    expect(warn).toHaveBeenCalled();
    expect(inv().count('sim_card')).toBe(1);
    warn.mockRestore();
  });
});
