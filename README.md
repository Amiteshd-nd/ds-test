# cloud-march

A **pnpm-workspaces monorepo**. Each project is a package under `packages/`.

```
packages/
├── portfolio/    # Vite + React portfolio site (the deployed site)
├── game/         # @cloud-march/game — Bangalore Times (Phaser). Library + standalone app.
└── blockmodel/   # Next.js prototype: phone photos → 3D model (see its own README)
```

The **portfolio** embeds the **game** as a library (route `/game/bangalore-times`),
and the game can also run on its own. **blockmodel** is fully independent.

## Prerequisites

- Node 20+ and **pnpm**. If you don't have pnpm:
  ```bash
  corepack enable pnpm      # uses the version pinned in package.json (needs sudo on some setups)
  # or: npm i -g pnpm       # or: brew install pnpm
  ```

## Install

```bash
pnpm install        # from the repo root — installs & links all packages
```

## Run a package

```bash
pnpm dev:portfolio      # portfolio  → http://localhost:5173  (game lives at /game/bangalore-times)
pnpm dev:game           # game standalone → http://localhost:5173
pnpm dev:blockmodel     # blockmodel → http://localhost:3000  (see packages/blockmodel/README.md)
```

Or target any package directly: `pnpm --filter <name> <script>`
(names: `portfolio`, `@cloud-march/game`, `blockmodel`).

## Build

```bash
pnpm build              # builds every package
pnpm build:portfolio    # just the portfolio (deployed via netlify.toml → packages/portfolio/dist)
```

## Add a new project

1. Create `packages/<name>/` with its own `package.json`.
2. `pnpm install` — the workspace picks it up automatically (`packages/*`).
3. To share it with another package, add `"<pkg-name>": "workspace:*"` to that
   package's dependencies (see how `portfolio` depends on `@cloud-march/game`).
