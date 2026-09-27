// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

export default defineConfig({
  // A static landing page. No server, no adapter, no runtime: the build output
  // is a folder of files that any host can serve, which is what makes the
  // deploy step boring and the preview step instant.
  output: 'static',
  integrations: [icon({ include: { ph: ['*'] } })],
  vite: { plugins: [tailwindcss()] },
  build: { inlineStylesheets: 'always' },
  devToolbar: { enabled: false },
});
