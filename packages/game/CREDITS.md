# Credits and asset provenance

Attribution is recorded when an asset arrives, not reconstructed later.
Working out which of three packs a sprite came from six months on is genuinely
unpleasant, so every asset in this package is accounted for below.

## Generated in this repository

| Asset | Source | Licence |
| --- | --- | --- |
| `src/assets/tilesets/street.png` | `scripts/generate-art.mjs` | Same as this repository |
| `src/assets/sprites/citizen*.png` | `scripts/generate-art.mjs` | Same as this repository |
| `src/assets/tilemaps/whitefield_street.tmj` | `scripts/generate-street-map.mjs` | Same as this repository |
| `public/pwa-*.png`, `public/favicon.png` | `scripts/generate-art.mjs` lineage | Same as this repository |

These are reproducible: rerunning `pnpm art` regenerates them byte-identically.
The generator, not the PNG, is the source of truth.

## Carried over from the reference project

Ported from the `v1.0` branch of
[`cityhunter-x-y-z/bt`](https://github.com/cityhunter-x-y-z/bt) (commit
`19899fd`), which is the earlier incarnation of this game:

| Asset | Notes |
| --- | --- |
| `src/assets/sprites/player.png` | 128x192 character sheet |
| `src/assets/tilesets/airport.png` and 7 others | Airport interior tilesets |
| `src/assets/tilemaps/airport_interior.tmj` | Tiled map referencing the above |

**Provenance unresolved.** That repository ships no `CREDITS.md` and no licence
file, and the tilesets' colour statistics — around 254,000 unique colours, with
roughly 1,000 inside a single 32x32 tile — indicate continuous-tone imagery
rather than hand-drawn pixel art. They were most likely generated or derived
rather than authored.

Two things follow, and both should be settled before any public release:

1. **Establish the origin.** If these came from a purchased or free pack, name
   it here with its licence and any required attribution. If they were
   generated, say so and record the tool.
2. **Treat them as placeholder until then.** The art pipeline was built so this
   is cheap: tilesets are discovered by filename, and maps reference tilesets
   by name, so replacing them is dropping in new PNGs and re-exporting the map.

## Third-party packs

None yet. When one is added, record it here on the day it is downloaded, with:
pack name, author, URL, licence, whether attribution is required, and whether
commercial use is permitted.
