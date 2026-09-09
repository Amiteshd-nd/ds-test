# CLAUDE.md

Read `grammar/patterns.md` before writing any UI. Read `docs/build-workflow.md` for structure and
the daily loop.

> **Where this lives.** This is `packages/discovery` inside the `cloud-march` monorepo, so the
> repo-root `CLAUDE.md` applies too and wins where they disagree: every change stays inside the
> repo, and no port may start with 4 or 5. This package runs on **6177** (`next dev -p 6177`) and
> is registered in the hub at `hub/server.mjs`. The docs below describe a standalone `agentic-ui/`
> app; read `agentic-ui/` as this package. Two deviations from `docs/build-workflow.md` §1, both
> deliberate: `styles/tokens.css` and `lib/agent-runtime.ts` **import** from `grammar/` rather than
> being copies of it, because two copies of a token file drift and two copies of a deterministic
> runtime are two runtimes. `README.md` lists three departures from `docs/tech-stack.md`.

---

## Who I am and what I want

I'm a **product designer**, not an engineer. I can read code, edit copy and tokens by hand, and
follow what you build — but I'm not going to write the streaming plumbing or debug a React Flow
layout. Assume that split.

I'm building six prototypes as portfolio work targeting Sarvam AI's design role, and **I'm learning
this domain as I go.** So:

- **Explain the non-obvious as you build.** Two or three sentences, not a tutorial. Especially for
  things I haven't used: SSE, React Flow layout, `Intl.Segmenter`, pdf.js coordinate overlay, VAD,
  font subsetting. If there was a real trade-off, name the alternative and why you didn't take it.
  Once I've clearly got something, stop explaining it.
- **Tell me when I'm about to paint myself into a corner.** If a request will need rewriting two
  projects from now, say so *before* building it.
- **I care about interaction quality over architecture.** Don't propose refactors I didn't ask for.
  Do refuse to build something that will stutter, because a prototype that drops frames can't be
  evaluated — timing and motion are the design materials here.
- I'll iterate on copy, spacing, hierarchy and state behaviour constantly. Structure code so those
  are cheap to change: copy in one place per surface, tokens in `styles/tokens.css`, no magic
  numbers inline.

These are prototypes for user testing, not production software. But see the engineering bar below —
"prototype" is not licence for the things that would break the *design* work.

---

## What this is

Six surfaces in one Next.js app, mapped to Sarvam's Indus platform, sharing one invented design
language in `grammar/`. The design language is the seventh deliverable.

```
projects/coding    #1   long runs, visible plan, mid-run steering, checkpoints
projects/doc       #2   extraction review, provenance, confidence states
projects/content   #3   dubbing and voice review across nine languages
projects/work      #4   agents acting as the user, audit trail, delegation
projects/voice     #5   agent authoring + simulating 1,000 calls  ← flagship
projects/shell     #6   platform layer, credits, the pattern library itself
```

Build in that order; each reuses components from the ones before. `shell` is an extraction, not an
invention — don't design it early.

**Promotion rule:** a component enters `components/grammar/` only when a *second* surface uses it.
Until then it lives in `components/surfaces/<name>/`.

---

## Build order — do not skip steps

```
state list → runtime script → state gallery → component → real API → fault-test → log
```

**If I ask for a screen without giving you a state list, ask for the state list first** — or propose
one and get it confirmed. Generating the screen first produces the happy path, and the happy path is
worthless for this brief: the whole thing being evaluated is how the interface behaves when the
agent is wrong, slow, uncertain, or offline.

Build the **state gallery** before the designed version. Every state on one unstyled page. I can't
design states I can't see side by side.

---

## The engineering bar

Think like a senior engineer at an inference company: **latency and cost are first-class, streams
are hard, and multilingual correctness is correctness, not polish.**

### Streams
- `AbortController` on every stream. Cancel on unmount and on navigation. A leaked SSE connection
  per surface visit will silently degrade the app and I won't know why the demo got worse.
- **Never `setState` per token.** Batch into frames. Forty nodes at ten updates a second with naive
  state updates drops frames, and a prototype that stutters cannot be used to evaluate motion
  design — which is half of what I'm testing.
- Reduce the event stream through **one reducer per surface**, not scattered state. `AgentEvent` is a
  discriminated union: use an exhaustive `switch` and let TypeScript catch the case I forgot when I
  add a state. That type-checking is doing design work for me.
- Events arrive out of order and duplicated in real life. The reducer should be idempotent.

### Performance cliffs that will actually bite
- **React Flow:** memoize custom node components and use selectors. Default behaviour re-renders
  every node on any change; at forty nodes that's visible.
- **Long lists:** 1,000 sweep runs, 200 queue items, a 4-minute transcript. Virtualize. Don't put
  1,000 rows in the DOM.
- **Fonts:** nine scripts is megabytes. Subset per script with `unicode-range`, preload only the two
  scripts a route needs. Avoid `font-display: swap` across scripts — the reflow between a fallback
  and Anek Malayalam is ugly and will look like a bug.

### Money and milliseconds
- **Cache every real API response to disk in dev**, keyed by input hash. Replay from cache by
  default. Development burns far more calls than anyone expects, mostly on layout iterations.
- **Log TTFT and total for every real call** to a local file. I need the distribution, not one
  sample, and those numbers get hardcoded into the runtime scripts for everything downstream.
- Never call the real API on mount or in an effect. Explicit user action only.
- API keys server-side only. Never `NEXT_PUBLIC_`. The SSE route is the only place that knows
  whether a run is scripted or live.

### Indic correctness is engineering, not i18n polish
This is where a generic web app quietly breaks and where a Sarvam engineer would not.

- **Truncation.** `String.slice()` works on UTF-16 code units. Devanagari conjuncts and Tamil
  clusters span several code points; slicing mid-cluster produces a *different word* or mojibake.
  Use `Intl.Segmenter` with `granularity: 'grapheme'` for anything user-facing. This is the single
  most common Indic bug on the web and it will show up in my transcript rows and subtitle tracks.
- **Length.** `.length` is not character count for these scripts. Use the segmenter.
- **Normalization.** `.normalize('NFC')` on input before comparing or hashing. The same visible
  string can have different byte sequences, which breaks caching and dedupe.
- **Sorting.** `Intl.Collator` with the locale, never `.sort()`.
- **Bidi.** Urdu is RTL. Don't assume LTR in layout maths.
- Flag any place where you had to make an assumption about a script you couldn't verify.

### Restraint
- No dependency for something under ~30 lines.
- No abstraction until the third use.
- No tests for prototype UI. **Do** write tests for `lib/agent-runtime.ts` — determinism is the one
  thing that must not break, since it's what makes my user tests comparable.
- Fail loudly in dev, gracefully in the demo. A silent catch will cost me an interview.
- Don't refactor my copy. Ever.

---

## Design non-negotiables

1. **Semantic tokens only.** Components read `--fg-primary`, never `--n-900`. If a component needs a
   value with no semantic name, the system is missing a token — add one to `styles/tokens.css`,
   don't reach past the layer.

2. **The agent-state colour channel is reserved, globally.** `--sig-attention` and `--agent-blocked-*`
   are for `blocked_on_human` and nothing else. Never nav, never a highlight, never a primary button.
   Because Indus is one shell, this holds across all six surfaces or it buys nothing.

3. **Confidence on at least two channels.** Never colour alone. Three bands only: committed / check
   / failed. The band must change *behaviour*, not just appearance — "check this" items can't be
   bulk-approved. No percentages in user-facing UI; raw scores only in the delegation-envelope
   control.

4. **Distribution before score; regression is loud.** In `voice`, never lead a sweep with a pass
   rate. Outcome shape first, clusters by cause second, caveats as content not footnotes. A re-run
   that's worse in any cluster must be impossible to miss. `--delta-worse` is reserved for that.

5. **Never over-claim about evidence.** A sweep pass rate is not a production promise. A clean
   back-translation is not a certificate. The wording around uncertainty is a design decision with
   legal consequences in these domains, not a caveat to bolt on at the end.

6. **Every Indic text node carries `lang`.** `<p lang="ta">`. Per-script line heights key off it;
   without it Devanagari renders with Latin leading and clips matras.

7. **Never `text-transform: uppercase` or `letter-spacing` on Indic text.** No case in these
   scripts; letter-spacing breaks conjuncts. Guarded in tokens — don't override.

8. **Size containers for the longest language.** Assume 30% expansion (`--expansion-budget`). Prefer
   wrapping to truncation.

9. **Build against `lib/agent-runtime.ts`, not the live API,** for all layout and state work.

10. **No browser storage** in any artifact-style demo. React state only.

---

## Accessibility

Not a checklist item here — it's an open research area and possibly the most original thing in this
portfolio. Nobody has answered how an agentic interface works for a screen reader user.

- State must live in the **accessible name or an explicit status**, not be implied by appearance. If
  `blocked_on_human` is only a colour and a ring, it doesn't exist for a blind operator. This is why
  the pattern rules insist the band changes behaviour.
- **Streaming and live regions:** don't wire `aria-live` to per-token updates — it either announces
  nothing or announces everything repeatedly. Announce at a semantic unit. Flag this to me as an
  open question rather than picking silently; I want to design it.
- **Focus under agent-driven change:** never steal focus when a node blocks. Announce and make it
  reachable. Tell me when you hit this case.
- **Keyboard on a taskgraph:** a DAG has no natural tab order. Don't invent one silently — surface
  the problem and we'll decide.
- Run axe on each surface when I ask, and report honestly rather than fixing cosmetically.

---

## Motion

One job: showing what changed. A state transition earns an animation; a card appearing in a list
does not. No fade-and-slide-up entrances, no hover transitions on every card, no continuously
pulsing "thinking" indicator, no animated progress theatre during a sweep — progress is one number
and one bar. In `work` and `voice`, something is always changing; if everything animates, nothing
reads as changed. Respect `prefers-reduced-motion`.

## Visual defaults to avoid

Tells of generated design, which the people reviewing this will recognise instantly:

- Identical rounded cards in a grid, one border-radius on everything, the same soft grey shadow
- A KPI row of big numbers across the top of a dashboard
- Tracked-out all-caps eyebrow labels above headings
- Meta strings joined with middle dots
- `→` appended to button and link text
- Warm cream with terracotta, or near-black with one acid-green accent
- Purple gradients and pulsing orbs for anything voice-related

Each surface gets **one** place to be bold; everything else stays quiet and instrumental.

## Surface identities

| | `voice` | `doc` | `work` | `content` | `coding` | `shell` |
|---|---|---|---|---|---|---|
| Reference | a test bench | a ledger | a briefing note | a print proof | dev tooling | reference material |
| Primary object | the spec + the sweep | a document | the brief + the ledger | a timeline | a run | a pattern |
| Bold thing | sweep distribution | provenance link | the action ledger | the drift diff | the plan view | the changelog |
| Core constraint | evidence must not over-claim | verification must be cheap | attribution must be honest | reviewer can't evaluate | readable cold, 40 min later | orientation, never density |

`data-product` on the route layout switches themes.

## Copy rules

- Second person, present tense, plain language, sentence case.
- Name things as the user names them. Kavitha says "sent back," not "validation failure."
- Errors state what happened and what to do. No apology, no "I", no vagueness.
- A button's label matches the outcome: "Publish" produces "Published."
- For agent-facing copy in `voice` and `content`, write the Indian-language version first and let
  English be the translation. Better copy, and expansion problems surface early.

---

## Friction

Two different frictions. Reduce entry friction aggressively — never make someone supply what you
could supply (sample audio in nine languages, a real handwritten Tamil form, a pre-written spec).

Place in-flow friction *proportionally*. Consequence Gate exists to **add** friction. Uniform low
friction is a safety bug: pointing an agent at real borrowers' phones must not feel like changing a
font. The goal is to minimise the cost of **understanding**, and to place friction only where
consequence earns it — in a different *kind* from the flow around it.

---

## How to disagree with me

I want this. Push back when:

- A request contradicts a pattern rule → name the rule and ask.
- A request will need rewriting two projects from now → say so before building.
- I'm asking for a screen without a state list → refuse, ask for the state list.
- A request would make the prototype stutter → say so; timing is the design material.
- A request is a design judgement dressed as an implementation question → hand it back to me.
- I'm about to over-claim in copy about evidence or confidence → flag it. This one matters most.

Don't silently improve my copy, and don't smooth over a state I asked to be jarring.

---

## Delegate vs keep

**Take on:** scaffolding, SSE plumbing, runtime scripts, synthetic Indian-language documents and
call transcripts, sweep clustering and naming, font subsetting, React Flow plumbing, the state
gallery, the fault toolbar, virtualization, axe integration, type errors, cleanup.

**Leave to me:** state lists, copy, which pattern applies, where friction goes, what the bold thing
is, what to test, and every judgement about how much to show.

---

## Slash commands to define

- `/state-list <flow>` — enumerate every state including failures, before any UI
- `/gallery <surface>` — build or update the unstyled all-states page
- `/pattern <name>` — pull the spec from `grammar/patterns.md` and audit the current component
- `/fault <type>` — add a fault-injection case to the runtime
- `/log <thing>` — append a dated entry to `grammar/log/`

## Content constraints

Synthetic data only. Nothing from my employer — no screenshots, no data, no internal formats, no
customer names. All users, companies and documents in the briefs are fictional. Flag any request
that would pull in real proprietary material.

Where a brief was reframed after checking the real products, the original framing stays in
`grammar/log/` as a deprecation. Don't quietly delete a wrong turn — the wrong turns are the
evidence that the system evolved.
