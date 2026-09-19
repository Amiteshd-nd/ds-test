import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Repo rule: no port beginning with 4 or 5. The demo UI is 6181; the CORTEX service
// next door is 6182, and /v1 is proxied to it so the browser makes same-origin calls.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  server: {
    port: 6181,
    strictPort: true,
    proxy: {
      '/v1': { target: 'http://localhost:6182', changeOrigin: true },
    },
  },
  build: { outDir: '../dist-demo', emptyOutDir: true },
});
