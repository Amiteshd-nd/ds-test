import path from 'node:path';

import type { NextConfig } from 'next';

const config: NextConfig = {
  // Without this, Next walks up looking for a lockfile and can land outside the
  // monorepo entirely, which quietly changes what output tracing collects.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
  // The OG image and favicon read these from disk at request time, so they must survive tracing.
  outputFileTracingIncludes: { '/**': ['./public/fonts/*.ttf', './public/bg.jpg', './public/stickers/*.png'] },
  poweredByHeader: false,
  images: { formats: ['image/avif', 'image/webp'] },
  // The confirmation email loads the brand fonts from here. Fonts are subject to
  // CORS, so without this any client that enforces it falls back to Georgia.
  async headers() {
    return [
      {
        source: '/fonts/:file*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=604800' },
        ],
      },
    ];
  },
};

export default config;
