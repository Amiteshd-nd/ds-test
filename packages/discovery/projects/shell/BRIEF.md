# shell
### One sign-up, one budget, five genuinely different products

**Covers:** the platform layer · cross-surface consistency · the design system itself ·
permissions and identity · chat-first experiences · developer console and docs

**Build order:** #6 of 6 — extract it, don't design it up front.
**Time:** ~1 week of assembly, if you've kept the log.

---

## Why this project exists

Sarvam's Indus is one platform bundling Work Agents, Voice Agents, Content Agents, Doc Agents,
Coding Agents and the inference stack behind one sign-up, one payment gateway and one credit
system. Plus Kivi, a voice layer that cuts across everything — speak naturally to write in
WhatsApp, draft in Docs, work through spreadsheets, build in Sarvam Code or direct Sarvam Work.

That structural fact changes the brief. If the five surfaces were separate products, a design
system would be a nice-to-have. Because they're one shell, **the design system is the job** — and
this project is where the "a design system you owned, with the story of how it evolved" bullet gets
answered directly.

**Do not build this first.** A design system designed before the products it serves is a guess. You
build five things, keep the log, then extract. The extraction *is* the case study, and the log is
what makes it credible.

---

## The trade-off

Two failure modes pulling against each other:

**Force consistency** and every surface flattens to the least-demanding one. A document review
queue and a voice authoring console have completely different density needs. Make them match and
you get a platform that is worse than the sum of its parts.

**Allow full divergence** and it stops being a platform. Five interaction models, five visual
languages, five mental models, one bill.

**The design work is drawing the line deliberately, and being able to defend where you drew it.**

---

## The users

**The person who uses two surfaces.** Anand uses Work Agents daily and Doc Agents once a month.
Monthly use is where inconsistency actually costs something — daily users absorb anything.

**The person who pays.** One credit balance spent across voice minutes, document pages, dubbing
minutes and code tokens. Incomparable units, one number. Their question is never "how many
credits?" — it's "can I afford to run this?"

**The admin.** Scopes what agents may touch across all five surfaces, org-wide. Their control has
to be comprehensible in one place while applying in five contexts with different affordances.

**The developer.** Reaches the inference stack directly rather than through any surface. Needs the
console and the docs. *This is where the API playground and latency waterfall from the earlier plan
belongs* — it's a real surface, just a platform-layer one rather than one of the five agent
products. And it comes with one contrarian argument worth making: half your docs' readers are now
coding agents, not humans, and Sarvam already ships `/llms.txt` and an MCP server, so designing for
two audiences with opposed needs is a live problem rather than a speculative one.

---

## Scope

Four things, all of them extractions rather than inventions.

1. **The pattern library, published.** All 17 patterns with live interactive demos, rules, and a
   changelog per pattern. Built in code, not Figma, so the demos actually run.
2. **The consistency audit.** Where the five surfaces agree, where they deliberately differ, and
   the recorded reason for each divergence. This document is the portfolio piece.
3. **The credit surface.** A shared budget across incomparable units, translated into decisions
   rather than reported as a number.
4. **One cross-surface handoff.** A Doc Agents output becoming a Work Agents input. Prove the seam
   works — it's a Fleet Handoff at platform scale.

Out of scope: a real marketing site, auth, actual billing.

---

## The state list

- `SURFACE_CONSISTENT` — follows the shared grammar
- `SURFACE_DIVERGENT_JUSTIFIED` — deliberately different, reason recorded
- `SURFACE_DIVERGENT_ACCIDENTAL` — different because you weren't paying attention. Finding these is
  what the audit is *for*, and reporting them honestly is what makes the audit believable.
- `PATTERN_UNPROVEN` — in the library but earned in fewer than two surfaces. Either promote it or
  cut it.
- `PATTERN_DEPRECATED` — tried, failed, removed, with the reason kept. **The most valuable entries
  in the whole library.** A system with no deprecations has no history.
- `BUDGET_SUFFICIENT`, `BUDGET_TIGHT`, `BUDGET_EXHAUSTED_MIDRUN` — the last one is the interesting
  state: a forty-minute coding run or a nine-language dub that stops halfway because credits ran
  out. Nobody designs it and everybody hits it.
- `HANDOFF_CLEAN` / `HANDOFF_LOSSY` at the platform seam
- `SCOPE_INHERITED` / `SCOPE_OVERRIDDEN` — org policy versus per-surface envelope

---

## Patterns this project must earn

| Pattern | Where |
|---|---|
| Cross-surface Shell | Primary — pattern 17 |
| Fleet Handoff | The doc-to-work seam |
| Delegation Envelope | Org-level scope as a ceiling on every surface envelope |
| Latency Waterfall | The developer console, where it originally lived |
| Non-finding | The docs: "this language isn't supported for this model" said usefully |

---

## Design direction

The pattern library site should look like **reference material**, not a marketing page for your own
design system. No hero section, no gradient, no "our design principles" in 48px type. Dense,
navigable, demo-first. The thing being sold is the thinking, and dressing it up undercuts it.

- **Every pattern gets a running demo.** A screenshot of a pattern proves nothing about a pattern
  that exists to handle time and failure. Wire the demos to `grammar/agent-runtime.ts` with a fault
  toggle so a reader can break each one themselves. That single decision will do more for this
  portfolio than any amount of visual polish.
- **The changelog is the content.** Put it at the same level as the pattern spec, not below it.
  Anyone can name twelve patterns. The evolution is the proof.
- **The audit should embarrass you slightly.** Include the accidental divergences you found and
  didn't fix, and say why. An audit with no findings is not an audit.
- **Credits need translation, not display.** "8,400 credits" is meaningless. "About 300 more calls,
  or 4,000 pages, or one nine-language dub" is a decision.
- **The shell owns orientation, never density.** Write this line down and hold to it. It's the
  single most useful constraint in the project.

---

## The hard moments

1. **Where the line goes.** Shell owns identity, budget, permissions, handoff, navigation. Surfaces
   own density, primary object, interaction model, their one bold thing. Defend that split against
   a specific case where it's uncomfortable — that discomfort is the interesting part.
2. **`BUDGET_EXHAUSTED_MIDRUN`.** A forty-minute run stops at minute thirty. What's kept, what's
   billed, what does she do?
3. **Kivi as a cross-cutting layer.** Voice input into every surface. Does voice get one grammar
   across all five, or does each surface need its own? Argue it. There's no established answer, and
   it touches the "chat-first experiences" bullet directly.
4. **The honest deprecation.** Pick a pattern you genuinely got wrong and write it up properly:
   what you believed, what testing showed, what you removed, what you'd do differently. This will
   be the most-read paragraph in your portfolio.

---

## What you'll learn building this

- What a design system is actually for. You'll find out by discovering which of your tokens
  survived contact with six surfaces and which ones you invented for no reason.
- How to write about your own mistakes usefully — a distinct skill from making good decisions, and
  more useful in an interview.
- Where consistency helps and where it's just uniformity. Nobody learns this from reading.

---

## Measurement targets

- **Pattern reuse rate.** What fraction of components across the five surfaces come from the
  library? Low is a finding, not a failure — report it either way.
- **Cross-surface orientation.** Show a `work` user a `doc` screen. Can they orient? This is the
  only thing the shell's consistency is actually buying.
- **Deprecation count.** How many patterns did you try and remove? Zero means you weren't testing.
- **Credit comprehension.** Show a balance and ask what they can afford. If they can't say, the
  translation failed.
