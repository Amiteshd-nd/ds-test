# Agentic UI — six projects, one design grammar

A build-and-learn program mapped to Sarvam's actual platform. Indus bundles Work Agents, Voice
Agents, Content Agents, Doc Agents, Coding Agents and the inference stack behind one sign-up, one
payment gateway and one credit system — so this is five product surfaces plus the shell that holds
them.

```
projects/coding    Coding Agents     long runs, visible plan, mid-run steering, checkpoints
projects/doc       Doc Agents        extraction, review queue, confidence states, provenance
projects/content   Content Agents    dubbing and voice: approving media you can't evaluate
projects/work      Work Agents       agents acting as you, with an audit trail that holds up
projects/voice     Voice Agents      authoring an agent, and simulating 1,000 calls first
projects/shell     the platform      one budget, five interaction models, and the design system
grammar/           17 patterns all six share — and the seventh deliverable
```

> **Revised after checking the real products.** An earlier version of this plan guessed at the
> surfaces and got two of five wrong. `voice` was framed as an end user talking to an agent; it's
> actually an authoring and ops console. `coding` was framed as an API playground; it's actually
> long-running runs with a visible plan. `work` and `content` had the right patterns and the wrong
> domains. The corrections are noted at the top of each brief, and the mis-framings are kept in the
> log — a design system with no deprecations has no history.

---

## The strategic read

Most design job posts ask for evidence you can execute inside an existing system. This one asks
for evidence you can **invent a system where none exists**. What the bullets are testing:

| What they wrote | What they're testing |
|---|---|
| "non-deterministic output, streaming, error and hallucination states" | Can you design for *states*, not screens? |
| "human-in-the-loop review, trust and confidence signalling" | Do you understand that trust is the product? |
| "voice or speech-first, multilingual or low-literacy" | Have you designed where reading isn't available? |
| "review queues, admin and permissions" | Can you do dense operator work, not just consumer polish? |
| "consoles, API playgrounds, SDK onboarding" | Can you design for developers as a real user class? |
| "a design system you owned, **with the story of how it evolved**" | Judgement over time, not a Figma screenshot |
| "script rendering, text expansion, transliteration, mixed-language input" | Do you know what actually breaks in Indian languages? |

The last two rows are where portfolios lose. Almost nobody shows a system's *evolution*, and
almost nobody has real Indic typography receipts. Those are your two cheapest wins.

### What makes this a body of work instead of six case studies

Six unrelated projects read as six unrelated projects. Six projects that **share one invented
design language, where each one changed the language**, read as one argument — and the language
becomes the strongest case study in the set.

So: every pattern in `grammar/patterns.md` must be earned in at least two projects, and each needs
a changelog entry of the form *v1 was X, testing broke it because Y, v2 does Z, and that cost me W.*

Because Indus is **one shell**, this isn't a nice-to-have. Five surfaces sharing one sign-up and
one credit balance means cross-surface consistency is a real product problem, which makes the
design system the job rather than the garnish. That's what `projects/shell` is for, and it's where
the hardest bullet in the brief gets answered directly.

---

## Build order — by learning curve

Ordered by what each project teaches and what it requires you to already know. Each ships
something small and complete, banks patterns, and sets up the next.

```
1. coding    1.5 wk   ← start here. You are the user. No recruiting.
2. doc       1.5 wk
3. content   1.5 wk
4. work      2 wk
5. voice     2.5 wk   ← the flagship, built last, built well
6. shell     1 wk     ← extraction, not invention
```

### 1 · `coding` — start here
You are the user, so no recruiting and no field research. Real output on screen the same day.
**Teaches:** SSE and streaming, the AI SDK, React Flow at low complexity, and real API latency
numbers you hardcode into the runtime and reuse for all five remaining projects. Measure once here,
benefit everywhere.
**Banks:** Taskgraph, Commit Boundary, Latency Waterfall, Delegation Envelope.

### 2 · `doc`
One document, one reviewer, one screen. Static input, no orchestration. The step up is epistemics —
extracted vs inferred vs conflicting vs illegible — not technical complexity.
**Teaches:** coordinate-space overlay on a rendered document, real Vision 2.0 output including
Indic handwriting, cross-script vertical rhythm, and why confidence percentages are a trap.
**Banks:** Provenance Link, Confidence Without Numbers, Non-finding, Repair Loop.

### 3 · `content`
Needs `doc`'s confidence patterns, adds the hardest typography in the program and one novel
pattern. Media rather than text, so time becomes the primary axis.
**Teaches:** nine scripts on one screen, timeline alignment, making linear media scannable.
**Banks:** Back-translation Mirror (pattern 13 — this one's yours), Consequence Gate.

### 4 · `work`
Where the agent stops producing output and starts *acting*, in your name. Delegation becomes about
authority rather than accuracy.
**Teaches:** modelling authority and attribution as data, audit trails worth reading, partial
failure across external systems.
**Banks:** Delegation Envelope at full strength, Exception Queue, Behaviour Spec, Fleet Handoff.

### 5 · `voice` — the flagship
Their Voice Agents console: describe the agent, simulate a thousand calls, rent a number, go live.
Their claim is three weeks compressed to under sixty minutes — a public benchmark you can measure
against. Built last because it needs the grammar to already exist.
**Teaches:** how to design an aggregate view over a thousand non-deterministic runs. Almost no
designer has this skill and it transfers to every eval surface in the industry.
**Banks:** Simulation Sweep (pattern 15, the most novel object here), plus it pressure-tests
everything the other four produced.

### 6 · `shell`
Extract, don't invent. A design system designed before the products it serves is a guess.
**Banks:** Cross-surface Shell. And this is where the API console, docs and latency waterfall live —
a real surface, just a platform-layer one.

**If you only have time for two:** `voice` + `shell`. The flagship plus the system. `voice` is the
most differentiated thing in the set and `shell` is the only place the evolution story can live.

---

## The learn-on-the-go loop

Per project, in this order:

```
1. state list      every state including failures, before opening a canvas
2. runtime script  encode those states in grammar/agent-runtime.ts as replayable scripts
3. build           components against the scripts, not the live API
4. real API        swap one path to the real thing; measure and hardcode the latency
5. test            3–5 people, with injected faults and one planted error
6. log             grammar/log/ — what changed, what broke, what it cost
```

Step 1 is the one you'll want to skip and the one that matters most. With Claude Code you can have
a screen in ninety seconds, and that screen will be the happy path — worthless here, because the
entire thing being evaluated is how the interface behaves when the agent is wrong, slow, uncertain,
or offline.

Keep `grammar/log/LEARNING.md` alongside the design log. One line per thing you didn't know before.
By project four you'll have forgotten how much project one taught you.

---

## Ground rules

**Working models, not mockups.** Every prototype runs in a browser and handles a real failure. A
Figma prototype cannot show you what 900ms to first token feels like, and latency is the most
important design material in this space.

**Real API calls in at least one place per project.** Prototypes that only replay scripts feel
different, and reviewers can tell.

**Scripted streams for everything else.** `grammar/agent-runtime.ts` gives you deterministic,
replayable agent event streams with injectable faults. Same seed and faults, identical stream —
which is what lets you *design* an error state instead of waiting for one, show every test
participant the same failure, and demo without depending on a network.

**Two disciplines that recur, and are the real thesis.** First: *don't over-claim.* The Simulation
Sweep must not let 94% read as a promise; the Back-translation Mirror must not let a clean round
trip read as a certificate. Second: *appropriate distrust is the metric.* An interface that produces
100% acceptance has built compliance, not trust. Plant an error in every test and report the catch
rate. Almost nobody does this and it will get you a callout.

**Synthetic data only.** Nothing from your current employer — no screenshots, no data, no internal
formats, no customer names. Say so in the write-up; it reads as professionalism.

---

## Which file, when

Nothing here duplicates anything else. Read in roughly this order.

| Read this | When | What it holds |
|---|---|---|
| **README.md** | now | Strategy, the slate, build order, ground rules. This file. |
| **CLAUDE.md** | before opening Claude Code | Who you are, the engineering bar, design non-negotiables, how Claude should disagree with you. Claude reads it every session — it's the highest-leverage file in the repo. |
| **docs/build-workflow.md** | day one, then daily | One-project structure, the scaffold prompt, the state gallery, the fault toolbar, friction, accessibility. *How to work.* |
| **grammar/patterns.md** | before designing any screen | The 17 patterns in three groups. The vocabulary everything else assumes. |
| **grammar/tokens.css** | while building | Semantic tokens, per-script Indic typography, six surface themes, reserved agent-state channel. |
| **grammar/agent-runtime.ts** | while building | Typed event model, deterministic scripts, fault injection. The event types *are* the grammar as data. |
| **projects/\*/BRIEF.md** | at the start of each project | Trade-off, users, scope, state list, patterns to earn, design direction, hard moments, what you'll learn, metrics. |
| **docs/research-and-eval.md** | week one of each project | How to recruit and interview, what to record, how to measure trust including appropriate distrust. |
| **docs/tech-stack.md** | day one, then when stuck | Stack choices and why, Sarvam API specifics, cost control, prompt shapes. |
| **grammar/log/** | every working session | Design log, learning ledger, and the reframe deprecations. This is a deliverable, not admin. |

Full tree:

```
README.md                       strategy and build order
CLAUDE.md                       operating instructions for Claude Code
grammar/
  patterns.md                   17 patterns in three groups
  tokens.css                    tokens, per-script Indic typography, six themes
  agent-runtime.ts              deterministic event stream, sweeps, fault injection
  log/
    2026-09-08-reframe.md       the two wrong turns, written up as deprecations
    LEARNING.md                 one line per thing you didn't know before
    TEMPLATE.md                 daily log template
docs/
  build-workflow.md             structure, day one, daily rhythm, friction, accessibility
  research-and-eval.md          research method and trust metrics
  tech-stack.md                 stack, Sarvam APIs, Claude Code prompt shapes
projects/
  coding/ doc/ content/ work/ voice/ shell/     each with a BRIEF.md
```

**Start here:** skim this file, then `CLAUDE.md`, then `docs/build-workflow.md` §2, then
`projects/coding/BRIEF.md`.
