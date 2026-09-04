# Gully — Phases 1 to 5

**Phase 1 — the map foundation.** One Bengaluru layout, drawn at **true width**, with a
queryable segment graph and an honest count of how much of that width anybody has
actually checked.

**Phase 2 — report capture.** A report in under four seconds, one thumb: camera, voice
or a one-tap *road is clear*. Classification, snapping and redaction all happen on the
device, and every report survives a dead network.

**Phase 3 — state engine and the decide panel.** Reports fold into blockage events with
corroboration and type-specific decay; the panel turns those into a choice between the
two or three ways you actually leave, led by cause rather than delay.

**Phase 4 — forecast and the incumbent comparison.** Rhythm aggregates make the app
useful at zero live reports; routing excludes what is blocked and penalises what is
tight; and the comparison screen puts Gully's answer next to a navigation app's.

**Phase 5 — the live spine, in code.** The BWSSB ingest, official-source events and the
pilot instrumentation are built. The pilot itself — one RWA, forty users, four weeks —
is field work, not code.

Anything needing a person — a phone in the field, a trained model, server keys — is in
[MANUAL.md](MANUAL.md).

**Pilot area:** Kaggadasapura, CV Raman Nagar — a tanker-dependent residential grid.
61 segments, 3.4 km of road.

---

## Run

```bash
pnpm --filter gully dev
```

→ http://localhost:6175 (or hit **Play** on the Gully card in the repo hub, `pnpm dev`).

## Refresh the data

The OSM pull is committed, not fetched at runtime — a demo that dies when Overpass is
busy is not a demo. To rebuild it:

```bash
npm run data --prefix packages/gully
```

That runs two scripts in order:

| Script | What it does | Output |
|---|---|---|
| `npm run fetch` | One Overpass query for the pilot polygon, falling through three mirrors | `data/raw-osm.json` |
| `npm run build:segments` | Splits ways at junctions, resolves width, derives tanker fit, asserts the graph | `data/segments.geojson`, `data/render-scale.json` |

Move the pilot by editing `PILOT_RING` in [`pilot.config.ts`](pilot.config.ts) — draw it at
[geojson.io](https://geojson.io) — then re-run both. The build warns if the result falls
outside the 40–120 segment target.

## Width resolution

Every segment gets a width and, more importantly, a record of where that number came from.

| Precedence | Source | `width_source` | `width_conf` |
|---|---|---|---|
| 1 | `data/survey-widths.csv`, matched by segment id | `survey` | 0.95 |
| 2 | OSM `width` tag (`4`, `4 m`, `13'`, `15 ft` all parse) | `osm_tag` | 0.85 |
| 3 | OSM `est_width` tag | `osm_est` | 0.60 |
| 4 | `lanes` × 3.0 m, plus 1.5 m if `parking:*` is tagged | `inferred_lanes` | 0.40 |
| 5 | Highway-class default (residential 6, service 4, …) | `class_default` | 0.20 |

`data/survey-widths.csv` is the Phase 0 field survey's landing place. The pipeline works
with it empty — which is the current state, and the reason the stat line reads
*0 surveyed*. That zero is the point.

## Tanker fit

```
tanker_gap_m = width_m − 2.5          # a 12,000 L tanker is ~2.5 m across
blocked   if one lane and one way, or gap < 2.2 m
squeeze   if gap < 4.2 m
clear     otherwise
```

2.2 m is not invented: it is the width below which OSRM's own car profile refuses to
route. Borrowing the router's constant keeps the UI and the eventual routing consistent.

## True width on screen

`line-width` is expressed in metres, not pixels. `build-segments.ts` computes metres per
screen pixel at the pilot's centre latitude for zooms 14–20 and writes them to
`data/render-scale.json`; the client divides each segment's real width by those constants
inside a base-2 `interpolate` on `["zoom"]`, which is exact between stops because
metres-per-pixel halves each zoom level.

Two constants matter and both are easy to get wrong:

- **MapLibre renders 512 px tiles**, so its zoom-0 resolution is `40075016.686 / 512`,
  not the familiar 256-px `156543.03392`. Use the latter and every road draws at exactly
  half its real width — which looks perfectly plausible until you hold it against the
  scale bar.
- **`["zoom"]` may only be the direct input of a top-level `interpolate`.** The
  minimum-pixel clamp therefore lives inside each stop, not wrapped around the whole
  expression; wrap it and MapLibre drops the layer without throwing.

Verified against `map.unproject()` at zooms 16, 18 and 19: 0.1 % agreement, the residual
being spherical-vs-Mercator in the check itself.

To re-check in the browser console:

```js
const m = window.gully.map, c = m.getContainer().getBoundingClientRect();
const a = m.unproject([c.width / 2 - 100, c.height / 2]);
const b = m.unproject([c.width / 2 + 100, c.height / 2]);
// distance(a, b) / 200 must match the stop for m.getZoom() in data/render-scale.json
```

## The graph assertion

`build-segments.ts` fails loudly if any segment endpoint is a **floating stub** — a
terminal that dies within 5 m of another segment without joining it. Endpoints that are
genuine cul-de-sacs, or that were cut where the pilot polygon ends, are counted and
reported rather than treated as errors. Broken topology here would quietly break routing
in Phase 4, so it is caught at build time instead.

## Interface

- **Plain** — road surface over casing, both in metres.
- **Width source** — recoloured by provenance, fainter as confidence drops. The stat line
  above the map is generated from the data, and is the measurement of the gap the whole
  product exists to close.
- **Tanker fit** — recoloured by what a 2.5 m tanker would leave behind.
- Click a segment, or focus the map and use <kbd>←</kbd> / <kbd>→</kbd> to walk the graph
  through the segments joined at each end. <kbd>↑</kbd> / <kbd>↓</kbd> step through every
  segment in order, so nothing is unreachable where the polygon edge cuts the graph into
  pieces. <kbd>Esc</kbd> clears.
- Under 900 px the inspector becomes a bottom sheet.

---

# Phase 2 — report capture

## The four-second path

Shutter → the phone works out *what* and *where* → one chip sends it. Nothing in that
chain touches the network, which is the only way four seconds is achievable on a street
with one bar of signal.

| Step | Where it runs | Module |
|---|---|---|
| Classify the photo | on device, TF.js | [`src/report/classify.ts`](src/report/classify.ts) |
| Snap the fix to a segment | on device | [`src/report/snap.ts`](src/report/snap.ts) |
| Blur faces and plates | on device, before encoding | [`src/report/redact.ts`](src/report/redact.ts) |
| Store | IndexedDB, sync later | [`src/report/store.ts`](src/report/store.ts) |

Three entry points, all one tap from the map: **Report a blockage**, **Road is clear**,
and **On this phone** (the local queue).

## Snapping

Distance alone picks the wrong road on a layout grid. A GPS fix in a built-up layout
sits 10–20 m off — wider than the roads themselves — so standing at a corner, the
nearest centreline is routinely the cross you are *not* on.

So distance picks the shortlist and heading breaks the tie: everything within 14 m of
the nearest candidate is live, and if the reporter's heading agrees with exactly one of
them, that one wins. Exactly one — two parallel candidates both agree, and then heading
tells you nothing.

`ST_LineLocatePoint` is ported to [`src/report/geo.ts`](src/report/geo.ts) rather than
called in Postgres. Same maths, no round trip.

```bash
npm run eval:snap
```

Measures against `data/snap-ground-truth.csv`. That file needs 40 hand-labelled field
fixes for the ≥90% exit criterion — see MANUAL.md. With no labels it runs a synthetic
self-check instead, which catches a flipped bearing or a broken projection but is
explicitly **not** the criterion: on this grid, stepping 7 m sideways off a 2 m stub
genuinely puts you nearer a different road, and the snap is right to say so.

## What the app will not claim

- **No classifier, no confidence.** With no model present the send chip reads
  *no classifier on this phone yet — check this is right* and reports a confidence of
  exactly zero. It never invents a number.
- **No complete redaction, no upload.** A photo leaves the device only when both the
  face and plate detectors have actually run. There is no browser API for plates, so
  today the photo stays local on every device and the sheet says so in those words.
- **Negative reports cost less than positive ones.** *Road is clear* is one tap with no
  confirmation step. Systems that make the negative report expensive fill up with
  blockages that cleared an hour ago.

## The safety gate

Above ~8 km/h the shutter is replaced by a red banner and the voice path. PRD §9 commits
to stopped-only capture; a rider should never be choosing between a report and the road.

## Timing

Every report stores milliseconds from shutter press — or first spoken word, or the clear
tap — to the moment it reaches the queue. **On this phone** shows the running median
against the 4.0 s target. The number has to come off a real mid-range Android to mean
anything (MANUAL.md §3).

## Passive capture

Specified, deliberately not built: [`docs/passive-capture-spec.md`](docs/passive-capture-spec.md).
It needs a working classifier, a native shell the mobile web cannot provide, and a
battery budget nobody has measured yet.

## Server

Optional. [`supabase/0001_reports.sql`](supabase/0001_reports.sql) creates the `reports`
table with anon-insert-only RLS. Without keys the app is local-only and complete.

---

# Phase 3 — state engine and the decide panel

## The engine

[`src/state/engine.ts`](src/state/engine.ts) folds reports into events. Pure and total:
no clock of its own, no storage, no DOM. `now` is a parameter, because a state machine
you cannot wind forward is one you cannot test.

| Rule | PRD §7 |
|---|---|
| 1 report | `possible` |
| 2 **independent** reports within 8 min | `confirmed` |
| past the type's decay window | `expired` |
| 1 clear from a weighted reporter | `cleared`, immediately |

Two places the implementation reasons past the brief:

- **A confirmed event is not silently expired.** It is held open past p90, flagged
  `awaiting_recheck`, and the panel asks nearby users. Expiring somebody's corroborated
  report behind their back is how a reporting product teaches people it is not
  listening. An unanswered ask cannot hold it open forever, so a grace of two dwells
  bounds it — another placeholder.
- **A recheck is a real report.** Answering *still there* files an obstruction report and
  restarts the dwell clock; *it has gone* files a clear. Neither pokes state directly.

`awaiting_recheck` is a derived flag, not a fifth state — PRD §6 lists exactly four and
this does not add one.

## Placeholders

**Every number in [`src/state/priors.ts`](src/state/priors.ts) is a placeholder**, and
they are quarantined in that one file for exactly that reason. Decay constants are the
PRD's own estimates; p50 is interpolated at 0.55 × p90; vehicle widths beyond
tanker/mixer/lorry are guesses.

While `PRIORS_ARE_PLACEHOLDERS` is true the panel carries a banner saying the clearing
times are estimates rather than measurements. The decide panel's entire argument is
cause **and duration** — a fabricated duration presented as fact is worse than no
duration at all. Phase 0 flips the flag.

## The panel

Rows, not a map, because Meena is choosing between her exits rather than reading
geometry. Every row answers in the same order:

```
cause  ->  duration  ->  consequence
```

That order is the argument. Navigation apps lead with delay and never state a cause,
which collapses "tanker, gone by 08:37" and "permanent bottleneck" into one orange line.

Uncertainty ships as the **evidence variant** — no confidence tier, no range, just what
is known: how many reports, from how many *people*, and how often this road has carried
one before. The two rejected representations and the reasoning are in
[`docs/uncertainty-variants.md`](docs/uncertainty-variants.md), including what would
falsify the choice.

Two states get explicit language rather than silence: *whether anyone has looked is
unknown* when there are no reports, and *nobody has checked since* when an event has
outlived its prediction. A blank row would read as "clear", and the app cannot tell a
clear road from one nobody has walked down.

**Exits** are PRD §6 `ui_stretches`, kept on the device. Labels are directional
("2nd Cross east", "South-east exit") because most roads in a layout are unnamed in OSM,
and three rows reading "unnamed service off Kaggadasapura Main Road" is the same row
printed three times, not a choice.

## En route

[`src/decide/enroute.ts`](src/decide/enroute.ts) — audio first, zero interaction. Ravi is
helmeted with both hands on the bars, so the warning is spoken and nothing on the card
can be pressed. Each event is announced once; a warning that repeats becomes noise, and
noise gets the app muted.

## Demo data

Corroboration needs two people, and one device produces one `reporter_id`, so
`confirmed` is unreachable locally. The **Demo data** toggle in the panel merges a
fabricated report history covering every state the engine can reach. It is never written
to storage, every reporter id starts with `demo-`, and affected rows are marked
*demo data* — fabricated data that is not labelled as fabricated is a lie with a
timestamp.

---

# Phase 4 — forecast and comparison

## Rhythm

[`src/rhythm/aggregate.ts`](src/rhythm/aggregate.ts) folds closed events into
`segment x day-of-week x 15-minute bucket -> p_blocked`. This is the cold-start answer:
tanker movement is semi-deterministic — same block, same weekday, same rough slot — so
the past is a usable prior when nobody has reported anything today.

Three rules keep it from overclaiming:

- **Laplace smoothing**, so one observation on one Tuesday cannot read as 100%.
- **Suppressed below 5 days** (PRD §7). A thin cell says nothing rather than something
  confidently wrong.
- **Only closed events count.** Folding a live event in early would let this morning's
  tanker inflate this morning's own forecast.

The heat layer paints unknown slots the casing grey, never green — *nobody has looked*
and *usually clear* are different answers, and a heat map that conflates them is
claiming coverage it does not have. On the pilot data today that means most of the
layout is grey, which is the honest picture.

**Leaving later** in the decide panel swaps live state for the forecast and states a
rate, not a prediction: *"Blocked on 55% of Fridays around 08:15 — 5 of 9 days seen."*
A bare "likely blocked" would be the confidence tier again, rejected for the same
reason.

## Routing

PRD §5 chooses Valhalla with `exclude_polygons`, and that is right for a product that
routes beyond the pilot. For a 61-segment layout it needs a server, an OSM extract and
a tile build before anything moves on screen — so the default is
[`src/route/graph.ts`](src/route/graph.ts), a Dijkstra router over our own segments, and
[Valhalla](src/route/valhalla.ts) is an optional upgrade behind `VITE_VALHALLA_URL`.

The cost model is the point, and it is verified:

| | behaviour | measured |
|---|---|---|
| `blocked` | removed from the graph | route went 350 m → 362 m and avoided it |
| `squeeze` | kept, costed higher | same 350 m road, cost 701 → 709 |

A squeeze penalty has to be finite. An infinite one is an exclusion in disguise, and
PRD §7 is explicit that a squeeze is not excluded.

Origins are resolved *against the destination*: a pilot polygon cuts roads at its edge,
so the graph is several components, and a fixed "home" in the wrong one makes every
route look blocked when it is really just unconnected data. The panel distinguishes
those two nothings in words.

## The comparison

[`src/compare/panel.ts`](src/compare/panel.ts). Same moment, same two points:

```
a navigation app   9 min · heavy traffic
Gully              Water tanker since 08:15 · usually clears by 08:37
                   1.5 m gap. A car cannot pass.
```

The argument is not that the route is better — on a 400 m layout it is often the same
road. It is that one answer is a number to accept and the other is a decision you can
make. Google Routes is **display-only**: fetched, rendered, dropped. Nothing from it is
stored and nothing derived from it reaches the segments table (PRD §9), because the
whole road graph is OSM precisely so the dataset stays publishable.

Without a key the screen still renders, with the incumbent side saying what it *would*
show. The argument is about the shape of the two answers and survives the absence of a
live one.

```bash
npm run eval:forecast
```

Brier score against a held-out week, versus the "always clear" baseline PRD §7 names.
The split is by time, never at random — a random split leaks this morning's tanker into
the model asked to predict it. Needs `data/reports-export.json`; see MANUAL.md.

---

# Phase 5 — the live spine

**Built:** [`src/official/bwssb.ts`](src/official/bwssb.ts) watches a Sanchari Cauvery
feed, and a tracked tanker standing over 4 minutes on a pilot segment raises an
`official` report. Those skip corroboration entirely — the vehicle is reporting its own
position, so there is nobody to corroborate with. The engine confirms them on arrival.

What the spine buys is the cold start: on day one of a pilot the map is empty, and an
empty map teaches forty seeded users that the app does not work.

**Built:** pilot instrumentation in [`src/metrics.ts`](src/metrics.ts), shown at the
bottom of *On this phone*. **Decision-changed rate** leads because it is the only one
that decides whether the product is worth continuing. "Time saved" is deliberately not
measured — PRD §7 rules it out, and claiming it reads as naive.

**Not built, and not buildable here:** there is no public, documented Sanchari Cauvery
API — access is a conversation with BWSSB. And the pilot is one RWA, one WhatsApp
group, forty seeded users and four weeks of field work.

---

## Still open

Phase 0's field survey, which every placeholder in this repo is waiting on, and the
manual steps in [MANUAL.md](MANUAL.md).

## Known noise

The Positron basemap logs three *"Expected value to be of type number, but found null"*
warnings on load. They come from the basemap style itself: re-running our own paint
mutations produces none, and adding a layer with an identical `["get", …]` width
expression produces none.
