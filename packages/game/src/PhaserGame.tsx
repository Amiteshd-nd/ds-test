import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import TitleScene from './scenes/TitleScene';
import CharacterSelectScene from './scenes/CharacterSelectScene';
import AirportScene from './scenes/AirportScene';
import WhitefieldScene from './scenes/WhitefieldScene';
import { GAME_HEIGHT, GAME_WIDTH, SCENE_KEYS } from './utils/constants';

export interface PhaserGameProps {
  /**
   * Scene to enter after BootScene finishes loading. Boot always runs first —
   * it owns every asset and animation — so this selects the destination rather
   * than the entry point. Defaults to the title screen.
   */
  startScene?: string;
}

/**
 * Mounts a Phaser game into a div and tears it down on unmount so the canvas
 * never leaks across route changes.
 *
 * Render settings follow the v1.0 spec: a 640×360 native resolution scaled with
 * Scale.FIT, pixelArt on and every smoothing path off. Anything less and the
 * 32px tiles shimmer as the camera moves.
 */
const PhaserGame = ({ startScene = SCENE_KEYS.TITLE }: PhaserGameProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (gameRef.current || !containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      parent: containerRef.current,
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      backgroundColor: '#0e0f13',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        pixelArt: true,
        antialias: false,
        antialiasGL: false,
        roundPixels: true,
      },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      // BootScene is listed first, so it is the scene Phaser starts with.
      scene: [BootScene, TitleScene, CharacterSelectScene, AirportScene, WhitefieldScene],
    });

    gameRef.current = game;
    game.registry.set('startScene', startScene);

    // Dev-only handle. Phaser is bundled, so there is no global to reach for
    // when inspecting scene state from the console or a driver script.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__nqGame = game;
      // The store too — module-scoped and unreachable from the console otherwise.
      void import('./store').then((m) => {
        (window as unknown as Record<string, unknown>).__nqStore = m.useGameStore;
      });
    }

    // Force nearest-neighbour sampling once the canvas exists. Phaser's
    // pixelArt flag covers its own texture uploads; this covers the canvas
    // element itself when the browser scales it up to fill the viewport.
    game.events.once('ready', () => {
      if (game.canvas) game.canvas.style.imageRendering = 'pixelated';
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // startScene is read once at boot; changing it should not rebuild the game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="nq-canvas-host" />;
};

export default PhaserGame;
