import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port 6178. The repo forbids anything starting with 4 or 5 (root CLAUDE.md), which
// rules out Vite's own 5173 default — hence strictPort, so a silent fallback can never
// land us on a banned port.
export default defineConfig({
  plugins: [react()],
  server: { port: 6178, strictPort: true },
  preview: { port: 6178, strictPort: true },
  // The wasm bundle is served as an asset, not bundled.
  assetsInclude: ['**/*.wasm'],
})
