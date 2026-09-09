# How to build this, as a designer

One project. Six surfaces inside it. This file covers the structure, the day-one setup, the daily
rhythm, and the accessibility work — which turns out to be the most interesting unclaimed territory
in the whole program.

---

## 1 · One project

```
agentic-ui/
├── app/
│   ├── layout.tsx              root: <html data-product> switching, font loading
│   ├── page.tsx                the shell's front door
│   ├── (surfaces)/
│   │   ├── coding/             #1
│   │   ├── doc/                #2
│   │   ├── content/            #3
│   │   ├── work/               #4
│   │   └── voice/              #5
│   ├── patterns/               #6 — the pattern library site, demo per pattern
│   ├── dev/                    the fault toolbar (see §4 — this is a design tool)
│   └── api/
│       └── agent/route.ts      SSE endpoint; plays a script OR calls the real API
├── components/
│   ├── grammar/                THE DESIGN SYSTEM. Earn your way in (rule below).
│   ├── ui/                     primitives: button, field, popover
│   └── surfaces/               per-surface components not yet promoted
├── lib/
│   ├── agent-runtime.ts        from grammar/
│   ├── scripts/                one file per project's scripts
│   └── sarvam.ts               API client, with disk cache
├── styles/tokens.css           from grammar/
└── CLAUDE.md
```

**The promotion rule.** A component enters `components/grammar/` only when a *second* surface needs
it. Before that it stays in `components/surfaces/<name>/`. This does three things: it stops you
inventing a design system for one use case, it makes the "earned in two projects" rule structural
rather than aspirational, and it hands you a measurable reuse rate for the `shell` audit.

**One route, one `data-product`.** Each surface's layout sets it. All theming flows from that one
attribute, so a surface can't accidentally borrow another's density.

**One SSE route for everything.** `api/agent/route.ts` takes a script name or `live: true`. The
client code path is identical either way, so swapping in the real API changes nothing in the UI.
That single decision saves you a rewrite per project.

---

## 2 · Day one

Four steps, about half a day.

### Step 1 — Scaffold
Paste this into Claude Code:

> Set up a Next.js 15 app (App Router, TypeScript, Tailwind v4) with the structure in
> `docs/build-workflow.md` §1. Copy `grammar/tokens.css` to `styles/tokens.css` and
> `grammar/agent-runtime.ts` to `lib/agent-runtime.ts`. Wire Anek variable fonts (Latin +
> Devanagari + Tamil + Malayalam subsets) via next/font. Create `app/api/agent/route.ts` as an SSE
> endpoint that accepts `{script, seed, faults, speed}` and streams events from the runtime. Create
> `app/dev/page.tsx` as an empty page I'll fill in next. Stub each surface route with a layout that
> sets `data-product`. Don't build any UI yet — I want the plumbing only.

Read what it produces. You don't need to be able to write it, but you need to know where things
are, because you'll be editing copy and tokens by hand constantly.

### Step 2 — The fault toolbar
This is the most important thing you will build all week. Details in §4.

### Step 3 — The state gallery
Before designing anything, build a page that renders **every state at once**, unstyled. See §3.

### Step 4 — One real API call
Get one Saaras or Sarvam-105B call working end to end and **write down the timings**. Time to first
token, total, and the spread over ten runs. Hardcode those numbers into your runtime scripts.

You measure once, on day one, and every prototype for the next two months inherits truthful timing.
This is the cheapest high-value thing in the whole program.

---

## 3 · The daily rhythm

```
state list  →  script  →  state gallery  →  design  →  fault-test  →  log
```

### Write the state list in markdown first
Not in a canvas. A plain list, in a `.md` file next to the brief. If it has fewer than a dozen
entries you haven't thought about failure yet. Hand that file to Claude Code as the spec.

### Then build the ugliest possible version
A single scrolling page with every state rendered, zero styling, labels visible. It will look
terrible. That's the point.

**You cannot design states you can't see simultaneously.** This is the core methodological
difference between designing an agentic interface and designing a normal one. In a normal product
you design a screen and edge cases are variants of it. Here the "edge cases" are most of the
product, and the only way to give them proportionate attention is to put them all in front of you
at once, side by side, before you've fallen in love with the happy path.

Ask for it like this:

> Build `app/dev/gallery/coding/page.tsx` that renders every state in
> `projects/coding/states.md` as a labelled row, using the real components, driven by
> `lib/agent-runtime.ts`. No styling beyond tokens. I want to see all 24 states on one page.

### Then design, in the browser
For this category specifically, Figma will lie to you about four things that matter most:

- **Latency.** A 900ms wait is a design material and it doesn't exist in a static file.
- **Streaming.** How text arrives changes how it reads. Rate, chunking, whether it jumps.
- **Motion under change.** Forty nodes updating at once feels nothing like a prototyped transition.
- **Text expansion.** Your Tamil string will break the container. In Figma you'll paste a
  placeholder that fits.

Use Figma for what it's good at here: type specimens across scripts, colour ramps, and the pattern
library's static documentation. Do the actual interaction design in code, in the browser, with the
fault toolbar open.

### Then break it, on purpose
Every state, every session. §4.

### Then log it
`grammar/log/`, same day. Especially the thing that surprised you.

---

## 4 · The fault toolbar

A dev-only panel, on every surface, that triggers any failure state in one click.

> Build a `<FaultBar/>` that mounts in the dev layout: a dropdown of every `FaultKind` in
> `lib/agent-runtime.ts`, a speed slider (0.25× / 1× / 4×), a seed field, and a "replay" button.
> It rewrites the current run's options and restarts the stream. Keep it visually separate from the
> product — it should never be mistakable for UI I designed.

Why it matters more than it sounds:

1. **It's how you design failure at all.** Without it you wait for a real failure, and a real
   failure arrives when you're mid-thought about something else.
2. **It makes your user tests comparable.** Every participant sees an identical failure at an
   identical moment.
3. **It's your interview demo.** Handing someone the toolbar and letting them break your interface
   themselves is far more convincing than any walkthrough. It says: I designed for this.
4. **It goes in the pattern library.** Every published pattern demo should have a fault toggle,
   because a pattern that exists to handle time and failure cannot be proven by a screenshot.

---

## 5 · Friction — the thing you're actually optimising

You said frictionless. Worth separating two different frictions, because one of them you want to
*reduce* and the other you want to *place deliberately*.

### Entry friction — reduce this aggressively
How does someone get from nothing to a working thing? Sarvam's own claim is a useful benchmark:
three weeks compressed to under sixty minutes, and a phone number rented in thirty seconds. So the
first-run experience is explicitly a competitive surface, not an afterthought.

Design targets, measurable:
- **`voice`:** minutes from landing to a simulated call. Their benchmark is 60. Beat it or explain.
- **`doc`:** seconds from landing to a first extraction. Give them a sample document — a real
  handwritten Tamil form — so they don't have to find one.
- **`coding`:** first run without configuring anything.
- **`shell`:** one sign-up serving six surfaces with genuinely different first-run needs. This is a
  real design problem and it's the shell's job.

The general rule: **never make someone supply the thing you could supply.** Sample audio in nine
languages, sample documents, a pre-written spec, a demo key. Every asset you provide removes a
reason to leave.

### In-flow friction — place this proportionally
Here "frictionless" is the wrong goal, and getting this right is a big part of what the brief is
screening for.

The Consequence Gate pattern exists to *add* friction. Certifying something legally binding,
sending an email as someone, publishing regulated medical claims, pointing an agent at real
borrowers' phones — these must not feel like changing a font. **Uniform low friction is a safety
bug**, and a portfolio that treats smoothness as an unqualified good will read as naive to people
who ship agents into regulated Indian industries.

The actual goal, stated properly:

> **Minimise the cost of understanding. Place friction only where consequence earns it, and make
> it a different kind of friction from the flow around it.**

That reframe is worth a paragraph in your write-up. It's the difference between "I made it smooth"
and "I decided where smoothness was inappropriate," and only the second one is a design argument.

---

## 6 · Accessibility — your unclaimed opportunity

Take this seriously and it may become the most original thing in the portfolio, ahead of anything
else here.

**Nobody has answered how an agentic interface works for a screen reader user.** Every product in
this space streams unpredictable content into the DOM, changes the page while you're reading it, and
communicates state through colour and motion. All three are unsolved for non-visual access, and the
field has simply not looked. You have a genuine chance to contribute here.

### The four real problems

**1. Streaming output and live regions.**
Tokens arriving one at a time into an `aria-live` region either announce nothing or announce
everything repeatedly. Neither works. The design question is what the *unit of announcement* is —
probably not the token, probably not the whole response. Sentence? Semantic chunk? Completion only,
with progress announced separately? This is a real, open question and answering it well is a
publishable-quality contribution.

**2. Focus under agent-driven change.**
A node goes `blocked_on_human` while the user is reading something else. Move focus and you've
stolen it mid-task. Don't move it and they may never learn they're blocked. There's a third option
worth designing: an announced, *reachable* affordance that doesn't grab. Nobody has a convention
for this.

**3. State encoded non-visually.**
Your tokens already require two channels, but for a screen reader the requirement is stricter:
state must be in the **accessible name or an explicit status**, not implied by appearance. If
`blocked_on_human` is a colour and a ring, it does not exist for a blind operator. This is exactly
why the pattern rules say the band must change *behaviour*, not just appearance — behaviour is
perceivable through any channel.

**4. Keyboard navigation of a taskgraph.**
A DAG is genuinely hostile to linear traversal. Forty nodes with dependencies has no obvious tab
order. Options: a parallel tree view, a "jump to what needs me" command, spatial arrow-key
navigation, or treating the graph as a visual affordance over a list that is the real structure.
Pick one, argue for it, test it. This is an unsolved problem with a real answer available.

### And the Indic layer on top
Screen reader support for Indian scripts and code-mixed text is weak and inconsistent. A code-mixed
Hindi-English sentence may be read in the wrong voice, or the wrong language, or not at all. You
probably can't fix that — but documenting it accurately, with tests, is itself valuable, and it's
the intersection of two things this brief explicitly cares about.

### The cheap version, if time is short
Pick **one** surface — `doc` is the best candidate, since it's dense, static and the states are
clear — and make it genuinely keyboard-and-screen-reader complete. Test it with a real screen
reader user if you possibly can; one session will teach you more than a month of guidelines.

Then write it up as pattern **#18, Non-visual Agent State**, and be honest about the five surfaces
you didn't get to. One surface done properly plus an honest boundary beats a compliance claim across
six.

---

## 7 · What Claude Code should and shouldn't do

**Delegate:** scaffolding, SSE plumbing, runtime scripts, synthetic test data (Indian-language
documents, call transcripts), sweep clustering, font subsetting, React Flow layout, the state
gallery, accessibility audits and axe integration, type errors.

**Keep:** state lists, copy, which pattern applies, where the friction goes, what the bold thing is,
what to test, and every judgement call about how much to show.

**The failure mode to watch.** Claude Code will happily produce a beautiful, plausible screen from a
one-line prompt, and it will be the happy path, and it will have a purple gradient. The prompt shape
that avoids this:

> Implement the `SWEEP_REGRESSED` state for the voice sweep view. Per pattern 15 in
> `grammar/patterns.md`: distribution first, clusters by cause second, caveats as content not
> footnotes, and the regression must be impossible to miss. Cluster c1 got better by 4, c2 got worse
> by 11. Drive it from `voiceSweep` in `lib/scripts/voice.ts` with `faults: []`. Tokens only. The
> author has 15 seconds and needs to know whether her last edit helped.

State, pattern, data, constraint, user condition. That's the shape.
