# Discovery — agentic UI

Six product surfaces and one invented design language, built as working prototypes for user
testing. The program, the briefs and the grammar came from the `disc.zip` foundation; this file is
about the build.

```bash
corepack pnpm dev:discovery      # → http://localhost:6177
```

| | |
|---|---|
| Program | [docs/PROGRAM.md](docs/PROGRAM.md) — the six surfaces and the strategic read |
| How to build | [docs/build-workflow.md](docs/build-workflow.md) — structure, day one, the daily loop |
| Stack notes | [docs/tech-stack.md](docs/tech-stack.md) |
| Research and eval | [docs/research-and-eval.md](docs/research-and-eval.md) |
| Working rules | [CLAUDE.md](CLAUDE.md) — read `grammar/patterns.md` before writing any UI |
| The grammar | [grammar/patterns.md](grammar/patterns.md), [grammar/tokens.css](grammar/tokens.css), [grammar/agent-runtime.ts](grammar/agent-runtime.ts) |
| The log | [grammar/log/](grammar/log/) — what changed, what broke, what it cost |

## What's built

| # | Surface | Route | State |
|---|---|---|---|
| 1 | Coding Agents | `/coding` | **built** — plan view, steering, checkpoints, waterfall |
| 2 | Doc Agents | `/doc` | **built** — provenance link, epistemic states, repair, accept gate |
| 3 | Content Agents | `/content` | **built** — back-translation mirror, timeline, consent, publish gate |
| 4 | Work Agents | `/work` | brief only |
| 5 | Voice Agents | `/voice` | brief only |
| 6 | shell / patterns | `/patterns` | pattern index reads `grammar/patterns.md`; demos not built |

Plus `/dev` (the state galleries) and `/studies` (the background studies this package started as —
kept, and outside the program: it uses none of the grammar).

## coding — the first surface

Built in the documented order: [state list](projects/coding/states.md) → scripts → state gallery →
components. Thirty-one states; the happy path is three of them. All thirty-one are reachable — 18
cases in [lib/scripts/coding.ts](lib/scripts/coding.ts) plus the ones visible on a plain run — and a
test fails if `states.md` gains a state with nowhere to appear.

- **The plan view** is the one bold thing. Readable cold, forty minutes later: two clocks (since
  start, since last progress), state in words, successful steps folded to one line, plan revisions
  as events rather than silent updates, provisional work treated as genuinely less committed.
- **Steering** shows what a redirect keeps and what it discards *before* you commit to it. Work
  behind a clean checkpoint survives; loose or provisional work is what the redirect costs.
- **Checkpoints** are semantic and diffed against the previous boundary, never the origin.
- **The waterfall** is at real scale, segmented by cause, TTFT separate from total, p50 and p95
  beside this run — and it says out loud that the numbers are placeholders.
- **The fault toolbar** at the bottom of the surface triggers any failure state in one click. It's
  how the failure states got designed at all, and it makes two test sessions comparable.

Everything is driven by `POST /api/agent`, which plays a script from the runtime. Nothing in the UI
knows whether a run is scripted or live — that's the one place that does.

## doc — the second surface

Same order: [state list](projects/doc/states.md) (33 states, confirmed with three decisions
recorded in [the log](grammar/log/2026-09-09-doc-decisions.md)) → scripts → gallery → components.

- **The provenance link** is the bold thing. Click a value, the page dims and its region lights —
  same screen, no modal, and it follows the value to another page by itself. It stays honest at the
  edges: a `page`-precision region says so rather than drawing a fake box, a conflict says both
  readings live in *other* documents, and a rotated blurred scan still highlights because the
  overlay is a child of the paper and inherits its transforms.
- **Epistemic states on their own channels.** Read, worked-out, conflicting, ambiguous-glyph,
  struck-through, impossible, illegible, absent — each a different treatment because each has a
  different next action. No percentages anywhere in the UI.
- **The band changes behaviour.** `needsEyes()` in the reducer decides what the bulk action can
  clear, so "check this" cannot be swept away in one click. That's the rule with teeth rather than
  a colour.
- **The accept gate** is a Consequence Gate: it states what accepting does, refuses while fields
  still need eyes, and when she accepts having checked 4 of 21 it records exactly that.
- **The document is synthetic and says so.** Every assumption behind it — including that my Tamil
  reads naturally and that ௧/௪ are confusable in real handwriting — is listed in the decision log.
  pdf.js is deliberately deferred: the overlay maths is identical over normalised coordinates, so
  swapping in a real PDF is a renderer change and not a design change.

## content — the third surface

[State list](projects/content/states.md): 33 states, confirmed, with three decisions and one
limitation in [the log](grammar/log/2026-09-09-content-decisions.md).

- **The back-translation mirror** is the bold thing — the only mechanism by which someone who
  doesn't read Tamil can see that a fluent dub says something else. It marks change only, carries
  no score, and states in the surface that a clean round trip is not a certificate.
- **Fluency and fidelity stay two axes.** Nothing names their worst corner, by decision, so the
  board's suspicion ranking is derived in the reducer instead of read off a state.
- **Time is the axis.** Two tracks at one scale, the dub against the source, with the part that
  doesn't fit the shot drawn as an overhang past the segment rather than as a badge.
- **Pronunciation she cannot hear** comes back as what it *actually said*, transliterated into
  Latin and Kannada side by side, with a loud caveat: those transliterations are generated, they
  are the evidence rather than the label, and they need a reader.
- **Consent warns and allows** — the weakest of three options, chosen deliberately so the design
  question ("what does she do when the tool lets her?") exists at all. The trail is the only guard,
  so it names the voice, the lapsed grant and whoever clicked past it. Nothing says "verified".
- **Nothing plays, and the surface says so.** No key, no TTS, and the browser's speech synthesis
  would misrepresent the exact thing under review. Waveform is a labelled proxy.

## Architecture, briefly

```
app/(surfaces)/<name>/     one route, one data-product; all theming flows from that attribute
app/api/agent/route.ts     the only SSE endpoint; script or live, decided server-side
app/dev/gallery/<name>/    every state on one page
components/surfaces/<name> per-surface components — promoted to components/grammar/ on second use
components/dev/            the fault toolbar. Deliberately not product UI
lib/surfaces/<name>/       one reducer per surface — exhaustive over AgentEvent, idempotent
lib/grammar/               promoted on the third use: useAgentStream, shared by all three
grammar/                   tokens, patterns, runtime, log — the seventh deliverable
projects/<name>/           brief, and the state list the components are built against
```

## Decisions that differ from docs/tech-stack.md

Flagged rather than buried; all three are cheap to reverse.

- **No Tailwind.** The stack notes call for Tailwind v4 alongside the tokens. The tokens carry
  every value already, and the rule is that components read the semantic layer with no magic
  numbers inline — plain CSS Modules keep copy and spacing editable by hand in one file per
  surface, which utility classes in JSX do not. Adding Tailwind later costs one config file.
- **No Zustand.** One reducer per surface plus `useAgentStream` is about forty lines, and the
  restraint rule is no dependency for something under thirty. The frame batching is the part that
  matters and it's hand-written either way. (That hook is the first thing promoted into
  `lib/grammar/` — on its third use, which is what the rule says.)
- **No React Flow yet.** coding's plan is a short dependency chain, and a graph library would make
  it less readable cold, not more. `work`'s taskgraph at full strength is where it earns its place.

## Not done yet

- **One real API call.** [docs/build-workflow.md](docs/build-workflow.md) §2 step 4, the cheapest
  high-value thing in the program, needs a Sarvam key. `POST /api/agent` with `live: true` returns
  501 and says so. Until then every timing in the UI is labelled a placeholder, and
  `latency.distribution` carries `source: 'placeholder'` so it cannot quietly read as measured.
- **Fonts.** Tokens name Anek; nothing loads it yet. Nine scripts unsubsetted is megabytes, and the
  subsetting decision belongs to `content`.
- **Three accessibility questions** are open by design rather than answered silently —
  see [docs/accessibility-open-questions.md](docs/accessibility-open-questions.md).

```bash
corepack pnpm --filter discovery test        # determinism, state coverage, and that the paper agrees with the agent
corepack pnpm --filter discovery typecheck
corepack pnpm --filter discovery build
```
