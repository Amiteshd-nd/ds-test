import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone build for the game. When consumed as a library, the host's bundler
// (the portfolio's Vite) transpiles src/index.js directly — this config isn't used.
export default defineConfig({
  plugins: [react()],
});
