# The pattern language

Read this before you design any screen. It is the shared vocabulary across all six projects —
`voice`, `doc`, `work`, `content`, `coding`, `shell` — and it is the seventh deliverable.

---

## The premise

The web settled on a grammar: link, scroll, form field, modal. Mobile settled on its own: tab bar,
sheet, pull-to-refresh. Agentic products have not settled on anything. Everyone is shipping
approximate versions of the same handful of objects — the plan list, the thinking trace, the
tool-call log, the source panel, the approval prompt — and none of them are stable.

The reason they're unstable is that they're all attempts to solve one trade-off:

> **An agent's value scales with how much it does unsupervised. Its trustworthiness scales with
> how much you can see. Every pattern below is a specific answer to "what is the cheapest possible
> unit of legibility here?"**

"Cheapest" is the operative word. Showing everything is not a design solution — it's the absence
of one, and it puts the reviewing burden back on the human, which destroys the reason to delegate.
Good agentic design surfaces the *minimum* state that supports confident delegation.

---

## Three axioms

**1. Design the state machine, not the screen.**
Non-deterministic systems have no canonical screen. They have a state space. List the states
before you draw. If your state list has fewer than a dozen entries you have not thought about
failure yet.

**2. The transcript is not the product.**
Chat is an excellent input surface and a terrible output surface: linear, ephemeral, stateless.
Everything valuable scrolls away. Every agentic product needs a second place — a durable artifact
that accumulates — and the chat's job is to modify it. Chat-first does not mean chat-only.

**3. Latency is a design material.**
Not an engineering problem to be hidden behind a spinner. Time-to-first-token, streaming rate, and
tool-call duration are as much part of the felt experience as colour and type. Design them.

---

## The patterns

Seventeen, in three groups.

**1–12 · The supervision grammar.** Patterns for watching an agent work and taking control back.
This is the well-trodden half, and these twelve are refinements of things the field is already
fumbling towards.

**13 · Verification without capability.** One pattern, out of `content`. For output you cannot
evaluate at all, not merely output that is expensive to check.

**14–17 · The authoring grammar.** Patterns for *building* an agent, evaluating it before it
touches a real person, and running fleets of them. This is the genuinely unoccupied territory —
almost every agentic product ships a supervision UI and almost none has thought hard about the
authoring and evaluation surface. #15 in particular is the most novel object in the program.

Each pattern must be earned in at least two projects. Each gets a mandatory changelog.

### 1. Spoken Echo
> *Confirming an action to someone who cannot read the confirmation.*

**Problem.** In a voice interface there is no undo, no scan, no glance. If the agent misheard, the
person needs to know before the action commits — and they may not be able to read a transcript.

**Anatomy.** Restate the *parsed intent*, not the heard words. Use a different modality than the
input where possible (audio in → audio out plus one icon). Restate only the fields whose being
wrong would be expensive. Include one distinguishing detail so the person can tell a right parse
from a plausible wrong one.

**Rules.**
- Echo semantics, never raw ASR. "Going off duty at Nagpur, 6:40 pm" beats replaying the audio.
- Never echo more than three facts. Beyond three, people stop listening.
- Numbers and proper nouns are where ASR fails, so those get echoed even when nothing else does.
- The echo must be interruptible. If it's wrong, the person will try to say so mid-sentence.

**Anti-pattern.** "I heard: *[replay of your own voice]*." This tells the person nothing about
whether the system understood.

**Used in.** `voice` (primary), `work` (bulk-action confirmation).

---

### 2. Repair Loop
> *Getting from a wrong parse to a right one in one turn.*

**Problem.** ASR and NLU will be wrong. The default recovery — "Sorry, I didn't understand, please
try again" — throws away everything the system *did* get right and puts the person back at zero.

**Anatomy.** Identify the low-confidence *span*, not the whole utterance. Offer the alternates the
model already ranked. Ask the narrowest possible question.

**Rules.**
- Never discard the whole turn. Repair the field, keep the frame.
- Ask about one span at a time, highest-consequence first.
- Offer a *disambiguation* not an *open retry*: "Nagpur or Nagaur?" beats "Where?"
- Cap at two repair attempts, then escalate to a different modality or a human. Three failures
  in a row is a design failure, not a user failure.

**Used in.** `voice` (primary), `work` (field correction), `coding` (query correction).

---

### 3. Confidence Without Numbers
> *Signalling uncertainty to people for whom "87%" is meaningless or misleading.*

**Problem.** Percentages imply a precision the model doesn't have, invite false calibration, and
are useless to a low-literacy or non-numerate user. But hiding uncertainty is worse.

**Anatomy.** Three bands, never a continuum: **committed** / **check this** / **couldn't do it**.
Each band gets a treatment on at least two non-colour channels — position, weight, an icon,
prosody, whether it's read aloud, whether it's pre-selected.

**Rules.**
- Three bands maximum. Five bands is a graph pretending to be an interface.
- The band determines *behaviour*, not just appearance. "Check this" items must be un-skippable
  in a bulk flow; "committed" items must be skippable. If the band changes nothing about what
  happens, it's decoration.
- Encode on at least two channels. Never colour alone.
- Expose the raw score exactly once — in the operator's threshold-tuning surface (see Delegation
  Envelope), where a number is genuinely the right control.

**Used in.** `voice`, `work` (both primary), `coding` (per-language accuracy).

---

### 4. Consequence Gate
> *Making the irreversible feel irreversible.*

**Problem.** Agentic flows are frictionless by design, which means the action that sends money,
signs a legal attestation or deletes a record feels exactly like the action that changes a font.
Uniform friction is a safety bug.

**Anatomy.** Friction proportional to consequence, and of a *different kind* from the surrounding
flow. If the flow is voice, the gate is physical. If the flow is one-click, the gate is typed. If
the flow is fast, the gate is slow on purpose.

**Rules.**
- Change the modality at the gate. A voice "yes" cannot authorise a legal attestation — a voice
  interface's whole strength is low friction, so it is the wrong channel for a commitment.
- Name the consequence in the gate copy, in the second person, in plain language. Not "Confirm
  submission" but "You're signing that these 8 hours are accurate."
- The gate is the one place a delay is a feature. Vehicle in motion? The gate waits.
- Never gate the reversible. Gates lose all meaning if they appear on ordinary actions.

**Used in.** `voice` (log certification), `work` (bulk commit, permission changes).

---

### 5. Degraded Mode
> *Offline, slow and on-device as first-class states rather than errors.*

**Problem.** On-device and cloud are not the same product with different latency. They have
different capability envelopes. Treating the edge case as an error state ("No connection")
throws away the fact that the local model works fine for 80% of what the person needs.

**Anatomy.** A persistent, low-key capability indicator — not an error banner. State what still
works, not what doesn't. Queue what can't be done now with a visible commitment about when it will.

**Rules.**
- Phrase in terms of capability, present tense, affirmative: "Working on-device — logging works,
  fleet messages will send later."
- Anything queued must be visible and countable. An invisible queue is a data-loss story.
- Never lose input because the network went away. Capture locally, always.
- The transition between modes is the design problem, not the modes themselves. Handoffs
  mid-utterance are where this pattern lives or dies.

**Used in.** `voice` (primary — this is the Sarvam Edge story), `work` (long-running job resilience).

---

### 6. Taskgraph
> *Making parallel, multi-step agent work legible at a glance.*

**Problem.** A transcript works for one agent doing one thing. The moment work fans out into
parallel subtasks with dependencies, a linear log becomes unreadable. You need structure: what's
running, what's blocked, what's blocked *on you*, where it went wrong.

**Anatomy.** A directed graph with node states and one privileged visual channel reserved
exclusively for "needs you." Two views of the same graph: an overview that answers "is this going
fine?" and a drill-in that answers "what exactly happened at this node?"

**Rules.**
- Reserve your loudest visual treatment for **blocked-on-human**. That is the only state that
  costs the person something if they miss it.
- The overview must answer "do I need to act?" in under two seconds, without reading.
- Collapse successful subgraphs aggressively. Success is not information.
- Failed nodes retain their inputs. A failure you can't retry with the same inputs is a dead end.
- Do not animate the graph continuously. Motion should mark *change*, and in a live system
  everything is always changing, so continuous motion communicates nothing and exhausts the viewer.

**Used in.** `work` (primary), `coding` (multi-step pipeline runs).

---

### 7. Exception Queue
> *Inverting review — the agent surfaces what it couldn't handle, instead of the human checking everything.*

**Problem.** The naive review UI shows all agent output for approval, which means the human's
workload scales linearly with the agent's throughput. That eliminates the point of the agent.

**Anatomy.** A queue of only the items the agent flagged, typed by *why* it flagged them, grouped
so one decision can resolve many items. Plus a visible sample of the unflagged work, so the
operator can audit the agent's own judgement about what needed flagging.

**Rules.**
- Type the exceptions by cause, not by severity. "Signature illegible" and "amount doesn't match
  total" need different UIs, and cause tells you which.
- Group by root cause so one decision clears a batch. This is where the leverage is.
- Always include a random audit sample of *accepted* items. Without it the operator is trusting
  the flagging model blind, and has no way to notice it's drifting.
- Show the queue's rate of change, not just its depth. Depth 200 and falling is fine; depth 40
  and climbing is an incident.

**Used in.** `work` (primary), `coding` (eval failures).

---

### 8. Provenance Link
> *Getting from a claim to its source in one action.*

**Problem.** An agent produced a value. Verifying it by re-reading the source defeats the purpose;
trusting it blind is unacceptable. The cost of verification is the whole ballgame.

**Anatomy.** Every agent-produced value carries a pointer to the exact region of the exact source
it came from. Activating the value reveals the source region *in context* — same screen, no
navigation, no modal that loses your place.

**Rules.**
- Point to a region, not a document. "Page 4" is not provenance.
- Round-trip both directions: value → source, and source → every value derived from it.
- Verification must be cheaper than re-derivation, or nobody will verify.
- A value with no provenance must *look* different from one with provenance. Inferred and
  extracted are not the same kind of fact and must not share a treatment.

**Used in.** `work` (primary), `coding` (docs citations), `voice` (which rule triggered this warning).

---

### 9. Delegation Envelope
> *Letting a person set how much authority the agent has, and see the consequences of that choice.*

**Problem.** "How much should the agent do on its own?" is the central question of every agentic
product, and it is almost always answered by the engineer at build time. It belongs to the
operator, and it changes by context, time of day, and stakes.

**Anatomy.** An explicit, adjustable scope of authority — which actions, up to what value, on
what data, with what confidence floor — paired with a *preview of the consequence* of the setting.

**Rules.**
- Show the trade in the same view as the control. Moving the confidence floor from 0.9 to 0.8
  should immediately show "≈340 more items auto-approved per day, ≈6 more errors expected." A
  policy control without a consequence preview is a guess dressed as a setting.
- Envelopes must be revocable instantly, and the revocation must halt in-flight work.
- Log every envelope change with who and why. This is the audit surface regulators ask for.
- Never let the agent widen its own envelope. Obvious, and frequently violated.

**Used in.** `work` (primary), voice (which actions may be `voice`-only).

---

### 10. Non-finding
> *Reporting the absence of evidence as a first-class result.*

**Problem.** Agents are trained to produce output. An agent that searched 200 documents and found
nothing relevant will usually produce something anyway. The most dangerous agent output is a
confident answer to a question the sources don't address.

**Anatomy.** An explicit slot in the output for "what I looked for and did not find," and for
"what I could not access." Sized and positioned so it is not skippable.

**Rules.**
- The non-finding needs the same visual weight as a finding. Footnoting it defeats it.
- Distinguish *absent* from *inaccessible* from *ambiguous*. Three different next actions.
- Name the search boundary: what corpus, what time range, what languages. An unbounded null
  result is meaningless.

**Used in.** `work` (primary), `coding` (empty eval results), `voice` (couldn't verify against the rulebook).

---

### 11. Commit Boundary
> *A named, restorable point in a long-running agent session.*

**Problem.** An agent working for 40 minutes produces continuous change. Without checkpoints,
review is all-or-nothing and rollback is impossible — so the person either accepts everything
or discards everything.

**Anatomy.** Explicit, named boundaries in the work stream. Each is diffable against the previous
and restorable. The person can accept up to boundary 3 and reject 4.

**Rules.**
- Boundaries are semantic, not temporal. "Extracted all invoice headers" not "12:04pm."
- Every boundary is a valid stopping point. If the agent can't safely stop there, it isn't one.
- Diff between boundaries, never against the origin. Cumulative diffs become unreadable fast.
- Name them from the person's domain vocabulary, not the system's.

**Used in.** `work` (primary), `coding` (playground session history), `voice` (shift segments).

---

### 12. Latency Waterfall
> *Making time visible so it can be reasoned about.*

**Problem.** Agentic systems are slow in structured, diagnosable ways — model time, tool time,
network time, queueing. A spinner collapses all of that into "wait." For a developer choosing
between configurations, the breakdown *is* the decision.

**Anatomy.** A horizontal time-decomposition of a single run, segmented by cause, at real scale.
Comparable across runs.

**Rules.**
- Real scale. A waterfall with a compressed axis is a lie about the thing it's measuring.
- Segment by cause, in the vocabulary of the person's decision (model / network / queue), not the
  vocabulary of your traces.
- Show time-to-first-token separately from total. For streaming interfaces they are different
  products.
- Show the distribution, not one sample. p50 and p95 side by side, because a demo run is not a
  performance claim.

**Used in.** `coding` (primary), `work` (job monitoring).

---

### 13. Back-translation Mirror
> *Letting someone verify output in a language they cannot read.*

**Problem.** A content agent generates copy in nine languages. The person accountable for it reads
two. This is not "verification is expensive" — it's "verification is impossible." And the failure
mode that matters is not a bad translation, it's a *fluent and wrong* one, because that's the one
nobody catches.

**Anatomy.** Round-trip the generated text back to the source language and show the person the
**drift**, as a diff, in a language they can read. Where the round trip holds, they have grounds
for confidence. Where it diverges, something moved and deserves a look. Sentence-aligned, so the
diff points at a specific claim rather than a whole paragraph.

**Rules.**
- Show drift as a diff, never as a score. A number invites false calibration; a diff invites
  reading.
- Sentence-level alignment, not document-level. "Something changed somewhere" is not actionable.
- Separate **fluency** from **fidelity**. They're different axes and collapsing them into one
  confidence value is the standard mistake in every translation tool that exists.
- Mark change only. Agreement is not information and must not get a treatment.
- **Do not over-claim.** A clean round trip does not prove a good translation — some errors survive
  the round trip intact, and some faithful translations round-trip badly. The pattern's job is to
  surface *candidates for suspicion*, not to certify. The copy around it must say so plainly.
- Pair with an honest `APPROVED_UNVERIFIED` state. If the person approves without being able to
  check, record that. Pretending the state doesn't exist is how the category currently fails.

**Anti-pattern.** A single "translation quality: 94%" badge. It's unfalsifiable, it's not
actionable, and it converts an unknown into false comfort — which is worse than the unknown.

**Used in.** `content` (primary), `doc` (verifying extraction from a script the reviewer
doesn't read).

**Why this one matters most.** The other twelve patterns are refinements of things the field is
already fumbling towards. This one addresses a problem specific to genuinely multilingual products
that nobody has a good answer to. Designing an affordance that is useful *while being honest about
its limits* is the hardest writing problem in the program, and it's exactly what the brief means
by trust signalling.

---

## The authoring grammar

Patterns 1–13 assume the agent exists and you are watching it. These four are about the surface
where an agent gets *made*, *tested* and *sent live* — which is a different job with a different
user, and where the design vocabulary is thinnest.

---

### 14. Behaviour Spec
> *Editing an agent's behaviour when the behaviour is not code and not a flowchart.*

**Problem.** A non-engineer needs to define how an agent behaves across situations nobody
enumerated. Prompt text is too loose to reason about and too fragile to edit safely. A flowchart
is too rigid — the whole value of the agent is handling paths you didn't draw. Neither is the
right artifact, and "just chat with it" leaves nothing durable behind.

**Anatomy.** A structured, inspectable specification that is neither prose nor a graph: the
agent's objective, the things it must never do, the tools it may reach for, the facts it can
assume, and a small set of worked examples that pin down tone and edge-case handling. Conversation
is how you *modify* the spec; the spec is what persists.

**Rules.**
- The spec is the durable artifact; the conversation that produced it is not (axiom 2, applied to
  authoring). If the author can't see and edit the thing they built, they can't own it.
- Separate **hard constraints** from **soft guidance** visually and structurally. "Never quote a
  price" and "sound warm" fail in completely different ways and deserve different treatments.
- Worked examples are load-bearing, not documentation. Show which ones are currently pinning
  behaviour, and warn when an edit contradicts one.
- Every spec change must be diffable against the last version, because the author's real question
  is never "is this good?" — it's "is this better than what I had?"
- Never let the agent silently rewrite its own spec.

**Anti-pattern.** A single large text area labelled "System prompt." It is unversioned,
undiffable, unreviewable, and it makes the author's expertise unusable.

**Used in.** `voice` (primary), `work` (defining what an employee agent may do), `coding` (run
instructions).

---

### 15. Simulation Sweep
> *Reading a thousand runs you will never listen to individually.*

**Problem.** Before an agent talks to a real customer, you can run it against a thousand synthetic
ones. That produces a thousand transcripts. A list of a thousand transcripts is not information,
and a single aggregate pass rate is not either — it tells you *that* something is wrong without
telling you *what*. The author needs to get from "94%" to the specific turn that breaks things,
and back out again.

**Anatomy.** Four altitudes, with a path down and back up:
1. **Distribution** — outcomes across the sweep, not an average. Shape over score.
2. **Clusters** — failures grouped by *cause*, named in the author's language, sized by frequency.
3. **Exemplars** — two or three representative runs per cluster. Not a random sample; the ones
   that best characterise the cluster.
4. **The turn** — the exact exchange where it went wrong, with the spec line that governed it.

**Rules.**
- Never lead with a single score. A pass rate is a headline, and the headline is the least useful
  thing in the report.
- Cluster by cause, not severity. Cause tells the author what to change; severity only tells them
  to care.
- Every cluster must link to the part of the Behaviour Spec that governs it. A failure you can't
  trace to an editable line is a dead end.
- **Say what the simulation cannot tell you.** Synthetic callers are more patient, more fluent and
  more cooperative than real ones. A sweep result is evidence, not a production promise, and the
  interface must not let a 94% read as a guarantee. This is the same over-claiming discipline as
  the Back-translation Mirror, and it's where most eval tooling quietly lies.
- Re-running after an edit must show the **delta**, not a fresh absolute. The author's question is
  "did my change help?"
- Show what got *worse*. An edit that fixes one cluster and breaks another is the normal case, and
  hiding the regression is the single most damaging thing this surface can do.

**Used in.** `voice` (primary), `content` (sweeping a dubbing job across languages), `coding`
(test runs across a repo).

**Why this one matters most.** Everyone builds the supervision UI. Almost nobody has designed the
surface where you find out whether the agent is any good *before* it costs you a customer. It's
also the surface with the clearest measurable value: if an author can get from a sweep to a
correct spec edit in one pass, you have compressed weeks of production trial-and-error into an
afternoon.

---

### 16. Fleet Handoff
> *Several agents, one outcome, one shared memory.*

**Problem.** A single outcome gets split across specialised agents — an explainer, then a
negotiator, then a closer — sharing context. When the outcome is wrong, the question is not "which
agent failed" but "where did the handoff lose something." That boundary is invisible by default.

**Anatomy.** The handoff itself is a first-class object: what was carried forward, what was
dropped, what was inferred rather than passed. Plus a view of the shared memory as a thing with
contents and a history, not an implementation detail.

**Rules.**
- Show what crossed the boundary and what didn't. A handoff you can only see the inputs and
  outputs of is not inspectable.
- Attribute outcomes to the handoff, not just to agents. Most fleet failures live in the seams.
- Shared memory needs provenance: which agent wrote this, when, from what. Otherwise it becomes an
  unauditable blob that everything depends on.
- Let the author replay from any handoff point, not only from the start. Re-running the whole fleet
  to test the third agent is how debugging becomes unaffordable.

**Used in.** `voice` (primary), `work` (a triage agent handing to a drafting agent), `coding`
(sub-agents on one task).

---

### 17. Cross-surface Shell
> *One identity, one budget, five genuinely different interaction models.*

**Problem.** A platform bundles surfaces that share nothing about how they're used — a voice
authoring console, a document review queue, a code run, a media studio — behind one sign-up and
one credit balance. Two failure modes pull against each other: force consistency and every surface
gets flattened to the least-demanding one; allow full divergence and it stops being a platform.

**Anatomy.** An explicit division: what the shell owns (identity, budget, permissions,
cross-surface handoff, the location of state) versus what each surface owns (density, primary
object, interaction model, its one bold thing). Written down, so the line is a decision rather
than an accident.

**Rules.**
- The shell owns **orientation and continuity**, never density. A review queue and a voice console
  should not have the same information density, and forcing them to is how platforms get worse
  than the sum of their parts.
- A shared budget across incomparable units — voice minutes, document pages, code tokens — needs
  translation, not just a number. "8,400 credits" is meaningless; "about 300 more calls, or 4,000
  pages" is a decision.
- Cross-surface handoff must be explicit and inspectable. When a doc agent's output becomes a work
  agent's input, that seam is a Fleet Handoff and gets the same treatment.
- Agent state tokens are shared and reserved **globally**. `blocked_on_human` must look the same
  in all five surfaces or the reservation buys nothing.
- Everything else is allowed to differ, on purpose, with the reason recorded.

**Used in.** `shell` (primary), and it constrains all five others — which is exactly why the
design-system case study lands here.

---

## Indic typography — the non-negotiables

These belong in the grammar, not in a footnote. They are also the fastest way to demonstrate you
have actually built for Indian languages rather than talked about it.

- **Line height.** Devanagari, Bangla, Gujarati and Gurmukhi carry marks above and below the
  baseline. Latin-tuned line height (1.4) clips matras and collides ascenders with the previous
  line's descenders. Use 1.65–1.8 for Indic body text. Set it per-script, not globally.
- **Text expansion.** Expect 15–30% more width than English for the same content, and more for
  Tamil and Malayalam. Any component sized to fit English copy will break. Design the longest
  language first — usually Tamil or Malayalam — and let English be the easy case.
- **Never uppercase.** Indic scripts have no case. `text-transform: uppercase` on a mixed-script
  label does nothing to the Devanagari and makes the Latin shout. This alone kills the standard
  all-caps label convention, which is a good thing.
- **Never letter-space.** `letter-spacing` on Indic text breaks conjuncts and pushes matras away
  from their base glyph. It is not a stylistic choice; it's a rendering bug.
- **Truncation is dangerous.** Cutting mid-conjunct or before a matra produces a non-word or,
  worse, a different word. Prefer wrapping, or truncate at word boundaries only.
- **Numerals.** Decide deliberately between Latin and native numerals, per language and per
  context. Many Hindi speakers read Devanagari prose but prefer Latin digits for times, amounts
  and phone numbers. Document the rule.
- **Code-mixing is the normal case, not an edge case.** Real Indian speech mixes scripts within
  a single sentence. Your components must handle a Devanagari sentence with a Latin brand name
  and a Latin digit sequence, without the baseline jumping. Test with a real code-mixed string,
  not lorem ipsum.
- **Font choice.** One variable family covering many scripts beats stitching families together.
  Anek (Ek Type) covers Devanagari, Bangla, Gujarati, Gurmukhi, Kannada, Malayalam, Odia, Tamil,
  Telugu and Latin with consistent metrics. Noto Sans variants are the fallback. Verify the exact
  script coverage yourself before committing — this is the kind of detail worth a line in your
  case study.

---

## The changelog is the deliverable

For each pattern, keep a dated changelog in `grammar/log/`. Minimum one entry per pattern:
*what v1 was, what broke in testing, what v2 changed, what that cost.*

Two examples of the kind of entry that lands:

> **Confidence Without Numbers, v1 → v2.**
> v1 used a three-step colour ramp, green/amber/red. In testing with two operators, both used
> amber and red interchangeably and neither could say what the difference meant. It also failed
> for one participant with red-green deficiency, which I should have caught at v1. v2 keeps three
> bands but encodes them on position and behaviour instead: "check this" items are pulled out of
> the list into a separate queue and cannot be bulk-approved. Colour is now redundant reinforcement
> rather than the carrier. Cost: the single-list scan is gone, which two operators said they
> missed. Accepting that trade — a scan you can't act on safely isn't worth preserving.

> **Spoken Echo, v1 → v3.**
> v1 echoed the ASR transcript. Drivers corrected the *wording* rather than the *meaning* — one
> spent three turns fixing "Nagpur" to "Nagpur city" when the parse was already right. v2 echoed
> parsed intent instead. Better, but the echo ran to five facts and two of three testers
> interrupted before the end, missing a wrong timestamp. v3 caps the echo at the two
> highest-consequence fields (time, duty status) and drops location unless it changed. Correction
> rate went from 3 turns to 1 on the same scripted test.

Do not write these retrospectively. Reviewers can tell, and the reason this bullet is in the
brief is that it's hard to fake.
