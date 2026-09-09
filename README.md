# cloud-march

A **pnpm-workspaces monorepo**. Each project is a package under `packages/`.

```
hub/               # launcher — `pnpm dev` opens it at http://localhost:8787
packages/
├── personal-doc/  # Vite + React portfolio site (the deployed site)
├── game/          # @cloud-march/game — Bangalore Times (Phaser). Library + standalone app.
├── blockmodel/    # Next.js prototype: phone photos → 3D model (see its own README)
├── gully/         # Vite + MapLibre: one Bengaluru layout at true width, plus report capture (see its own README)
└── discovery/     # Next.js: the agentic UI program — six surfaces, one design grammar (see its own README)
```

The **personal-doc** site embeds the **game** as a library (route `/game/bangalore-times`),
and the game can also run on its own. **blockmodel**, **gully**, and **discovery** are
fully independent. **discovery** is the largest: a Next.js app holding six agentic-UI
surfaces, their shared design grammar, and the program docs — start at
`packages/discovery/README.md`.

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

## Run — the hub

```bash
pnpm dev        # starts the hub → http://localhost:8787
```

The **hub** (`hub/`) lists every project. Hit **Play** on a card to start that
project's dev server on demand; the card then shows **Open ↗** (once it's up), **Stop**,
and live **Logs**. Quitting the hub (`Ctrl-C`) stops every server it started.

Fixed ports: personal-doc `:6173`, game `:6174`, gully `:6175`, blockmodel `:6176`, discovery `:6177`.

## Run a package directly (without the hub)

```bash
pnpm dev:personal-doc    # personal-doc → http://localhost:6173  (game lives at /game/bangalore-times)
pnpm dev:game           # game standalone → http://localhost:6174
pnpm dev:blockmodel     # blockmodel → http://localhost:6176  (see packages/blockmodel/README.md)
pnpm dev:gully          # gully → http://localhost:6175  (see packages/gully/README.md)
pnpm dev:discovery      # discovery → http://localhost:6177  (surfaces at /coding, gallery at /dev, studies at /studies)
```

Or target any package directly: `pnpm --filter <name> <script>`
(names: `personal-doc`, `@cloud-march/game`, `blockmodel`, `gully`, `discovery`).

## Build

```bash
pnpm build              # builds every package
pnpm build:personal-doc  # just the site (deployed via netlify.toml → packages/personal-doc/dist)
```

## Add a new project

1. Create `packages/<name>/` with its own `package.json`.
2. `pnpm install` — the workspace picks it up automatically (`packages/*`).
3. To share it with another package, add `"<pkg-name>": "workspace:*"` to that
   package's dependencies (see how `personal-doc` depends on `@cloud-march/game`).
