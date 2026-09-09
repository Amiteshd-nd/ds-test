import { Canvas } from './canvas.mjs';
import { P } from './palette.mjs';

export const T = 32; // tile size

/**
 * The modular street kit: road, kerb, pavement, walls, openings and props.
 *
 * Each entry draws one 32x32 tile. Locations are then built by combining these
 * in Tiled rather than by drawing each location as a unique illustration —
 * which is the whole point of a tileset, and far cheaper per square metre of
 * city than bespoke art.
 *
 * Order here is the order in the sheet, and the index is the tile id, so
 * inserting in the middle would renumber every map. Append only.
 */
/**
 * Draw another tile as a base layer, by name.
 *
 * Earlier this indexed TILES directly, and `window_barred` referenced its own
 * position — an infinite recursion. Names cannot drift when a tile is appended
 * and cannot accidentally point at self.
 */
const base = (name, c) => {
  const entry = TILES.find(([n]) => n === name);
  if (!entry) throw new Error(`Unknown base tile "${name}"`);
  entry[1](c);
};

export const TILES = [
  // ── Road ────────────────────────────────────────────────────────────────
  ['road', (c) => {
    c.rect(0, 0, T, T, P.asphalt);
    c.speckle(0, 0, T, T, P.asphaltLit, 0.08, 1);
    c.speckle(0, 0, T, T, P.asphaltWorn, 0.03, 2);
  }],
  ['road_dash_h', (c) => {
    base('road', c);
    c.rect(4, 15, 10, 2, P.marking);
    c.rect(20, 15, 8, 2, P.marking);
  }],
  ['road_dash_v', (c) => {
    base('road', c);
    c.rect(15, 4, 2, 10, P.marking);
    c.rect(15, 20, 2, 8, P.marking);
  }],
  ['road_manhole', (c) => {
    base('road', c);
    c.outline(11, 11, 10, 10, P.metalShade);
    c.rect(12, 12, 8, 8, P.metal);
    for (let y = 13; y < 19; y += 2) c.hline(13, y, 6, P.metalShade);
  }],
  ['road_patch', (c) => {
    base('road', c);
    c.rect(6, 8, 18, 14, P.asphaltWorn);
    c.speckle(6, 8, 18, 14, P.asphaltLit, 0.12, 3);
  }],

  // ── Kerb: pavement meeting road, one per edge ───────────────────────────
  ['kerb_top', (c) => {
    c.rect(0, 0, T, T, P.asphalt);
    c.speckle(0, 6, T, 26, P.asphaltLit, 0.08, 1);
    c.rect(0, 0, T, 4, P.kerb);
    c.hline(0, 4, T, P.kerbShade);
    c.hline(0, 5, T, P.ink);
  }],
  ['kerb_bottom', (c) => {
    c.rect(0, 0, T, T, P.asphalt);
    c.speckle(0, 0, T, 26, P.asphaltLit, 0.08, 1);
    c.rect(0, T - 4, T, 4, P.kerb);
    c.hline(0, T - 5, T, P.ink);
  }],
  ['kerb_left', (c) => {
    c.rect(0, 0, T, T, P.asphalt);
    c.speckle(6, 0, 26, T, P.asphaltLit, 0.08, 1);
    c.rect(0, 0, 4, T, P.kerb);
    c.vline(4, 0, T, P.kerbShade);
    c.vline(5, 0, T, P.ink);
  }],
  ['kerb_right', (c) => {
    c.rect(0, 0, T, T, P.asphalt);
    c.speckle(0, 0, 26, T, P.asphaltLit, 0.08, 1);
    c.rect(T - 4, 0, 4, T, P.kerb);
    c.vline(T - 5, 0, T, P.ink);
  }],

  // ── Pavement ────────────────────────────────────────────────────────────
  ['paver', (c) => {
    c.rect(0, 0, T, T, P.paver);
    // 16px slabs with recessed joints — reads as pavement at 1x.
    for (let i = 0; i <= T; i += 16) { c.hline(0, i, T, P.paverShade); c.vline(i, 0, T, P.paverShade); }
    c.rect(0, 0, 15, 15, P.paverAlt);
    c.rect(16, 16, 15, 15, P.paverAlt);
    c.speckle(0, 0, T, T, P.paverShade, 0.04, 5);
  }],
  ['paver_crack', (c) => {
    base('paver', c);
    for (let i = 0; i < 14; i++) c.set(8 + i, 10 + Math.floor(Math.sin(i / 2.5) * 3), P.paverShade);
  }],
  ['paver_drain', (c) => {
    base('paver', c);
    c.rect(9, 12, 14, 9, P.metalShade);
    for (let x = 11; x < 22; x += 3) c.vline(x, 14, 5, P.ink);
  }],

  // ── Walls ───────────────────────────────────────────────────────────────
  ['wall_plaster', (c) => {
    c.rect(0, 0, T, T, P.plaster);
    c.speckle(0, 0, T, T, P.plasterShade, 0.06, 7);
    c.hline(0, 0, T, P.plasterShade);
  }],
  ['wall_plaster_stain', (c) => {
    base('wall_plaster', c);
    // Monsoon streaking, which is what dates a Bangalore wall.
    for (let x = 7; x < 13; x++) {
      const h = 12 + Math.floor(Canvas.noise(x, 0, 9) * 12);
      for (let y = 0; y < h; y++) if (Canvas.noise(x, y, 11) > 0.35) c.set(x, y, P.plasterDeep);
    }
  }],
  ['wall_concrete', (c) => {
    c.rect(0, 0, T, T, P.concrete);
    c.speckle(0, 0, T, T, P.concreteShade, 0.07, 13);
    c.hline(0, 0, T, P.concreteShade);
  }],
  ['wall_base', (c) => {
    c.rect(0, 0, T, T, P.plaster);
    c.speckle(0, 0, T, 20, P.plasterShade, 0.06, 7);
    c.rect(0, 22, T, 10, P.plasterDeep); // skirting, grounds the building
    c.hline(0, 22, T, P.ink);
  }],

  // ── Openings ────────────────────────────────────────────────────────────
  ['door_wood', (c) => {
    base('wall_plaster', c);
    c.rect(6, 4, 20, 28, P.woodShade);
    c.rect(7, 5, 18, 27, P.wood);
    c.vline(15, 6, 25, P.woodShade);
    c.rect(12, 16, 2, 2, P.metal); // handle
  }],
  ['door_dark', (c) => {
    base('wall_plaster', c);
    c.rect(6, 4, 20, 28, P.ink);
    c.rect(7, 5, 18, 27, P.glassDeep);
  }],
  ['window', (c) => {
    base('wall_plaster', c);
    c.rect(5, 7, 22, 18, P.plasterDeep);
    c.rect(6, 8, 20, 16, P.glassShade);
    c.rect(6, 8, 20, 7, P.glass); // sky catch along the top
    c.vline(15, 8, 16, P.plasterDeep);
    c.hline(6, 15, 20, P.plasterDeep);
    c.hline(4, 25, 24, P.kerb); // sill
  }],
  ['window_barred', (c) => {
    base('window', c);
    for (let x = 8; x < 25; x += 4) c.vline(x, 8, 16, P.metalShade);
  }],
  ['shutter_closed', (c) => {
    c.rect(0, 0, T, T, P.steelShade);
    for (let y = 1; y < T; y += 3) c.hline(0, y, T, P.steel);
    c.hline(0, 0, T, P.ink);
    c.rect(13, 27, 6, 2, P.metalShade); // pull handle
  }],
  ['shutter_open', (c) => {
    c.rect(0, 0, T, T, P.glassDeep);
    c.rect(0, 0, T, 8, P.steelShade);
    for (let y = 1; y < 8; y += 3) c.hline(0, y, T, P.steel);
    c.speckle(2, 12, 28, 18, P.glassShade, 0.05, 17);
  }],

  // ── Props ───────────────────────────────────────────────────────────────
  ['tree_canopy', (c) => {
    // Blobby, asymmetric silhouette — a circle reads as a bush, not a tree.
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const dx = (x - 15.5) / 15.5, dy = (y - 16) / 15;
        const r = dx * dx + dy * dy;
        const wobble = Canvas.noise(x >> 1, y >> 1, 19) * 0.22;
        if (r < 0.85 + wobble - 0.11) c.set(x, y, P.leaf);
        if (r < 0.5 + wobble - 0.11) c.set(x, y, P.leafShade);
      }
    }
    c.speckle(4, 4, 24, 24, P.leafDeep, 0.10, 23);
    c.speckle(6, 2, 20, 12, P.leaf, 0.10, 29);
  }],
  ['tree_trunk', (c) => {
    c.rect(13, 0, 6, T, P.trunk);
    c.vline(13, 0, T, P.ink);
    c.rect(10, 26, 12, 6, P.leafDeep); // root shadow / soil
  }],
  ['streetlight_pole', (c) => {
    c.rect(15, 0, 3, T, P.metal);
    c.vline(15, 0, T, P.metalShade);
  }],
  ['streetlight_head', (c) => {
    c.rect(15, 8, 3, 24, P.metal);
    c.vline(15, 8, 24, P.metalShade);
    c.rect(9, 4, 15, 3, P.metal);      // arm
    c.rect(6, 6, 9, 4, P.metalShade);  // lamp housing
    c.rect(7, 9, 7, 2, P.cloth);       // lit lens
  }],
  ['bench', (c) => {
    c.rect(4, 14, 24, 4, P.wood);      // seat
    c.hline(4, 14, 24, P.woodShade);
    c.rect(4, 10, 24, 3, P.wood);      // back
    c.rect(6, 18, 3, 8, P.metalShade); // legs
    c.rect(23, 18, 3, 8, P.metalShade);
  }],
  ['bin', (c) => {
    c.rect(9, 10, 14, 18, P.binGreen);
    c.outline(9, 10, 14, 18, P.ink);
    c.rect(7, 7, 18, 4, P.metalShade); // lid
    c.hline(11, 15, 10, P.leafDeep);
  }],
  ['fence', (c) => {
    for (let x = 2; x < T; x += 6) c.rect(x, 8, 3, 22, P.metal);
    c.rect(0, 10, T, 2, P.metalShade);
    c.rect(0, 24, T, 2, P.metalShade);
  }],
  ['sign_shop', (c) => {
    c.rect(2, 6, 28, 14, P.cloth);
    c.outline(2, 6, 28, 14, P.ink);
    // Illegible glyph rows — a signboard reads as text without claiming words.
    for (let y = 10; y < 17; y += 3) {
      for (let x = 5; x < 27; x += 3) if (Canvas.noise(x, y, 31) > 0.35) c.rect(x, y, 2, 2, P.ink);
    }
  }],
  ['awning_left', (c) => {
    c.rect(6, 4, 26, 12, P.awningRed);
    c.rect(6, 4, 26, 3, P.awningBlue);
    c.hline(6, 16, 26, P.ink);
    c.rect(6, 16, 3, 14, P.metalShade); // support post
  }],
  ['awning_mid', (c) => {
    c.rect(0, 4, T, 12, P.awningRed);
    c.rect(0, 4, T, 3, P.awningBlue);
    for (let x = 4; x < T; x += 8) c.rect(x, 7, 4, 9, P.cloth); // stripes
    c.hline(0, 16, T, P.ink);
  }],
  ['awning_right', (c) => {
    c.rect(0, 4, 26, 12, P.awningRed);
    c.rect(0, 4, 26, 3, P.awningBlue);
    c.hline(0, 16, 26, P.ink);
    c.rect(23, 16, 3, 14, P.metalShade);
  }],
  ['planter', (c) => {
    c.rect(6, 16, 20, 14, P.plasterDeep);
    c.outline(6, 16, 20, 14, P.ink);
    for (let x = 8; x < 24; x += 3) c.rect(x, 10, 2, 7, P.leafShade);
    c.speckle(7, 8, 18, 8, P.leaf, 0.30, 37);
  }],
  ['puddle', (c) => {
    base('road', c);
    for (let y = 12; y < 24; y++) {
      for (let x = 6; x < 26; x++) {
        const dx = (x - 16) / 10, dy = (y - 18) / 6;
        if (dx * dx + dy * dy < 1) c.set(x, y, P.glassDeep);
      }
    }
    c.hline(10, 15, 8, P.glassShade); // sky reflection
  }],
];
