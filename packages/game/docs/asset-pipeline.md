# Asset pipeline

How art gets into this game, and which parts of the
[source brief](#relationship-to-the-source-brief) apply here.

## The core principle, and where we differ

The brief's principle is **never hand-author sprite metadata, and never draw a
sprite you can generate**. That holds completely. Where this project differs is
one step earlier: the brief assumes you *buy* a tileset and then have to
recover its structure — slice it with flood fill, caption the crops with a
vision model, correct the result in a throwaway editor.

We generate the art instead, so the structure is never lost in the first
place. There is no anonymous sheet to slice, because `scripts/art/tiles.mjs`
knows every tile's name, size and grid position by construction. Detection and
captioning recover information that generation never discards.

That makes three of the brief's seven stages inapplicable **today**. They
become relevant the moment a bought pack enters the repo — see
[importing a bought pack](#importing-a-bought-pack).

## What runs today

```
scripts/art/palette.mjs     fixed palette; nothing may use a colour outside it
scripts/art/canvas.mjs      integer-addressed RGBA buffer, deterministic noise
scripts/art/tiles.mjs       35 modular street tiles, append-only id order
scripts/art/character.mjs   32x48 rig, 4 directions x 4 frames, 8 palettes
scripts/generate-art.mjs    writes tilesets/, sprites/, street.tiles.json
scripts/generate-street-map.mjs   composes a 30x20 street block as a .tmj
```

`corepack pnpm --filter @cloud-march/game art` runs the lot. Output is
deterministic — reruns are byte-identical, so regenerating never dirties the
tree.

## Pinned conventions

These are load-bearing. The automation only works because the formats are
rigid enough to generate, and changing one invalidates every generated asset.

| Convention | Value |
| --- | --- |
| Tile size | **32 px**, everywhere, no exceptions |
| Character frame | **32 x 48 px**, feet at y=42, bottom-aligned |
| Character sheet | 4 columns x 4 rows = 128 x 192 |
| Row order | 0 down, 1 left, 2 right, 3 up |
| Frame order per row | stride, idle, opposite stride, idle |
| Animation keys | `<sheet>-walk-<dir>`, `<sheet>-idle-<dir>` |
| Tileset sheet | 8 columns, tile id = index, **append only** |
| Map layers | Ground, Walls, Objects, Collision, Above Player, Effects, Foreground |
| Depth | computed from `zY`, never authored |

The brief uses 16 px tiles and a 16x32 character in a 7x3 sheet. We use 32 px
and 32x48 in 4x4 because that is what the ported reference art already was, and
re-cutting it would have been a day's work for no gain. The *rigidity* is the
transferable idea, not the specific numbers.

**Left-facing frames are drawn, not flipped.** The brief stores three rows and
mirrors the right row at runtime, saving a quarter of the sheet. We draw all
four because the rig is generated: a mirror flag in the drawing code costs
nothing and the two sides cannot drift, while a runtime flip would mirror
asymmetric details too.

## Depth sorting is computed, never authored

Every drawable has a `zY` — its bottom edge in world space — and
`src/core/depth.ts` turns that into a Phaser depth. Nothing is ever tagged
foreground or background.

- **Characters** take `zY` from their feet, not their sprite centre.
- **Objects** take `zY` from the bottom of their *footprint*.
- All entity depths land inside a single unit band above the world layers, so
  they interleave with each other and never with UI.

This replaced four copies of the same expression across two scenes. More
importantly it fixed a real defect: props used to live on a static tile layer,
which draws at one fixed depth, so a bench could never occlude the player
however far above it they stood. Props are now placed objects that sort every
frame.

## Placeable objects

An object is a manifest in `src/data/objects/*.json`, flat enough that a script
— or a vision model captioning a bought pack — can generate one correctly:

```json
{
  "id": "STREET_TREE",
  "label": "Street Tree",
  "category": "nature",
  "tilesWide": 1,
  "tilesTall": 2,
  "backgroundTiles": 1,
  "solid": true,
  "colorEditable": false,
  "tiles": { "default": ["tree_canopy", "tree_trunk"] }
}
```

| Field | What it does |
| --- | --- |
| `tilesWide` / `tilesTall` | Image footprint in grid cells |
| `backgroundTiles` | Rows at the **top** that are purely visual |
| `solid` | Whether the footprint blocks movement |
| `colorEditable` | Whether a runtime hue shift is offered |
| `tiles` | Named variants; a simple item has only `default` |

`tiles` holds tile *names*, resolved against the generated
`street.tiles.json`, so a manifest never hard-codes a bare index.

**On `backgroundTiles`.** The brief describes it as rows hanging *below* the
footprint, which contradicts its own example of a bookcase standing on one tile
and drawing three high. Rows-at-the-top is the reading that matches how
top-down art is drawn, and is what is implemented: a tree's canopy is a
background row, its trunk is the footprint, and it blocks at the trunk only.
With that layout the footprint bottom and the image bottom coincide, so
`backgroundTiles` governs collision rather than `zY`.

Maps place objects through an object layer whose `type` names a manifest id.
The map generator no longer paints props into tile layers.

## Recolouring

`colorEditable` objects can take a `hueShift` property, applied as a real HSL
rotation over the pixels and cached as `<key>@<degrees>`. Forty objects sharing
eight angles cost eight textures. See `src/utils/hue.ts`.

**Characters do not use it.** The brief recommends a runtime hue shift on the
character draw call for unlimited variety at zero cost, and that advice is
unsafe here: rotating the whole sprite drags skin and hair round the colour
wheel with the clothing, which at 300 degrees turns a brown-skinned character
magenta. Since the rig stores *semantic cells* rather than colours, an explicit
palette is one entry in `generate-art.mjs` and keeps skin, hair and clothing
independent. Eight palettes ship today; a ninth is five hex codes.

Hue rotation stays for objects, where `colorEditable` already marks the things
it is safe on — fabric and painted metal, never wood grain, glass or skin.

## Validation

Two scripts run before every build, covering what TypeScript cannot:

- `scripts/validate-maps.mjs` — tile size, orientation, required layers, layer
  taxonomy and order, hidden collision stencil, spawn objects, tileset name
  matching, placed-object types.
- `scripts/validate-content.ts` — dialogue graph integrity, quest and district
  references, NPC tiers, and object manifests: footprint arithmetic, tile
  names, variant lengths, and solid objects left with no footprint.

## Importing a bought pack

Not built, because there is no pack. When one arrives, the brief's stages 1 to
4 become worth building, roughly in this order:

1. **Record attribution first**, in `CREDITS.md`, on the day of download.
2. **Detector** — flood-fill connected components, snap boxes to the 32 px
   grid, centre horizontally and **bottom-align vertically**. Bottom alignment
   is not symmetric with centring; getting it wrong floats every object half a
   tile above the floor.
3. **Box review editor** — one HTML file, no framework. Touching sprites merge
   under flood fill and there is no clever fix; correct them by hand.
4. **Vision captioning** — crop each box, ask a model for name, label and
   category. Enumerate the categories in the prompt, store results as
   `suggested*` so a rerun cannot clobber human corrections, and treat every
   boolean as a first draft: a model can see that something is a chair, but not
   whether chairs are walkable in this game.

Intermediate JSON belongs in `scripts/.work/` and in `.gitignore`. Keep the
source sheet in the repo — a convention change means re-running the pipeline.
These tools are scaffolding; deleting them once a pack is imported is fine.

## Relationship to the source brief

Adapted from a playbook reconstructed from
[pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) commit
`28c4e16`. Adopted: the core principle, computed depth sorting, per-item flat
manifests, one template plus N palettes, rigid positional frame grids,
attribution-on-arrival, and levels as plain data. Adapted: tile and frame
sizes, `backgroundTiles` semantics, left-facing frames, and character
recolouring. Deferred: detection, captioning and the review editors, which
solve a problem generation does not have.
