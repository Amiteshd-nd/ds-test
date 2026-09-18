# file-compressor

**Adaptive PDF compression with a perceptual quality gate.** Drop a PDF in; it comes
back as the smallest file that still passes a fidelity check on every page. The whole
pipeline — parsing, encoding, scoring, rendering — runs in the browser tab. Nothing is
uploaded.

```bash
pnpm --filter file-compressor dev     # http://localhost:6179
```

`dev` runs [`dev.mjs`](dev.mjs), which copies pdf.js's worker, standard fonts and
CMaps into `public/`, bundles the compression worker, and then starts Next — the hub
starts the package the same way, so neither path can skip a build step.

Built from [`pdf-compressor-prd.md`](#what-came-from-the-prd-and-what-did-not). The
short version of the idea:

> Every mainstream compressor applies one global JPEG quality and one target DPI to
> every image and never looks at its own output. This one compresses each image under a
> closed loop — encode, decode, score against the original, reject anything below the
> floor — and keeps the most aggressive result the gate permits.

---

## How it works

Six stages. One through four are lossless and run in every mode, including Lossless.
Stage five is the only one that can lose information, and it is the one the gate guards.

| Stage | What it does | Where |
| --- | --- | --- |
| 1 · Ingest and triage | Object graph, byte budget, image inventory with effective DPI, refusals | [`core/pdf/inventory.ts`](src/core/pdf/inventory.ts), [`core/pdf/ctm.ts`](src/core/pdf/ctm.ts) |
| 2 · Structure | Garbage-collect dead objects, merge duplicates, re-deflate at max effort, object streams | [`core/pdf/structural.ts`](src/core/pdf/structural.ts) |
| 3 · Fonts | Merge duplicate font programs (see the gap below) | [`core/pdf/fonts.ts`](src/core/pdf/fonts.ts) |
| 4 · Strip | Thumbnails, identifying metadata, optional JavaScript and attachments | [`core/pdf/strip.ts`](src/core/pdf/strip.ts) |
| 5 · Images | Classify, route by class, search under the gate | [`core/pdf/images.ts`](src/core/pdf/images.ts), [`core/search/gate.ts`](src/core/search/gate.ts) |
| 6 · Validate | Opens, page count, renders, text extraction, per-page scores | [`core/pdf/validate.ts`](src/core/pdf/validate.ts) |

### The loop

For each image: classify it from its pixels (not its declared colour space), resolve its
effective DPI by walking the content stream's transformation matrix, downsample first if
the page cannot show the resolution it carries, then search for the lowest quality that
still clears the floor — encoding, decoding, and scoring each candidate. A candidate is
accepted only if it passes **and** is smaller than the original stream.

Three things keep that search to two or three cycles instead of six: a predictive seed
from cheap image features, an early exit when resolution alone is the win, and a
content-addressed cache so the same logo on 200 pages is searched once.

### The floors

| Mode | Per-image | Per-page | For |
| --- | --- | --- | --- |
| Lossless | — | — | Legal, medical, archival |
| Visually Lossless | 90 | 92 | Documents with photos |
| Balanced | 78 | 82 | Email attachments |
| Aggressive | 62 | 68 | Bulk scans, archive hygiene |

The page floor is stricter than the image floor on purpose: an image that scores 90 alone
can still look wrong next to crisp vector text. **The page check governs the final
accept** — if the worst page falls below its mode's floor, the job falls back to the
lossless-only result rather than delivering something that broke the promise.

### The 80% gate

A large ratio is ambiguous: it can mean the source was bloated or that we destroyed
something. So when a file shrinks by more than 80%, the ratio decides *whether* to speak
and the quality evidence decides *how*:

- **no page below 90** → a confident notice, non-blocking. The saving was real and free.
- **any page below 90** → a blocking choice, with the worst page shown at 100% on its
  worst region, and both files — aggressive and conservative — already built so the
  choice is between two real outputs rather than an offer to re-run.

The second branch also fires on its own, whatever the ratio. A 60% reduction that wrecked
one page deserves the same interruption.

---

## Layout

```
src/
├── core/              # the pipeline. No React, no DOM assumptions beyond canvas.
│   ├── pipeline.ts    # stage order + the two invariants (floor, never-broken)
│   ├── modes.ts       # the fidelity floors — the product, in 40 lines
│   ├── quality/       # the perceptual metric, image features, resampling
│   ├── search/        # the closed loop
│   └── pdf/           # object graph, CTM walk, codecs, render, validate
├── worker/            # the pipeline runs here; main-thread fallback included
├── components/        # analysis, progress, gate, comparison viewer, results
└── test/              # unit tests + an end-to-end run on a generated fixture
scripts/
├── build-worker.mjs   # esbuild -> public/compress-worker.js (see below)
├── copy-pdfjs-worker.mjs
└── fixture.mjs        # the test document, as a function
```

```bash
pnpm --filter file-compressor test        # 44 tests, including the end-to-end run
pnpm --filter file-compressor typecheck
pnpm --filter file-compressor fixture     # writes fixture.pdf to try by hand
pnpm --filter file-compressor worker      # rebuild the worker bundle on its own
```

The end-to-end test is the seed of the benchmark harness the PRD asks for: it builds a
document whose properties are known, runs the real modules over it, and asserts the
invariants that must never break. It runs under Node with the same production code, using
[`@napi-rs/canvas`](src/test/support/browser-shims.ts) for the three browser APIs the
pipeline touches.

---

## What came from the PRD, and what did not

This is a browser-only build — the PRD's §10 client-side path, chosen over its §9 server
stack. That decision has consequences, and pretending otherwise would be the same failure
the product is designed to prevent.

### Substituted, and why

| PRD asks for | This build uses | Consequence |
| --- | --- | --- |
| SSIMULACRA2 (libjxl) | Multi-scale SSIM in an opponent colour space, mapped onto the SSIMULACRA2 scale ([`quality/score.ts`](src/core/quality/score.ts)) | The floors keep their meaning, but the mapping is a curve fit through the JPEG ladder, not a metric calibrated against human judgement |
| MozJPEG | The platform's JPEG encoder via `OffscreenCanvas` | No trellis quantisation, no progressive scans: ~5–15% larger at equal quality |
| PyMuPDF for rendering | pdf.js | Apache 2.0 instead of AGPL, so the PRD's week-one licensing question does not arise |
| LightGBM seed model | A closed-form predictor over the same features ([`quality/features.ts`](src/core/quality/features.ts)) | Lands near the answer on typical content; on unusual content the search hits its five-cycle cap |
| pikepdf / qpdf | pdf-lib | Less tolerant of malformed files; a file pdf-lib cannot parse is refused rather than mangled |

### Not implemented

- **Glyph subsetting (FR-3.1).** Duplicate font programs are merged, but glyphs are not
  cut. A subsetter that does not provably carry `ToUnicode` and encoding differences
  produces a file that looks perfect and cannot be copied out of or read by a screen
  reader — invisible in a pixel diff, which is exactly why FR-6.2 is a hard gate here.
  Shipping an approximation of `fontTools.subset` would be the wrong trade in a product
  whose premise is not damaging files silently. The stage reports the bytes it left.
- **JBIG2 and CCITT G4.** No encoder in the browser, and lossy JBIG2 symbol mode is the
  PRD's own critical risk. Bilevel scans take the 1-bit Flate path instead, which is a
  large win over 8-bit but not what a real JBIG2 encoder would do.
- **JPEG 2000, JBIG2 and CCITT *decoding*.** A codec we cannot decode is a codec we
  cannot score, so those streams are left exactly as they are.
- **Linearisation (FR-1.3).** pdf-lib cannot re-linearise; a linearised input produces a
  non-linearised output, and the result says so.
- **Server-side everything**: the API, batch policies, Temporal, webhooks, the audit log,
  the 500-document corpus and the nightly quality-vs-size curve.

### Known limits

- Pages are scored at 96 DPI — screen viewing size. Detail finer than that is judged by
  the **image-level** gate, which compares at the image's native resolution; that is what
  protects print detail when a 600 DPI photo is downsampled.
- Practical ceiling around 50 MB, per the PRD's own note on browser memory.
- The search is capped at five encode-and-score cycles per image.

---

## Notes for whoever works on this next

- **The invariants live in [`pipeline.ts`](src/core/pipeline.ts)**, not in the stages. If
  you add a stage, the floor check and the validation fallback still govern it.
- **`modes.ts` is the product.** Changing a floor changes what the tool promises; changing
  a codec does not.
- **Nothing below `core/` imports React or Next.** That is what lets the end-to-end test
  drive the real pipeline under Node.
- **The worker is bundled by esbuild, not by Next.** Turbopack resolves
  `new Worker(new URL("./x.ts", import.meta.url))` to a *static asset* — it copied the
  raw TypeScript into `.next/static/media` and handed the browser a `.ts` file to
  execute. The worker never started and every job quietly ran on the main thread
  instead. [`scripts/build-worker.mjs`](scripts/build-worker.mjs) builds
  `public/compress-worker.js`, the client handshakes with it before trusting it, and
  [`test/worker-bundle.test.ts`](src/test/worker-bundle.test.ts) loads the shipped
  artifact and makes it answer, so that failure cannot come back silently.
- **The render check earns its keep.** During development a reference-rewriting bug made
  page 2 of a multi-page file render blank while the file stayed structurally valid and
  its text still extracted. Only FR-6.1's render-every-page check caught it.
- **`public/` is generated.** The pdf.js assets and the worker bundle are copied and
  built on dev/build start, and none of it is checked in.
