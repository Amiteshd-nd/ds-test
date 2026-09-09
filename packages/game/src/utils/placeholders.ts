import Phaser from 'phaser';
import { SPRITE_HEIGHT, SPRITE_WIDTH, TILE_SIZE } from './constants';

/**
 * Runtime placeholder textures.
 *
 * The reference project ships real 32×48 spritesheets; this package has no art
 * yet. Rather than block on assets, we generate flat-colour textures at the
 * correct pixel dimensions so movement, collision boxes and depth sorting are
 * all exercised against the final geometry. Drop real spritesheets into
 * public/assets/sprites and load them in preload() — these are only created for
 * keys that a loader has not already claimed.
 */
export function ensurePlaceholderTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  fill: number,
  stroke: number,
): void {
  if (scene.textures.exists(key)) return;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(fill, 1);
  g.fillRect(0, 0, width, height);
  g.lineStyle(2, stroke, 1);
  g.strokeRect(1, 1, width - 2, height - 2);
  // A notch at the top marks the "head" end so facing is readable without art.
  g.fillStyle(stroke, 1);
  g.fillRect(Math.floor(width / 2) - 2, 3, 4, 4);
  g.generateTexture(key, width, height);
  g.destroy();
}

/** Player placeholder: one tile wide, one and a half tall. */
export function ensurePlayerTexture(scene: Phaser.Scene): void {
  ensurePlaceholderTexture(scene, 'player', SPRITE_WIDTH, SPRITE_HEIGHT, 0xff5a5f, 0xffffff);
}

/** Bot placeholder: a slightly smaller silhouette in the ambient blue. */
export function ensureBotTexture(scene: Phaser.Scene): void {
  ensurePlaceholderTexture(scene, 'bot', TILE_SIZE - 8, SPRITE_HEIGHT - 10, 0x4a8fe7, 0x9cc4f5);
}
