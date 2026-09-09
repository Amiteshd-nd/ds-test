import { gameEvents } from '../core/events';
import { QUESTS } from '../data';
import { InventoryManager } from './InventoryManager';
import { ReputationManager } from './ReputationManager';
import { StatsManager } from './StatsManager';
import { useGameStore } from '../store';
import type { QuestFile } from '../utils/types';

/** Flag key set when a quest unlocks a scene, e.g. "scene_unlocked:PGScene". */
export const sceneUnlockedFlag = (sceneKey: string): string => `scene_unlocked:${sceneKey}`;

/**
 * QuestManager — objective tracking driven entirely by the event bus.
 *
 * It subscribes once and reacts: a finished conversation progresses `dialogue`
 * objectives, a picked-up item progresses `collect`, a trigger volume
 * progresses `reach`, an examined entity progresses `interact`. No scene ever
 * calls "completeObjective" — scenes report facts, this manager draws
 * conclusions. That is the property that keeps quest logic out of scene code as
 * the quest count grows.
 *
 * Quest state (active objective sets, completed list) lives in the store in the
 * exact shape SaveData persists.
 */
export class QuestManager {
  private static instance: QuestManager | null = null;

  static getInstance(): QuestManager {
    if (!QuestManager.instance) QuestManager.instance = new QuestManager();
    return QuestManager.instance;
  }

  /** Unsubscribes the singleton from the bus and drops it. */
  static resetInstance(): void {
    QuestManager.instance?.dispose();
    QuestManager.instance = null;
  }

  private unsubscribes: Array<() => void> = [];

  /** `quests` is injectable so tests can drive synthetic quest graphs. */
  constructor(private quests: Record<string, QuestFile> = QUESTS) {
    this.unsubscribes.push(
      gameEvents.on('dialogue:ended', ({ dialogueId, triggeredQuests }) => {
        this.progress('dialogue', dialogueId);
        for (const questId of triggeredQuests) this.start(questId);
      }),
      gameEvents.on('item:added', ({ itemId }) => this.progress('collect', itemId)),
      gameEvents.on('zone:reached', ({ zoneId }) => this.progress('reach', zoneId)),
      gameEvents.on('entity:interacted', ({ entityId }) => this.progress('interact', entityId)),
    );
  }

  dispose(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
  }

  isActive(questId: string): boolean {
    return questId in useGameStore.getState().quests.active;
  }

  isCompleted(questId: string): boolean {
    return useGameStore.getState().quests.completed.includes(questId);
  }

  /**
   * Begin a quest. Refuses (returns false) when it is already active or done,
   * or a prerequisite quest has not been completed.
   */
  start(questId: string): boolean {
    const quest = this.quests[questId];
    if (!quest) throw new Error(`Unknown quest "${questId}"`); // content bug — be loud

    const { active, completed } = useGameStore.getState().quests;
    if (questId in active || completed.includes(questId)) return false;

    const prerequisites = quest.prerequisite_quests ?? [];
    if (!prerequisites.every((id) => completed.includes(id))) return false;

    // Reputation gate: some work is only offered to people the city trusts.
    if (ReputationManager.getInstance().total < (quest.reputation_required ?? 0)) return false;

    useGameStore.getState().setQuests({
      active: { ...active, [questId]: [] },
      completed,
    });
    gameEvents.emit('quest:started', { questId });
    return true;
  }

  /** Advance every active quest whose objective of `type` targets `target`. */
  private progress(type: QuestFile['objectives'][number]['type'], target: string): void {
    const { active } = useGameStore.getState().quests;

    for (const questId of Object.keys(active)) {
      const quest = this.quests[questId];
      if (!quest) continue;

      for (const objective of quest.objectives) {
        if (objective.type !== type || objective.target !== target) continue;
        if (active[questId].includes(objective.id)) continue;

        // Counted collects complete when the whole count is held, not per pickup.
        if (type === 'collect') {
          const needed = objective.count ?? 1;
          if (InventoryManager.getInstance().count(target) < needed) continue;
        }

        this.completeObjective(questId, objective.id);
      }
    }
  }

  private completeObjective(questId: string, objectiveId: string): void {
    const state = useGameStore.getState();
    const done = [...(state.quests.active[questId] ?? []), objectiveId];

    state.setQuests({
      active: { ...state.quests.active, [questId]: done },
      completed: state.quests.completed,
    });
    gameEvents.emit('quest:objective', { questId, objectiveId });

    const quest = this.quests[questId];
    const finished = quest.objectives
      .filter((o) => !o.optional)
      .every((o) => done.includes(o.id));
    if (finished) this.complete(questId);
  }

  private complete(questId: string): void {
    const quest = this.quests[questId];
    const state = useGameStore.getState();

    const { [questId]: _, ...remaining } = state.quests.active;
    state.setQuests({
      active: remaining,
      completed: [...state.quests.completed, questId],
    });

    // Rewards, then unlocks — order matters if a reward item is itself a key.
    const rewards = quest.rewards;
    if (rewards.xp && rewards.xp_branch) {
      StatsManager.getInstance().addXp(rewards.xp_branch, rewards.xp);
    }
    if (rewards.money) StatsManager.getInstance().adjustMoney(rewards.money);
    if (rewards.reputation) {
      // Credited to the quest's district as well as the global total.
      ReputationManager.getInstance().add(rewards.reputation, quest.district);
    }
    for (const itemId of rewards.items ?? []) {
      InventoryManager.getInstance().add(itemId);
    }

    if (quest.on_complete?.unlock_scene) {
      state.setFlag(sceneUnlockedFlag(quest.on_complete.unlock_scene), true);
    }

    gameEvents.emit('quest:completed', { questId });
  }
}
