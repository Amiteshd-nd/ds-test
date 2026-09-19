import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { useGameStore } from '../store';
import { SaveManager } from '../systems/SaveManager';
import { TILESET_URLS } from '../assets';
import { MAPS } from '../assets/maps';
import { OBJECTS } from '../data';
import { PlacedObject } from '../entities/PlacedObject';
import { characterZY, depthForZY } from '../core/depth';
import type { Direction } from '../utils/types';
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
} from '../utils/constants';

/** Ambient citizen: a sprite that walks and knows which way it is facing. */
type Citizen = Phaser.GameObjects.Sprite & {
  nextTurn: number;
  sheet: string;
  facing: Direction;
};

// Recoloured variants of one rig — a visibly mixed crowd from a single sheet
// of drawing work. These are baked palettes rather than a runtime hue
// rotation: the rig stores semantic cells, so a palette moves shirt colour
// without dragging skin and hair round the colour wheel with it.
const CITIZEN_SHEETS = [
  'citizen',
  'citizen_teal',
  'citizen_ochre',
  'citizen_maroon',
  'citizen_olive',
  'citizen_slate',
  'citizen_violet',
  'citizen_sand',
];

/**
 * A Whitefield street block, built from the street tileset.
 *
 * This is the local-simulation illusion in miniature: ambient citizens on a
 * random walk make the street feel populated with no server involved. Later,
 * a handful of these become real players and the rest stay bots.
 */
export class WhitefieldScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.WHITEFIELD;
  static readonly DISTRICT = 'whitefield';

  private player!: Player;
  private citizens: Citizen[] = [];
  private map!: Phaser.Tilemaps.Tilemap;
  private placedObjects: PlacedObject[] = [];
  private solids?: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super(WhitefieldScene.KEY);
  }

  create(): void {
    this.citizens = [];
    useGameStore.getState().setActiveScene(WhitefieldScene.KEY);

    this.cameras.main.setRoundPixels(true);
    this.cameras.main.fadeIn(300, 0, 0, 0);

    const def = MAPS.whitefield_street;
    this.map = this.make.tilemap({ key: def.key });

    const tilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const declared of this.map.tilesets) {
      const name = declared.name;
      if (!(name in TILESET_URLS)) {
        console.error(`[WhitefieldScene] tileset "${name}" has no image loaded`);
        continue;
      }
      const tileset = this.map.addTilesetImage(name, name);
      if (tileset) tilesets.push(tileset);
    }

    const ground = this.map.createLayer('Ground', tilesets);
    const walls = this.map.createLayer('Walls', tilesets);
    const objects = this.map.createLayer('Objects', tilesets);
    const collisionLayer = this.map.createLayer(def.collisionLayer!, tilesets);
    const above = this.map.createLayer('Above Player', tilesets);

    ground?.setDepth(DEPTH.GROUND);
    walls?.setDepth(DEPTH.WALLS);
    objects?.setDepth(DEPTH.OBJECTS);
    above?.setDepth(DEPTH.ABOVE_PLAYER);

    if (collisionLayer) {
      collisionLayer.setVisible(false);
      collisionLayer.setCollisionByExclusion([-1, 0]);
    }

    const spawns = this.map.getObjectLayer(def.spawnLayer!);
    const spawn = spawns?.objects.find((o) => o.name === 'player_spawn');

    this.player = new Player(this, spawn?.x ?? 480, spawn?.y ?? 336, 'citizen');
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(CAMERA_DEADZONE_X, CAMERA_DEADZONE_Y);
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    if (collisionLayer) this.physics.add.collider(this.player, collisionLayer);

    this.placeObjects(collisionLayer);
    this.spawnCitizens(collisionLayer);

    SaveManager.getInstance().restore();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.persist, this);
    this.game.events.once(Phaser.Core.Events.DESTROY, this.persist, this);
  }

  private persist(): void {
    SaveManager.getInstance().save(WhitefieldScene.KEY, this.player.x, this.player.y);
  }

  /**
   * Instantiate every object in the map's object layer from its manifest.
   *
   * Solid objects get a static body over their footprint, which is why the
   * generated map no longer paints props into the collision stencil — the
   * manifest is the single source of truth for what blocks movement.
   */
  private placeObjects(collisionLayer: Phaser.Tilemaps.TilemapLayer | null): void {
    void collisionLayer;
    this.placedObjects = [];

    const def = MAPS.whitefield_street;
    const layer = def.objectLayer ? this.map.getObjectLayer(def.objectLayer) : null;
    if (!layer) return;

    const solids = this.physics.add.staticGroup();
    const tile = this.map.tileWidth;

    for (const obj of layer.objects) {
      const objectDef = obj.type ? OBJECTS[obj.type] : undefined;
      if (!objectDef) {
        // Validated at build time, so this means data and build have diverged.
        console.error(`[WhitefieldScene] placed object "${obj.type}" has no manifest`);
        continue;
      }

      const hueProp = obj.properties?.find(
        (p: { name: string; value: unknown }) => p.name === 'hueShift',
      );

      const placed = new PlacedObject(
        this,
        objectDef,
        Math.round((obj.x ?? 0) / tile),
        Math.round((obj.y ?? 0) / tile),
        tile,
        { hueShift: typeof hueProp?.value === 'number' ? hueProp.value : undefined },
      );
      placed.addCollision(this, solids, tile);
      this.placedObjects.push(placed);
    }

    this.physics.add.collider(this.player, solids);
    this.solids = solids;
  }

  /**
   * Populate the street. Citizens are placed on the road corridor rather than
   * anywhere on the map, so none of them start inside a building.
   */
  private spawnCitizens(collisionLayer: Phaser.Tilemaps.TilemapLayer | null): void {
    const tile = this.map.tileWidth;
    // Rows 5..16 are pavement, kerb and road — the walkable band.
    const minY = 5 * tile + tile / 2;
    const maxY = 16 * tile + tile / 2;

    for (let i = 0; i < BOT_COUNT; i++) {
      // Stride the index so neighbouring spawns do not share a look.
      const sheet = CITIZEN_SHEETS[(i * 3) % CITIZEN_SHEETS.length];

      const citizen = this.add.sprite(
        Phaser.Math.Between(tile, this.map.widthInPixels - tile),
        Phaser.Math.Between(minY, maxY),
        sheet,
      ) as Citizen;

      this.physics.add.existing(citizen);
      const body = citizen.body as Phaser.Physics.Arcade.Body;
      body.setSize(20, 12);
      body.setOffset(6, 35);
      body.setCollideWorldBounds(true);
      if (collisionLayer) this.physics.add.collider(citizen, collisionLayer);
      if (this.solids) this.physics.add.collider(citizen, this.solids);

      citizen.setDepth(DEPTH.ENTITIES);
      citizen.nextTurn = 0;
      citizen.sheet = sheet;
      citizen.facing = 'down';
      citizen.play(`${sheet}-idle-down`);
      this.citizens.push(citizen);
    }

    useGameStore.getState().setBotCount(BOT_COUNT);
  }

  update(time: number): void {
    this.player.update();

    for (const citizen of this.citizens) {
      const body = citizen.body as Phaser.Physics.Arcade.Body;

      if (time > citizen.nextTurn) {
        // Cardinal headings only: a diagonal walk has no matching animation
        // row, so the sprite would face a direction it is not moving in.
        const dir = Phaser.Math.RND.pick(['down', 'left', 'right', 'up'] as Direction[]);
        const speed = Phaser.Math.Between(BOT_SPEED_MIN, BOT_SPEED_MAX);
        const idle = Phaser.Math.FloatBetween(0, 1) < 0.25;

        body.setVelocity(
          idle ? 0 : dir === 'left' ? -speed : dir === 'right' ? speed : 0,
          idle ? 0 : dir === 'up' ? -speed : dir === 'down' ? speed : 0,
        );

        citizen.facing = dir;
        citizen.play(`${citizen.sheet}-${idle ? 'idle' : 'walk'}-${dir}`, true);
        citizen.nextTurn =
          time + Phaser.Math.Between(BOT_TURN_INTERVAL_MIN, BOT_TURN_INTERVAL_MAX);
      }

      // A citizen stopped by a wall should not keep playing a walk cycle.
      if (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down) {
        body.setVelocity(0);
        citizen.play(`${citizen.sheet}-idle-${citizen.facing}`, true);
        citizen.nextTurn = Math.min(citizen.nextTurn, time + 200);
      }
    }

    // Depth is computed from each drawable's bottom edge, never authored.
    // Placed objects set theirs once at construction; characters move, so
    // theirs is recomputed each frame.
    this.player.setDepth(depthForZY(characterZY(this.player)));
    for (const citizen of this.citizens) {
      citizen.setDepth(depthForZY(characterZY(citizen)));
    }
  }
}

export default WhitefieldScene;
