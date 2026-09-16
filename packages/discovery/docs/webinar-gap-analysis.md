# What the webinar notes changed

`docs/sarvam-voice-agents-webinar.md` is a technical account of the real product. The briefs in
`projects/` were written from the public description; this is the first source that says how the
thing is actually *shaped*. Read against what we built, it exposes ten gaps. Seven are fixed in this
pass, three are deliberately not.

The useful ones are not "we missed a feature". They're places where our model of the product is
wrong in a way that would make a prototype read as naive to anyone who has used it.

---

## Fixed

### 1. The agent was rules, not an agent

**What the notes say.** An agent is a prompt document *plus tools, input variables, output variables
and a goal*. Output variables are extracted after the call by a second LLM pass; the goal is defined
against them (`call_disposition == appointment_booked`), and the goal is what drives Monitor.

**What we had.** A spec of hard rules, soft guidance and worked examples. No tools, no variables, no
goal. Which means the sweep's seven outcome categories were invented by us rather than derived from
anything the author defined — the single most important structural error in the surface, because it
made the evidence unattached to the thing being evaluated.

**Fixed.** `spec.tool`, `spec.variable` and `spec.goal` events; tools and variables render in the
spec column; the sweep's outcomes are now read against the author's goal, and the distribution
states which outcomes count as the goal being met.

### 2. Evaluation is expected behaviours, not our invented clusters

**What the notes say.** A test is a **simulated user scenario plus a list of expected behaviours in
natural language**, run N times, reported as pass/fail per behaviour against a transcript. The
worked failure: "agent confirms the requested 11:30 callback" never happened, and the failure points
straight at the callback section of the prompt.

**What we had.** Clusters named by cause, traced to a spec line. Not wrong — the brief asked for the
sweep — but floating free of how evaluation is actually expressed, and the trace was to a *rule*
rather than to an assertion someone wrote.

**Fixed.** `spec.behaviour` (the expected behaviour), and clusters now carry `behaviourId`. A
cluster traces to the behaviour it violated and, through it, to the section of the prompt. That is a
stronger Provenance Link than we had: an assertion someone wrote, not a rule we guessed at.

### 3. The spec is a document, and debugging is finding the wrong paragraph

**What the notes say.** Single-state agents only, no conversation graphs: one long prompt, and
"debugging is a matter of scrolling through a document to find the paragraph that is wrong".

**What we had.** Three flat lists. Structurally honest about hard-versus-soft, structurally wrong
about what the artifact *is*.

**Fixed.** The spec has named sections; hard rules and tools live inside them; a failed behaviour
names its section. Hard rules keep their separate container, because the notes don't contradict the
pattern rule — they add the document around it.

### 4. Turn-taking is a set of controls, and they are where latency is felt

**What the notes say.** Eagerness (lower = responds faster, listens less), interruption threshold
(needs tuning for noise; naive handling misfires), nudges after 7–15s of silence with hang-up after
N, voicemail and hold-music detection by a sidecar so minutes aren't burned, synthetic background
ambience because silence is uncanny.

**What we had.** Nothing. Latency was a panel of numbers with no controls attached — which makes it
a readout rather than a design material.

**Fixed.** A settings block with the four that change behaviour, and two faults: an interruption
threshold that misfires in noise, and a call parked on hold burning minutes.

### 5. Going live has real controls, and ours were invented

**What the notes say.** Campaigns carry CPS (calls per second), a permitted calling window, and
retry rules per outcome (busy / no-answer / failed). Numbers are bought by circle after KYC, about
two minutes.

**What we had.** A call cap, which we invented. The cap is still the right *design* — it turns an
untested rule into a measurement — but presenting it as the only control was a fiction.

**Fixed.** The gate now carries CPS, the calling window and retry rules alongside the cap, and the
cap is named for what it is: our addition, sitting beside the product's own throttles.

### 6. Number capture, the named failure mode

**What the notes say.** Capturing phone numbers is a common weak point. Two complementary fixes:
read the number back and confirm, and a `data_validator` system tool with a regex. Format validation
catches malformed values; read-back catches correctly-formatted but misheard ones.

**Fixed.** `data_validator` is one of the system tools, with its regex shown, and the distinction
between the two failure types is in the copy — because they are genuinely different bugs.

### 7. Indic-native means no romanisation in the pipeline

**What the notes say.** Text stays in the Indic script end to end: ASR emits Devanagari, the LLM
receives Devanagari, the TTS is trained on code-mixed input and receives it directly. The accuracy
gains are emergent from that.

**Why it matters to us.** `content` transliterates a mispronounced brand name back into Latin and
Kannada. That is correct *as a review affordance* and would be wrong as a pipeline step. The
distinction is now written into the grammar so a later reader doesn't take it as licence to
romanise.

---

## Not fixed, deliberately

### 8. Monitor is a whole surface and we have a banner

The notes describe Monitor as the third product surface: a dashboard laid out as the journey of a
call (connectivity → engagement → goal achievement → tool calls → group-by → call logs), plus a
custom-board layer with SQL or natural-language widget generation.

`projects/voice/BRIEF.md` scopes this surface to four things and says "resist adding a fifth", and
"one drift signal in production is enough to make the point". So `LIVE_DIVERGING` gets *evidence*
rather than a dashboard: connectivity, goal rate and latency, simulation beside production, which is
the minimum that makes "production is not behaving like the simulation" a claim rather than an
assertion. The full Monitor belongs to a sixth project that doesn't exist, or to `shell`.

### 9. Genie — the agent that builds agents

A copilot with web search and read/write access to the agent's own configuration, which scaffolds
the whole agent from a one-paragraph brief. It is a large, genuinely interesting surface and the
brief's framing — "she describes the agent conversationally; what accumulates is a structured,
editable, diffable Behaviour Spec" — is exactly it.

Not built, because building a convincing conversational authoring surface is its own project and
half-building it would produce the chat-first pattern the axioms warn against. The spec *is* the
durable artifact, which is the half that matters; the conversation that modifies it is the half
that's missing. Named here so it reads as a decision rather than an oversight.

### 10. Campaign construction, MoEngage, pricing, on-prem

Cohort upload with column mapping, error files, webhooks, journey nodes, ₹4/minute. All real, all
out of scope per the brief ("out of scope: billing, team management"), and none of them are where
the design argument lives.

---

## Two things the notes confirmed rather than changed

- **Latency is a design material, and the numbers are small.** Co-location saves 50–200ms; the model
  is deliberately small and runs in non-thinking mode. Our waterfall's segment vocabulary (network /
  queue / model / synthesis) matches how they talk about it, and the placeholder labelling stays —
  but the co-location fact is now in the latency panel, because "why is it fast" is a question the
  author will ask.
- **The simulation-reality gap is real and they say it out loud.** "Web-call behaviour and telephone
  behaviour differ meaningfully"; the caveat that simulation runs on clean audio while production is
  8kHz telephony was already in our caveats, and the notes independently confirm it. That was the
  one piece of writing most at risk of sounding invented.
