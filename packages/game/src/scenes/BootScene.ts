import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS, SPRITE_HEIGHT, SPRITE_WIDTH } from '../utils/constants';
import { SPRITE_URLS, TILESET_URLS } from '../assets';
import { MAPS } from '../assets/maps';
import { useGameStore } from '../store';
import { QuestManager } from '../systems/QuestManager';

/**
 * BootScene — preloads every shared asset behind a loading bar, registers the
 * player animations, then hands off to the scene named in the registry.
 *
 * Everything the game needs is loaded here rather than per-scene, so a scene
 * transition never stalls on a fetch.
 */
export class BootScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.BOOT;

  private loadingBarFill!: Phaser.GameObjects.Rectangle;
  private loadingText!: Phaser.GameObjects.Text;

  constructor() {
    super(BootScene.KEY);
  }

  preload(): void {
    this.createLoadingBar();

    this.load.on('progress', (value: number) => {
      this.loadingBarFill.width = value * 200;
    });

    this.load.on('complete', () => {
      this.loadingText.setText('Ready!');
    });

    // A failed asset must not leave the player staring at a stalled bar.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`[BootScene] failed to load "${file.key}" from ${file.url}`);
    });

    // Player spritesheet: 128×192 = 4 columns × 4 rows of 32×48 frames.
    this.load.spritesheet('player', SPRITE_URLS.player, {
      frameWidth: SPRITE_WIDTH,
      frameHeight: SPRITE_HEIGHT,
    });

    // Every map in the registry, and every tileset on disk. Tilesets are keyed
    // by basename, which the validator guarantees matches the `name` field of
    // the corresponding tileset in each .tmj.
    for (const map of Object.values(MAPS)) {
      this.load.tilemapTiledJSON(map.key, map.url);
    }

    for (const [key, url] of Object.entries(TILESET_URLS)) {
      this.load.image(key, url);
    }
  }

  create(): void {
    useGameStore.getState().setActiveScene(BootScene.KEY);

    // The quest system reacts to bus events; instantiate it before any scene
    // can emit one, or the first objective of a run could be missed.
    QuestManager.getInstance();

    this.setAllTexturesNearest();
    this.createPlaceholderTextures();
    this.createPlayerAnimations();

    // Which scene follows is set by PhaserGame via the registry, so a host can
    // drop straight into a scene (e.g. the Whitefield sandbox) without editing
    // the scene list. Falls back to the title screen.
    const next = (this.registry.get('startScene') as string | undefined) ?? SCENE_KEYS.TITLE;

    this.time.delayedCall(300, () => {
      this.scene.start(next);
    });
  }

  /**
   * Force NEAREST filtering on every loaded texture. Phaser's pixelArt flag
   * covers textures it creates; this catches the ones the loader brought in.
   */
  private setAllTexturesNearest(): void {
    Object.values(this.textures.list).forEach((texture) => {
      if (texture && typeof texture.setFilter === 'function') {
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    });
  }

  private createLoadingBar(): void {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    const bgBar = this.add.rectangle(centerX, centerY - 20, 204, 16, 0x1e293b);
    bgBar.setStrokeStyle(1, 0x64748b);

    this.loadingBarFill = this.add.rectangle(centerX - 100, centerY - 20, 0, 12, 0x3b82f6);
    this.loadingBarFill.setOrigin(0, 0.5);

    this.loadingText = this.add
      .text(centerX, centerY + 15, 'Loading...', {
        font: '8px monospace',
        color: '#94a3b8',
        align: 'center',
      })
      .setOrigin(0.5);
  }

  /** Stand-in textures for entities that have no art yet (NPCs, items, tiles). */
  private createPlaceholderTextures(): void {
    this.createCharacterPlaceholder('player_placeholder', 0x3b82f6);
    this.createCharacterPlaceholder('npc_placeholder', 0x22c55e);
    this.createItemPlaceholder('item_placeholder', 0xf59e0b);

    this.createTilePlaceholder('tile_floor', 0x94a3b8);
    this.createTilePlaceholder('tile_wall', 0x475569);
    this.createTilePlaceholder('tile_grass', 0x22c55e);
    this.createTilePlaceholder('tile_road', 0x64748b);
  }

  /** A 32×48 character silhouette: head, torso, two legs. */
  private createCharacterPlaceholder(key: string, bodyColor: number): void {
    if (this.textures.exists(key)) return;

    const gfx = this.make.graphics({ x: 0, y: 0 }, false);

    gfx.fillStyle(0xfbbf24);
    gfx.fillRect(8, 0, 16, 12);

    gfx.fillStyle(bodyColor);
    gfx.fillRect(4, 6, 24, 30);

    gfx.fillStyle(0x1e293b);
    gfx.fillRect(6, 36, 8, 12);
    gfx.fillRect(18, 36, 8, 12);

    gfx.generateTexture(key, SPRITE_WIDTH, SPRITE_HEIGHT);
    gfx.destroy();
  }

  private createItemPlaceholder(key: string, color: number): void {
    if (this.textures.exists(key)) return;

    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(color);
    gfx.fillRect(0, 0, 32, 32);
    gfx.generateTexture(key, 32, 32);
    gfx.destroy();
  }

  private createTilePlaceholder(key: string, color: number): void {
    if (this.textures.exists(key)) return;

    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(color);
    gfx.fillRect(0, 0, 32, 32);
    gfx.lineStyle(1, 0x1e293b, 0.3);
    gfx.strokeRect(0, 0, 32, 32);
    gfx.generateTexture(key, 32, 32);
    gfx.destroy();
  }

  /**
   * Walk and idle animations, one per direction.
   *
   * Spritesheet rows: 0 = down (frames 0-3), 1 = left (4-7), 2 = right (8-11),
   * 3 = up (12-15). Each row runs [stride-left, idle, stride-right, idle], so
   * the middle frame of each row doubles as that direction's idle pose.
   */
  private createPlayerAnimations(): void {
    const rows: Array<{ dir: string; start: number }> = [
      { dir: 'down', start: 0 },
      { dir: 'left', start: 4 },
      { dir: 'right', start: 8 },
      { dir: 'up', start: 12 },
    ];

    for (const { dir, start } of rows) {
      const walkKey = `player-walk-${dir}`;
      if (!this.anims.exists(walkKey)) {
        this.anims.create({
          key: walkKey,
          frames: this.anims.generateFrameNumbers('player', { start, end: start + 3 }),
          frameRate: 8,
          repeat: -1,
        });
      }

      const idleKey = `player-idle-${dir}`;
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: [{ key: 'player', frame: start + 1 }],
          frameRate: 1,
        });
      }
    }
  }
}

export default BootScene;
