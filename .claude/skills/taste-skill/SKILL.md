---
name: taste-skill
description: "Anti-slop frontend design skill for marketing-shaped surfaces — landing pages, portfolios, hero sections, editorial pages, and redesigns of any of those. Infers a design read from the brief, sets variance/motion/density dials, picks a real design system or a named aesthetic, and enforces a hard pre-flight check that bans the LLM tells (AI-purple gradients, three equal cards, Inter + slate-900, em-dashes in page copy, Jane Doe placeholders). Use when building or reworking a page that has to look like a person designed it, when asked to make something less generic or less AI-looking, or when a redesign needs an audit before anyone touches the CSS."
---

# tasteskill

> Vendored from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT,
> `skills/taste-skill/SKILL.md`, v2). The upstream document is ~1,200 lines; it is split
> verbatim across `references/` and this file is the front door. Nothing was rewritten —
> when this page and a reference disagree, the reference wins.

**Scope:** landing pages, portfolios, editorial pages, redesigns. **Not** dashboards, data
tables, or multi-step product UI — for those use `ui-ux-pro-max` instead.

Every rule in `references/` is **contextual**. None of it fires automatically. Read the
brief first, then pull only what fits.

---

## The loop

### 1. Declare the design read (before any code)

One line, out loud, every time:

> **"Reading this as: \<page kind> for \<audience>, with a \<vibe> language, leaning toward \<design system or aesthetic family>."**

Signals to read: page kind, the user's vibe words, reference URLs or products they named,
audience, brand assets that already exist, and quiet constraints (accessibility-first,
public-sector, regulated, kids). Constraints override aesthetic preference.

If the read genuinely diverges, ask **exactly one** question. If you can infer it, do not ask.

### 2. Set the three dials

```
DESIGN_VARIANCE: 8    1 = perfect symmetry      10 = artsy chaos
MOTION_INTENSITY: 6   1 = static                10 = cinematic / physics
VISUAL_DENSITY: 4     1 = art gallery / airy    10 = cockpit / packed data
```

Baseline is `8 / 6 / 4`. State the values you chose and why they follow from the design
read — silently using the baseline fails the pre-flight. Inference table and use-case
presets: `references/brief-dials-and-systems.md`.

### 3. Build

Pull the reference files the work actually needs (map below). One design system per
project. Motion isolated in client leaf components with real cleanup.

### 4. Run the pre-flight

`references/preflight.md` — every box, honestly. If one cannot be ticked, the page is
not done.

---

## Anti-default discipline (the part that gets skipped)

Do not reach for these. They are the LLM's defaults, and they are what "AI slop" means:

- AI-purple / indigo-violet gradients, centered hero over a dark mesh
- Three equal feature cards in a row
- Glassmorphism applied to everything
- Inter + `slate-900`, Fraunces or Instrument Serif as the "tasteful" serif
- Infinite-loop micro-animations with no state behind them
- `Jane Doe`, `Acme Inc`, "Trusted by" walls of plain text wordmarks
- Scroll cues, section-numbering eyebrows (`001 · Capabilities`), decorative dots,
  version footers (`v1.4.2`) on marketing pages

Three locks that hold for the whole page: **one theme** (no section flips to inverted
mid-page), **one accent color**, **one corner-radius system**.

**Em-dash ban.** Zero `—` and zero separator `–` in anything the visitor can see:
headlines, eyebrows, pills, buttons, body, quotes, attribution, captions, alt text. Use a
period, a comma, parentheses, a colon, or ` - `. Full rule: `references/dark-mode-and-ai-tells.md` §9.G.

> **Local note — the ban is about rendered page copy only.** It does not apply to this
> repo's prose: `CLAUDE.md`, `README.md`, commit messages, code comments, or anything in
> `.claude/`. Do not "fix" em-dashes in those.

---

## Reference map

Read on demand. Do not load all of these at once.

| Need | File |
| --- | --- |
| Dial inference, presets, brief → design system map, stack/icons/deps conventions | `references/brief-dials-and-systems.md` |
| Typography, color calibration, layout hard rules, images, content density, theme lock | `references/design-directives.md` |
| Sticky-stack / horizontal-pan / scroll-reveal skeletons, forbidden animations, perf + a11y guardrails | `references/motion-and-guardrails.md` |
| Dark mode protocol, the full AI-tell ban list, em-dash ban | `references/dark-mode-and-ai-tells.md` |
| Pattern vocabulary, redesign protocol (audit-first), block library contract | `references/vocabulary-redesign-blocks.md` |
| The pre-flight matrix | `references/preflight.md` |
| Install commands and canonical docs per design system (Material, Fluent, Carbon, Polaris, Primer, GOV.UK, USWDS, Radix, shadcn, Bootstrap) | `references/design-system-appendices.md` |

---

## How this fits the rest of the repo

Four design skills already live in `.claude/skills/`. They do not overlap as much as they
look like they do:

| Question | Skill |
| --- | --- |
| Does this page look templated? What is the design read? | **taste-skill** (here) |
| What are the correct tokens, a11y rules, chart types, stack idioms? | `ui-ux-pro-max` |
| Is this specific interaction's motion any good? Build or audit it. | `design-motion-principles` |
| What does this already-rendered page actually paint? | `design-md-extractor` |
| Which visual direction, by reference? | `design-md-gallery` |

Typical order for a new surface: **`design-md-gallery`** (pick a direction) →
**taste-skill** (design read, dials, anti-slop) → **`ui-ux-pro-max`** (tokens, a11y,
stack) → **`design-motion-principles`** (craft the motion) → taste-skill's pre-flight.

### Repo conventions that override the upstream text

- **Ports never start with 4 or 5** (`CLAUDE.md` §2). Upstream examples that suggest
  `5173`, `3000` or similar are examples, not instructions. Use the allocation table.
- **Animation library.** Upstream names `motion/react` as the default; in this repo that
  is concrete — `motion` is a workspace dependency and the shared motion language lives
  in `@cloud-march/motion` (`packages/motion-kit/`). Reach for its tokens and helpers
  before hand-rolling durations and easings. See `packages/motion-kit/README.md`.
- **Everything stays inside this repository** (`CLAUDE.md` §1). Upstream's block-library
  section suggests file locations; keep them under the package you are working in.
