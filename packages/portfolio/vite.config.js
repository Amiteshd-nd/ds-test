import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ViteImageOptimizer({
      // Test patterns for images to optimize
      test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,

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
})
