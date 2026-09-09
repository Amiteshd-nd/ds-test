import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Standalone build for the game. When consumed as a library, the host's bundler
// (personal-doc's Vite) transpiles src/index.ts directly — this config isn't used.
export default defineConfig({
  // Repo guardrail: no ports starting with 4 or 5 (Vite's 5173 default is out).
  server: { port: 6174, strictPort: true },
  plugins: [
    react(),
    // Phase 1 of the v1.0 distribution plan: ship as an installable PWA before
    // any native wrapper. Workbox precaches the bundle and the sprite/tilemap
    // assets so a returning player gets an offline-capable launch.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'Namma Quest',
        short_name: 'Namma Quest',
        description: 'A top-down pixel RPG set in Bengaluru.',
        theme_color: '#0e0f13',
        background_color: '#0e0f13',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2,json,tmj}'],
        // Phaser alone clears the 2 MiB default; tilesets will push it further.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2020',
    // Pixel art must not be inlined as base64 — keep asset files addressable so
    // Workbox can precache them.
    assetsInlineLimit: 0,
  },
});
