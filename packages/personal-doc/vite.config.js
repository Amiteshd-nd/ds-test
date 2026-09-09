import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

// https://vite.dev/config/
export default defineConfig({
  // Repo guardrail: no ports starting with 4 or 5 (Vite's 5173 default is out).
  server: { port: 6173, strictPort: true },
  plugins: [
    react(),
    ViteImageOptimizer({
      // Test patterns for images to optimize
      test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,

      // Never touch the game's pixel art. Re-encoding a PNG at quality: 80
      // palette-quantises it — measured at ~78% of subpixels altered on the
      // player spritesheet — which visibly corrupts sprites and tilesets.
      // build.rollupOptions below routes that art into assets/game/ so this
      // path-based exclude can catch it.
      // Bundle keys arrive without a leading separator ("assets/game/x.png"),
      // so this must not require one.
      exclude: /(^|[\\/])assets[\\/]game[\\/]/,

      // PNG optimization settings
      png: {
        quality: 80,
        compressionLevel: 9,
      },

      // JPEG optimization settings
      jpeg: {
        quality: 80,
      },

      // WebP conversion settings - generates WebP versions
      webp: {
        lossless: false,
        quality: 80,
        alphaQuality: 80,
        force: false, // Don't force WebP, keep originals too
      },

      // Cache optimization results
      cache: true,
      cacheLocation: 'node_modules/.cache/image-optimizer',
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Keep the game package's art in its own output folder so the image
        // optimizer can skip it (see `exclude` above). Everything else keeps
        // the default flat assets/ layout.
        assetFileNames: (assetInfo) => {
          const sources = assetInfo.originalFileNames ?? [];
          const isGameArt = sources.some((p) =>
            p.replace(/\\/g, '/').includes('/game/src/assets/'),
          );
          return isGameArt
            ? 'assets/game/[name]-[hash][extname]'
            : 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
})
