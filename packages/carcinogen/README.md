# carcinogen

**Everything causes cancer. Not equally.** — 26 everyday exposures plotted against 13 cancer
sites in a colour-coded matrix, plus a scatter panel that separates *how sure we are* that
something causes cancer from *how much* it raises the risk.

The whole thing is one file: [`index.html`](index.html). No build step, no bundler, no
framework, no dependencies. Double-click it, or:

```bash
open packages/carcinogen/index.html
```

## Run it on a port

Only useful if you want it alongside the other projects in the hub — the page does not need
a server.

```bash
pnpm --filter carcinogen dev    # → http://localhost:6180
```

`serve.mjs` is a ~40-line dependency-free static server. It exists so the hub can start this
package the same way it starts the Vite and Next ones.

## What's in the file

| Part | Where |
| --- | --- |
| Data — `SITES`, `TIERS`, `LABELS`, 26 `ROWS` | top of the single `<script>` |
| Theme tokens (light / dark / `[data-theme]`) | top of the single `<style>` |
| Matrix | a real `<table>` — sticky row-header column, rotated column heads, three sort modes |
| Readout | `aria-live="polite"` region under the matrix |
| Certainty-vs-magnitude panel | hand-placed SVG, `viewBox="0 0 760 460"` |

### The 0–4 scale

Each cell's value fuses two things — how settled the evidence is and how large the effect is —
into one axis, because a single colour can only carry one dimension. That is an editorial
simplification, stated as such in the page footer; the scatter panel exists to pull the two
apart again. Values follow the broad consensus of IARC monographs, WCRF reviews and large
cohort studies, rounded hard.

### Editing the data

`v` arrays must be exactly 13 long and index-aligned to `SITES`. The script asserts this on
load and logs a console error naming the offending row — a short array would otherwise shift
every cell after it without any visible break.

## Constraints held

- One file, opens from `file://`, no external scripts, no API calls.
- The only outbound request is the Google Fonts stylesheet. Comment the `<link>` out and the
  page is still fully legible on `Georgia` / `Helvetica Neue`.
- No `localStorage` / `sessionStorage` / `IndexedDB`, no `<form>` elements.
- The page body never scrolls sideways — only the matrix's own `.scroller` does.
- ~35 KB, so it stays emailable.
