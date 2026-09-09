# Namma Quest — tech stack

Aligned with the `v1.0` branch of [`cityhunter-x-y-z/bt`](https://github.com/cityhunter-x-y-z/bt)
(commit `19899fd`, 2026-07-13). That commit added `TECH_STACK.md` and
`ARCHITECTURE.md` and **no code** — the reference implementation on that branch
is from `090627c` (2026-03-29). So the newest statement of direction in that
repo is the stack description, and this package follows it.

## Current

| Layer | Choice | Reference spec | Here |
| --- | --- | --- | --- |
| Engine | Phaser | 3.70+ | **3.90** |
| UI | React | 18+ | **19.1** |
| State | Zustand | yes | **5.0** |
| Build | Vite | 5.x | **7.2** |
| Language | TypeScript | yes | 5.9 |
| PWA | vite-plugin-pwa + Workbox | Phase 1 | 1.3 |

Where this package is on a newer major than the spec's floor, the newer version
wins — the spec sets a minimum, not a ceiling.

## Rendering

640×360 native, `Scale.FIT`, `pixelArt: true`, `roundPixels: true`, every
antialias path off. Integer-scales to 720p (2×), 1080p (3×) and 1440p (4×).
Tiles are 32px; character sprites are 32×48.

The reference `main.ts` also re-acquires the WebGL context after boot to set
`TEXTURE_2D` filtering to `NEAREST`. That is omitted here: it applies to
whichever texture happens to be bound at that moment rather than to the atlas,
and Phaser's `pixelArt` flag already sets `NEAREST` on every texture it uploads.
The canvas-level `image-rendering: pixelated` is kept, since that governs the
browser's own upscale of the 640×360 backing store.

## Layout

Follows the conventions in the reference `docs/AI_CONTEXT.md`:

```
src/
├── assets/     art + tilemap, imported as ?url    (see "Assets" below)
├── entities/   Phaser.GameObjects subclasses      (Player)
├── scenes/     one file per screen, static KEY
├── systems/    singleton managers, getInstance()  (StatsManager, SaveManager)
├── utils/      constants.ts, types.ts, placeholders.ts
└── store.ts    zustand — the single source of truth
```

## Scene flow

```
BootScene ──► TitleScene ──► CharacterSelectScene ──► AirportScene
                  │                                        │
                  └── Continue (restores a save) ───────────┘

WhitefieldScene — MVP-1 bot sandbox, reachable via the startScene prop
```

BootScene always runs first: it owns every asset and animation, so no later
transition ever stalls on a fetch. It then starts whichever scene the
`startScene` registry key names (default `TitleScene`), which is how
`<BangaloreTimes startScene="WhitefieldScene" />` drops straight into the
sandbox without a separate scene list.

One deliberate divergence: the reference has no React, so its managers own
state directly. Here the managers delegate to the zustand store, so Phaser and
the React HUD read the same state instead of drifting apart.

## Assets

Ported from the reference: the player spritesheet (128×192, 16 frames of 32×48),
`airport_interior.tmj` (30×20 tiles, 5 layers, 7 spawn points) and the 8
tilesets it references — 1.8 MB in total.

They live in `src/assets/` and are pulled in through `src/assets/index.ts` with
`?url` imports rather than sitting in `public/`. The reference loads them by
relative path, which works only when the game is the site root; this package is
also consumed as a library by personal-doc, whose build does not copy this
package's `public/` directory, and where a relative `assets/…` path would
resolve against the host route and 404. Letting the bundler emit them fixes both
cases at once.

`utils/placeholders.ts` still generates flat textures at the real pixel
dimensions for entities with no art (bots, NPCs), and `Player` guards animation
playback with `anims.exists()`, so an entity works before and after its art
arrives.

**Not ported:** ~10 MB of unreferenced source art in the reference repo
(`Air one.png`, `air two.png`, the four large sprite sheets, `test-sprite.png`)
plus `tools/debug-frames/`. No scene loads any of it. It is working material
rather than runtime assets, and committing it would weigh the repo down
permanently — easy to add later, hard to remove from history.

### Pixel art and the image optimizer

personal-doc runs `vite-plugin-image-optimizer`, whose `png: { quality: 80 }`
palette-quantises PNGs — measured at ~78% of subpixels altered on the player
spritesheet, which visibly corrupts pixel art. personal-doc's Vite config now
routes this package's art into `assets/game/` and excludes that folder from the
optimizer. Every ported file is byte-identical in that build; if the layout
changes, re-check with a checksum against `src/assets/`.

## Deferred

Phases 2 and 3 of the reference plan are **not** installed here, because each
needs an account or toolchain that is a decision rather than a dependency:

- **Firebase** (Realtime DB, Auth, Cloud Messaging, Functions) — needs a
  Firebase project and config credentials. Gates MVP 2 (accounts, online panel)
  and MVP 3 (co-op sessions, push).
- **Capacitor 6** (`@capacitor/core`, `cli`, `android`, `ios`) — needs Android
  Studio / Xcode. The PWA is the Phase 1 distribution channel and works today.


## Fixes applied during the port

The scenes are ported faithfully except where the reference would misbehave
here. Each of these is a real defect, not a style preference:

- **`BootScene` loaded `assets/tilesets/airport_tiles.png`, which does not exist
  in the reference repo.** It was a fallback placeholder that was never created,
  so every boot took a 404. Removed, and a `loaderror` handler now reports any
  future missing asset instead of leaving the loading bar stalled.
- **`CharacterSelectScene` defined `shutdown()` as a plain method.** Phaser does
  not call that — it emits a `SHUTDOWN` event — so the `window` keydown listener
  used for name entry outlived the scene. Harmless on a standalone page, a real
  leak when the game is embedded and unmounted. Now bound to the actual
  `SHUTDOWN`/`DESTROY` events.
- **The name filter accepted any key matching `/[a-zA-Z0-9 ]/`,** which also
  matches multi-character key names. Now requires `key.length === 1`.
- **`zone_exit` fired its overlap callback every frame** the player stood in it.
  Now fires once and emits `zone-exit-reached`.
- **Phase-2 arrow navigation hard-coded the card count** (`Math.min(3, …)`).
  Now derived from the number of cards.
- **`addTilesetImage` failures were pushed silently**, which renders an empty
  layer with no clue why. Now reported.

## Map pipeline

Maps are data, not code. `src/assets/maps.manifest.json` is the contract; both
the runtime registry (`src/assets/maps.ts`) and the build-time validator
(`scripts/validate-maps.mjs`) read it, so they cannot drift.

Tilesets and tilemaps are discovered with `import.meta.glob`. Adding a map is:

1. Export the `.tmj` from Tiled into `src/assets/tilemaps/` (embed tilesets).
2. Drop each tileset PNG into `src/assets/tilesets/`, named to match the
   tileset's `name` field in Tiled.
3. Add an entry to `maps.manifest.json` naming the required layers and spawns.

No import to add, no loader line in `BootScene`, no tileset list in the scene.

### Why the validator exists

Tiled failure modes are silent: a renamed layer renders an empty floor, a
tileset whose `name` stops matching its PNG renders nothing, a missing spawn
drops the player at a hard-coded fallback. None of them throw. Both bugs already
found in the reference code were of exactly this kind — `BootScene` loading an
`airport_tiles.png` that does not exist, and a spawn named `gaurd` that only
works because the typo is matched verbatim.

`node scripts/validate-maps.mjs` runs first in `build` and checks: tile size,
orthogonal orientation, non-infinite, every required layer present (with a
case/spacing near-miss hint), the collision stencil hidden, the spawn layer
being an object layer, required spawns present, every declared tileset having a
matching image, and no external `.tsx` references.

## Scaling strategy

Coverage of the low-cost scaling strategy document lives in
[STRATEGY_COVERAGE.md](./STRATEGY_COVERAGE.md), including what is deliberately
deferred and an open genre question.

The shape it asks for, and the shape here: one system per concern, fed by data.
A new district should need a map, tiles, NPC records, quest records, dialogue
and items — and no core code.

## Event-driven core

Gameplay systems communicate through one typed event bus (`src/core/events.ts`),
not direct calls. Scenes announce facts — `dialogue:ended`, `item:added`,
`zone:reached`, `entity:interacted` — and systems draw conclusions:

```
scene / DialogueBox ──emit──►  gameEvents  ──on──►  QuestManager   (objectives)
InventoryManager    ──emit──►      │       ──on──►  (future: achievements,
DialogueManager     ──emit──►      │                 analytics, ghost recorder,
                                   ▼                 multiplayer relay)
```

AirportScene does not know the quest system exists; QuestManager has never
heard of Phaser. New systems subscribe instead of being wired into scene code,
and the bus is deliberately engine-free so every subscriber stays unit-testable
in Node. Listener errors are isolated — one broken handler cannot kill the
frame. Recording this event stream is the planned Stage-0 ghost format.

State split: managers own the **rules** (stack limits, prerequisites, gating);
the zustand store owns the **data**, in exactly the shape SaveData persists —
so the React HUD, Phaser scenes and the save file can never disagree.

Current managers: `StatsManager` (stats, xp, effects), `InventoryManager`
(stacking rules, all-or-nothing add/remove, consumable use), `QuestManager`
(bus-driven objective tracking, rewards, scene-unlock flags), `DialogueManager`
(tree traversal, choice gating), `SaveManager` (localStorage, versioned).
`ui/DialogueBox` is the thin Phaser presentation over DialogueManager.

## Content pipeline

Dialogue, quests and items are authored as JSON in `src/data/` and discovered by
glob, the same way maps are. Writing content never means editing a scene:

```
src/data/
├── dialogue/<id>.json   one conversation; entry node is always "start"
├── quests/<id>.json     one quest
└── items/<group>.json   an array of item definitions
```

Filenames must match the `id` inside. `DialogueManager` walks a tree, applies
`StatEffect`s through `StatsManager`, and gates choices on skill tier —
returning locked choices with a reason rather than hiding them, so the player
can see what a skill would have unlocked.

### Why the content validator exists

`utils/types.ts` types the *shape* of a JSON import, but TypeScript cannot check
its *contents*. A dialogue node whose `next` points at a node that was renamed
type-checks perfectly and soft-locks the conversation in a shipped build. There
is no compiler error and no runtime error — the player simply cannot continue.

`node scripts/validate-content.ts` runs before every build and checks what the
compiler cannot: dangling `next` and choice targets, nodes unreachable from
`start`, missing entry nodes, unknown item ids in effects, unknown quest
triggers, skill branches and tiers outside the defined range, xp granted with no
branch, reward items that do not exist, `unlock_scene` values absent from
`SCENE_KEYS`, duplicate ids, filename/id drift, `stackable`/`max_stack`
incoherence, and prerequisite cycles between quests.

Node 24 runs the validator's TypeScript directly, so it imports `SCENE_KEYS`
and `SKILL_TIER_NAMES` from `utils/constants.ts` rather than duplicating them —
the lists cannot drift apart.

## Commands

```bash
corepack pnpm --filter @cloud-march/game dev             # http://localhost:6174
corepack pnpm --filter @cloud-march/game test            # vitest
corepack pnpm --filter @cloud-march/game validate        # maps + content
corepack pnpm --filter @cloud-march/game build           # validate → typecheck → build
```

Port 6174 is fixed with `strictPort` per the repo's no-4xxx/5xxx guardrail.
