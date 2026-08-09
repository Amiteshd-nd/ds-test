import { Link } from 'react-router-dom';
import PhaserGame from '../../game/PhaserGame';
import { useGameStore } from '../../game/store';

const BangaloreTimes = () => {
  const score = useGameStore((s) => s.score);
  const botCount = useGameStore((s) => s.botCount);

  return (
    <div className="fixed inset-0 bg-[#0e0f13] overflow-hidden">
      {/* Game canvas fills the viewport */}
      <PhaserGame />

      {/* HUD overlay */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 pointer-events-none">
        <Link
          to="/works"
          className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 backdrop-blur border border-white/10 text-light font-outfit text-sm hover:border-white/30 transition-all"
        >
          <span>←</span>
          <span>Back</span>
        </Link>

        <div className="flex flex-col items-end gap-1 px-4 py-2 rounded-2xl bg-black/50 backdrop-blur border border-white/10">
          <span className="font-space font-bold text-light text-sm">Namma Quest</span>
          <span className="font-outfit text-text-secondary text-xs">
            Score {score} · {botCount} online
          </span>
        </div>
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/50 backdrop-blur border border-white/10 pointer-events-none">
        <span className="font-outfit text-text-secondary text-xs">
          Move with WASD or arrow keys
        </span>
      </div>
    </div>
  );
};

export default BangaloreTimes;
