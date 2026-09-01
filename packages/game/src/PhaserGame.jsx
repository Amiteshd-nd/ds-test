import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import WhitefieldScene from './scenes/WhitefieldScene';

// Mounts a Phaser game into a div and tears it down on unmount so the
// canvas never leaks across route changes.
const PhaserGame = () => {
  const containerRef = useRef(null);
  const gameRef = useRef(null);

  useEffect(() => {
    if (gameRef.current) return;

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#0e0f13',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: 'arcade',
        arcade: { debug: false },
      },
      scene: [WhitefieldScene],
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default PhaserGame;
