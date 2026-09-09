# Tech stack and Claude Code workflow

Chosen for one criterion: how fast can a designer get a *credible, stateful, streaming* prototype
in front of a real user. Not for engineering elegance.

---

## The stack

### Core
| Layer | Choice | Why this and not the alternative |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Server routes let you hold API keys server-side, which you need the moment you show the prototype to anyone. Vite is faster to boot but then you're proxying by hand. |
| Styling | **Tailwind v4 + CSS custom properties** | Tokens live in `tokens.css` as real CSS variables, so the same token file drives all three products with different values. Don't put tokens in a JS object; you lose them in Figma handoff and in devtools. |
| Components | **Radix primitives**, styled yourself | Not shadcn's full kit. shadcn's defaults are the visual signature of a thousand AI demos, and you're being hired to invent a look. Take Radix for behaviour and accessibility, write the surface yourself. |
| State | **Zustand** | Agent state is a machine with events arriving over time. Zustand handles that with less ceremony than Redux and less prop-drilling than context. |
| State machines | **XState**, for voice only | The voice flow genuinely is a state chart, and having the chart be executable means the diagram in your case study is the actual implementation. That's a strong artifact. Don't use it for work/coding — overkill. |
| Streaming | **Vercel AI SDK** | `streamText`, tool calls, and a clean `useChat`. Also handles the SSE plumbing you don't want to write. |
| Graph | **React Flow (@xyflow/react)** | For work's taskgraph. Add `dagre` or `elkjs` for automatic layout — hand-positioning nodes will waste a day. |
| Charts | **visx** or hand-rolled SVG | For the latency waterfall. Recharts will fight you on a real-scale time axis, and this chart is your coding hero so it's worth writing. |
| Motion | **motion** (formerly Framer Motion) | Use it for state transitions only. Read the restraint note below. |
| Mocking | **MSW** + `agent-runtime.ts` | MSW for HTTP-shaped fakes; the runtime for agent event streams. |
| Deploy | **Vercel** | Free, instant, and gives you a URL to put in an application. |

### Voice-specific (`voice`)

Note the reframe: this project is an **authoring console**, so the voice stack is what you test
*inside* it, not the primary interface. Most of your build time goes into the spec editor and the
sweep view.

| Need | Choice |
|---|---|
| STT | **Saaras v3** (`mode: "transcribe"` or `"codemix"`) — 23 languages, code-mixed input, and a telephony-tuned path. `codemix` mode is the interesting one for your brief. |
| TTS | **Bulbul v3** — 11 languages, 30+ voices, adjustable pace and pitch. Pace control matters: your Spoken Echo should be slower than conversational output. |
| LLM | **Sarvam-105B** (`sarvam-105b-conversations` for realtime dialogue) or **Sarvam-30B** if you want lower latency. |
| Realtime orchestration | **LiveKit Agents** or **Pipecat** — both have documented Sarvam integrations, both handle VAD, barge-in and turn-taking. Do not build turn-taking yourself; it's a month of work and it's not the design problem. |
| On-device / Edge | Prototype the *interface* for on-device with a local Whisper-tiny via `transformers.js`, or simply simulate the capability envelope. You are designing the experience of degraded capability, not shipping an edge model. Be explicit about this in the write-up. |
| Browser fallback | `MediaRecorder` + Web Audio for the recording surface; Web Speech API as a dev-time stand-in so you're not burning credits on layout work. |

### Simulation-specific (`voice`)

The sweep is the hero and it needs a thousand synthetic conversations. Two ways to get them, and
you want both:

- **Scripted** — `grammar/agent-runtime.ts` `voiceSweep` gives you a deterministic 1,000-run result
  set with a seeded regression and honest caveats. Build the entire sweep UI against this. It is
  free, instant, identical for every test participant, and it lets you design the regression state
  without waiting for a regression.
- **Real, small** — actually generate 20–50 calls against Sarvam-105B conversations with synthetic
  caller personas. Enough to see what real transcripts look like and to catch the ways your
  scripted data is too tidy. Do not try to run a real thousand; it costs money and teaches you
  nothing the fifty didn't.

For clustering failures by cause, hand the transcripts to Claude Code and have it group and name
the clusters in the author's vocabulary. That's the mechanical half of the hero feature and it's
exactly the kind of work to delegate.

### Document-specific (`doc`)
- **Sarvam Vision 2.0** — native key-value extraction and Indic handwriting support, which makes a
  handwritten Tamil form a real test input rather than a hypothetical one.
- **Sarvam Vision** for OCR and structured extraction across 23 languages — this is what makes work
  more than a mock. Feed it a few synthetic Indian-language forms and you get real, imperfect
  output, which is exactly what you need to design against.
- **pdf.js** for rendering the source document with region highlighting (the Provenance Link
  pattern needs coordinate-level overlay).

### Typography
- **Anek** (Ek Type) — variable, multi-script. One family across Devanagari, Bangla, Gujarati,
  Gurmukhi, Kannada, Malayalam, Odia, Tamil, Telugu and Latin. Verify per-script coverage yourself
  before committing.
- **Noto Sans / Noto Sans Devanagari** as fallback. Load per-script subsets — loading all of Noto
  is megabytes, which matters for voice's ₹8k-phone constraint and is a legitimate design decision
  to write about.

---

## Sarvam API — practical notes

Get a key at `dashboard.sarvam.ai`. Auth is an `api-subscription-key` header.

Models as of now (verify against the docs, they move):
- **Saaras v3** — STT, 23 languages, modes: `transcribe`, `translate`, `verbatim`, `translit`, `codemix`
- **Bulbul v3** — TTS, 11 languages, 30+ speakers, configurable pace/pitch/sample rate
- **Mayura** — translation, 11 languages; **Sarvam-Translate** — 23 languages
- **Sarvam-30B / Sarvam-105B** — chat, 23 languages; `sarvam-105b-conversations` for voice
- **Sarvam Vision** — document intelligence, OCR + structured output, 23 languages

Two things in their docs worth reading before you design anything:
- **`/api-reference-docs/building-for-india`** — their own guide to code-mixing, scripts, native
  numerals, 8kHz telephony audio and pronunciation control. If you're designing for their surface
  area, this is the source of truth for what breaks.
- **The pronunciation dictionary and text-preprocessing options in Bulbul.** Proper nouns and
  alphanumerics are where TTS fails; the fact that they expose controls for it is a design
  affordance you can build on.

### Free gift for Claude Code
Their docs ship an MCP server at `https://docs.sarvam.ai/_mcp/server`, plus `/llms.txt` and
`/llms-full.txt`, and any page returns markdown if you append `.md`. Wire the MCP server into
Claude Code and it will read the live API reference instead of guessing at parameter names.

```bash
claude mcp add --transport http sarvam-docs https://docs.sarvam.ai/_mcp/server
```

This also *is* the `shell` developer-console insight. Sarvam has already decided that coding agents are a first-class
documentation audience. Designing docs for two audiences with different needs — a human who wants
orientation, an agent that wants exhaustive machine-readable reference — is a real, current,
underexplored design problem, and you can point at their own infrastructure as evidence it matters.

### Budget
Speech APIs are billed per unit of audio or per 10k characters. Development burns far more calls
than you expect, mostly on layout iterations. Two habits:
- Cache every response to disk in dev, keyed by input hash. Replay from cache by default.
- Build against `agent-runtime.ts` scripts for all layout and state work. Hit the real API only
  when you're specifically testing quality or latency.

---

## Claude Code workflow

You'll get dramatically better output by front-loading structure. Four things:

### 1. `CLAUDE.md` at the repo root
Already written for you — see the file. It carries the design grammar constraints so you don't
re-explain them every session. Update it when a pattern changes.

### 2. Build in this order, always
```
state list  →  agent-runtime script  →  component  →  real API  →  test  →  log entry
```
The temptation with Claude Code is to ask for a screen and get one in ninety seconds. Resist it.
If you generate the screen first, you get the happy path, and the happy path is worthless here.
Write the state list first and hand it over as the spec.

### 3. Prompt at the level of state, not screen
Bad: *"Build a voice assistant UI for truck drivers."* You'll get a purple gradient and a
pulsing orb.

Good:
> Implement the `AWAITING_REPAIR` state for the duty-status flow. Context: Saaras returned
> `off_duty` at 0.94 confidence and location `Nagpur` at 0.41. Per the Repair Loop pattern in
> grammar/patterns.md, ask about the low-confidence span only, offer the top-3 ranked
> alternates, and keep the parsed frame intact. Use tokens from grammar/tokens.css.
> Drive it from a script in agent-runtime.ts — no real API call. The screen is glanceable
> only: assume 1.5 seconds of attention, direct sunlight, and one free hand.

### 4. Use subagents for the boring half
Claude Code is very good at the work that isn't design judgement: writing the runtime scripts,
generating synthetic Indian-language test documents, building the font-subsetting pipeline,
scaffolding the pattern-library site. Delegate all of that. Spend your own attention on the state
lists, the copy, and the testing.

### Useful slash commands to define
- `/state-list <flow>` — enumerate every state including failures, before any UI
- `/pattern <name>` — pull the pattern spec from the grammar doc and check the current component against its rules
- `/log <what changed>` — append a dated entry to `grammar/log/`
- `/fault <type>` — add a fault-injection case to the runtime

---

## A note on restraint

Two failure modes to watch, because Claude Code makes both effortless:

**Motion.** Fade-and-slide-up on every card, hover transitions on everything, a continuously
pulsing "thinking" indicator. This reads as generated. Motion in an agentic interface should do
exactly one job: show what changed. A state transition earns an animation. A card appearing in a
list does not. In work especially, where the graph is always changing, continuous motion communicates
nothing and makes the screen unusable for an eight-hour shift.

**Card soup.** Content chopped into identical rounded rectangles with the same border radius, the
same soft grey shadow and a gradient wash. Hierarchy should come from the information, not from
uniform containers. work in particular should feel like a working instrument — dense, quiet, closer
to a trading terminal or a ledger than to a marketing site — and voice should feel like road
signage: enormous type, brutal contrast, almost no chrome.

Spend your boldness in one place per product. voice's is the type scale. work's is the taskgraph. coding's
is the latency waterfall. Everything around the bold thing stays disciplined.
