# cloud-march

A **pnpm-workspaces monorepo**. Each project is a package under `packages/`.

```
hub/               # launcher — `pnpm dev` opens it at http://localhost:8787
packages/
├── personal-doc/  # Vite + React portfolio site (the deployed site)
├── game/          # @cloud-march/game — Bangalore Times (Phaser). Library + standalone app.
├── blockmodel/    # Next.js prototype: phone photos → 3D model (see its own README)
├── gully/         # Vite + MapLibre: one Bengaluru layout at true width, plus report capture (see its own README)
├── discovery/     # Next.js: the agentic UI program — six surfaces, one design grammar (see its own README)
├── carcinogen/    # one self-contained HTML page: the carcinogen heatmap (no build step)
├── file-compressor/ # Next.js: adaptive PDF compression behind a perceptual quality gate (see its own README)
├── cortex/        # @cloud-march/cortex — a portable AI agent layer behind eight adapters, plus the demo host it installs into
└── motion-kit/    # @cloud-march/motion — shared motion tokens and helpers on motion.dev (library, no dev server)
```

The **personal-doc** site embeds the **game** as a library (route `/game/bangalore-times`),
and the game can also run on its own. **blockmodel**, **gully**, and **discovery** are
fully independent. **discovery** is the largest: a Next.js app holding six agentic-UI
surfaces, their shared design grammar, and the program docs — start at
`packages/discovery/README.md`.

**cortex** is a library with an app attached. `src/core/` is the agent layer and knows
nothing about any product; `adapters-host/` and `demo/` are a small fictional host called
Atlas that it is installed into, so the thing is runnable rather than only described. The
same package holds the manifests, prompts, evals, red-team suite, and a self-hosted trace
store — it takes three runtime dependencies and talks to no vendor. Start at
`packages/cortex/README.md`.

**motion-kit** is the odd one out: a library, not an app. It holds the repo's motion
vocabulary (durations, easings, springs, stagger budgets) on top of
[motion.dev](https://motion.dev), so animation across the packages comes from one set
of decisions instead of seven. It has no dev server and no port. Every front-end
package depends on it; see `packages/motion-kit/README.md`.

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

Fixed ports: personal-doc `:6173`, game `:6174`, gully `:6175`, blockmodel `:6176`, discovery `:6177`,
trimension `:6178`, file-compressor `:6179`, carcinogen `:6180`, cortex `:6181` (its agent
service sits behind it on `:6182`).

## Run a package directly (without the hub)

```bash
pnpm dev:personal-doc    # personal-doc → http://localhost:6173  (game lives at /game/bangalore-times)
pnpm dev:game           # game standalone → http://localhost:6174
pnpm dev:blockmodel     # blockmodel → http://localhost:6176  (see packages/blockmodel/README.md)
pnpm dev:gully          # gully → http://localhost:6175  (see packages/gully/README.md)
pnpm dev:discovery      # discovery → http://localhost:6177  (surfaces at /coding, gallery at /dev, studies at /studies)
pnpm dev:file-compressor # file-compressor → http://localhost:6179  (see packages/file-compressor/README.md)
pnpm dev:carcinogen     # carcinogen → http://localhost:6180  (or just open packages/carcinogen/index.html)
pnpm dev:cortex         # cortex → http://localhost:6181  (Atlas demo + agent service; see packages/cortex/README.md)
```

Or target any package directly: `pnpm --filter <name> <script>`
(names: `personal-doc`, `@cloud-march/game`, `blockmodel`, `gully`, `discovery`, `carcinogen`,
`file-compressor`, `@cloud-march/cortex`, `@cloud-march/motion`).

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
