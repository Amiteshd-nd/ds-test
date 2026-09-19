# Repo guardrails

These rules are non-negotiable for any work in this repository.

## 1. Scope — changes stay in this repo

Every change made for this repo happens **exclusively inside this repository directory**
(`cloud-march/`). Never create, edit, move, or delete files outside it (no global configs,
no other projects, no home-directory files) as part of repo work.

## 2. Ports — never start with 4 or 5

**Do not use any port that begins with the digit 4 or 5.** This rules out the whole 4xxx
and 5xxx ranges (including Vite's 5173 default). When adding a project or picking any port,
choose one outside those ranges.

Current allocation (all compliant):

| Service       | Port |
| ------------- | ---- |
| blockmodel    | 6176 |
| personal-doc  | 6173 |
| game          | 6174 |
| gully         | 6175 |
| discovery     | 6177 |
| trimension    | 6178 (web), 8788 (session server) |
| file-compressor | 6179 |
| carcinogen    | 6180 |
| cortex        | 6181 (Atlas demo UI), 6182 (agent service), 6183 (server tests) |
| hub           | 8787 |

Set the port explicitly (e.g. Vite `server.port` + `strictPort`, Next `-p`) so it holds
when a package is run directly, not just via the hub. Note: numbers like `4326` in
gully's SQL are an EPSG coordinate-system code, **not** a port — leave them alone.

## 3. Design work — use the bundled skills

Five design skills live in `.claude/skills/`, alongside one that is not about design
(`cortex-agent-layer`, below). Any change that alters how something **looks,
feels, moves, or is interacted with** — in `hub/` or any package under `packages/` —
starts with one of them rather than reaching straight for defaults.

### `ui-ux-pro-max` — structure, color, type, layout, a11y

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux
```

Pick the narrowest mode that fits: `--design-system` for a new page or a whole visual
direction, one `--domain` for a targeted concern, `--stack <name>` for stack-specific
implementation. Full rules live in the skill's `references/quick-reference.md` and
`references/pro-rules.md` — read them on demand, not every session.

If a search returns nothing, the script says so explicitly. Say so too, and label any
fallback guidance as a fallback — do not present an unverified answer as a database hit.

### `design-motion-principles` — transitions, micro-interactions, animation

Read `.claude/skills/design-motion-principles/SKILL.md` and follow its mode detection:
**Create** to build motion, **Audit** to review it. No script; it is all Markdown.

Audit mode has side effects worth knowing: it writes an HTML report into a
`motion-audits/` directory at the repo root and opens it in the browser. Add that
directory to `.gitignore` before running an audit you do not intend to commit.

### `design-md-extractor` — capture what a page already renders

Extracts computed tokens from a live page in the Browser pane and writes a
`DESIGN.md` or `SKILL.md`. Reports what is painted, not what the source claims.
Read `.claude/skills/design-md-extractor/SKILL.md` for the workflow.

### `taste-skill` — is this page templated, and what is the design read

For marketing-shaped surfaces only: landing pages, portfolios, hero sections,
editorial pages, and redesigns of those. Not dashboards or multi-step product UI.

Read `.claude/skills/taste-skill/SKILL.md`. It runs a four-step loop — declare a
one-line design read, set the variance/motion/density dials, build, then run the
pre-flight check that catches the LLM tells. The ~1,200 lines of upstream rules are
split across `references/`; read them on demand.

Vendored from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT).
Its **em-dash ban applies to rendered page copy only** — not to this file, the
READMEs, commit messages, or code comments. Do not "fix" em-dashes in repo prose.

### `design-md-gallery` — pick a direction by reference

```bash
python3 .claude/skills/design-md-gallery/scripts/find.py "<aesthetic words>"
```

68 indexed reference systems. The index is searchable locally; the documents
themselves are not fetchable — the script prints a link to open.

### Which one

| Need | Skill |
| ---- | ----- |
| Decide structure, color, type, layout, a11y | `ui-ux-pro-max` |
| Build or review a specific interaction's motion | `design-motion-principles` |
| Document what an existing page renders | `design-md-extractor` |
| Choose a visual direction by reference | `design-md-gallery` |
| Judge whether a landing page or portfolio looks templated | `taste-skill` |

Typical order for a new surface: `design-md-gallery` (pick a direction) →
`taste-skill` (design read, dials, anti-slop) → `ui-ux-pro-max` (tokens, a11y,
stack) → `design-motion-principles` (craft the motion) → taste-skill's pre-flight.

`ui-ux-pro-max` and `design-motion-principles` overlap on animation. Use the
former for the *decision* (should this move, how fast, does it respect
reduced-motion); the latter for the *craft* of a specific interaction and for
reviewing motion that already exists.

Skip all five for backend logic, build tooling, and non-visual scripts.

### `cortex-agent-layer` — not a design skill

A sixth skill sits in the same directory and has nothing to do with how things look. It
covers adding an AI agent layer to an application that already has data, APIs, auth, and a
design system: the eight adapters, grounding with permission filtering at retrieval,
skills and agents as manifests, human-in-the-loop gates, and the eval and red-team gates.
`packages/cortex/` is that skill applied end to end, and is where its answers live in
code. The design rules above still apply to anything it renders.

## 4. Animation — go through `@cloud-march/motion`

Front-end motion in this repo runs on [motion.dev](https://motion.dev) (the `motion`
package), wrapped by the workspace package `packages/motion-kit`
(`@cloud-march/motion`). Read `packages/motion-kit/README.md` before animating
anything.

The wrapper exists so five surfaces do not each invent their own 300ms. Reach for a
token before writing a fresh duration or easing:

```js
import { motion, rise, staggerChildren, useMotionSafe } from '@cloud-march/motion/react';
import { revealOnScroll, animate, duration, ease } from '@cloud-march/motion';  // vanilla
```

Both entries re-export motion.dev's **entire** API, so anything in the motion docs
is importable from here. Our tokens live under a `tokens` namespace
(`tokens.spring.soft`, `tokens.stagger.normal`, `tokens.distance.rise`) because
`spring`, `stagger` and `distance` are real motion exports and must not be
shadowed; `duration`, `ease`, `staggerFor` and `defaultTransition` do not collide
and are also plain named exports.

```css
@import '@cloud-march/motion/tokens.css';   /* --motion-duration-*, --motion-ease-* */
```

Rules that hold regardless of package:

- **Take the dependency once.** Import `motion` and `motion/react` through
  `@cloud-march/motion`, not directly, so the repo stays on one pinned version.
- **`prefers-reduced-motion` is not optional.** The helpers here handle it; if you
  animate by hand, handle it yourself. Collapse the motion, never hide the element.
- **No `window.addEventListener('scroll')`.** Use `revealOnScroll` / `useReveal` /
  motion's `scroll()` / CSS scroll-driven animations.
- **Clean up.** Every helper returns a teardown function. Call it on unmount.
- **Never mix GSAP or Three.js with `motion` in the same component tree** — they
  fight over the same frames. Isolate each in its own leaf component.

**`framer-motion` and `motion` are the same library** — same author (Matt Perry),
same repo, released in lockstep; `motion/react` is literally
`export * from 'framer-motion'`, and `motion` depends on `framer-motion`. Framer
Motion is just the old name from when it lived at framer.com. `packages/personal-doc`
has been migrated off its direct `framer-motion@12` dependency onto
`@cloud-march/motion/react`. **Do not add `framer-motion` back anywhere** — two
majors of one library means two React contexts, and an `AnimatePresence` from one
copy will not coordinate with a `motion` component from the other.

`packages/carcinogen` has no bundler. Copy the `:root` block from
`packages/motion-kit/src/tokens.css` into its stylesheet and note where it came from.
