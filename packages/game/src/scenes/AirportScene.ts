import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { SaveManager } from '../systems/SaveManager';
import { useGameStore } from '../store';
import { TILESET_URLS } from '../assets';
import { DIALOGUE, npcsInDistrict } from '../data';
import { AIRPORT_MAP } from '../assets/maps';
import { gameEvents } from '../core/events';
import { characterZY, depthForZY } from '../core/depth';
import { QuestManager } from '../systems/QuestManager';
import { DialogueBox } from '../ui/DialogueBox';
import {
  CAMERA_DEADZONE_X,
  CAMERA_DEADZONE_Y,
  DEPTH,
  SCENE_KEYS,
  TILE_SIZE,
} from '../utils/constants';

/**
 * AirportScene — arrival at Kempegowda International, the tutorial zone.
 *
 * Built from airport_interior.tmj: 30×20 tiles, 8 tilesets, five tile layers
 * and an object layer of spawn points.
 */
export class AirportScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.AIRPORT;

  private player!: Player;
  private npcs: Phaser.GameObjects.Sprite[] = [];
  private map!: Phaser.Tilemaps.Tilemap;
  private dialogueBox!: DialogueBox;

  constructor() {
    super(AirportScene.KEY);
  }

  create(): void {
    this.npcs = [];
    useGameStore.getState().setActiveScene(AirportScene.KEY);

    this.cameras.main.setRoundPixels(true);
    this.cameras.main.fadeIn(400, 0, 0, 0);

    this.map = this.make.tilemap({ key: AIRPORT_MAP.key });

    // Register the tilesets this map actually declares, rather than everything
    // loaded. addTilesetImage returns null on a name mismatch, which would
    // silently render an empty layer — so a miss is reported, not swallowed.
    const tilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const declared of this.map.tilesets) {
      const name = declared.name;
      if (!(name in TILESET_URLS)) {
        console.error(`[AirportScene] tileset "${name}" has no image loaded`);
        continue;
      }
      const tileset = this.map.addTilesetImage(name, name);
      if (tileset) tilesets.push(tileset);
      else console.error(`[AirportScene] tileset "${name}" failed to register`);
    }

    // Layer names must match the .tmj exactly — note the space in "Above Player".
    const groundLayer = this.map.createLayer('Ground', tilesets);
    const wallsLayer = this.map.createLayer('Walls', tilesets);
    const objectsLayer = this.map.createLayer('Objects', tilesets);
    const collisionLayer = this.map.createLayer(AIRPORT_MAP.collisionLayer!, tilesets);
    const abovePlayerLayer = this.map.createLayer('Above Player', tilesets);

    groundLayer?.setDepth(DEPTH.GROUND);
    wallsLayer?.setDepth(DEPTH.WALLS);
    objectsLayer?.setDepth(DEPTH.OBJECTS);
    abovePlayerLayer?.setDepth(DEPTH.ABOVE_PLAYER);

    // The collision layer is a hidden stencil: any non-empty tile is solid.
    if (collisionLayer) {
      collisionLayer.setVisible(false);
      collisionLayer.setCollisionByExclusion([-1, 0]);
    }

    const spawns = this.map.getObjectLayer(AIRPORT_MAP.spawnLayer!);
    const playerSpawn = spawns?.objects.find((obj) => obj.name === 'player_spawn');

    this.player = new Player(this, playerSpawn?.x ?? 318, playerSpawn?.y ?? 164);
    this.player.setDepth(DEPTH.ENTITIES);

    if (collisionLayer) {
      this.physics.add.collider(this.player, collisionLayer);
    }

    if (spawns) this.createSpawnEntities(spawns.objects);

    // The dialogue box freezes the player while open; closing unfreezes on a
    // short delay so the closing keystroke cannot double as movement/interact.
    this.dialogueBox = new DialogueBox(this, {
      onClose: () => {
        this.time.delayedCall(80, () => this.player.setInteractionEnabled(true));
      },
    });
    this.player.onInteract(() => this.tryInteract());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dialogueBox.forceClose());

    // Act 1 begins on arrival. start() refuses if already active or done, so
    // re-entering the scene cannot restart a finished quest.
    QuestManager.getInstance().start('arrival');

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(CAMERA_DEADZONE_X, CAMERA_DEADZONE_Y);
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setBounce(0);
    body.setCollideWorldBounds(true);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.persist, this);
    this.game.events.once(Phaser.Core.Events.DESTROY, this.persist, this);
  }

  private persist(): void {
    SaveManager.getInstance().save(AirportScene.KEY, this.player.x, this.player.y);
  }

  /** District this scene renders — decides which NPC records populate it. */
  static readonly DISTRICT = 'airport';

  private createSpawnEntities(objects: Phaser.Types.Tilemaps.TiledObject[]): void {
    for (const obj of objects) {
      const x = obj.x ?? 0;
      const y = obj.y ?? 0;
      const name = obj.name ?? '';

      if (name === 'zone_exit') {
        this.createExitZone(x, y);
        continue;
      }

      // NPCs come from src/data/npcs, matched to the map by spawn name, so
      // populating a district is authoring rather than editing this scene.
      const npc = npcsInDistrict(AirportScene.DISTRICT).find((n) => n.spawn === name);
      if (!npc) continue;

      // Content is validated at build time, so a miss here means the data and
      // the build have diverged — worth saying out loud.
      if (npc.dialogue && !DIALOGUE[npc.dialogue]) {
        console.error(`[AirportScene] NPC "${npc.id}" wants dialogue "${npc.dialogue}", which does not exist`);
        continue;
      }

      this.createNPC(x, y, npc.id, npc.dialogue, npc.tint);
    }
  }

  /**
   * The 3×3-tile trigger that will lead out of the airport. The next area
   * (PGScene) does not exist yet, so this only fires once and reports itself
   * rather than pretending to transition.
   */
  private createExitZone(x: number, y: number): void {
    const exitZone = this.add.zone(x, y, TILE_SIZE * 3, TILE_SIZE * 3);
    this.physics.add.existing(exitZone, true);

    const overlap = this.physics.add.overlap(this.player, exitZone, () => {
      // Fire once — an overlap callback runs every frame the bodies touch.
      overlap.destroy();
      gameEvents.emit('zone:reached', { zoneId: 'zone_exit', sceneKey: AirportScene.KEY });
    });
  }

  /** E pressed in the world: talk to the nearest NPC within reach. */
  private tryInteract(): void {
    if (this.dialogueBox.isOpen) return;

    let nearest: Phaser.GameObjects.Sprite | null = null;
    let nearestDist = 56; // px — about 1.75 tiles
    for (const npc of this.npcs) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
      if (dist < nearestDist) {
        nearest = npc;
        nearestDist = dist;
      }
    }
    if (!nearest) return;

    // Reported either way: an ambient NPC with no dialogue can still satisfy an
    // `interact` objective.
    gameEvents.emit('entity:interacted', { entityId: nearest.getData('npcId') as string });

    const dialogueId = nearest.getData('dialogueId') as string | undefined;
    if (!dialogueId) return; // tier 1 ambient — atmosphere only

    this.player.setInteractionEnabled(false);
    this.dialogueBox.open(dialogueId);
  }

  private createNPC(
    x: number,
    y: number,
    npcId: string,
    dialogueId: string | undefined,
    tint?: number,
  ): void {
    const npc = this.add.sprite(x, y, 'npc_placeholder');
    npc.setDepth(DEPTH.ENTITIES);
    if (tint !== undefined) npc.setTint(tint);
    npc.setData('npcId', npcId);
    npc.setData('dialogueId', dialogueId);
    this.npcs.push(npc);
  }

  update(): void {
    this.player.update();

    // Depth is computed from each drawable's bottom edge, never authored.
    this.player.setDepth(depthForZY(characterZY(this.player)));
    for (const npc of this.npcs) {
      npc.setDepth(depthForZY(characterZY(npc)));
    }
  }
}

export default AirportScene;
