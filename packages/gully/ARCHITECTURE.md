# Architecture

A map for whoever edits this next. What each module owns, which rules are
load-bearing, and which trade-offs were made on purpose. The product reasoning
lives in the PRD and README; this is the engineering view.

## Shape

Vanilla TypeScript + Vite. No framework, no state library, no backend
required — deliberate for a pilot this size. The discipline that replaces the
framework: **pure core, thin shell.**

```
scripts/            build-time: Overpass fetch, segment build, eval harnesses
src/
  basemap.ts          Positron treatment + the palette
  segments/width.ts   width parsing + class defaults (tested)
  segments/geometry.ts    pilot mask, junction discs
  segments/obstructions.ts to-scale obstruction footprints + hatch swatch
  report/             capture: geo + snap (tested), voice (tested), sensors,
                      classify, redact, store (IndexedDB), capture UI, queue UI
  state/              engine (tested) — reports → events; priors (ALL PLACEHOLDERS); seed
  rhythm/aggregate.ts forecast aggregates (tested)
  route/              graph router (tested); valhalla adapter (optional)
  decide/             the decide panel, exits, en-route audio card
  compare/            incumbent comparison; Google Routes adapter (display-only)
  official/bwssb.ts   Phase 5 live-spine adapter (inert without a feed URL)
  metrics.ts          pilot instrumentation
  main.ts             composition root — the only file allowed to know everything
```

## The one rule

**Pure modules never touch the DOM, the clock, the network, or storage.**
`engine`, `snap`/`geo`, `aggregate`, `graph`, `voice`'s parsers, and
`segments/width` all take their inputs as parameters — including `now`. That is
what makes them testable (`npm test`, 68 tests) and what makes the decide panel
able to ask "what would 08:40 look like" without waiting for 08:40.

UI classes (`Capture`, `Decide`, `Compare`, `Queue`, `Enroute`) own DOM and
side effects, and receive the pure world through a context object constructed
in `main.ts`. If a change needs a pure module to import from `report/store`,
`maplibre-gl`, or anything with `import.meta.env`, the change is in the wrong
layer.

## Data flow

```
Overpass ──fetch──▶ raw-osm.json ──build:segments──▶ segments.geojson  (committed)
                                                     render-scale.json (committed)

capture / voice / official spine ──▶ store (IndexedDB) ─┐
demo seed (memory only, never stored) ──────────────────┤
                                                        ▼
                                          buildEvents(reports, {now, segments})
                                                        │
                              ┌─────────────────────────┼──────────────────┐
                              ▼                         ▼                  ▼
                        decide panel            buildRhythm (closed     route graph
                        (live events)           events only) → heat,    (blocked/squeeze
                                                forecast mode           sets per request)
```

`refoldEvents()` in `main.ts` is the single re-derivation point: reports in,
everything else recomputed from scratch. Nothing caches events or rhythm.
Rebuild-from-scratch is O(small) at pilot scale and eliminates the entire class
of incremental-cache bugs; if the pilot grows past ~10k reports, memoise on a
hash of the report set rather than mutating.

## Load-bearing invariants (each has a test)

- **Corroboration is people, not counts** — the confirm window is measured from
  the *first* report, and only a *different* reporter confirms.
- **A confirmed event is asked about before it expires**, and an unanswered ask
  lapses after `RECHECK_GRACE_MULTIPLE` dwells.
- **`official` reports confirm on arrival** — a vehicle reporting itself has
  nobody to corroborate with.
- **A squeeze is never an exclusion** — finite penalty, route still passable.
- **Rhythm counts only closed events** and suppresses cells under `MIN_DAYS`.
  Unknown must never render as clear.
- **Heading breaks a snap tie only when it selects exactly one candidate.**
- **MapLibre renders 512 px tiles** — the metres-per-pixel constant is
  `40075016.686 / 512 / 2^zoom`, and `["zoom"]` may only appear as the direct
  input of a top-level `interpolate` (violations are dropped *silently*).
- **`line-dasharray` is not data-driven.** An expression there is accepted and
  then ignored; split into filtered layers instead.
- **The mask must be darker than the ground it covers.** Filling it with the
  ground colour dims nothing — see `PALETTE.outside`.
- **Nothing from Google Routes is stored.** The road graph stays publishable
  because nothing Google-derived ever enters it.

## Honesty conventions

These are product decisions enforced in code; keep them when editing.

- Placeholders live in **one file** (`state/priors.ts`) behind
  `PRIORS_ARE_PLACEHOLDERS`, and the UI banners read from that flag.
- Fabricated demo data is memory-only, `demo-`-prefixed, and labelled in every
  row that shows it.
- Absence of data is worded as absence of *looking* ("whether anyone has looked
  is unknown"), never as safety.
- Confidence numbers are real or absent — `by: 'unavailable'` reports `conf: 0`,
  never an invented percentage.

## External services

All optional, all behind `VITE_*` env vars, all degrade in words rather than
silently: Supabase (sync), Google Routes (comparison), Valhalla (routing),
BWSSB (live spine). The app is complete with none of them configured.

## Known debts, in priority order

1. `main.ts` is a 500-line composition root. Acceptable while the shell is
   this thin; split by view the next time it grows.
2. `buildRhythm` recomputes a day×segment×bucket denominator on every fold
   (~300k set-inserts on 8 weeks of demo data). Fine at 30 s cadence; measure
   before touching.
3. UI classes render by `innerHTML` template strings with a local `esc()`.
   Consistent and simple, but escaping is per-call-site discipline — a
   templating helper would make it structural.
4. Camera/GPS/compass paths have never run on hardware (MANUAL.md §1).
5. No CI. `npm run check` (typecheck + tests + build) is the gate; wire it to
   a workflow when the repo gets one.
