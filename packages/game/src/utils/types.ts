import type { NPC_TIERS, PlayerBackground, QUEST_TYPES } from './constants';

// Direction for player movement and NPC facing.
export type Direction = 'down' | 'left' | 'right' | 'up';

export interface PlayerStats {
  energy: number; // 0-100
  stress: number; // 0-100
  money: number; // ₹ — the single currency; no second currency until the
  // gameplay actually needs one.
}

/**
 * Standing in the city. `total` drives the macro-loop tier; `byDistrict` is
 * local trust, which is what gates access to an area's deeper missions.
 */
export interface ReputationState {
  total: number;
  byDistrict: Record<string, number>;
}

export interface SkillBranch {
  xp: number;
  level: number; // 0-4 (5 tiers total)
}

export interface PlayerSkills {
  technical: SkillBranch;
  soft_skills: SkillBranch;
  city_survival: SkillBranch;
}

export type SkillBranchName = keyof PlayerSkills;

export interface PlayerData {
  name: string;
  background: PlayerBackground;
  homeState: string;
  position: {
    scene: string;
    x: number;
    y: number;
  };
  direction: Direction;
}

// --- Dialogue --------------------------------------------------------------
export interface StatEffect {
  energy?: number;
  stress?: number;
  money?: number;
  xp?: number;
  xp_branch?: SkillBranchName;
  item_add?: string;
  item_remove?: string;
}

export interface SkillRequirement {
  skill: SkillBranchName;
  level: number;
}

export interface DialogueChoice {
  text: string;
  next: string;
  effect?: StatEffect;
  requires?: SkillRequirement;
  quest_trigger?: string;
}

export interface DialogueNode {
  text: string;
  portrait_expression?: number; // 0=neutral, 1=angry, 2=happy, …
  choices?: DialogueChoice[];
  next?: string; // auto-advance when there are no choices
  effect?: StatEffect;
  quest_trigger?: string;
  requires?: SkillRequirement;
}

export interface DialogueFile {
  id: string;
  speaker: string;
  portrait: string; // spritesheet key
  nodes: Record<string, DialogueNode>;
}

// --- Districts -------------------------------------------------------------
/**
 * A district is the unit of world expansion: a believable RPG interpretation
 * of a Bangalore area, not a 1:1 recreation. Adding one should require data —
 * map, tiles, NPCs, quests, dialogue — and no core code.
 */
export interface DistrictDef {
  id: string;
  name: string;
  /** Rollout phase, so content can ship district by district. */
  phase: number;
  /** Scene that renders it, from SCENE_KEYS. Absent until the scene is built. */
  scene?: string;
  /** Quest that opens it. */
  unlocked_by_quest?: string;
  /** Minimum total reputation required to enter. */
  reputation_required?: number;
}

// --- NPCs ------------------------------------------------------------------
export type NpcTier = (typeof NPC_TIERS)[number];

/**
 * NPC definitions live in data so populating a district is authoring, not
 * coding. Tier decides how much the NPC is expected to carry narratively.
 */
export interface NpcDef {
  id: string;
  name: string;
  tier: NpcTier;
  district: string;
  /** Dialogue id. Required for tier 2 and 3; ambient NPCs have none. */
  dialogue?: string;
  /** Object name in the Tiled spawn layer that places this NPC. */
  spawn?: string;
  /** Placeholder tint until real portraits and sprites land. */
  tint?: number;
}

// --- Placeable objects -----------------------------------------------------
/**
 * A placeable world object, described flatly enough that a script — or a
 * vision model captioning a bought tileset — can generate one correctly.
 *
 * `tiles` lists tile names row-major, top-left to bottom-right, with exactly
 * `tilesWide * tilesTall` entries. Names resolve against the tileset's
 * generated id map, so a manifest never hard-codes a bare tile index.
 */
export interface ObjectDef {
  id: string;
  label: string;
  category: string;
  /** Image footprint in grid cells. */
  tilesWide: number;
  tilesTall: number;
  /**
   * Rows at the TOP of the image that are purely visual — a tree's canopy, a
   * bookcase's upper shelves. The remaining bottom rows are the footprint that
   * blocks movement. See src/core/depth.ts for why this reading was chosen.
   */
  backgroundTiles: number;
  /** Whether the footprint blocks movement. */
  solid: boolean;
  /** Whether a runtime hue shift is offered for this object. */
  colorEditable: boolean;
  /** Named variants — orientations, on/off states. A simple item has `default`. */
  tiles: Record<string, string[]>;
}

// --- Quests ----------------------------------------------------------------
export interface QuestObjective {
  id: string;
  text: string;
  type: 'interact' | 'dialogue' | 'collect' | 'reach' | 'challenge';
  target: string; // entity, NPC, item or zone ID
  count?: number;
  optional?: boolean;
}

export interface QuestRewards {
  xp: number;
  xp_branch?: SkillBranchName;
  money?: number;
  /** Reputation gained — credited globally and to the quest's district. */
  reputation?: number;
  items?: string[];
  skill_unlock?: string;
  unlocks?: string[]; // scene keys or quest IDs
}

/** One of the ten reusable mission archetypes. */
export type QuestType = (typeof QUEST_TYPES)[number];

export interface QuestFile {
  id: string;
  title: string;
  description: string;
  chapter: number;
  /** Which district this mission belongs to. */
  district: string;
  /** Which archetype drives it — the same system runs all ten. */
  type: QuestType;
  prerequisite_quests?: string[];
  /** Minimum total reputation before this mission is offered. */
  reputation_required?: number;
  objectives: QuestObjective[];
  rewards: QuestRewards;
  on_complete?: {
    unlock_scene?: string;
    trigger_dialogue?: string;
    trigger_cutscene?: string;
  };
}

// --- Items -----------------------------------------------------------------
export type ItemType = 'consumable' | 'key_item' | 'gift' | 'equipment';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  icon: string; // spritesheet key
  type: ItemType;
  effect?: StatEffect;
  stackable: boolean;
  max_stack?: number;
}

// --- Save ------------------------------------------------------------------
export interface SaveData {
  version: string; // SAVE_VERSION, for migration support
  timestamp: number;
  player: PlayerData;
  stats: PlayerStats;
  skills: PlayerSkills;
  reputation: ReputationState;
  inventory: string[]; // item IDs
  quests: {
    active: Record<string, string[]>; // quest_id -> completed objective IDs
    completed: string[];
  };
  flags: Record<string, boolean>; // generic flags for branching
  playtime_seconds: number;
}
