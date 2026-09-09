import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from '../utils/constants';
import { SaveManager } from '../systems/SaveManager';
import { useGameStore } from '../store';

/**
 * TitleScene — main menu over a Bengaluru skyline silhouette.
 * Navigable by keyboard (arrows/WASD + Enter) or mouse.
 */
export class TitleScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.TITLE;

  private selectedIndex = 0;
  private menuItems: Phaser.GameObjects.Text[] = [];
  private menuOptions = ['New Game', 'Continue', 'Settings'];
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super(TitleScene.KEY);
  }

  create(): void {
    this.selectedIndex = 0;
    this.menuItems = [];

    useGameStore.getState().setActiveScene(TitleScene.KEY);

    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#0f172a');
    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.createSkyline();
    this.createTitleText();
    this.createMenu();
    this.setupInput();
  }

  /** Bengaluru cityscape, drawn as flat rectangles. */
  private createSkyline(): void {
    const buildings = [
      { x: 20, width: 24, height: 45 },
      { x: 50, width: 20, height: 35 },
      { x: 75, width: 28, height: 55 },
      { x: 110, width: 22, height: 40 },
      { x: 140, width: 26, height: 50 },
      { x: 175, width: 24, height: 38 },
      { x: 205, width: 28, height: 48 },
      { x: 240, width: 20, height: 42 },
      { x: 268, width: 26, height: 52 },
      { x: 300, width: 24, height: 46 },
      { x: 335, width: 28, height: 54 },
      { x: 370, width: 22, height: 40 },
      { x: 400, width: 26, height: 50 },
      { x: 435, width: 20, height: 36 },
    ];

    buildings.forEach((b) => {
      this.add.rectangle(b.x, GAME_HEIGHT - b.height / 2 - 8, b.width, b.height, 0x1e293b);
    });

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 4, GAME_WIDTH, 8, 0x334155);
  }

  private createTitleText(): void {
    this.add
      .text(GAME_WIDTH / 2, 50, 'NAMMA QUEST', {
        font: 'bold 24px monospace',
        color: '#f8fafc',
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 72, 'A Bengaluru Story', {
        font: '8px monospace',
        color: '#94a3b8',
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 105, '🛺', { font: '24px Arial', align: 'center' })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 12, 'v1.0.0 | Arrow Keys + Enter', {
        font: '6px monospace',
        color: '#475569',
        align: 'center',
      })
      .setOrigin(0.5);

    // Feedback line for menu entries that do nothing yet.
    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 26, '', {
        font: '7px monospace',
        color: '#64748b',
        align: 'center',
      })
      .setOrigin(0.5);
  }

  private createMenu(): void {
    const startY = 145;
    const gap = 22;

    this.menuOptions.forEach((option, index) => {
      const text = this.add
        .text(GAME_WIDTH / 2, startY + index * gap, option, {
          font: '10px monospace',
          color: '#64748b',
          align: 'center',
        })
        .setOrigin(0.5);

      text.setInteractive({ useHandCursor: true });
      text.on('pointerover', () => {
        this.selectedIndex = index;
        this.updateMenuDisplay();
      });
      text.on('pointerdown', () => this.confirmSelection());

      this.menuItems.push(text);
    });

    this.updateMenuDisplay();
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    // Scene-scoped listeners: Phaser tears these down on shutdown, so the menu
    // cannot keep responding after the scene is gone.
    keyboard.on('keydown-UP', () => this.moveSelection(-1));
    keyboard.on('keydown-W', () => this.moveSelection(-1));
    keyboard.on('keydown-DOWN', () => this.moveSelection(1));
    keyboard.on('keydown-S', () => this.moveSelection(1));
    keyboard.on('keydown-ENTER', () => this.confirmSelection());
    keyboard.on('keydown-SPACE', () => this.confirmSelection());
  }

  private moveSelection(direction: number): void {
    this.selectedIndex = Phaser.Math.Wrap(
      this.selectedIndex + direction,
      0,
      this.menuOptions.length,
    );
    this.updateMenuDisplay();
  }

  private updateMenuDisplay(): void {
    this.menuItems.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.setColor('#f8fafc');
        item.setText(`> ${this.menuOptions[index]} <`);
      } else {
        item.setColor('#64748b');
        item.setText(this.menuOptions[index]);
      }
    });
  }

  private confirmSelection(): void {
    switch (this.menuOptions[this.selectedIndex]) {
      case 'New Game':
        this.startNewGame();
        break;

      case 'Continue':
        this.continueGame();
        break;

      case 'Settings':
        this.statusText.setText('Settings are not in yet.');
        break;
    }
  }

  /** Resume a saved run, or say so plainly when there is nothing to resume. */
  private continueGame(): void {
    const save = SaveManager.getInstance().load();
    if (!save) {
      this.statusText.setText('No saved game found.');
      return;
    }

    SaveManager.getInstance().restore();
    this.fadeToScene(save.player.position.scene || SCENE_KEYS.AIRPORT);
  }

  private startNewGame(): void {
    this.fadeToScene(SCENE_KEYS.CHARACTER_SELECT);
  }

  private fadeToScene(key: string): void {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(key));
  }
}

export default TitleScene;
