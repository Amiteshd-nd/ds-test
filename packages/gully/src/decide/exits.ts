/**
 * Habitual exits — PRD §6 `ui_stretches`.
 *
 * "Users think in stretches, the router thinks in segments." Meena has two or
 * three ways out of her layout and picks between them; she does not think about
 * `w119050741:2`. An exit is therefore a labelled bundle of segment ids, and the
 * panel reasons over exits while the engine reasons over segments.
 *
 * Kept on the device. There is no account, and a list of the roads someone
 * leaves by every morning is exactly the sort of thing that should not be
 * sitting on a server before anyone has asked.
 */
import type { Exit, SegmentFacts } from '../state/types';

/** PRD §6's own example label is "2nd Cross east" — the direction is part of
    how people name the way they leave, not decoration. */
export type Direction =
  | 'north' | 'north-east' | 'east' | 'south-east'
  | 'south' | 'south-west' | 'west' | 'north-west';

const COMPASS: Direction[] = [
  'north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west',
];

/** Which way this road lies from the middle of the layout. */
export function directionOf(bearingFromCentre: number): Direction {
  return COMPASS[Math.round((((bearingFromCentre % 360) + 360) % 360) / 45) % 8];
}

/**
 * A layout is full of roads OSM never named, and "unnamed service off
 * Kaggadasapura Main Road" three times over is not a choice between exits — it
 * is the same row printed three times. So the label leads with the direction,
 * which is what actually distinguishes one exit from another, and the road name
 * follows underneath.
 */
function labelFor(seg: SegmentFacts, dir: Direction): { label: string; via: string | null } {
  if (seg.name.startsWith('unnamed')) {
    const cap = dir.charAt(0).toUpperCase() + dir.slice(1);
    return { label: `${cap} exit`, via: seg.name.replace(/^unnamed /, '') };
  }
  return { label: `${seg.name} ${dir}`, via: null };
}

const KEY = 'gully.exits';

export function loadExits(): Exit[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Exit[];
    return Array.isArray(parsed) ? parsed.filter((e) => e?.id && Array.isArray(e.segment_ids)) : [];
  } catch {
    return [];
  }
}

export function saveExits(exits: Exit[]): void {
  localStorage.setItem(KEY, JSON.stringify(exits));
}

/**
 * Four is the ceiling on purpose. The panel is a decision between the ways you
 * actually go, and a list of nine is a map with extra steps.
 */
export const MAX_EXITS = 4;

export function addExit(
  seg: SegmentFacts,
  dir: Direction,
): { exits: Exit[]; added: boolean; reason?: string } {
  const exits = loadExits();
  if (exits.some((e) => e.segment_ids.includes(seg.id))) {
    return { exits, added: false, reason: 'already one of your exits' };
  }
  if (exits.length >= MAX_EXITS) {
    return { exits, added: false, reason: `you can keep ${MAX_EXITS} exits — remove one first` };
  }

  let { label, via } = labelFor(seg, dir);
  // Two exits can still collide on a layout with several roads to the east.
  // Number them rather than shipping a list with two identical rows.
  const clashes = exits.filter((e) => e.label === label || e.label.startsWith(`${label} `)).length;
  if (clashes) label = `${label} ${clashes + 1}`;

  const next = [...exits, { id: seg.id, label, via, segment_ids: [seg.id] }];
  saveExits(next);
  return { exits: next, added: true };
}

export function removeExit(id: string): Exit[] {
  const next = loadExits().filter((e) => e.id !== id);
  saveExits(next);
  return next;
}

export const isExit = (segmentId: string) =>
  loadExits().some((e) => e.segment_ids.includes(segmentId));

/**
 * A starting set for someone who has not chosen yet: the narrowest roads that
 * carry a name, which in a layout is where the tankers go.
 *
 * Offered, never applied silently. The whole point of the panel is that these
 * are *your* exits.
 */
export function suggestExits(all: SegmentFacts[]): SegmentFacts[] {
  const narrowestFirst = (a: SegmentFacts, b: SegmentFacts) =>
    a.width_m - b.width_m || a.name.localeCompare(b.name);

  const named = [...all].filter((s) => !s.name.startsWith('unnamed')).sort(narrowestFirst);
  if (named.length >= 3) return named.slice(0, 3);

  // Most roads in a layout are unnamed in OSM. Offering only the named ones
  // would offer one road, which is not a choice.
  const rest = [...all].filter((s) => s.name.startsWith('unnamed')).sort(narrowestFirst);
  return [...named, ...rest].slice(0, 3);
}
