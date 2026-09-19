import { DEPTH } from '../utils/constants';

/**
 * Depth sorting, computed — never authored.
 *
 * Every drawable gets a `zY`: its bottom edge in world space. Sorting the draw
 * list by it each frame is the whole answer to "how do I make things appear in
 * front of each other". Nothing is ever tagged foreground or background.
 *
 * Before this existed the rule was inlined in four places across two scenes,
 * and props lived on a static tile layer — which meant a bench could never
 * occlude the player, however far above it they stood.
 */

/** Largest `zY` the normaliser expects; keeps depths inside one integer band. */
const MAX_WORLD_HEIGHT = 100_000;

/**
 * Turn a world-space bottom edge into a Phaser depth.
 *
 * The result stays between DEPTH.ENTITIES and DEPTH.ENTITIES + 1, so entities
 * interleave with each other by position while still sitting above the ground
 * and wall layers and below UI.
 */
export const depthForZY = (zY: number): number =>
  // Divided by one more than the ceiling so a fully clamped value still lands
  // strictly below DEPTH.ENTITIES + 1 and cannot collide with the next band.
  DEPTH.ENTITIES + Math.min(Math.max(zY, 0), MAX_WORLD_HEIGHT) / (MAX_WORLD_HEIGHT + 1);

/**
 * A character's `zY` is its feet, not its centre. The sprite origin sits at
 * the middle of a 32x48 frame whose feet are at the bottom, so half the frame
 * height is added back.
 */
export const characterZY = (sprite: { y: number; displayHeight: number }): number =>
  sprite.y + sprite.displayHeight / 2;

/**
 * An object's `zY` is the bottom edge of its *footprint*.
 *
 * On the convention fixed in docs/asset-pipeline.md, `backgroundTiles` counts
 * rows at the **top** of the image that are purely visual — a tree's canopy, a
 * bookcase's upper shelves — and the footprint is the remaining bottom rows.
 * With that layout the footprint's bottom edge and the image's bottom edge are
 * the same line, so `zY` is simply the image bottom.
 *
 * (The source brief describes `backgroundTiles` as rows hanging *below* the
 * footprint, which contradicts its own bookcase example. Rows-on-top is the
 * reading that matches how top-down art is actually drawn, so that is what is
 * implemented; `backgroundTiles` governs the collision footprint, not `zY`.)
 */
export const objectZY = (
  topTileY: number,
  tilesTall: number,
  tileSize: number,
): number => (topTileY + tilesTall) * tileSize;

/** Small bump so an item resting on a surface sorts in front of it. */
export const SURFACE_BUMP = 0.5;
