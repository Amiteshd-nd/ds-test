---
name: design-md-extractor
description: "Extract a live web page's design system into a DESIGN.md or SKILL.md file. Reads computed typography, color, spacing, radius, shadow and motion from any URL open in the Browser pane, infers token scales, and writes agent-ready design-system documentation. Use when asked to capture, extract, reverse-engineer, document or clone the visual language of a site or of a package in this repo — or to produce a DESIGN.md, a design-system brief, or a style guide from something already rendered in a browser."
---

# DESIGN.md Extractor

Turns a rendered page into design-system documentation. The extraction reads
`getComputedStyle` off a sample of up to 280 visible elements, so it reports
what the page **actually renders**, not what its source claims.

Ported from the TypeUI DESIGN.md Chrome extension
([bergside/design-md-chrome](https://github.com/bergside/design-md-chrome), MIT).
The `lib/` modules are vendored unmodified; the Chrome popup and the
`chrome.runtime` messaging are replaced by the Browser pane and a Node CLI.

## When to apply

Use when the goal is to **capture an existing visual language as a document**:

- "Write a DESIGN.md for our personal-doc site"
- "What design system is this page using?"
- "Document the tokens on <url>"
- "Extract this site's typography and color scale"

Do **not** use it to decide what a design *should* be — that is `ui-ux-pro-max`.
This skill only reports and formats what is already on screen.

## Workflow

### 1. Get the page into the Browser pane

For a package in this repo, start its dev server by name from
`.claude/launch.json` (`personal-doc`, `discovery`, `blockmodel`, …):

```
preview_start with {name: "<package>"}
```

For an external site, open it directly:

```
preview_start with {url: "https://example.com"}
```

Let the page settle before extracting. A page still showing skeletons yields
skeleton tokens. If the design has a dark and a light mode, use
`resize_window` with `colorScheme` and extract each one separately — the
extractor captures whichever is currently painted.

### 2. Extract

Read `scripts/extract-page.js` and pass its **entire contents** as the `text`
argument to `javascript_tool`. It is a self-contained IIFE that returns the
payload; nothing needs to be appended.

The payload is large. Do not paste it back into the conversation — write it
straight to a file in the scratchpad directory and work from there.

### 3. Generate

```bash
node .claude/skills/design-md-extractor/scripts/generate.mjs <payload.json> --mode design -o DESIGN.md
```

| Flag | Meaning |
|---|---|
| `--mode design` | `DESIGN.md` — design-system documentation (default) |
| `--mode skill` | `SKILL.md` — agent-ready, with frontmatter and a managed block |
| `--name` | System name; defaults to `<brand> DS` |
| `--brand` | Brand name; inferred from `og:site_name`, `application-name`, title, then hostname |
| `-o FILE` | Write to a file; omit to print to stdout |

Pass `-` as the payload path to read from stdin. Exit code is `1` on a bad
payload or failed validation, `2` on a usage error.

The generator runs the upstream validator before emitting anything: the output
must carry every required section and a `WCAG 2.2 AA` target, and in `skill`
mode also valid frontmatter and the managed-block markers. Warnings print to
stderr and do not block. **A validation failure is a real failure** — do not
hand-patch the markdown to get past it; fix the input or say the page could not
be extracted cleanly.

## Reading the output honestly

The extractor infers scales from sampled values. It is good at typography,
color and radius, and weaker where a page is sparse:

- **A small or mostly-empty page gives thin results.** Element count is in the
  payload (`sampledElements`); under ~30, treat the scales as indicative only
  and say so.
- **Motion is often all zeros.** Transitions are usually attached to `:hover`
  and `:focus`, which a static snapshot never triggers. Absent motion tokens
  mean "not observed", not "the site has no motion".
- **`backgroundColor` reads `rgba(0, 0, 0, 0)` for most elements.** That is
  transparency inherited from an ancestor, not a real token.
- **Tokens are observed values, not the author's intent.** The page may have
  three greys because of an accident, not a decision. Say "the page renders X"
  rather than "the system defines X".

## Scope note

Extracting another company's site produces a description of their visual
identity. That is fine as reference or analysis, but their trademarks, logos
and licensed typefaces remain theirs — use the output as input to an original
system rather than shipping a copy. See `design-md-gallery` for the same
caveat applied to a ready-made collection.
