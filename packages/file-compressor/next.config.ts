import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // A package in a pnpm-workspaces monorepo: point Turbopack at the repo root so
  // it resolves the hoisted `next` and friends from the root node_modules.
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
  },
  // Next 16 writes its own AGENTS.md and CLAUDE.md into the package on dev
  // start. This repo's guidance lives at the root; a second CLAUDE.md here would
  // shadow it with boilerplate nobody wrote.
  agentRules: false,
};

export default nextConfig;
