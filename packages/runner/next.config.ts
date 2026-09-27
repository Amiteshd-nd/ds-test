import path from 'node:path';

import type { NextConfig } from 'next';

const config: NextConfig = {
  /*
   * Dev and production builds get separate output directories.
   *
   * Next defaults both to `.next`. Run `next build` while `next dev` is live -
   * which is the obvious thing to do when you are checking that a change
   * compiles - and the two write over each other's chunk manifests. The
   * symptom is a runtime error naming a chunk that is plainly sitting in
   * `.next/server/chunks/`, because the surviving `webpack-runtime.js` is from
   * the other build and looks for it somewhere else.
   *
   * The build and start scripts set NEXT_DIST_DIR, so the two never share a
   * directory and the failure cannot happen.
   */
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // Without this, Next walks up looking for a lockfile and can land outside the
  // monorepo entirely, which quietly changes what output tracing collects.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
  // Phase 0 is the foundation everything else stands on; a type error stops the build.
  typescript: { ignoreBuildErrors: false },
  // better-sqlite3 is a native module. It must not be traced into the bundle.
  serverExternalPackages: ['better-sqlite3', 'playwright', 'playwright-core'],
  // schema.sql is read at runtime, so it has to survive output tracing.
  outputFileTracingIncludes: { '/**': ['./src/core/db/schema.sql'] },
};

export default config;
