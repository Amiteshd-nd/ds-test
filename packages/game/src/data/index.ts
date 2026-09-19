import districtsJson from './districts.json';
import tileIds from '../assets/tilesets/street.tiles.json';
import type {
  DialogueFile,
  DistrictDef,
  ItemDef,
  NpcDef,
  ObjectDef,
  QuestFile,
} from '../utils/types';

/**
 * Content registry.
 *
 * Dialogue, quests and items are authored as JSON and discovered by glob, so
 * writing content never means editing a scene. Adding a conversation is adding
 * `dialogue/<id>.json` — nothing here changes.
 *
 * TypeScript cannot check the *contents* of a JSON import, so these casts are a
 * promise, not a proof. `scripts/validate-content.ts` is what keeps the promise:
 * it runs before every build and checks the parts the type system cannot —
 * dangling node references, unreachable nodes, unknown item and quest ids,
 * prerequisite cycles.
 */

const load = <T>(modules: Record<string, unknown>): T[] => Object.values(modules) as T[];

const dialogueModules = import.meta.glob('./dialogue/*.json', { eager: true, import: 'default' });
const questModules = import.meta.glob('./quests/*.json', { eager: true, import: 'default' });
const itemModules = import.meta.glob('./items/*.json', { eager: true, import: 'default' });
const npcModules = import.meta.glob('./npcs/*.json', { eager: true, import: 'default' });
const objectModules = import.meta.glob('./objects/*.json', { eager: true, import: 'default' });

const byId = <T extends { id: string }>(entries: T[], kind: string): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const entry of entries) {
    if (out[entry.id]) throw new Error(`Duplicate ${kind} id "${entry.id}"`);
    out[entry.id] = entry;
  }
  return out;
};

export const DIALOGUE: Record<string, DialogueFile> = byId(
  load<DialogueFile>(dialogueModules),
  'dialogue',
);

export const QUESTS: Record<string, QuestFile> = byId(load<QuestFile>(questModules), 'quest');

// Item files hold arrays, so they are flattened before indexing.
export const ITEMS: Record<string, ItemDef> = byId(
  load<ItemDef[]>(itemModules).flat(),
  'item',
);

// Districts are a flat list — the unit of world expansion.
export const DISTRICTS: Record<string, DistrictDef> = byId(
  districtsJson as DistrictDef[],
  'district',
);

/** NPC definitions, so populating a district is authoring rather than coding. */
export const NPCS: Record<string, NpcDef> = byId(load<NpcDef[]>(npcModules).flat(), 'npc');

/** NPCs belonging to one district, in declaration order. */
export const npcsInDistrict = (districtId: string): NpcDef[] =>
  Object.values(NPCS).filter((npc) => npc.district === districtId);

/** Quests belonging to one district. */
export const questsInDistrict = (districtId: string): QuestFile[] =>
  Object.values(QUESTS).filter((quest) => quest.district === districtId);

/** Placeable world objects, keyed by id. */
export const OBJECTS: Record<string, ObjectDef> = byId(
  load<ObjectDef[]>(objectModules).flat(),
  'object',
);

/** Tile name -> 0-based frame index in street.png, generated with the art. */
export const STREET_TILE_IDS: Record<string, number> = tileIds.ids;

/** Frame indices for one variant of an object, row-major. */
export const objectFrames = (def: ObjectDef, variant = 'default'): number[] => {
  const names = def.tiles[variant];
  if (!names) throw new Error(`Object "${def.id}" has no variant "${variant}"`);
  return names.map((name) => {
    const frame = STREET_TILE_IDS[name];
    if (frame === undefined) throw new Error(`Object "${def.id}" uses unknown tile "${name}"`);
    return frame;
  });
};

/** The node every dialogue tree starts from. */
export const DIALOGUE_ENTRY_NODE = 'start';

/** Lookup that fails loudly — a missing id is a content bug, not a soft state. */
export const getDialogue = (id: string): DialogueFile => {
  const file = DIALOGUE[id];
  if (!file) throw new Error(`Unknown dialogue "${id}" (have: ${Object.keys(DIALOGUE).join(', ')})`);
  return file;
};

export const getQuest = (id: string): QuestFile => {
  const quest = QUESTS[id];
  if (!quest) throw new Error(`Unknown quest "${id}" (have: ${Object.keys(QUESTS).join(', ')})`);
  return quest;
};

export const getItem = (id: string): ItemDef => {
  const item = ITEMS[id];
  if (!item) throw new Error(`Unknown item "${id}" (have: ${Object.keys(ITEMS).join(', ')})`);
  return item;
};

export const getDistrict = (id: string): DistrictDef => {
  const district = DISTRICTS[id];
  if (!district) {
    throw new Error(`Unknown district "${id}" (have: ${Object.keys(DISTRICTS).join(', ')})`);
  }
  return district;
};

export const getObject = (id: string): ObjectDef => {
  const def = OBJECTS[id];
  if (!def) throw new Error(`Unknown object "${id}" (have: ${Object.keys(OBJECTS).join(', ')})`);
  return def;
};

export const getNpc = (id: string): NpcDef => {
  const npc = NPCS[id];
  if (!npc) throw new Error(`Unknown NPC "${id}" (have: ${Object.keys(NPCS).join(', ')})`);
  return npc;
};
