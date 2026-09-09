/**
 * Validates authored content in src/data/ against the schemas in utils/types.ts
 * and against itself.
 *
 * TypeScript cannot check the contents of a JSON import, so a dialogue tree
 * whose `next` points at a node that no longer exists type-checks perfectly and
 * soft-locks the conversation at runtime. Everything here is the class of bug
 * the compiler cannot see: dangling references, unreachable nodes, unknown item
 * and quest ids, prerequisite cycles.
 *
 * Node runs this .ts file directly (24+ strips types), so SCENE_KEYS is
 * imported from constants rather than duplicated here.
 *
 * Exit 0 = content is sound. 1 = at least one problem.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NPC_TIERS,
  QUEST_TYPES,
  SCENE_KEYS,
  SKILL_TIER_NAMES,
} from '../src/utils/constants.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../src/data');

const ENTRY_NODE = 'start';
const ITEM_TYPES = ['consumable', 'key_item', 'gift', 'equipment'];
const SKILL_BRANCHES = Object.keys(SKILL_TIER_NAMES);
const SCENES: string[] = Object.values(SCENE_KEYS);
const QUEST_TYPE_LIST: string[] = [...QUEST_TYPES];
const NPC_TIER_LIST: number[] = [...NPC_TIERS];

type Json = Record<string, any>;

const readJsonDir = (dir: string): Array<{ file: string; basename: string; json: Json }> => {
  const path = join(dataDir, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({
      file: `${dir}/${file}`,
      basename: file.replace(/\.json$/, ''),
      json: JSON.parse(readFileSync(join(path, file), 'utf8')),
    }));
};

export function validateContent(
  dialogueFiles: Array<{ file: string; basename: string; json: Json }>,
  questFiles: Array<{ file: string; basename: string; json: Json }>,
  itemFiles: Array<{ file: string; basename: string; json: Json }>,
  districts: Json[] = [],
  npcFiles: Array<{ file: string; basename: string; json: Json }> = [],
): string[] {
  const problems: string[] = [];
  const add = (file: string, msg: string) => problems.push(`${file}: ${msg}`);

  // ── Items ────────────────────────────────────────────────────────────────
  const itemIds = new Set<string>();
  for (const { file, json } of itemFiles) {
    if (!Array.isArray(json)) {
      add(file, 'expected an array of items');
      continue;
    }
    for (const item of json) {
      if (!item.id) { add(file, 'an item has no id'); continue; }
      if (itemIds.has(item.id)) add(file, `duplicate item id "${item.id}"`);
      itemIds.add(item.id);

      if (!ITEM_TYPES.includes(item.type)) {
        add(file, `item "${item.id}" has type "${item.type}", expected one of ${ITEM_TYPES.join(', ')}`);
      }
      if (item.max_stack !== undefined && !item.stackable) {
        add(file, `item "${item.id}" sets max_stack but is not stackable`);
      }
      if (item.stackable && item.max_stack === undefined) {
        add(file, `item "${item.id}" is stackable but has no max_stack`);
      }
      if (item.effect) problems.push(...validateEffect(file, `item "${item.id}"`, item.effect, itemIds, true));
    }
  }

  // ── Districts ────────────────────────────────────────────────────────────
  const districtIds = new Set<string>();
  for (const district of districts) {
    if (!district.id) { add('districts.json', 'a district has no id'); continue; }
    if (districtIds.has(district.id)) add('districts.json', `duplicate district id "${district.id}"`);
    districtIds.add(district.id);

    if (typeof district.phase !== 'number') {
      add('districts.json', `district "${district.id}" has no numeric phase`);
    }
    if (district.scene && !SCENES.includes(district.scene)) {
      add('districts.json', `district "${district.id}" names scene "${district.scene}", which is not in SCENE_KEYS`);
    }
  }

  // ── Quests ───────────────────────────────────────────────────────────────
  const questIds = new Set(questFiles.map((q) => q.json.id).filter(Boolean));
  const dialogueIds = new Set(dialogueFiles.map((d) => d.json.id).filter(Boolean));

  for (const { file, basename, json } of questFiles) {
    if (json.id !== basename) add(file, `id "${json.id}" does not match filename "${basename}"`);

    if (!QUEST_TYPE_LIST.includes(json.type)) {
      add(file, `type "${json.type}" is not one of ${QUEST_TYPE_LIST.join(', ')}`);
    }
    if (districts.length && !districtIds.has(json.district)) {
      add(file, `district "${json.district}" is not in districts.json`);
    }

    const objectiveIds = new Set<string>();
    for (const obj of json.objectives ?? []) {
      if (objectiveIds.has(obj.id)) add(file, `duplicate objective id "${obj.id}"`);
      objectiveIds.add(obj.id);
    }
    if (!json.objectives?.length) add(file, 'has no objectives');

    for (const prereq of json.prerequisite_quests ?? []) {
      if (!questIds.has(prereq)) add(file, `unknown prerequisite quest "${prereq}"`);
    }

    const rewards = json.rewards ?? {};
    if (rewards.reputation !== undefined && typeof rewards.reputation !== 'number') {
      add(file, 'rewards.reputation must be a number');
    }
    if (rewards.xp_branch && !SKILL_BRANCHES.includes(rewards.xp_branch)) {
      add(file, `rewards.xp_branch "${rewards.xp_branch}" is not a skill branch`);
    }
    for (const item of rewards.items ?? []) {
      if (!itemIds.has(item)) add(file, `reward item "${item}" does not exist`);
    }

    const onComplete = json.on_complete ?? {};
    if (onComplete.unlock_scene && !SCENES.includes(onComplete.unlock_scene)) {
      add(file, `on_complete.unlock_scene "${onComplete.unlock_scene}" is not in SCENE_KEYS`);
    }
    if (onComplete.trigger_dialogue && !dialogueIds.has(onComplete.trigger_dialogue)) {
      add(file, `on_complete.trigger_dialogue "${onComplete.trigger_dialogue}" does not exist`);
    }
  }

  for (const district of districts) {
    if (district.unlocked_by_quest && !questIds.has(district.unlocked_by_quest)) {
      add('districts.json', `district "${district.id}" is unlocked by "${district.unlocked_by_quest}", which does not exist`);
    }
  }

  // ── NPCs ─────────────────────────────────────────────────────────────────
  const npcIds = new Set<string>();
  const seenSpawns = new Map<string, string>();
  for (const { file, json } of npcFiles) {
    if (!Array.isArray(json)) { add(file, 'expected an array of NPCs'); continue; }

    for (const npc of json) {
      if (!npc.id) { add(file, 'an NPC has no id'); continue; }
      if (npcIds.has(npc.id)) add(file, `duplicate NPC id "${npc.id}"`);
      npcIds.add(npc.id);

      if (!NPC_TIER_LIST.includes(npc.tier)) {
        add(file, `NPC "${npc.id}" has tier ${npc.tier}, expected one of ${NPC_TIER_LIST.join(', ')}`);
      }
      if (districts.length && !districtIds.has(npc.district)) {
        add(file, `NPC "${npc.id}" is in district "${npc.district}", which is not in districts.json`);
      }
      if (npc.dialogue && !dialogueIds.has(npc.dialogue)) {
        add(file, `NPC "${npc.id}" points at dialogue "${npc.dialogue}", which does not exist`);
      }
      // Tier 1 is atmosphere; tiers 2 and 3 exist to be talked to.
      if (npc.tier !== 1 && !npc.dialogue) {
        add(file, `NPC "${npc.id}" is tier ${npc.tier} but has no dialogue`);
      }
      // Two NPCs on one spawn point means one of them silently never appears.
      if (npc.spawn) {
        const key = `${npc.district}/${npc.spawn}`;
        const claimed = seenSpawns.get(key);
        if (claimed) {
          add(file, `NPC "${npc.id}" and "${claimed}" both claim spawn "${npc.spawn}" in "${npc.district}"`);
        } else {
          seenSpawns.set(key, npc.id);
        }
      }
    }
  }

  problems.push(...detectPrerequisiteCycles(questFiles));

  // ── Dialogue ─────────────────────────────────────────────────────────────
  for (const { file, basename, json } of dialogueFiles) {
    if (json.id !== basename) add(file, `id "${json.id}" does not match filename "${basename}"`);

    const nodes: Record<string, Json> = json.nodes ?? {};
    const nodeIds = Object.keys(nodes);

    if (!nodeIds.includes(ENTRY_NODE)) {
      add(file, `has no "${ENTRY_NODE}" node — every tree needs an entry point`);
      continue;
    }

    for (const [nodeId, node] of Object.entries(nodes)) {
      if (!node.text) add(file, `node "${nodeId}" has no text`);

      if (node.next && !nodes[node.next]) {
        add(file, `node "${nodeId}" advances to "${node.next}", which does not exist — this soft-locks the conversation`);
      }
      if (node.next && node.choices?.length) {
        add(file, `node "${nodeId}" has both choices and next; next would be unreachable`);
      }

      node.choices?.forEach((choice: Json, i: number) => {
        if (!choice.text) add(file, `node "${nodeId}" choice ${i} has no text`);
        if (!choice.next) {
          add(file, `node "${nodeId}" choice ${i} has no next`);
        } else if (!nodes[choice.next]) {
          add(file, `node "${nodeId}" choice ${i} points at "${choice.next}", which does not exist — this soft-locks the conversation`);
        }
        if (choice.requires) problems.push(...validateRequirement(file, `node "${nodeId}" choice ${i}`, choice.requires));
        if (choice.effect) problems.push(...validateEffect(file, `node "${nodeId}" choice ${i}`, choice.effect, itemIds, false));
        if (choice.quest_trigger && !questIds.has(choice.quest_trigger)) {
          add(file, `node "${nodeId}" choice ${i} triggers unknown quest "${choice.quest_trigger}"`);
        }
      });

      if (node.requires) problems.push(...validateRequirement(file, `node "${nodeId}"`, node.requires));
      if (node.effect) problems.push(...validateEffect(file, `node "${nodeId}"`, node.effect, itemIds, false));
      if (node.quest_trigger && !questIds.has(node.quest_trigger)) {
        add(file, `node "${nodeId}" triggers unknown quest "${node.quest_trigger}"`);
      }
    }

    // Unreachable nodes are dead content — usually a rename that missed a link.
    const reachable = new Set<string>([ENTRY_NODE]);
    const queue = [ENTRY_NODE];
    while (queue.length) {
      const current = nodes[queue.shift()!];
      if (!current) continue;
      const targets = [current.next, ...(current.choices ?? []).map((c: Json) => c.next)];
      for (const target of targets) {
        if (target && nodes[target] && !reachable.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
    for (const nodeId of nodeIds) {
      if (!reachable.has(nodeId)) add(file, `node "${nodeId}" is unreachable from "${ENTRY_NODE}"`);
    }
  }

  return problems;
}

function validateRequirement(file: string, where: string, requires: Json): string[] {
  const out: string[] = [];
  if (!SKILL_BRANCHES.includes(requires.skill)) {
    out.push(`${file}: ${where} requires skill "${requires.skill}", which is not a branch (${SKILL_BRANCHES.join(', ')})`);
  } else {
    const tiers = (SKILL_TIER_NAMES as Record<string, readonly string[]>)[requires.skill];
    if (typeof requires.level !== 'number' || requires.level < 0 || requires.level >= tiers.length) {
      out.push(`${file}: ${where} requires level ${requires.level}, outside 0..${tiers.length - 1}`);
    }
  }
  return out;
}

function validateEffect(
  file: string,
  where: string,
  effect: Json,
  itemIds: Set<string>,
  itemsMayBeUnknown: boolean,
): string[] {
  const out: string[] = [];
  if (effect.xp !== undefined && !effect.xp_branch) {
    out.push(`${file}: ${where} grants xp with no xp_branch`);
  }
  if (effect.xp_branch && !SKILL_BRANCHES.includes(effect.xp_branch)) {
    out.push(`${file}: ${where} has xp_branch "${effect.xp_branch}", which is not a branch`);
  }
  // Item files are validated before every id is known, so their own effects
  // cannot cross-check item ids without a second pass.
  if (!itemsMayBeUnknown) {
    for (const key of ['item_add', 'item_remove'] as const) {
      if (effect[key] && !itemIds.has(effect[key])) {
        out.push(`${file}: ${where} references unknown item "${effect[key]}" via ${key}`);
      }
    }
  }
  return out;
}

function detectPrerequisiteCycles(
  questFiles: Array<{ file: string; json: Json }>,
): string[] {
  const graph = new Map<string, string[]>();
  for (const { json } of questFiles) {
    if (json.id) graph.set(json.id, json.prerequisite_quests ?? []);
  }

  const problems: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      problems.push(`quests: prerequisite cycle — ${[...path, id].join(' → ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const next of graph.get(id) ?? []) {
      if (graph.has(next)) visit(next, [...path, id]);
    }
    state.set(id, 'done');
  };

  for (const id of graph.keys()) visit(id, []);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const dialogue = readJsonDir('dialogue');
  const quests = readJsonDir('quests');
  const items = readJsonDir('items');
  const npcs = readJsonDir('npcs');
  const districts = JSON.parse(readFileSync(join(dataDir, 'districts.json'), 'utf8')) as Json[];
  const problems = validateContent(dialogue, quests, items, districts, npcs);

  if (problems.length) {
    console.error(`\n✗ Content validation failed (${problems.length} problem${problems.length > 1 ? 's' : ''}):\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
  }

  const count = (files: typeof items) =>
    files.reduce((n, f) => n + (Array.isArray(f.json) ? f.json.length : 0), 0);
  console.log(
    `✓ content valid — ${districts.length} districts, ${count(npcs)} NPCs, ` +
      `${dialogue.length} dialogue, ${quests.length} quest, ${count(items)} items`,
  );
}
