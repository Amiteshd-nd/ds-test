---
name: design-md-gallery
description: "A searchable index of 68 curated DESIGN.md reference systems drawn from well-known products, tagged by category and aesthetic — dark terminal, editorial, neon, brutalist, premium automotive, and so on. Use when choosing a visual direction by reference or vibe rather than from first principles: 'make it feel like Linear', 'find me a dark developer-tool aesthetic', 'what should this look like', or when a DESIGN.md starting point or design-system inspiration is wanted."
---

# DESIGN.md Gallery

An index of 68 reference design systems, catalogued from
[VoltAgent/awesome-claude-design](https://github.com/VoltAgent/awesome-claude-design)
(MIT). Use it to answer "what should this feel like" by pointing at something
that already exists, instead of inventing a direction from nothing.

## Read this before using it

**This skill indexes references; it cannot fetch them.** The 68 `DESIGN.md`
documents are not in the upstream repository and are not retrievable
programmatically — every link resolves to a landing page on `getdesign.md`,
and there is no raw endpoint (`/raw`, `/design.md`, `/DESIGN.md` and
`/api/...` all return 404). Getting the actual file means opening the page and
using the site's own UI.

So the honest workflow is: **search here, then open the link.** Do not claim to
have read a system's tokens when all you have is the one-line description in
this index.

## Searching

```bash
python3 .claude/skills/design-md-gallery/scripts/find.py "<query>"
```

| Flag | Meaning |
|---|---|
| `--category "<name>"` | Restrict to one category |
| `--list-categories` | Show all 9 categories with counts |
| `-n N` | Max results (default 8) |

Query with **aesthetic words**, not product names, unless a specific product
is wanted — the index is weighted so that the look description dominates:

```bash
python3 .claude/skills/design-md-gallery/scripts/find.py "dark terminal developer"
python3 .claude/skills/design-md-gallery/scripts/find.py "editorial warm minimal"
python3 .claude/skills/design-md-gallery/scripts/find.py --category "Automotive"
```

The 9 categories: AI & LLM Platforms (12), Developer Tools & IDEs (7),
Backend/Database/DevOps (8), Productivity & SaaS (7), Design & Creative Tools
(6), Fintech & Crypto (7), E-commerce & Retail (4), Media & Consumer Tech (11),
Automotive (6).

If a search returns nothing, say so. This is a fixed list of 68 — it is not a
search over all design systems, and an empty result means the gallery has no
match, not that no such aesthetic exists.

## Where this sits next to the other design skills

| Need | Skill |
|---|---|
| Pick a direction by reference | **this skill** |
| Decide structure, color, type, a11y from rules | `ui-ux-pro-max` |
| Build or review a specific interaction's motion | `design-motion-principles` |
| Capture what a page already renders | `design-md-extractor` |

A natural pairing: find a reference here, then open that product's live site
and run `design-md-extractor` against it to get real observed tokens rather
than a one-line blurb.

## Brand caveat

These describe **other companies' visual identities**, reconstructed from
publicly observable patterns. They are not official design systems and carry no
endorsement from the companies named. Trademarks, logos and licensed typefaces
belong to their owners.

Treat an entry as a direction to borrow from, not a skin to apply. "Stripe's
gradient restraint at a smaller type scale" is a design decision; a 1:1 clone
of Stripe's identity on someone else's product is a trademark problem. If a
request is heading toward the latter, say so once and offer the former.
