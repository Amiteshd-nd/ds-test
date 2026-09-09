import type { NextConfig } from 'next';

const config: NextConfig = {
  // The prototypes are the product here; a type error should stop the build.
  typescript: { ignoreBuildErrors: false },
};

export default config;
