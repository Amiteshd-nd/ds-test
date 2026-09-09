// Standalone entry — mounts the game as its own app (pnpm --filter @cloud-march/game dev).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import BangaloreTimes from './BangaloreTimes';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <BangaloreTimes />
  </StrictMode>,
);
