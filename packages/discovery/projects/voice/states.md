# voice — the state list

**Status: confirmed 2026-09-09, extended after the webinar notes.** The brief names 29 states across
spec, sweep, per-call outcomes, deployment and fleet; its hard moments implied 12 more; and
`docs/sarvam-voice-agents-webinar.md` — the first source describing how the real product is actually
shaped — added 15. Decisions in `grammar/log/2026-09-09-voice-decisions.md`, the gap analysis in
`docs/webinar-gap-analysis.md`.

Fifty-six states. It's the flagship and it owes ten of the seventeen patterns.

## The agent — what she is actually editing

Added after `docs/sarvam-voice-agents-webinar.md`; see `docs/webinar-gap-analysis.md` §1–3. An agent
is a prompt document plus tools, variables and a goal. Without these the sweep's outcome categories
were ours rather than hers.

| State | What the interface owes |
|---|---|
| `SECTIONED_PROMPT` | Single-state agent, one document. Debugging is finding the paragraph that is wrong, so the paragraphs have names. |
| `TOOL_DEFINED` | Name, description (which is what the model reads), when it fires, and a budget. |
| `TOOL_OVER_BUDGET` | Over 5s the caller hears dead air. 30s is the hard stop. A tool budget is a latency budget. |
| `VALIDATOR_BOUND` | `data_validator` with a regex. Format checking and read-back confirmation catch different bugs. |
| `INPUT_VARIABLE` | What it knows before it dials. |
| `OUTPUT_VARIABLE` | Extracted from the transcript after the call, by its own prompt. |
| `GOAL_DEFINED` | When a call counts, expressed against an output variable. The thing the sweep is measured against. |
| `BEHAVIOUR_EXPECTED` | An assertion in her words, checked against every simulated call. |
| `BEHAVIOUR_BROKEN` | It did not hold everywhere. The path from a failed assertion down to the calls that broke it. |
| `BEHAVIOUR_UNEXERCISED` | No call tested it — the same silence as an untested rule. |

## Turn-taking — where latency is felt

| State | What the interface owes |
|---|---|
| `EAGERNESS_SET` | Lower answers faster and listens less. It is a trade, and the copy says which way. |
| `INTERRUPTION_MISFIRE` | The threshold is wrong for a noisy line, so traffic stops it mid-sentence. |
| `NUDGING` | Silence after 7s, hang up after two. Minutes are money. |
| `HELD_ON_HOLD` | Parked on hold music and cut by the harness rather than left to burn. |

## Production — one drift signal, not a dashboard

| State | What the interface owes |
|---|---|
| `PRODUCTION_SIGNAL` | The same measures from the phone beside the ones from the simulation. Without it, "diverging" is a word. |

## The spec — the artifact she edits

| State | From the brief | What the interface owes |
|---|---|---|
| `SPEC_DRAFT` | ✅ | Authored, never simulated. No evidence yet, and it should feel like it. |
| `SPEC_DIRTY` | ✅ | Edited since the last sweep. **The most important state here** — her results are stale and the interface must not let her forget. |
| `SPEC_CONTRADICTION` | ✅ | An edit conflicts with a pinned worked example. Show both, don't resolve it for her. |
| `SPEC_CONSTRAINT_UNTESTED` | ✅ | A hard rule no simulated call ever exercised. This is how the late-fee incident happens. |
| `SPEC_VERSIONED` | ✅ | Committed, diffable against the previous — a Commit Boundary. |
| `HARD_CONSTRAINT` | added | Structurally different container from guidance, not a different colour. |
| `SOFT_GUIDANCE` | added | The sibling it must not look like. |
| `EXAMPLE_PINNED` | added | A worked example that edits must not break. The thing `SPEC_CONTRADICTION` fires against. |

## The sweep — the hero

| State | From the brief | What the interface owes |
|---|---|---|
| `SWEEP_QUEUED` | ✅ | What it will cost, before it runs. |
| `SWEEP_RUNNING` | ✅ | n of 1000. One number and one bar — no progress theatre. |
| `SWEEP_COMPLETE` | ✅ | Distribution first. Never a pass rate first. |
| `SWEEP_PARTIAL` | ✅ | Ran out of budget. Still informative, and must not present as a failure. |
| `SWEEP_STALE` | ✅ | Valid results, spec has moved. Pairs with `SPEC_DIRTY`. |
| `SWEEP_REGRESSED` | ✅ | Worse than last time in at least one cluster. Impossible to miss. |
| `SWEEP_UNREPRESENTATIVE` | ✅ | The synthetic callers don't match production. Honest, and nearly nobody surfaces it. |
| `CLUSTER_NAMED` | added | A failure cause named in *her* vocabulary — "the bot quoted a late fee", not "constraint violation". |
| `CLUSTER_UNNAMEABLE` | added | The clustering found a group it cannot describe. Saying so beats inventing a label. |
| `CLUSTER_TRACED` | added | This cluster is governed by that spec line. A cluster you can't trace is a dead end. |
| `CLUSTER_UNTRACEABLE` | added | No spec line explains it. Which is itself the finding. |

## Per call

| State | From the brief | What the interface owes |
|---|---|---|
| `RESOLVED` | ✅ | Collapsed. Success is not information. |
| `ESCALATED_TO_HUMAN` | ✅ | Why, and at which turn. |
| `ABANDONED_BY_CALLER` | ✅ | Where they hung up — the opening or the ask. |
| `LOOPED` | ✅ | The same turn twice. Visible as a shape, not a count. |
| `TIMED_OUT` | ✅ | Distinct from abandoned: nobody hung up, it just stopped. |
| `CONSTRAINT_BREACHED` | ✅ | It said the thing it must never say. Loudest treatment in the product. |
| `OFF_SCRIPT_BUT_FINE` | ✅ | It improvised and the improvisation was good. A third verdict, because binary pass/fail destroys the most interesting information in the sweep. |
| `LANGUAGE_DRIFT` | ✅ | Started Hindi, ended English. Marked on the turn where it moved. |
| `TURN_TRACED` | added | The exact turn, linked to the spec line that governed it — the bottom of the four altitudes. |

## Deployment — the gate

| State | From the brief | What the interface owes |
|---|---|---|
| `NOT_DEPLOYED` | ✅ | |
| `NUMBER_PENDING` | ✅ | Renting a real number takes time; say how long. |
| `LIVE` | ✅ | Real phones are ringing. This should not look like a save. |
| `PAUSED` | ✅ | Stopped, with in-flight calls accounted for. |
| `LIVE_DIVERGING` | ✅ | Production behaviour differs from simulation. The state that answers her actual fear. |
| `GATE_BLOCKED` | added | Something makes going live irresponsible right now. See question 2. |
| `CALL_CAP_ACTIVE` | added | Live, but bounded — the first N calls before it opens up. |

## The fleet

| State | From the brief | What the interface owes |
|---|---|---|
| `HANDOFF_CLEAN` | ✅ | Everything the next agent needed, carried. |
| `HANDOFF_LOSSY` | ✅ | What was dropped at the seam. Most fleet failures live here. |
| `HANDOFF_LOOPED` | ✅ | It came back. The loop is the object. |
| `MEMORY_CONFLICT` | ✅ | Two agents wrote contradictory facts. Both writers named. |

## Latency — she has to feel what she built

| State | What the interface owes |
|---|---|
| `LATENCY_SAMPLED` | What a turn costs: model, network, telephony. At real scale. |
| `LATENCY_UNMEASURED` | Scripted numbers, said out loud as scripted. |

---

## The two decisions

**1. The go-live gate caps rather than blocks.** A hard constraint no call exercised lowers the cap
to 25 real calls instead of preventing deployment — an untested rule becomes a measurement. The one
hard block is a sweep whose spec has since changed, because evidence describing a different agent is
worse than no evidence.

**2. The results lead with shape, then clusters.** One distribution bar across seven outcomes, no
number. Regression gets a reserved treatment above the clusters rather than the opening slot, and
constraint breaches stay inside the bar rather than being lifted out — lifting them out is the
pass-rate failure in a different costume.

## What the webinar notes changed

The sweep's outcomes used to be categories this interface invented. They are now read against a goal
the author defined, and clusters trace to an **expected behaviour** — an assertion somebody wrote —
rather than only to a rule. `docs/webinar-gap-analysis.md` has the full accounting, including the
three gaps left deliberately open.
