import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { useGameStore } from '../store';
import { SaveManager } from '../systems/SaveManager';
import { ensureBotTexture } from '../utils/placeholders';
import {
  BOT_COUNT,
  BOT_SPEED_MAX,
  BOT_SPEED_MIN,
  BOT_TURN_INTERVAL_MAX,
  BOT_TURN_INTERVAL_MIN,
  CAMERA_DEADZONE_X,
  CAMERA_DEADZONE_Y,
  DEPTH,
  SCENE_KEYS,
  TILE_SIZE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../utils/constants';

type Bot = Phaser.GameObjects.Sprite & { nextTurn: number };

/**
 * MVP 1 — a walkable Whitefield block with a controllable player and ambient
 * bots on a random walk. No server and no art: the bots are the "looks like an
 * MMO, but isn't" illusion from the v1.0 tech stack, running entirely on the
 * player's device.
 */
export class WhitefieldScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.WHITEFIELD;

  private player!: Player;
  private bots: Bot[] = [];

  constructor() {
    super(WhitefieldScene.KEY);
  }

  create(): void {
    useGameStore.getState().setActiveScene(WhitefieldScene.KEY);

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    // Snap the camera to whole pixels — a fractional scroll re-samples every
    // sprite and undoes the pixel-art rendering settings.
    this.cameras.main.roundPixels = true;

    this.drawGround();
    this.spawnBots();

    this.player = new Player(this, WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(CAMERA_DEADZONE_X, CAMERA_DEADZONE_Y);

    // Restore a previous run if one is on disk.
    SaveManager.getInstance().restore();

    // Persist position on the way out so a reload resumes where it left off.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.persist, this);
    this.game.events.once(Phaser.Core.Events.DESTROY, this.persist, this);
  }

  private persist(): void {
    SaveManager.getInstance().save(WhitefieldScene.KEY, this.player.x, this.player.y);
  }

  private drawGround(): void {
    const g = this.add.graphics();
    g.setDepth(DEPTH.GROUND);
    g.fillStyle(0x1a1d24, 1);
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Grid on the real tile pitch, so the sense of movement matches the size
    // a Tiled tilemap will occupy once the art lands.
    g.lineStyle(1, 0x2a2e38, 1);
    for (let x = 0; x <= WORLD_WIDTH; x += TILE_SIZE) {
      g.lineBetween(x, 0, x, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += TILE_SIZE) {
      g.lineBetween(0, y, WORLD_WIDTH, y);
    }
  }

  private spawnBots(): void {
    ensureBotTexture(this);

    for (let i = 0; i < BOT_COUNT; i++) {
      const bot = this.add.sprite(
        Phaser.Math.Between(TILE_SIZE, WORLD_WIDTH - TILE_SIZE),
        Phaser.Math.Between(TILE_SIZE, WORLD_HEIGHT - TILE_SIZE),
        'bot',
      ) as Bot;

      this.physics.add.existing(bot);
      const body = bot.body as Phaser.Physics.Arcade.Body;
      body.setCollideWorldBounds(true);
      bot.setDepth(DEPTH.ENTITIES);
      bot.nextTurn = 0;
      this.bots.push(bot);
    }

    useGameStore.getState().setBotCount(BOT_COUNT);
  }

  update(time: number): void {
    this.player.update();

    // Random-walk bots: pick a new heading every so often.
    for (const bot of this.bots) {
      if (time <= bot.nextTurn) continue;

      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.Between(BOT_SPEED_MIN, BOT_SPEED_MAX);
      const body = bot.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      bot.nextTurn = time + Phaser.Math.Between(BOT_TURN_INTERVAL_MIN, BOT_TURN_INTERVAL_MAX);
    }

    // Depth-sort so characters lower on screen draw in front.
    this.player.setDepth(DEPTH.ENTITIES + this.player.y / WORLD_HEIGHT);
    for (const bot of this.bots) {
      bot.setDepth(DEPTH.ENTITIES + bot.y / WORLD_HEIGHT);
    }
  }
}

export default WhitefieldScene;
