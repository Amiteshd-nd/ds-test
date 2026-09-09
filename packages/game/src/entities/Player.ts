import Phaser from 'phaser';
import type { Direction } from '../utils/types';
import { DEPTH, PLAYER_RUN_SPEED, PLAYER_SPEED, TILE_SIZE } from '../utils/constants';
import { ensurePlayerTexture } from '../utils/placeholders';

/**
 * Player — the controllable character.
 *
 * Ported from the v1.0 reference entity: arrow keys or WASD to move, SHIFT to
 * run, E to interact, and a freeze switch for dialogue. Animation playback is
 * guarded by anims.exists() so the entity runs on a placeholder texture today
 * and starts animating the moment real spritesheets are loaded under the same
 * `player-walk-<dir>` / `player-idle-<dir>` keys.
 */
export class Player extends Phaser.GameObjects.Sprite {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private shiftKey: Phaser.Input.Keyboard.Key;
  private eKey: Phaser.Input.Keyboard.Key;

  private currentDirection: Direction = 'down';
  private isMoving = false;
  private interactionEnabled = true;
  private interactionCallback: (() => void) | null = null;

  /** `textureKey` also selects the animation set, `<key>-walk-<dir>` etc. */
  constructor(scene: Phaser.Scene, x: number, y: number, private textureKey = 'player') {
    if (textureKey === 'player') ensurePlayerTexture(scene);
    super(scene, x, y, textureKey);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // The 32×48 sprite carries head and torso in the top ~36px, feet in the
    // bottom ~12px, so the collision box sits at the feet — that is what makes
    // a top-down character read as standing "in" the scene rather than on it.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(20, 12);
    body.setOffset(6, 35);
    body.setCollideWorldBounds(true);

    this.setDepth(DEPTH.ENTITIES);

    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Player requires the keyboard input plugin');

    this.cursors = keyboard.createCursorKeys();
    this.wasdKeys = {
      W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.shiftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.eKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.playIdleAnim();
  }

  /** Called from the scene's update loop. */
  update(): void {
    if (!this.interactionEnabled) {
      this.stopMoving();
      // Drain buffered E presses so the keystroke that closed a dialogue does
      // not immediately re-trigger an interaction on unfreeze.
      Phaser.Input.Keyboard.JustDown(this.eKey);
      return;
    }

    const left = this.cursors.left.isDown || this.wasdKeys.A.isDown;
    const right = this.cursors.right.isDown || this.wasdKeys.D.isDown;
    const up = this.cursors.up.isDown || this.wasdKeys.W.isDown;
    const down = this.cursors.down.isDown || this.wasdKeys.S.isDown;

    const speed = this.shiftKey.isDown ? PLAYER_RUN_SPEED : PLAYER_SPEED;

    let velX = 0;
    let velY = 0;

    if (left) {
      velX = -speed;
      this.currentDirection = 'left';
    }
    if (right) {
      velX = speed;
      this.currentDirection = 'right';
    }
    if (up) {
      velY = -speed;
      this.currentDirection = 'up';
    }
    if (down) {
      velY = speed;
      this.currentDirection = 'down';
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(velX, velY);

    // Keep diagonals from outrunning the cardinals.
    if (velX !== 0 && velY !== 0) {
      body.velocity.normalize().scale(speed);
    }

    this.isMoving = velX !== 0 || velY !== 0;
    if (this.isMoving) this.playWalkAnim();
    else this.playIdleAnim();

    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.interactionCallback?.();
    }
  }

  private playAnimIfPresent(key: string): void {
    // No-op until real spritesheets register these animation keys.
    if (!this.scene.anims.exists(key)) return;
    if (this.anims.currentAnim?.key === key) return;
    this.play(key);
  }

  private playWalkAnim(): void {
    this.playAnimIfPresent(`${this.textureKey}-walk-${this.currentDirection}`);
  }

  private playIdleAnim(): void {
    this.playAnimIfPresent(`${this.textureKey}-idle-${this.currentDirection}`);
  }

  private stopMoving(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.isMoving = false;
    this.playIdleAnim();
  }

  getDirection(): Direction {
    return this.currentDirection;
  }

  getIsMoving(): boolean {
    return this.isMoving;
  }

  /** Freeze or unfreeze movement (used during dialogue). */
  setInteractionEnabled(enabled: boolean): void {
    this.interactionEnabled = enabled;
  }

  /** Register the E-key interaction handler. */
  onInteract(callback: () => void): void {
    this.interactionCallback = callback;
  }

  /** Tile coordinate one step ahead of the player, in tile units. */
  getFacingPosition(): { x: number; y: number } {
    const tileX = Math.floor(this.x / TILE_SIZE);
    const tileY = Math.floor(this.y / TILE_SIZE);

    switch (this.currentDirection) {
      case 'up':
        return { x: tileX, y: tileY - 1 };
      case 'down':
        return { x: tileX, y: tileY + 1 };
      case 'left':
        return { x: tileX - 1, y: tileY };
      case 'right':
        return { x: tileX + 1, y: tileY };
    }
  }
}
