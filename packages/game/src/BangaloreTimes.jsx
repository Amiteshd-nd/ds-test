import PhaserGame from './PhaserGame';
import { useGameStore } from './store';
import './game.css';

// Self-contained game screen. Portable across hosts: it takes no router or theme
// dependency. Pass an optional `backSlot` node (e.g. a react-router <Link>) and it
// gets styled as the back pill; omit it (standalone) and no back button shows.
const BangaloreTimes = ({ backSlot }) => {
  const score = useGameStore((s) => s.score);
  const botCount = useGameStore((s) => s.botCount);

  return (
    <div className="nq-root">
      {/* Game canvas fills the viewport */}
      <PhaserGame />

      {/* HUD overlay */}
      <div className="nq-hud-top">
        <div className="nq-back-slot">{backSlot}</div>

        <div className="nq-title-block">
          <span className="nq-title">Namma Quest</span>
          <span className="nq-sub">
            Score {score} · {botCount} online
          </span>
        </div>
      </div>

      {/* Controls hint */}
      <div className="nq-controls">
        <span className="nq-sub">Move with WASD or arrow keys</span>
      </div>
    </div>
  );
};

export default BangaloreTimes;
