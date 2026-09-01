import Phaser from 'phaser';
import { useGameStore } from '../store';

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1200;
const PLAYER_SPEED = 220;
const BOT_COUNT = 40;

// MVP 1 skeleton: a walkable Whitefield block with a controllable player
// and ambient bots doing a random walk. No server, no assets — pure graphics.
export default class WhitefieldScene extends Phaser.Scene {
  constructor() {
    super('WhitefieldScene');
    this.bots = [];
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.drawGround();

    // Player
    this.player = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 28, 28, 0xff5a5f);
    this.player.setStrokeStyle(2, 0xffffff);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Ambient bots
    for (let i = 0; i < BOT_COUNT; i++) {
      const bot = this.add.rectangle(
        Phaser.Math.Between(40, WORLD_WIDTH - 40),
        Phaser.Math.Between(40, WORLD_HEIGHT - 40),
        22,
        22,
        0x4a8fe7
      );
      this.physics.add.existing(bot);
      bot.body.setCollideWorldBounds(true);
      bot.nextTurn = 0;
      this.bots.push(bot);
    }
    useGameStore.getState().setBotCount(BOT_COUNT);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
  }

  drawGround() {
    const g = this.add.graphics();
    g.fillStyle(0x1a1d24, 1);
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    // Simple grid to give a sense of movement.
    g.lineStyle(1, 0x2a2e38, 1);
    for (let x = 0; x <= WORLD_WIDTH; x += 80) {
      g.lineBetween(x, 0, x, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 80) {
      g.lineBetween(0, y, WORLD_WIDTH, y);
    }
  }

  update(time) {
    const body = this.player.body;
    body.setVelocity(0);

    const left = this.cursors.left.isDown || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up = this.cursors.up.isDown || this.wasd.W.isDown;
    const down = this.cursors.down.isDown || this.wasd.S.isDown;

    if (left) body.setVelocityX(-PLAYER_SPEED);
    else if (right) body.setVelocityX(PLAYER_SPEED);
    if (up) body.setVelocityY(-PLAYER_SPEED);
    else if (down) body.setVelocityY(PLAYER_SPEED);
    body.velocity.normalize().scale(PLAYER_SPEED);

    // Random-walk bots: pick a new heading every so often.
    for (const bot of this.bots) {
      if (time > bot.nextTurn) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const speed = Phaser.Math.Between(40, 90);
        bot.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        bot.nextTurn = time + Phaser.Math.Between(1000, 3000);
      }
    }
  }
}
