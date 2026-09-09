import type { ReactNode } from 'react';
import PhaserGame from './PhaserGame';
import { useGameStore } from './store';
import { QUESTS } from './data';
import { REPUTATION_THRESHOLDS, REPUTATION_TIER_NAMES, SCENE_KEYS, SKILL_TIER_NAMES } from './utils/constants';
import './game.css';

export interface BangaloreTimesProps {
  /**
   * Optional node rendered as the back pill (e.g. a react-router <Link>).
   * Omit it — as the standalone build does — and no back button shows.
   */
  backSlot?: ReactNode;
  /** Scene to enter after loading. Defaults to the title screen. */
  startScene?: string;
}

// Scenes where the player is walking around and the stat HUD is meaningful.
// Menus and the loading screen get a bare canvas instead.
const GAMEPLAY_SCENES = new Set<string>([SCENE_KEYS.AIRPORT, SCENE_KEYS.WHITEFIELD]);

// Self-contained game screen. Portable across hosts: it takes no router or
// theme dependency.
const BangaloreTimes = ({ backSlot, startScene }: BangaloreTimesProps) => {
  const botCount = useGameStore((s) => s.botCount);
  const reputation = useGameStore((s) => s.reputation);
  const stats = useGameStore((s) => s.stats);
  const survival = useGameStore((s) => s.skills.city_survival);
  const activeScene = useGameStore((s) => s.activeScene);
  const quests = useGameStore((s) => s.quests);

  // Track the first active quest — enough until multiple quests can run.
  const activeQuestId = Object.keys(quests.active)[0] ?? null;
  const activeQuest = activeQuestId ? QUESTS[activeQuestId] : null;
  const doneObjectives = activeQuestId ? quests.active[activeQuestId] : [];

  const inGameplay = activeScene !== null && GAMEPLAY_SCENES.has(activeScene);
  const survivalTier = SKILL_TIER_NAMES.city_survival[survival.level];

  // Reputation tier drives the macro loop, so the HUD leads with it rather
  // than a raw number.
  const repTier = REPUTATION_THRESHOLDS.reduce(
    (tier, threshold, i) => (reputation.total >= threshold ? i : tier),
    0,
  );
  const repNext = REPUTATION_THRESHOLDS[repTier + 1];

  return (
    <div className="nq-root">
      {/* Game canvas fills the viewport */}
      <PhaserGame startScene={startScene} />

      {/* HUD overlay. The back pill stays available everywhere so the player is
          never stranded in a menu; the rest is gameplay-only. */}
      <div className="nq-hud-top">
        <div className="nq-back-slot">{backSlot}</div>

        {inGameplay && (
          <div className="nq-title-block">
            <span className="nq-title">{REPUTATION_TIER_NAMES[repTier]}</span>
            <span className="nq-sub">
              {repNext === undefined
                ? `Reputation ${reputation.total}`
                : `Reputation ${reputation.total}/${repNext}`}
              {botCount > 0 && ` · ${botCount} online`}
            </span>
          </div>
        )}
      </div>

      {inGameplay && activeQuest && (
        <div className="nq-quest">
          <span className="nq-quest-title">{activeQuest.title}</span>
          {activeQuest.objectives.map((objective) => {
            const done = doneObjectives.includes(objective.id);
            return (
              <span key={objective.id} className={done ? 'nq-obj nq-obj-done' : 'nq-obj'}>
                {done ? '✓' : '○'} {objective.text}
                {objective.optional ? ' (optional)' : ''}
              </span>
            );
          })}
        </div>
      )}

      {inGameplay && (
        <>
          {/* Stat readout — energy, stress and money from the v1.0 stat model */}
          <div className="nq-stats">
            <span className="nq-stat">
              <span className="nq-stat-label">Energy</span>
              <span className="nq-meter">
                <span className="nq-meter-fill nq-energy" style={{ width: `${stats.energy}%` }} />
              </span>
            </span>
            <span className="nq-stat">
              <span className="nq-stat-label">Stress</span>
              <span className="nq-meter">
                <span className="nq-meter-fill nq-stress" style={{ width: `${stats.stress}%` }} />
              </span>
            </span>
            <span className="nq-stat nq-stat-text">₹{stats.money.toLocaleString('en-IN')}</span>
            <span className="nq-stat nq-stat-text">{survivalTier}</span>
          </div>

          <div className="nq-controls">
            <span className="nq-sub">
              Move with WASD or arrow keys · SHIFT to run · E to interact
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default BangaloreTimes;
