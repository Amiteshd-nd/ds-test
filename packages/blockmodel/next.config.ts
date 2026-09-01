import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This app is a package in a pnpm-workspaces monorepo. Point Turbopack at the
  // monorepo root (two levels up) so it resolves the hoisted `next` and other
  // dependencies from the root node_modules.
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
  // better-sqlite3 is a native module — keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Photo sets can be large (dozens of images). Raise the Server Action /
  // route body limit generously — this is a single-user local prototype.
  experimental: {
    serverActions: {
      bodySizeLimit: "1gb",
    },
  },
};

export default nextConfig;
