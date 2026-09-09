/**
 * Generates a street block as a Tiled .tmj from the street tileset.
 *
 * Hand-authoring in Tiled is the normal path; this exists to prove the tileset
 * composes into a real location and to give the sandbox scene something built
 * from tiles rather than from procedural graphics. Layer names and order match
 * the taxonomy in maps.manifest.json, so the map validator accepts it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, '../src/assets');
const meta = JSON.parse(readFileSync(join(assets, 'tilesets/street.tiles.json'), 'utf8'));

const W = 30;
const H = 20;
const T = meta.tileSize;
const id = (name) => {
  if (!(name in meta.ids)) throw new Error(`Unknown tile "${name}"`);
  return meta.ids[name] + 1; // .tmj gids are 1-based against firstgid
};

const blank = () => new Array(W * H).fill(0);
const put = (layer, x, y, name) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  layer[y * W + x] = id(name);
};

const ground = blank();
const walls = blank();
const objects = blank();
const collision = blank();
const above = blank();

// Deterministic variation, so a rerun produces the same street.
const rnd = (x, y, s = 0) => {
  let n = (x * 374761393 + y * 668265263 + s * 1442695040) >>> 0;
  n = ((n ^ (n >>> 13)) * 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

// ── Vertical section, top to bottom ────────────────────────────────────────
// 0-4  top building   5-7  pavement   8 kerb   9-12 road
// 13 kerb   14-16 pavement   17-19 bottom building
const TOP_BUILDING = [0, 4];
const TOP_WALK = [5, 7];
const KERB_TOP = 8;
const ROAD = [9, 12];
const KERB_BOTTOM = 13;
const BOTTOM_WALK = [14, 16];
const BOTTOM_BUILDING = [17, 19];

for (let x = 0; x < W; x++) {
  // Top building facade: plain wall, then openings at the storefront line.
  for (let y = TOP_BUILDING[0]; y <= TOP_BUILDING[1] - 1; y++) {
    put(ground, x, y, rnd(x, y, 1) > 0.55 ? 'wall_concrete' : 'wall_plaster');
    if (rnd(x, y, 2) > 0.93) put(walls, x, y, 'wall_plaster_stain');
    collision[y * W + x] = 1;
  }
  // Storefront row: shutters, doors and windows in runs, not alternating noise.
  const yStore = TOP_BUILDING[1];
  const bay = Math.floor(x / 3);
  const kind = rnd(bay, 0, 3);
  put(ground, x, yStore, 'wall_base');
  if (kind > 0.72) put(walls, x, yStore, 'shutter_closed');
  else if (kind > 0.52) put(walls, x, yStore, x % 3 === 1 ? 'door_wood' : 'window');
  else if (kind > 0.3) put(walls, x, yStore, x % 3 === 1 ? 'door_dark' : 'window_barred');
  else put(walls, x, yStore, 'window');
  collision[yStore * W + x] = 1;

  // Pavements
  for (let y = TOP_WALK[0]; y <= TOP_WALK[1]; y++) {
    put(ground, x, y, rnd(x, y, 4) > 0.94 ? 'paver_crack' : 'paver');
  }
  for (let y = BOTTOM_WALK[0]; y <= BOTTOM_WALK[1]; y++) {
    put(ground, x, y, rnd(x, y, 5) > 0.94 ? 'paver_crack' : 'paver');
  }

  put(ground, x, KERB_TOP, 'kerb_top');
  put(ground, x, KERB_BOTTOM, 'kerb_bottom');

  // Road, with a dashed centre line and occasional wear.
  for (let y = ROAD[0]; y <= ROAD[1]; y++) {
    const mid = y === 10 || y === 11;
    let tile = 'road';
    if (mid && x % 3 !== 2) tile = 'road_dash_h';
    else if (rnd(x, y, 6) > 0.95) tile = 'road_manhole';
    else if (rnd(x, y, 7) > 0.9) tile = 'road_patch';
    else if (rnd(x, y, 8) > 0.97) tile = 'puddle';
    put(ground, x, y, tile);
  }

  // Bottom building
  put(ground, x, BOTTOM_BUILDING[0], 'wall_base');
  collision[BOTTOM_BUILDING[0] * W + x] = 1;
  for (let y = BOTTOM_BUILDING[0] + 1; y <= BOTTOM_BUILDING[1]; y++) {
    put(ground, x, y, rnd(x, y, 9) > 0.5 ? 'wall_concrete' : 'wall_plaster');
    collision[y * W + x] = 1;
  }
}

// ── Awnings over the storefronts, drawn above the player ───────────────────
for (let x = 2; x < W - 4; x += 7) {
  put(above, x, TOP_BUILDING[1] + 1, 'awning_left');
  put(above, x + 1, TOP_BUILDING[1] + 1, 'awning_mid');
  put(above, x + 2, TOP_BUILDING[1] + 1, 'awning_right');
}

// ── Street furniture on the pavements ──────────────────────────────────────
// Trees: trunk on the object layer (solid), canopy above the player, so
// walking behind a tree reads correctly.
const plantTree = (x, y) => {
  put(objects, x, y, 'tree_trunk');
  put(above, x, y - 1, 'tree_canopy');
  collision[y * W + x] = 1;
};

for (let x = 3; x < W - 2; x += 6) plantTree(x, TOP_WALK[1]);
for (let x = 6; x < W - 2; x += 7) plantTree(x, BOTTOM_WALK[0] + 1);

const place = (x, y, name, solid = true) => {
  put(objects, x, y, name);
  if (solid) collision[y * W + x] = 1;
};

place(5, BOTTOM_WALK[1], 'bench');
place(6, BOTTOM_WALK[1], 'bench');
place(13, BOTTOM_WALK[1], 'bin');
place(21, BOTTOM_WALK[1], 'bench');
place(22, BOTTOM_WALK[1], 'bench');
place(27, BOTTOM_WALK[1], 'bin');
place(9, TOP_WALK[1], 'planter');
place(18, TOP_WALK[1], 'planter');

// Streetlights: head on the object layer, pole below it.
for (let x = 8; x < W - 2; x += 11) {
  place(x, TOP_WALK[0], 'streetlight_head');
  put(objects, x, TOP_WALK[0] + 1, 'streetlight_pole');
}

// Shop signs sit on the wall above the storefronts.
for (let x = 4; x < W - 4; x += 9) put(walls, x, TOP_BUILDING[1] - 1, 'sign_shop');

// Fence along part of the bottom pavement edge.
for (let x = 15; x < 20; x++) place(x, BOTTOM_WALK[2 - 1], 'fence');

// ── Assemble ───────────────────────────────────────────────────────────────
const tileLayer = (name, data, visible = true, order) => ({
  data,
  height: H,
  id: order,
  name,
  opacity: 1,
  type: 'tilelayer',
  visible,
  width: W,
  x: 0,
  y: 0,
});

const map = {
  compressionlevel: -1,
  height: H,
  infinite: false,
  layers: [
    tileLayer('Ground', ground, true, 1),
    tileLayer('Walls', walls, true, 2),
    tileLayer('Objects', objects, true, 3),
    tileLayer('Collision', collision, false, 4),
    tileLayer('Above Player', above, true, 5),
    {
      draworder: 'topdown',
      id: 6,
      name: 'Spawns',
      objects: [
        { id: 1, name: 'player_spawn', point: true, rotation: 0, type: '', visible: true, x: 15 * T, y: 10.5 * T, width: 0, height: 0 },
        { id: 2, name: 'vendor', point: true, rotation: 0, type: '', visible: true, x: 7 * T + 16, y: TOP_WALK[1] * T + 24, width: 0, height: 0 },
        { id: 3, name: 'auto_driver', point: true, rotation: 0, type: '', visible: true, x: 20 * T + 16, y: BOTTOM_WALK[0] * T + 24, width: 0, height: 0 },
      ],
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    },
  ],
  nextlayerid: 7,
  nextobjectid: 4,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.11.0',
  tileheight: T,
  tilesets: [
    {
      columns: meta.columns,
      firstgid: 1,
      image: '../tilesets/street.png',
      imageheight: Math.ceil(meta.tileCount / meta.columns) * T,
      imagewidth: meta.columns * T,
      margin: 0,
      name: 'street',
      spacing: 0,
      tilecount: meta.tileCount,
      tileheight: T,
      tilewidth: T,
    },
  ],
  tilewidth: T,
  type: 'map',
  version: '1.10',
  width: W,
};

writeFileSync(join(assets, 'tilemaps/whitefield_street.tmj'), `${JSON.stringify(map, null, 1)}\n`);
const solid = collision.filter(Boolean).length;
console.log(`✓ whitefield_street.tmj — ${W}x${H} tiles, ${solid} solid, 3 spawns`);
