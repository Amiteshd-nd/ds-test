// Standalone entry — mounts the game as its own app (pnpm --filter @cloud-march/game dev).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import BangaloreTimes from './BangaloreTimes';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BangaloreTimes />
  </StrictMode>,
);
