import { beforeEach, describe, expect, it } from 'vitest';
import { DialogueManager } from '../systems/DialogueManager';
import { StatsManager } from '../systems/StatsManager';
import { useGameStore } from '../store';
import { DIALOGUE, ITEMS, QUESTS, getDialogue, getItem, getQuest } from '../data';

beforeEach(() => {
  DialogueManager.resetInstance();
  StatsManager.resetInstance();
  useGameStore.getState().reset();
});

describe('content registry', () => {
  it('loads authored content by id', () => {
    expect(Object.keys(DIALOGUE).sort()).toEqual([
      'airport_helper', 'receptionist', 'security_guard', 'shopkeeper',
    ]);
    expect(Object.keys(QUESTS)).toContain('arrival');
    expect(Object.keys(ITEMS)).toContain('water_bottle');
  });

  it('fails loudly on an unknown id rather than returning undefined', () => {
    expect(() => getDialogue('nobody')).toThrow(/Unknown dialogue "nobody"/);
    expect(() => getQuest('nothing')).toThrow(/Unknown quest/);
    expect(() => getItem('nothing')).toThrow(/Unknown item/);
  });
});

describe('DialogueManager', () => {
  it('opens on the start node and exposes its choices', () => {
    const view = DialogueManager.getInstance().start('receptionist');
    expect(view.speaker).toBe('Receptionist');
    expect(view.nodeId).toBe('start');
    expect(view.choices.map((c) => c.text)).toEqual([
      'Which one is cheaper?', 'Thanks, I\'ll manage.',
    ]);
    expect(view.isEnd).toBe(false);
  });

  it('applies a node effect on arrival', () => {
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    expect(useGameStore.getState().skills.city_survival.xp).toBe(0);
    d.choose(0); // -> "fares", which grants 10 city_survival xp
    expect(useGameStore.getState().skills.city_survival.xp).toBe(10);
  });

  it('applies a choice effect — buying water costs money and grants the item', () => {
    const d = DialogueManager.getInstance();
    d.start('shopkeeper');
    d.choose(0);
    expect(useGameStore.getState().stats.money).toBe(4980);
  });

  it('auto-advances a node that has next and no choices', () => {
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    const fares = d.choose(0);
    expect(fares.canAdvance).toBe(true);
    const farewell = d.advance();
    expect(farewell.nodeId).toBe('farewell');
    expect(farewell.isEnd).toBe(true);
    expect(farewell.canAdvance).toBe(false);
  });

  it('locks a choice behind a skill requirement but still shows it', () => {
    const view = DialogueManager.getInstance().start('airport_helper');
    const gated = view.choices[1];
    expect(gated.enabled).toBe(false);
    expect(gated.lockedReason).toBe('Needs City Survival: Newcomer');
    expect(gated.text).toBeTruthy(); // shown, not hidden
  });

  it('unlocks that choice once the skill tier is reached', () => {
    StatsManager.getInstance().addXp('city_survival', 100); // -> level 1
    const view = DialogueManager.getInstance().start('airport_helper');
    expect(view.choices[1].enabled).toBe(true);
    expect(view.choices[1].lockedReason).toBeUndefined();
  });

  it('refuses to take a locked choice', () => {
    const d = DialogueManager.getInstance();
    d.start('airport_helper');
    expect(() => d.choose(1)).toThrow(/is locked/);
  });

  it('refuses a choice index that does not exist', () => {
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    expect(() => d.choose(99)).toThrow(/does not exist/);
  });

  it('refuses to advance from a terminal node', () => {
    const d = DialogueManager.getInstance();
    d.start('receptionist');
    d.choose(1); // straight to farewell
    expect(() => d.advance()).toThrow(/nothing to advance to/);
  });

  it('tracks active state across a conversation', () => {
    const d = DialogueManager.getInstance();
    expect(d.isActive).toBe(false);
    d.start('security_guard');
    expect(d.isActive).toBe(true);
    d.end();
    expect(d.isActive).toBe(false);
  });

  it('throws when driven with no active conversation', () => {
    expect(() => DialogueManager.getInstance().view()).toThrow(/No dialogue is active/);
  });

  it('accumulates stress from the guard branch that foreshadows the outbreak', () => {
    const d = DialogueManager.getInstance();
    d.start('security_guard');
    d.choose(0);
    expect(useGameStore.getState().stats.stress).toBe(25); // 20 starting + 5
  });
});
