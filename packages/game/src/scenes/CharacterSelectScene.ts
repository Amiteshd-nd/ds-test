import Phaser from 'phaser';
import type { PlayerBackground } from '../utils/constants';
import { GAME_WIDTH, PLAYER_BACKGROUNDS, SCENE_KEYS } from '../utils/constants';
import { useGameStore } from '../store';

type BackgroundData = (typeof PLAYER_BACKGROUNDS)[PlayerBackground];

// The card container carries its own identity so selection handlers stay simple.
type BackgroundCard = Phaser.GameObjects.Container & {
  rect: Phaser.GameObjects.Rectangle;
  backgroundKey: PlayerBackground;
};

/**
 * CharacterSelectScene — two-phase character creation.
 * Phase 1 takes a name, phase 2 picks an educational background.
 */
export class CharacterSelectScene extends Phaser.Scene {
  static readonly KEY = SCENE_KEYS.CHARACTER_SELECT;

  private playerName = '';
  private cursorVisible = true;
  private cursorTimer: Phaser.Time.TimerEvent | null = null;
  private nameInputText!: Phaser.GameObjects.Text;
  private keyboardListener: ((event: KeyboardEvent) => void) | null = null;

  private selectedCardIndex = 0;
  private backgroundCards: BackgroundCard[] = [];

  constructor() {
    super(CharacterSelectScene.KEY);
  }

  create(): void {
    this.playerName = '';
    this.cursorVisible = true;
    this.selectedCardIndex = 0;
    this.backgroundCards = [];

    useGameStore.getState().setActiveScene(CharacterSelectScene.KEY);

    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor('#0f172a');
    this.cameras.main.fadeIn(300, 0, 0, 0);

    // Name entry reads raw `window` keystrokes, which outlive the scene unless
    // they are explicitly torn down. Phaser never calls a bare `shutdown()`
    // method, so bind the real lifecycle events instead — otherwise the
    // listener survives scene changes and, in an embedded host, the whole game.
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.on(Phaser.Scenes.Events.DESTROY, this.cleanup, this);

    this.initializePhase1();
  }

  private cleanup(): void {
    if (this.cursorTimer) {
      this.cursorTimer.destroy();
      this.cursorTimer = null;
    }
    if (this.keyboardListener) {
      window.removeEventListener('keydown', this.keyboardListener);
      this.keyboardListener = null;
    }
  }

  // ── Phase 1: name entry ──────────────────────────────────────────────────
  private initializePhase1(): void {
    this.add
      .text(GAME_WIDTH / 2, 30, 'Welcome to Bengaluru!', {
        font: 'bold 12px monospace',
        color: '#f8fafc',
        align: 'center',
      })
      .setOrigin(0.5);

    const inputBox = this.add.rectangle(GAME_WIDTH / 2, 70, 160, 20, 0x1e293b);
    inputBox.setStrokeStyle(1, 0x3b82f6);

    this.nameInputText = this.add
      .text(GAME_WIDTH / 2, 70, '', {
        font: '10px monospace',
        color: '#f8fafc',
        align: 'center',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 100, 'Type your name and press Enter', {
        font: '7px monospace',
        color: '#64748b',
        align: 'center',
      })
      .setOrigin(0.5);

    this.cursorTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        this.cursorVisible = !this.cursorVisible;
        this.updateNameDisplay();
      },
      loop: true,
    });

    this.setupPhase1Input();
    this.updateNameDisplay();
  }

  private setupPhase1Input(): void {
    this.replaceKeyboardListener((event) => {
      const key = event.key;

      // Single printable characters only — this filter must not catch 'Enter',
      // 'Shift' and friends, hence the explicit length check.
      if (key.length === 1 && /[a-zA-Z0-9 ]/.test(key) && this.playerName.length < 12) {
        this.playerName += key;
        this.updateNameDisplay();
        return;
      }

      if (key === 'Backspace') {
        this.playerName = this.playerName.slice(0, -1);
        this.updateNameDisplay();
        return;
      }

      if (key === 'Enter' && this.playerName.trim().length > 0) {
        this.proceedToPhase2();
      }
    });
  }

  private updateNameDisplay(): void {
    this.nameInputText.setText(this.playerName + (this.cursorVisible ? '_' : ''));
  }

  private proceedToPhase2(): void {
    if (this.cursorTimer) {
      this.cursorTimer.destroy();
      this.cursorTimer = null;
    }
    this.removeKeyboardListener();

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.children.removeAll();
      this.cameras.main.fadeIn(300, 0, 0, 0);
      this.initializePhase2();
    });
  }

  // ── Phase 2: background selection ────────────────────────────────────────
  private initializePhase2(): void {
    this.selectedCardIndex = 0;
    this.backgroundCards = [];

    this.add
      .text(GAME_WIDTH / 2, 16, `${this.playerName}, what did you study?`, {
        font: '10px monospace',
        color: '#f8fafc',
        align: 'center',
      })
      .setOrigin(0.5);

    const entries = Object.entries(PLAYER_BACKGROUNDS) as Array<
      [PlayerBackground, BackgroundData]
    >;

    const cardWidth = 100;
    const cardHeight = 50;
    const gap = 12;
    const startX = (GAME_WIDTH - (cardWidth * 2 + gap)) / 2;
    const startY = 50;

    entries.forEach(([key, data], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = startX + col * (cardWidth + gap) + cardWidth / 2;
      const y = startY + row * (cardHeight + gap) + cardHeight / 2;

      this.backgroundCards.push(
        this.createBackgroundCard(key, data, x, y, cardWidth, cardHeight, index),
      );
    });

    this.setupPhase2Input();
    this.updateBackgroundSelection();
  }

  private createBackgroundCard(
    key: PlayerBackground,
    data: BackgroundData,
    x: number,
    y: number,
    width: number,
    height: number,
    index: number,
  ): BackgroundCard {
    const container = this.add.container(x, y) as BackgroundCard;

    const rect = this.add.rectangle(0, 0, width, height, 0x1e293b);
    rect.setStrokeStyle(1, 0x334155);
    container.add(rect);
    container.rect = rect;
    container.backgroundKey = key;

    const label = this.add
      .text(0, -15, data.label, {
        font: 'bold 8px monospace',
        color: '#f8fafc',
        align: 'center',
        wordWrap: { width: width - 4 },
      })
      .setOrigin(0.5);
    container.add(label);

    const description = this.add
      .text(0, 0, data.description, {
        font: '6px monospace',
        color: '#94a3b8',
        align: 'center',
        wordWrap: { width: width - 4 },
      })
      .setOrigin(0.5);
    container.add(description);

    const bonusText = Object.entries(data.statBonuses)
      .map(([stat, value]) => `+${value} ${stat}`)
      .join(', ');
    const bonus = this.add
      .text(0, 13, bonusText, {
        font: '6px monospace',
        color: '#3b82f6',
        align: 'center',
        wordWrap: { width: width - 4 },
      })
      .setOrigin(0.5);
    container.add(bonus);

    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => {
      this.selectedCardIndex = index;
      this.updateBackgroundSelection();
    });
    rect.on('pointerdown', () => this.confirmBackgroundSelection());

    return container;
  }

  private setupPhase2Input(): void {
    this.replaceKeyboardListener((event) => {
      const lastIndex = this.backgroundCards.length - 1;

      switch (event.key) {
        case 'ArrowUp':
          this.selectedCardIndex = Math.max(0, this.selectedCardIndex - 2);
          break;
        case 'ArrowDown':
          this.selectedCardIndex = Math.min(lastIndex, this.selectedCardIndex + 2);
          break;
        case 'ArrowLeft':
          if (this.selectedCardIndex % 2 === 1) this.selectedCardIndex -= 1;
          break;
        case 'ArrowRight':
          if (this.selectedCardIndex % 2 === 0 && this.selectedCardIndex < lastIndex) {
            this.selectedCardIndex += 1;
          }
          break;
        case 'Enter':
        case ' ':
          this.confirmBackgroundSelection();
          return;
      }

      this.updateBackgroundSelection();
    });
  }

  private updateBackgroundSelection(): void {
    this.backgroundCards.forEach((card, index) => {
      if (index === this.selectedCardIndex) {
        card.rect.setStrokeStyle(2, 0x3b82f6);
        card.rect.setFillStyle(0x1e3a5f);
      } else {
        card.rect.setStrokeStyle(1, 0x334155);
        card.rect.setFillStyle(0x1e293b);
      }
    });
  }

  private confirmBackgroundSelection(): void {
    const selectedCard = this.backgroundCards[this.selectedCardIndex];
    if (!selectedCard) return;

    this.tweens.add({
      targets: selectedCard.rect,
      alpha: { from: 1, to: 0.5 },
      duration: 150,
      yoyo: true,
      repeat: 2,
    });

    // Registry keeps parity with the reference; the store is what the React HUD
    // renders from, so both are written.
    this.registry.set('playerName', this.playerName);
    this.registry.set('playerBackground', selectedCard.backgroundKey);
    useGameStore.getState().setPlayerName(this.playerName);

    this.removeKeyboardListener();

    this.time.delayedCall(600, () => {
      this.cameras.main.fadeOut(800, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start(SCENE_KEYS.AIRPORT);
      });
    });
  }

  // ── Keyboard plumbing ────────────────────────────────────────────────────
  private replaceKeyboardListener(handler: (event: KeyboardEvent) => void): void {
    this.removeKeyboardListener();
    this.keyboardListener = handler;
    window.addEventListener('keydown', handler);
  }

  private removeKeyboardListener(): void {
    if (!this.keyboardListener) return;
    window.removeEventListener('keydown', this.keyboardListener);
    this.keyboardListener = null;
  }
}

export default CharacterSelectScene;
