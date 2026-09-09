# voice
### Building a voice agent, and finding out if it's any good before it calls a real person

**Covers:** Voice Agents · agent authoring · pre-deployment evaluation · fleets and shared memory ·
non-deterministic output · trust and confidence signalling · Indian language and code-mix diversity

**Build order:** #5 of 6 — the flagship, built last, built well.
**Time:** ~2.5 weeks.

> **Reframed.** An earlier version of this brief designed the *end user* talking to a voice agent.
> That's the wrong side of the glass. Sarvam's Voice Agents is an authoring and ops console: you
> describe the agent, it gets built, you simulate a thousand calls before the first real one, then
> you rent a number and go live. Their claim is that what took about three weeks now takes under
> sixty minutes. That's a far better design problem and a far emptier space.

---

## The trade-off

An author who cannot write code has to specify how an agent behaves in situations nobody
enumerated, then decide whether it's safe to point at real customers.

**Both halves are hard for the same reason: the thing being designed is a distribution of
behaviours, not a behaviour.** You cannot review it by looking at it. You can only sample it.

So this project is really two design problems stacked:
1. What is the *artifact* you edit, when the artifact is neither code nor a flowchart?
2. How do you read a thousand simulated conversations you will never listen to?

The second one is the most novel object in the entire program. Everyone builds a supervision UI.
Almost nobody has designed the surface where you find out whether the agent is any good *before*
it costs you a customer.

---

## The users

**Meera, 31.** Ops lead at a mid-size lending company in Pune. Needs a renewal-reminder agent that
calls borrowers in Hindi and Marathi. Not an engineer — she has written a Zapier automation and
that is the top of her technical range. She has done this before with an external vendor: six
meetings, three weeks, and a bot that said the wrong thing about late fees for a month before
anyone noticed.

Her actual fear is not that the agent will be bad. It's that it will be *good in the demo and bad
in the field*, and that she will be the one who signed off. Design for that fear specifically.

**Rohit, 36**, the same company's ops manager, is the second user: the agent is live, 8,000 calls
a day, and he watches for drift. Different job, different screen, same underlying object.

Their constraints, from research:
- Regulated. What the agent may say about fees, penalties and timelines is legally bounded. "Never
  say X" is a hard constraint, not a style note.
- Borrowers code-switch constantly, and formal Hindi lands worse than Hindi with English loanwords.
  Register is a real control with real outcomes.
- Calls come through telephony: 8kHz, background noise, one party on speakerphone in a market.
  Simulation on clean audio will overstate quality and the interface has to admit it.
- Going live means renting a real number and calling real people about money. There is no
  staging environment that contains that.

---

## Scope

Four surfaces. This is a big project; resist adding a fifth.

1. **The authoring surface.** She describes the agent conversationally; what accumulates is a
   structured, editable, diffable Behaviour Spec. Conversation modifies it; the spec persists.
2. **The simulation sweep.** A thousand synthetic calls, read at four altitudes: distribution →
   failure clusters → exemplars → the exact turn, with a link back to the spec line that governed
   it. **This is the hero.**
3. **Going live.** Number rental, telephony connection, and the Consequence Gate — the moment the
   agent starts calling real people about their debts.
4. **The fleet view.** Explainer → Negotiator → Closer, one workflow, one shared memory. The
   handoffs are the objects, not the agents.

Out of scope: billing, team management, a full analytics suite. One drift signal in production is
enough to make the point.

---

## The state list

**Spec states**
- `SPEC_DRAFT` — being authored, never simulated
- `SPEC_DIRTY` — edited since the last sweep. The most important state here: her results are now
  stale and the interface must not let her forget it.
- `SPEC_CONTRADICTION` — an edit conflicts with a pinned worked example
- `SPEC_CONSTRAINT_UNTESTED` — a hard constraint no simulated call ever exercised. Silently
  untested constraints are how the late-fee incident happens.
- `SPEC_VERSIONED` — committed, diffable against the previous

**Sweep states**
- `SWEEP_QUEUED`, `SWEEP_RUNNING` (with n of 1000 done), `SWEEP_COMPLETE`
- `SWEEP_PARTIAL` — ran out of budget or time. Partial sweeps are still informative and must not
  present as failures.
- `SWEEP_STALE` — valid results, but the spec has moved since
- `SWEEP_REGRESSED` — this run is worse than the last in at least one cluster. Must be
  impossible to miss.
- `SWEEP_UNREPRESENTATIVE` — the synthetic caller population doesn't match production. Honest,
  and almost never surfaced by real tools.

**Per-call outcomes**
- `RESOLVED`, `ESCALATED_TO_HUMAN`, `ABANDONED_BY_CALLER`, `LOOPED`, `TIMED_OUT`
- `CONSTRAINT_BREACHED` — it said the thing it must never say. Loudest treatment in the product.
- `OFF_SCRIPT_BUT_FINE` — it improvised and the improvisation was good. A real and useful category
  that binary pass/fail destroys, and worth designing for.
- `LANGUAGE_DRIFT` — started Hindi, ended English, or vice versa

**Deployment states**
- `NOT_DEPLOYED`, `NUMBER_PENDING`, `LIVE`, `PAUSED`
- `LIVE_DIVERGING` — production behaviour differs materially from simulation. The state that
  answers Meera's actual fear.

**Fleet states**
- `HANDOFF_CLEAN`, `HANDOFF_LOSSY` (context dropped at the seam), `HANDOFF_LOOPED`
- `MEMORY_CONFLICT` — two agents wrote contradictory facts to shared memory

---

## Patterns this project must earn

| Pattern | Where |
|---|---|
| Simulation Sweep | The hero. Four altitudes with a path down and back up. |
| Behaviour Spec | The authoring surface |
| Fleet Handoff | The fleet view; seams as objects |
| Consequence Gate | Going live — real numbers, real borrowers, real money |
| Confidence Without Numbers | Cluster-level: how much should she trust this sweep? |
| Non-finding | `SPEC_CONSTRAINT_UNTESTED` — "no call exercised this rule" is a result |
| Provenance Link | Failure cluster → the spec line that caused it |
| Repair Loop | Fixing a spec line without regressing the clusters that passed |
| Commit Boundary | Spec versions as restorable points |
| Latency Waterfall | The author needs to *feel* the latency of the agent she built |

Ten of seventeen. This is why it's the flagship and why it comes last.

---

## Design direction

Not a chatbot builder. Specifically not: a node-graph canvas with draggable conversation nodes
(rigid, and wrong about what an agent is), and not a single giant "system prompt" textarea
(unversioned, undiffable, makes her expertise unusable).

The reference is a **proofing and test bench** — a wind tunnel, a QA lab, a print proof. Something
where the specimen and the evidence about the specimen sit side by side.

- **The spec and the evidence are co-equal.** Most of the screen, most of the time, is spec on one
  side and sweep results on the other. The whole product is the loop between them.
- **Hard constraints look structurally different from soft guidance.** Not a different colour — a
  different container, a different position, a different edit affordance. "Never quote a penalty
  amount" and "sound warm" fail in different ways and must not be siblings.
- **Distribution before score.** The first thing on the results surface is the shape of a thousand
  outcomes, not `94%`. If you lead with the number, she'll stop reading, and the number is the
  least useful thing you have.
- **Regression is loud.** An edit that fixes one cluster and breaks another is the normal case.
  Hiding it is the single most damaging thing this interface can do. Reserve a treatment for
  "worse than last time" and never use it decoratively.
- **The one bold thing is the sweep distribution.** Everything else — spec editor, transcript
  viewer, deployment panel — stays quiet and instrumental.
- **Transcripts render code-mixed Hindi/Marathi/English inline.** Per-script line heights keyed off
  `lang`, correct fallbacks, no letter-spacing. Mixed-script transcript rows with a stable baseline
  is the concrete Indic-typography proof point in this project.
- **No continuous motion.** A running sweep will tempt you into an animated progress theatre.
  Progress is one number and one bar.

**Copy:** Meera's vocabulary. She says "the bot said the wrong thing," not "constraint violation."
Simulation results must never over-claim — the wording around a pass rate is a design decision
with legal consequences here, and getting it right is a genuine portfolio moment.

---

## The hard moments — this is where the project lives

1. **Reading a thousand calls.** Four altitudes, and the path *back up* matters as much as the
   path down. She fixes one turn and needs to know what that did to the whole distribution.
2. **The simulation-reality gap.** Synthetic callers are more patient, fluent and cooperative than
   real borrowers. How does the interface make a 94% sweep read as *evidence* rather than a
   promise, without being so hedged that it's useless? Hardest writing problem in the program.
3. **The untested constraint.** She wrote "never discuss penalties." No simulated call ever brought
   penalties up. The rule is untested and she believes it's enforced. Surface this.
4. **Editing without regressing.** Same structural problem as regenerating one language variant in
   `content` and re-running a diff in `coding`. Three costumes, one problem — note that in the
   grammar; it's evidence the patterns are real.
5. **`OFF_SCRIPT_BUT_FINE`.** The agent improvised well. Binary pass/fail throws away the most
   interesting information in the sweep. Design a third verdict.
6. **The go-live gate.** The next click causes a real phone to ring in a borrower's pocket about
   money they owe. Design friction proportional to *that*, and of a different kind from everything
   around it.

---

## What you'll learn building this

- How to design an aggregate view over a thousand non-deterministic runs. Transferable to every
  eval surface in the industry, and a skill almost no designer has.
- Clustering and summarising text at scale well enough to name failure causes in a user's own
  vocabulary. Genuinely hard, and Claude Code can do the mechanical half.
- Real-time voice via LiveKit or Pipecat: VAD, barge-in, turn-taking. Don't build turn-taking
  yourself — it's a month of work and it isn't the design problem.
- The real Saaras/Bulbul loop, including what 8kHz telephony audio does to quality.
- How to write about uncertainty without either over-claiming or hedging into uselessness.

---

## Measurement targets

- **Time to first deployed agent.** They claim three weeks compressed to under sixty minutes. Take
  that as the benchmark and measure your own flow against it with 3 non-technical participants.
  A real number against a public claim is a strong case-study artifact.
- **Sweep-to-edit conversion.** Given a sweep with a seeded failure cluster, does the author reach
  the correct spec edit in one pass? This is the sharpest single experiment in the program.
- **Regression catch rate.** Seed an edit that fixes cluster A and breaks cluster B. Do they
  notice B?
- **Calibration, not confidence.** Ask for a predicted production pass rate after they see a 94%
  sweep. If they predict 94%, your interface has over-claimed — no matter how much they liked it.
  Report the gap. This is the appropriate-distrust metric in its most useful form.
