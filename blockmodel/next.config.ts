import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subfolder of a larger repo that has its own lockfile.
  // Pin Turbopack's root here so it doesn't infer the parent repo as the root.
  turbopack: {
    root: import.meta.dirname,
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
