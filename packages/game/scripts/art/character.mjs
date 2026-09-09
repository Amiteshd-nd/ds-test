import { Canvas } from './canvas.mjs';
import { P } from './palette.mjs';

export const CW = 32; // frame width
export const CH = 48; // frame height

/**
 * A 32x48 character in four directions.
 *
 * Sheet layout matches what BootScene already expects, so this drops in with
 * no loader change: 4 columns x 4 rows, rows ordered down, left, right, up,
 * each row running [stride, idle, opposite stride, idle] so the middle frame
 * doubles as that direction's idle pose.
 *
 * Geometry is pinned to the collision box Player already uses — a 20x12 body
 * offset (6, 35) — so the feet land at y=42 and the character stands in the
 * scene rather than hovering over it.
 */

const HEAD_Y = 7;
const HEAD_W = 10;
const HEAD_H = 10;
const TORSO_X = 10;
const TORSO_W = 12;
const TORSO_H = 13;
const FOOT_Y = 42; // bottom of the shoes

/** One frame. `phase`: 0 = lead stride, 1 = idle, 2 = opposite stride. */
function drawFrame(c, dir, phase, palette) {
  const skin = palette.skin ?? P.skin;
  const skinShade = palette.skinShade ?? P.skinShade;
  const shirt = palette.shirt ?? P.shirt;
  const shirtShade = palette.shirtShade ?? P.shirtShade;
  const hair = palette.hair ?? P.hair;

  // A one-pixel lift on the stride frames. Without it the walk reads as a
  // slide, however much the legs move.
  const bob = phase === 1 ? 0 : -1;
  const hy = HEAD_Y + bob;
  const hx = 11;

  // ── Head ──
  c.rect(hx, hy, HEAD_W, HEAD_H, skin);
  c.outline(hx, hy, HEAD_W, HEAD_H, P.ink);

  if (dir === 'up') {
    // Back of the head: hair over the whole crown, no face.
    c.rect(hx, hy, HEAD_W, 7, hair);
    c.rect(hx - 1, hy + 1, 1, 6, hair);
    c.rect(hx + HEAD_W, hy + 1, 1, 6, hair);
  } else if (dir === 'down') {
    c.rect(hx, hy, HEAD_W, 3, hair);
    c.rect(hx - 1, hy + 1, 1, 4, hair); // sideburns frame the face
    c.rect(hx + HEAD_W, hy + 1, 1, 4, hair);
    c.set(hx + 3, hy + 5, P.ink);
    c.set(hx + 7, hy + 5, P.ink);
    c.hline(hx + 4, hy + 8, 3, skinShade);
  } else {
    // Profile: hair covers the rear two-thirds of the skull; the face is a
    // narrow strip with one eye and a single-pixel nose at the leading edge.
    const left = dir === 'left';
    c.rect(hx, hy, HEAD_W, 3, hair);
    if (left) {
      c.rect(hx + 4, hy, 6, 8, hair);
      c.rect(hx + HEAD_W, hy + 1, 1, 5, hair);
      c.set(hx + 2, hy + 5, P.ink);          // eye
      c.set(hx - 1, hy + 6, skin);           // nose
      c.hline(hx, hy + 8, 2, skinShade);     // mouth
    } else {
      c.rect(hx, hy, 6, 8, hair);
      c.rect(hx - 1, hy + 1, 1, 5, hair);
      c.set(hx + 7, hy + 5, P.ink);
      c.set(hx + HEAD_W, hy + 6, skin);
      c.hline(hx + 8, hy + 8, 2, skinShade);
    }
  }

  // ── Neck ──
  const ty = hy + HEAD_H;
  c.rect(hx + 3, ty - 1, 4, 2, skinShade);

  // ── Torso ──
  c.rect(TORSO_X, ty, TORSO_W, TORSO_H, shirt);
  c.outline(TORSO_X, ty, TORSO_W, TORSO_H, P.ink);
  c.vline(TORSO_X + 1, ty + 1, TORSO_H - 2, shirtShade);
  if (dir !== 'up') c.vline(TORSO_X + TORSO_W - 2, ty + 1, TORSO_H - 2, shirtShade);

  // ── Arms, swinging opposite the legs ──
  const swing = phase === 0 ? 1 : phase === 2 ? -1 : 0;
  const armTop = ty + 2;
  const armH = 8;
  if (dir === 'left' || dir === 'right') {
    // Only the near arm is visible in profile.
    const ax = dir === 'left' ? TORSO_X - 2 : TORSO_X + TORSO_W;
    c.rect(ax, armTop + swing, 2, armH, shirt);
    c.rect(ax, armTop + armH + swing, 2, 2, skin);
  } else {
    c.rect(TORSO_X - 2, armTop - swing, 2, armH, shirt);
    c.rect(TORSO_X - 2, armTop + armH - swing, 2, 2, skin);
    c.rect(TORSO_X + TORSO_W, armTop + swing, 2, armH, shirt);
    c.rect(TORSO_X + TORSO_W, armTop + armH + swing, 2, 2, skin);
  }

  // ── Legs ──
  // The stride is carried by one leg lifting while the other stays planted.
  // A pure horizontal offset does not read at this size; a length difference
  // does, because the silhouette changes.
  const ly = ty + TORSO_H;
  const legTop = ly;
  const plantedH = FOOT_Y - 2 - legTop;
  const liftedH = plantedH - 3;

  const drawLeg = (x, h, trouserCol, shoeShift) => {
    c.rect(x, legTop, 4, h, trouserCol);
    c.rect(x + shoeShift, legTop + h, 4, 2, P.shoe);
  };

  if (dir === 'left' || dir === 'right') {
    const forward = dir === 'left' ? -2 : 2;
    if (phase === 0) {
      drawLeg(TORSO_X + 3, plantedH, P.trouser, forward);
      drawLeg(TORSO_X + 6, liftedH, P.trouserShade, -forward);
    } else if (phase === 2) {
      drawLeg(TORSO_X + 3, liftedH, P.trouser, -forward);
      drawLeg(TORSO_X + 6, plantedH, P.trouserShade, forward);
    } else {
      drawLeg(TORSO_X + 3, plantedH, P.trouser, 0);
      drawLeg(TORSO_X + 6, plantedH, P.trouserShade, 0);
    }
  } else {
    if (phase === 0) {
      drawLeg(TORSO_X + 2, plantedH, P.trouser, 0);
      drawLeg(TORSO_X + 8, liftedH, P.trouserShade, 0);
    } else if (phase === 2) {
      drawLeg(TORSO_X + 2, liftedH, P.trouser, 0);
      drawLeg(TORSO_X + 8, plantedH, P.trouserShade, 0);
    } else {
      drawLeg(TORSO_X + 2, plantedH, P.trouser, 0);
      drawLeg(TORSO_X + 8, plantedH, P.trouserShade, 0);
    }
  }

  // ── Contact shadow ──
  // Sits directly under the feet. A gap here is what makes a top-down
  // character look like it is hovering.
  c.hline(TORSO_X + 1, FOOT_Y + 1, TORSO_W - 2, P.asphaltWorn);
  c.hline(TORSO_X + 3, FOOT_Y + 2, TORSO_W - 6, P.asphaltWorn);
}

const ROWS = ['down', 'left', 'right', 'up'];
const PHASES = [0, 1, 2, 1]; // stride, idle, opposite stride, idle

/** Build the 128x192 sheet. `palette` overrides skin/shirt/hair per variant. */
export function buildCharacterSheet(palette = {}) {
  const sheet = new Canvas(CW * 4, CH * 4);
  ROWS.forEach((dir, row) => {
    PHASES.forEach((phase, col) => {
      const frame = new Canvas(CW, CH);
      drawFrame(frame, dir, phase, palette);
      sheet.blit(frame, col * CW, row * CH);
    });
  });
  return sheet;
}
