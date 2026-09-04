# Manual steps — Gully Phases 2 to 5

Everything in this file needs a human. Some of it needs a human standing in
Kaggadasapura; some needs credentials I should not create on your behalf. The
code is written and runs without any of it — what you get without these steps is
a fully working capture flow that keeps every report on the phone, does not
classify photographs, and does not upload them.

Ordered by what unblocks the most.

---

## 1. Test the capture flow on a real phone

**Why it needs you:** camera, GPS and compass are all blocked in the sandboxed
browser I verify in, and none of them exist on a laptop in the right place. I
have verified the flow with those paths stubbed — the fallbacks, the snapping,
the queue, the sheet, the one-tap clear. The camera, compass and GPS paths
themselves are unverified on hardware.

`getUserMedia` and `geolocation` need a **secure context**. `localhost` counts;
`http://192.168.x.x:6175` does not, so the plain LAN address will silently give
you no camera. Two ways round it:

**Option A — tunnel (works on any phone, no flags)**

```bash
pnpm --filter gully dev
```

then, in a second terminal:

```bash
npx cloudflared tunnel --url http://localhost:6175
```

Open the `https://…trycloudflare.com` URL it prints, on the phone.

**Option B — LAN plus a Chrome flag (Android only, faster to repeat)**

```bash
pnpm --filter gully dev:lan
```

On the Android phone open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
add `http://<your-laptop-ip>:6175`, and restart Chrome.

**What to check, in this order:**

- [ ] The status line at the top names a road and a fix accuracy. If it says
      *Outside the pilot layout*, you are not in Kaggadasapura — the flow will
      fall back to the map centre and label the report *position simulated*.
- [ ] Shutter → the confirm sheet appears with a road name and a width.
- [ ] Walk while the screen is open: above ~8 km/h the shutter is replaced by the
      red **Moving — camera is off** banner. This is the PRD §9 safety gate.
- [ ] **Road is clear** on the map files a report in one tap, with no sheet.
- [ ] **Speak** → say "tanker on 3rd cross" → it should land on a 3rd Cross
      segment even if the nearest road is a different one.
- [ ] iOS only: the compass asks for permission the first time. Decline it and
      snapping still works — it just falls back to distance alone.

---

## 2. Label 40 snap fixes

**Why it needs you:** the Phase 2 exit criterion is ≥90% snap accuracy against
40 **hand-labelled** reports. Only a person standing on the road knows which road
they were standing on. I cannot synthesise this, and a synthetic substitute would
be measuring the code against itself.

1. Walk the layout with the capture screen open.
2. At each stop, read `lat`, `lng` and heading off the status line, and write down
   the segment id of the road you are **actually** on — tap the road on the map to
   read its id, which looks like `w119050741:2`.
3. Add a row to [`data/snap-ground-truth.csv`](data/snap-ground-truth.csv):

   ```
   12.98801,77.66934,84,w119050741:2,corner by the borewell
   ```

   Leave the heading column empty if the phone had no compass.
4. Aim for a mix: mid-block, at junctions, beside parallel crosses, and a few
   deliberately awkward ones. Junction fixes are where snapping actually fails.

Then:

```bash
npm run eval:snap --prefix packages/gully
```

Below 40 rows it reports without passing. At 40+ it passes or fails the criterion
outright. With no rows at all it runs a synthetic self-check — that check is a
regression guard for the geometry, **not** the exit criterion, and it is labelled
as such in the output.

> Segment ids change whenever `PILOT_RING` moves. Re-label if you move the polygon.

---

## 3. Measure capture-to-submit

**Why it needs you:** "under 4 s median on a mid-range Android" is a claim about a
device I do not have.

The app already instruments it. Every report stores milliseconds from shutter
press (or first spoken word, or the clear tap) to the moment it hits the queue.

- [ ] On the phone, take **at least 20** reports in the field, mixed camera and voice.
- [ ] Open **On this phone**. The header reads e.g. *20 reports · median 3.4 s capture to sent*.
- [ ] Record the phone model alongside the number. A median from a Pixel proves nothing
      about the phone Suresh actually has.

---

## 4. Train the classifier

**Why it needs you:** it needs Phase 0's photographs. There is no model in the
repo and there should not be one — the app reports `no classifier on this phone
yet` and shows a chip row instead, rather than inventing a confidence number.

**Collect.** During the Phase 0 survey, photograph every logged obstruction from
roughly where a rider would stand. Target ≥300 images per common class (tanker,
mixer, garbage, lorry), ≥100 for the rest, plus a `other` bucket of clear road.
Hold back 15% as a test set **by day, not at random** — same-morning frames are
near-duplicates and a random split will flatter the model badly.

**Train.** Fine-tune MobileNetV3-Small (ImageNet weights, unfreeze the last block),
224×224, light augmentation only — no horizontal flips that would put a tanker on
the wrong side of the road.

**Convert and install.**

```bash
pip install tensorflowjs
tensorflowjs_converter --input_format=keras_saved_model \
  path/to/saved_model packages/gully/public/models/obstruction
```

Then write `packages/gully/public/models/obstruction/model-card.json`:

```json
{
  "labels": ["tanker", "mixer", "garbage", "lorry", "construction", "event", "other"],
  "input_size": 224,
  "normalise": "-1-1",
  "trained_on": "Phase 0 survey, 2026-09-14 to 2026-09-27, 1,840 images",
  "top1_holdout": 0.88
}
```

- [ ] `normalise` **must** match your training pipeline. Getting it wrong does not
      error — it silently costs 20–30 points of top-1, which then looks like a bad
      model rather than a bad constant.
- [ ] Labels must be exactly those seven strings. Anything else falls back to `other`.
- [ ] Exit criterion: top-1 ≥85% on the held-out set. Put the number in the card.

Reload the app and the send chip will show a real percentage instead of the
fallback line.

---

## 5. Decide whether photos may leave the phone

**Why it needs you:** it is a policy call, and currently the answer is no.

The app will only upload a photo when **every** required detector has run: faces
*and* number plates. Faces use the browser's own `FaceDetector`, which exists on
Chrome for Android. There is no browser API for plates, so today `complete` is
false on every device and photos stay local — the sheet says so in plain words.

To change that, either:

- **Ship a plate detector.** Train one the same way as the classifier and place it
  at `public/models/plate/` with a `model-card.json`. `redact.ts` already treats
  its presence as the second half of the policy; wire its boxes into the same
  `mosaic()` call the face boxes use.
- **Or decide photos never upload.** Defensible, and arguably the better answer for
  a pilot: the report's value is in the type, the road and the timing, not the
  pixels. If you choose this, say so in the case study rather than leaving it
  looking like an unfinished feature.

- [ ] Pick one and write it down. Do not leave it ambiguous — the privacy claim in
      the write-up depends on which it is.

---

## 6. Turn on the server (optional)

**Why it needs you:** it needs an account and keys I will not create.

Reports queue on the phone and survive reloads with no server. Sync is only
needed when you want them off the device.

1. Create a Supabase project.
2. Run [`supabase/0001_reports.sql`](supabase/0001_reports.sql) in the SQL editor.
   It creates `reports` with anon-insert-only RLS — the anon key is public, so
   read access would publish every reporter's movements.
3. Create `packages/gully/.env.local`:

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

4. Restart the dev server. **On this phone** → **Sync now** stops saying
   *No server configured*.

- [ ] Confirm `.env.local` is not committed. `.gitignore` covers `node_modules` and
      `dist`; add `.env*.local` before you create it.

---

## 7. Extend the voice keywords

**Why it needs you:** I guessed at the Kannada and Hindi phrasings. You will hear
what people actually say, and it will not be what a dictionary suggests.

- [ ] During Phase 0, write down the exact words each interviewee uses for a water
      tanker, a mixer and a garbage truck — in whatever mix of languages they use.
- [ ] Add them to `KEYWORDS` in [`src/report/voice.ts`](src/report/voice.ts). The
      matcher is substring-based and transliteration-tolerant, so both
      `"ಟ್ಯಾಂಕರ್"` and `"tanker"` can sit in the same list.
- [ ] Web Speech is Chrome-only and needs a network connection. On a phone without
      it, the **Speak** button is disabled and the camera path still works.

---

## 8. Phase 3 — run the 5-user panel test

**Why it needs you:** the exit criterion is "the panel renders a decision in under 10 s
of eye time in a 5-user test". That needs five people and a stopwatch.

The mechanical half is already verified: every row carries a cause and either a duration
or an explicit "unknown", checked against the rendered DOM. The human half is yours.

- [ ] Five people, each with the panel loaded and **Demo data on**, and two or three
      exits already chosen for them.
- [ ] Ask one question: *"Which way would you leave, and why?"* Time from first look to
      spoken answer.
- [ ] Record whether they read the evidence line at all
      ("2 reports from 2 people · 23 past stops here"). This is the live bet — see
      [docs/uncertainty-variants.md](docs/uncertainty-variants.md) → "What would falsify
      this choice". If they skip it, the evidence variant is costing four lines for
      nothing and the confidence-tier variant gets cheaper.
- [ ] Record whether anyone treats "usually clears by 08:37" as a promise rather than a
      pattern. If they do, the wording is wrong whichever variant wins.

## 9. Phase 3 — seed the dwell priors

**Why it needs you:** it is the Phase 0 observation log, and it is what turns every
duration in the panel from an estimate into a measurement.

Right now [`src/state/priors.ts`](src/state/priors.ts) holds the PRD's own worked
estimates, `n = 0` throughout, and the panel says so in a banner above every row.

- [ ] From the Phase 0 log, compute p50 and p90 dwell minutes per obstruction type,
      bucketed by road width (narrow < 5 m, medium 5–8 m, wide > 8 m) and hour of day.
- [ ] Write `data/dwell-priors.csv` with
      `obstruction_type,width_bucket,hour_bucket,p50_min,p90_min,n`.
- [ ] Suppress any bucket below n = 5 — the same rule PRD §7 Phase 4 applies to rhythm.
      Fall back to the type-wide figure rather than showing a number built from two
      observations.
- [ ] Set `PRIORS_ARE_PLACEHOLDERS = false`. The banner disappears on its own.

Also worth measuring while you are in the log, because both are currently invented:

- [ ] The p50/p90 ratio. The code assumes 0.55.
- [ ] How long a confirmed obstruction should be held open awaiting a recheck. The code
      assumes two dwells (`RECHECK_GRACE_MULTIPLE`).

## 10. Carried over from Phase 0

- [ ] Fill [`data/survey-widths.csv`](data/survey-widths.csv) with tape
      measurements. Until then the stat line honestly reads *0 surveyed*, and
      48 of 61 segments carry a width nobody has checked.
- [ ] Seed `dwell_priors` from the observation log. Phase 3's decay constants
      (tanker 25 min, garbage 12 min, mixer 90 min) are currently PRD estimates,
      not measurements.

---

## 11. Phase 4 — a Google Routes key (optional)

**Why it needs you:** it needs a Google Cloud project with billing enabled, which I
will not create on your behalf.

The comparison screen works without it — the incumbent side says what it would show
instead of showing it — but the live version is the persuasive one.

1. Google Cloud console → enable **Routes API** → create an API key.
2. Restrict it to the Routes API, and to your origins. The key ships in the client
   bundle; an unrestricted key is a bill waiting to happen.
3. Add to `packages/gully/.env.local`:

   ```
   VITE_GOOGLE_ROUTES_KEY=<key>
   ```

- [ ] Confirm the comparison screen shows a real duration and colour band.
- [ ] Read [`src/compare/incumbent.ts`](src/compare/incumbent.ts) and satisfy yourself
      the response is only rendered, never stored. PRD §9 and Google's licence both
      depend on it, and it is the reason the road graph can stay publishable.

## 12. Phase 4 — Valhalla (optional)

**Why it needs you:** it is a Docker container and a multi-gigabyte OSM extract.

The built-in graph router covers the pilot and needs nothing. Valhalla is what the PRD
picks for the real product, and switching to it is worth doing before any claim that
routing works beyond the polygon.

```bash
mkdir -p valhalla/custom_files
curl -o valhalla/custom_files/bengaluru.osm.pbf   https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf
docker run -d --name valhalla -p 8002:8002   -v $PWD/valhalla/custom_files:/custom_files   ghcr.io/gis-ops/docker-valhalla/valhalla:latest
```

Tile building takes a while on a southern-zone extract. Then:

```
VITE_VALHALLA_URL=http://localhost:8002
```

- [ ] Confirm the comparison screen's footer changes from "the built-in graph router"
      to "Valhalla".
- [ ] Check `exclude_polygons` is actually honoured — block a segment and confirm the
      returned shape avoids it. The buffer maths is in
      [`src/route/valhalla.ts`](src/route/valhalla.ts) and a too-thin buffer lets
      Valhalla route straight through the gap.

## 13. Phase 4 — hold out a week

**Why it needs you:** the Brier criterion needs a week of real reports the aggregate
has never seen.

- [ ] Export the pilot's reports to `data/reports-export.json` as a JSON array of the
      report rows (the same shape *On this phone* holds).
- [ ] `npm run eval:forecast --prefix packages/gully`
- [ ] Exit criterion: the forecast Brier beats the "always clear" baseline. If it does
      not, the forecast is not worth showing yet — the script says so and exits
      non-zero.

The split is by time, not at random, and the script enforces that. Do not be tempted to
shuffle: same-morning slots are near-duplicates and a random split flatters the model
badly.

## 14. Phase 5 — BWSSB feed access

**Why it needs you:** there is no public, documented Sanchari Cauvery API. Getting one
is a conversation with BWSSB, not a fetch call.

[`src/official/bwssb.ts`](src/official/bwssb.ts) is written and inert. It expects a JSON
feed of `{vehicle_id, lat, lng, at}` — either a bare array or `{vehicles: [...]}` — and
raises an `official` report when a tracked tanker stands over 4 minutes on a pilot
segment.

- [ ] Ask BWSSB for read access to the Sanchari Cauvery vehicle feed, naming the pilot
      layout and the four-week window. Their own tracking is citizen-facing, so the
      data is already public in effect; the ask is for a machine-readable form of it.
- [ ] Translate their response shape to `TankerPing` inside `fetchFeed` if it differs.
      Everything downstream reads `TankerPing` and should not need changing.
- [ ] Set `VITE_BWSSB_URL` and confirm *On this phone* reports the spine as connected.
- [ ] Sanity-check the 4-minute threshold and the 25 m on-road radius against real
      pings before trusting them. Both are from the PRD and neither has been measured.

## 15. Phase 5 — run the pilot

**Why it needs you:** all of it. This is the part no amount of code substitutes for.

- [ ] One RWA, one WhatsApp group, 40 seeded users, four weeks.
- [ ] Turn the backend on first (§6). Corroboration is the core of Phase 3 and it does
      not exist on a single device.
- [ ] Instrument from day one. The metrics block at the bottom of *On this phone*
      computes them per device; the honest version of decision-changed rate is asking
      people which way they were about to go **before** they opened the panel. The
      counter is a proxy for that, not a replacement.
- [ ] Do not measure time saved. PRD §7 rules it out and it is right to — it needs a
      counterfactual nobody has.

---

## Deviations from the brief you should sign off on

Seven places where I did something other than what the PRD says. Each is a
judgement call, and each is easy to reverse.

1. **`source: 'tap'` is a new value.** PRD §6 lists `photo | voice | passive |
   official`. The one-tap clear report has neither a photo nor an utterance, and
   labelling it `photo` would poison any later analysis of classifier accuracy.
   Added to the type, the SQL check constraint, and the UI.

2. **"No form, no dropdown, ever" is honoured; a chip row is not.** With no
   classifier, the sheet cannot present a single confident chip. It presents the
   most likely type as the big send button and the six alternatives as a row of
   chips — every one of which sends in one tap. It is not a dropdown and it does
   not add a step, but it is more than the brief's single chip. When a model
   ships, the alternatives can move behind a "Not that?" tap if you prefer.

3. **Snapping runs on the device, not in PostGIS.** PRD §5 puts
   `ST_LineLocatePoint` in Postgres. Doing it on the phone is what makes a
   four-second capture possible on a street with no signal, and it is the same
   maths — `src/report/geo.ts` is a direct port. The SQL file keeps a commented
   `segments` table for when a later phase needs server-side snapping.

4. **A confirmed event is held open past its decay window, not expired.** PRD §7 says
   auto-expire but ask nearby users before expiring a confirmed event. Asking takes
   time, so the event has to survive the question — it is flagged `awaiting_recheck`
   and held for a grace of two dwells before lapsing anyway. `awaiting_recheck` is a
   derived flag rather than a fifth state, so PRD §6's four states are untouched. The
   grace multiple is a placeholder; see §9 above.

6. **Routing defaults to a built-in graph router, not Valhalla.** PRD §5 picks Valhalla
   with `exclude_polygons`. That needs a server and a tile build before anything moves
   on screen, so the default is Dijkstra over our own 61 segments — same cost model,
   same blocked/squeeze distinction, no dependencies — and Valhalla engages when
   `VITE_VALHALLA_URL` is set (§12). For a product whose argument is that width is the
   missing variable, routing on our own width data is arguably the better
   demonstration; for anything beyond the polygon it is not, and Valhalla should win.

7. **The comparison routes from the middle of the layout, not from a chosen home.**
   Picking a house on a map is its own flow and Phase 4 does not need it. The origin is
   the node nearest the layout centre *that can reach the destination* — resolved per
   destination, because the pilot polygon cuts the graph into components.

5. **The panel states a consequence, not a delay in minutes.** PRD §7 puts delay third
   in the hierarchy. A delay in minutes needs the Valhalla routing that arrives in
   Phase 4, so the third line currently reads "A car cannot pass" / "Bikes pass, cars
   queue" — derived from geometry, which is not uncertain. If you would rather the row
   held an empty delay slot until Phase 4 fills it, say so; I would argue against it.
