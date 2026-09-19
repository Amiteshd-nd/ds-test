import Phaser from 'phaser';
import { objectFrames } from '../data';
import { depthForZY, objectZY } from '../core/depth';
import { hueShiftedTexture } from '../utils/hue';
import type { ObjectDef } from '../utils/types';

/** The spritesheet key street.png is registered under for frame indexing. */
export const STREET_FRAMES_KEY = 'street_frames';

export interface PlaceOptions {
  /** Variant to draw, e.g. an orientation. Defaults to `default`. */
  variant?: string;
  /**
   * Hue rotation in degrees for `colorEditable` objects. Colour variants cost
   * no extra files — the art is recoloured at draw time.
   */
  hueShift?: number;
}

/**
 * One placed world object, drawn from a manifest.
 *
 * Every tile of the object goes into a single container so the whole thing
 * carries one depth, derived from the bottom of its footprint. That is what
 * lets a player walk behind a bench and in front of it a moment later —
 * impossible while props lived on a static tile layer, which always drew at a
 * fixed depth no matter where the player stood.
 */
export class PlacedObject {
  readonly container: Phaser.GameObjects.Container;
  readonly def: ObjectDef;
  readonly tileX: number;
  readonly tileY: number;

  constructor(
    scene: Phaser.Scene,
    def: ObjectDef,
    tileX: number,
    tileY: number,
    tileSize: number,
    options: PlaceOptions = {},
  ) {
    this.def = def;
    this.tileX = tileX;
    this.tileY = tileY;

    const frames = objectFrames(def, options.variant ?? 'default');
    const expected = def.tilesWide * def.tilesTall;
    if (frames.length !== expected) {
      throw new Error(
        `Object "${def.id}" declares ${def.tilesWide}x${def.tilesTall} but lists ${frames.length} tiles`,
      );
    }

    // A hue shift is honoured only where the manifest allows it — wood grain
    // and glass look wrong recoloured, fabric and painted metal do not.
    const textureKey =
      options.hueShift && def.colorEditable
        ? hueShiftedTexture(scene, STREET_FRAMES_KEY, options.hueShift, {
            frameWidth: tileSize,
            frameHeight: tileSize,
          })
        : STREET_FRAMES_KEY;

    const sprites: Phaser.GameObjects.Sprite[] = [];
    frames.forEach((frame, i) => {
      const col = i % def.tilesWide;
      const row = Math.floor(i / def.tilesWide);
      const sprite = scene.add.sprite(col * tileSize, row * tileSize, textureKey, frame);
      sprite.setOrigin(0, 0);
      sprites.push(sprite);
    });

    this.container = scene.add.container(tileX * tileSize, tileY * tileSize, sprites);
    this.container.setSize(def.tilesWide * tileSize, def.tilesTall * tileSize);
    this.container.setDepth(depthForZY(objectZY(tileY, def.tilesTall, tileSize)));
  }

  /**
   * Add a static body over the footprint — the bottom rows, excluding the
   * purely visual `backgroundTiles` on top. A tree blocks at its trunk, not
   * across its canopy.
   */
  addCollision(scene: Phaser.Scene, group: Phaser.Physics.Arcade.StaticGroup, tileSize: number): void {
    if (!this.def.solid) return;

    const footprintRows = this.def.tilesTall - this.def.backgroundTiles;
    if (footprintRows <= 0) return;

    const x = this.tileX * tileSize;
    const y = (this.tileY + this.def.backgroundTiles) * tileSize;
    const w = this.def.tilesWide * tileSize;
    const h = footprintRows * tileSize;

    const body = scene.add.zone(x + w / 2, y + h / 2, w, h);
    group.add(body);
    const arcade = body.body as Phaser.Physics.Arcade.StaticBody;
    arcade.setSize(w, h);
    arcade.updateFromGameObject();
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
