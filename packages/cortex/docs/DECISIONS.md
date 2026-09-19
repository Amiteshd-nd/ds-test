# DECISIONS

PRD rule 7: where this implementation conflicts with the PRD, the conflict is written
down rather than silently resolved. Each entry names what the PRD says, what was built,
and what it would cost to go back.

---

## D-1 — Core language: TypeScript, not Python

**PRD §18** pins the core to Python 3.12 + FastAPI + Pydantic v2, on the argument that
the GenAI ecosystem moves fastest there.

**Built:** TypeScript on Node 24, run directly (Node strips types natively — no build
step, no venv, no second toolchain).

**Why:** the host repo is a pnpm/TypeScript workspace. A Python service here cannot be
spawned by `hub/server.mjs`, is not covered by `pnpm -r build`, and needs a virtualenv no
other package has. The portability argument in the PRD is about the *adapter boundary*,
not the language — eight interfaces are eight interfaces in either language.

**Cost of reversal:** the adapter contracts, manifests, prompts, and eval cases are all
either YAML, Jinja, or JSON Schema, and are language-neutral by construction. A Python
core would reimplement `src/core/**` (~2.5k lines) and keep everything else. The
TypeScript types in `src/core/adapters/types.ts` were written to mirror Pydantic models
one-for-one so the port is mechanical.

**Decided by:** the repo owner, asked before any code was written.

---

## D-2 — Durable state: SQLite, not Postgres

**PRD §18 / §6.3** requires Postgres, on the grounds that runs must survive a process
restart and an `awaiting_approval` run may sit for days.

**Built:** SQLite via `better-sqlite3` (already a trusted build in this workspace's
`pnpm-workspace.yaml`), behind `RunStore` in `src/core/runtime/store.ts`.

**Why:** the property the PRD actually asks for is durability, not Postgres. SQLite gives
it with no server to run, which keeps `pnpm dev` a single command. Every query in
`store.ts` is plain SQL with no SQLite-specific syntax.

**Cost of reversal:** one file. `RunStore` is the only thing in core that knows SQL.

**When to reverse:** the moment there is more than one server process. SQLite's
single-writer model is the limit here, not the SQL.

---

## D-3 — Vectors: a lexical hash embedder, not pgvector

**PRD §18** defaults to pgvector with a real embedding model (`bge-m3`).

**Built:** `embed.default` resolves to a deterministic local embedder
(`src/core/router/providers/local.ts`) — character n-gram hashing into a fixed-width
vector. Cosine similarity over it behaves like a weak semantic search: good enough to
exercise the retrieval pipeline, the permission filter, reranking, and the citation
contract, and deterministic enough that evals do not flake.

**Why:** a real embedder needs either an API key or a model download, and neither can be
a precondition for `pnpm dev` in this repo.

**This is a stand-in, not a result.** Do not quote retrieval quality numbers from it.
`RetrievalAdapter` is the seam; swapping in a real embedder is a config change plus one
provider file.

---

## D-4 — Transport: in-process stream + durable event log, not Redis Streams

**PRD §5.3 adapter 7** defaults to Redis Streams + SSE, and strongly recommends backing
it with the host's own messaging system if one exists.

**Built:** `InProcessTransport` — an async iterator fanned out per run, with every event
also appended to the `events` table. SSE resumption via `Last-Event-ID` reads from that
table, so a client that disconnects for a minute loses nothing.

**Why:** one process, no Redis to run. The durable half — the part that makes resumption
real — is implemented, not stubbed.

**Cost of reversal:** `TransportAdapter` is one of the eight. A Redis implementation is a
new file in `adapters-host/`, no core change.

---

## D-5 — Orchestration: a hand-written state graph, not LangGraph

**PRD §18** specifies LangChain wrapped thinly, with LangGraph for control flow.

**Built:** `src/core/orchestrator/graph.ts` — about 120 lines: typed nodes, a reducer over
run state, checkpoint-after-every-node into `RunStore`.

**Why:** the PRD's own instruction is to wrap the framework "deliberately thin — internal
logging, instrumentation, and storage only — so migration stays cheap". At this size the
wrapper *is* the graph. Taking the dependency would have added the framework's state,
callback, and tracing model on top of ours for no behaviour we use.

**Cost of reversal:** node functions have the shape `(state, ctx) => Partial<state>`,
which is LangGraph's own shape. Revisit when Mode B (§9.1 supervisor/sub-agent) ships —
that is where a real graph framework starts paying.

---

## D-6 — Two of the eight adapters are deliberately incomplete in the demo host

`GraphAdapter` is implemented over a small typed edge list; `DesignSystemAdapter` is
implemented by the demo UI. Both are real. But the demo host is a fixture, not a product:
its data is 27 hand-written entities and 28 edges. `cortex doctor graph` (§11.3) runs against it and
reports honestly — including that its median neighbourhood size is too small to prove
anything about a real graph.

---

## D-7 — No write skills in this slice *(superseded by D-16)*

**PRD §19** puts write skills and HITL in M4. **SKILL.md non-negotiable 3** says no write
skill ships until read-only evals pass.

**Built:** read-only skills only. `features.write_skills.enabled: false` in
`cortex.config.yaml`, and the skill registry refuses to load a manifest with
`side_effect != none` while that flag is false.

The *machinery* for gates is present — `awaiting_approval` is a real run state, it
survives a restart, and the approval endpoint exists — because the M1 Definition of Done
requires a durable, resumable run and that is the same mechanism. What is absent is any
skill that could use it.

---

## D-8 — Model access degrades instead of failing

With no `ANTHROPIC_API_KEY` in the environment, `reasoning.*` classes fall through to the
`rehearsal` provider: a deterministic extractive composer that answers from retrieved
chunks and cites them. Runs complete, evals run, the UI renders — and the UI shows the
§13.4 `model-unavailable-fallback-used` state, because that is exactly what happened.

**This is not a language model.** It cannot reason, and its answers are stitched source
sentences. It exists so the substrate is demonstrable offline and so eval cases assert on
the *pipeline* (did retrieval respect permissions, were citations real, was the right
skill chosen) rather than on model prose.

Set `ANTHROPIC_API_KEY` and the same run uses Claude with no other change. That swap
being a zero-code change is the point of §8.

---

## D-9 — Agent entitlement validation is inverted from the PRD's wording

**PRD §6.1** validation rule 1 says: "the agent's `visibility.entitlements` are a subset
of what those skills require."

**Built:** the other direction — every entitlement an agent's skills require must appear
in that agent's `visibility.entitlements`.

**Why:** the PRD's wording permits an agent that is visible to a principal who cannot
call half of its skills. The user meets an agent, asks it to do the thing it advertises,
and gets a permission denial from a tool they were never told about. The reverse
direction is what actually holds the invariant the rule is reaching for: *if you can see
this agent, you can use all of it.*

Flagged rather than silently applied, per PRD rule 7. If the original direction was
intended for some reason not in the document, this is a one-line change in
`src/core/agents/registry.ts`.

---

# PRD Addendum v1.1 — native-only dependency policy

Applied after the audit in `docs/AUDIT-v1.1.md`. The amendment's urgent item — disconnect
LangSmith — did not apply: no hosted dependency was ever taken, and no run data has ever
left this network. What follows is what the rest of it cost.

---

## D-10 — C1 applied, adjusted to SQLite and to having no collector

**Addendum said:** OpenTelemetry everywhere, exported through a collector to Postgres,
with monthly partitions, BRIN indexes, a blob store for payloads, and a viewer in the
Playground.

**Built:** all of it except the collector, which has nothing to sit between. Spans already
had the §16.1 shape; they now land in `traces` and `spans` tables via `TraceExporter`,
payloads go to a content-addressed blob store by `payload_ref`, retention sweeps roll each
day into `trace_daily_stats` before dropping raw detail, and the viewer is a Playground tab
with a waterfall, filters, payload inspection, run-against-run comparison, and replay.

Three SQLite adjustments, none behavioural: `TIMESTAMPTZ` → ISO-8601 text, monthly
partitions → a retention sweep, BRIN → a plain index on an append-ordered column.

**One rename.** The existing `traces` table — run annotations: prompt hashes, quality
numbers, guardrail findings, feedback — became `annotations`, freeing the name for the
span store. `RunStore.trace()` and `.traces()` kept their method names, so no caller
changed, and `openDb` carries a `user_version` migration for databases that predate it.

**What is still missing:** an actual OpenTelemetry SDK. The span *shape* follows the spec,
so adding an exporter is additive rather than a rewrite, but nothing here speaks OTLP yet.

## D-11 — C2 applied, though its stated premise did not hold

**Addendum said:** replace LiteLLM with native provider adapters, *if* LiteLLM is thinly
wrapped.

**Reality:** there was no LiteLLM. The providers were already native.

**Built anyway, because the valuable part was the contract, not the replacement:**
`Provider` now owes `countTokens`, `price`, and `retentionPosture`, and every request
carries `noTraining` and `residency` — derived from the principal's own org rather than
from a caller remembering to pass them. A provider that cannot honour one raises, and the
router skips it and falls through to the next candidate rather than dispatching with the
requirement quietly dropped.

That last clause is the one with teeth: a silently ignored residency requirement is a
compliance breach that looks exactly like a successful request.

## D-12 — C3 confirmed: there is no LangGraph to keep

The addendum's default is to keep LangGraph and verify two conditions. Both hold by
construction here: checkpoints are rows in our own tables, readable with `SELECT` and no
library, and there is no import to contain. Recorded so it is not revisited.

## D-13 — C4 applied as protocol negotiation, not as a rename

**Addendum said:** rename `RunEvent` types to AG-UI names, keep old names as aliases for
one milestone, then remove them.

**Built:** the same vocabulary, served at `GET /v1/runs/{id}/events?protocol=ag-ui`, with
internal names untouched. `docs/EVENTS.md` has the full mapping.

**Why the deviation:** the mapping is not one-to-one, and a rename cannot express that.
One `token` produces two AG-UI events; one `block` produces three; `approval_requested`
becomes a *terminal* `RUN_FINISHED` carrying an interrupt — because AG-UI already models a
human-in-the-loop pause as a run that ends and is resumed by a new one, which is precisely
what an `awaiting_approval` run is. Aliases would also have left every consumer written
during the alias window picking a name at random.

Field names were taken from the published spec rather than from memory.

## D-14 — C5 applied, and it found something

**Built:** a retrieval-boundary assertion that runs in every environment and fails the run
rather than logging; a property test over 1,008 randomised permission matrices; a batching
SLA test at k=200 (measured p95 0.008ms against Atlas, against a 50ms budget); and three
new red-team cases — revocation mid-run, a two-hop graph traversal, and an answer that
repeats an injected instruction.

**What it found.** The two-hop graph case passed immediately, and passed for the wrong
reason. The restricted document was never reaching retrieval at all: the relevance floor
added during the earlier M2 work was a lexical threshold of 0.30, graph neighbours enter at
a flat 0.25, and so **the graph leg had been silently dead since that change** — only
neighbours that also matched on terms survived, which is the set the graph leg is not
needed for. The floor now applies to the keyword and vector legs only, and graph
neighbours are admitted as context around a real hit rather than as an answer on their own.

A red-team case that passes vacuously is worse than no case, because it is evidence of
something it did not test.

**Not built, and flagged rather than faked:** C5 item 4's third case — "a chunk authorised
for retrieval but not for citation display" — is **not expressible** in the current
`PolicyAdapter` contract. There is one `canRead`, and it answers one question. Splitting it
into read-for-grounding and read-for-display would change one of the eight interfaces,
which addendum §0 rule 4 puts behind an explicit instruction and a deprecation cycle. It is
an open item, not a silent skip.

## D-15 — C6 and C7 confirmed: no UI framework, no external search platform

Both were already true and both are enforced rather than intended — the headless package
carries no styles and the lint fails the build on one, and retrieval is first-party behind
`RetrievalAdapter`. `docs/DEPENDENCIES.md` records why CopilotKit and Onyx were each
evaluated and declined.

---

## D-16 — M4: the first write skill, and what it cost

**Supersedes D-7.** Read-only shipped first and its evals passed — golden 6/6, red team
12/12 — which is the condition non-negotiable 3 sets. `write_skills.enabled` is now true.
A fresh host still starts with it false and earns it the same way.

**What landed:** `docs.comment`, a side-effecting skill with an idempotency key, a rate
limit, and a retry policy; `atlas-scribe`, a second agent that holds it behind a
`require_approval` gate; the approval outcomes `approve`, `approve_with_edits`, and
`reject_with_reason`, all three reachable from the UI with the arguments editable in the
card; and ten tests whose entire purpose is to try to make "no write skill executes
without a recorded approval" false.

The Scribe is a **separate agent** on purpose. The Guide is read-only and its golden set
means something precisely because nothing it does has a side effect; folding a write skill
into it would have quietly changed what that suite measures.

### Three things this work changed that were not on the list

**1. A resumed run must not re-ask.** The gate halts the run inside the `skills` node, and
a resume re-enters that node. The first implementation re-ran selection, hit the gate
again, and would have looped forever. Approvals now carry an `executed_at`, a resumed run
executes the answered decision directly, and the mark is written *before* the call rather
than after — a crash mid-call must not leave an approval a later resume would run twice.
The manifest's idempotency key is what makes that safe.

**2. Durable state before the invitation to act on it.** `approval_requested` was emitted
before the run's status was persisted as `awaiting_approval`, so a client that approved
immediately — a fast user, or any automated approver — got "run is running, not awaiting
approval". Found by writing the smoke test, not by review. Same shape as the egress-guard
bug in D-8's neighbourhood: the event must not outrun the state it describes.

**3. §14.2's escalation is no longer dead code.** `argsFromUntrustedContent` was always
false, so the rule that retrieved content may never authorise an action had nothing to
fire on. Arguments a *model* chose are downstream of its context by construction, and that
context contains retrieved documents — so when a run's retrieval turned up
instruction-shaped content, model-chosen arguments for a side-effecting skill now escalate
regardless of the agent's own configuration. Arguments a host *surface* proposed do not:
those came from a person operating the product, and they still meet the declared gates.

### Surface-proposed actions

Choosing a write action's arguments out of free prose is a model's job, and the offline
provider cannot do it (D-8). Rather than fake a parser, a host surface may propose the
action — `trigger.context.proposeSkill` — which is how a real inline or form surface works
anyway.

**Proposing is not authorising.** A proposal enters the same path as a model's choice: the
skill must be in the agent's allow-list, the principal must hold its entitlements, the host
policy still answers, the arguments are still validated against the schema, and the gate
still fires. The red-team case `write-without-approval` proposes the action *and* claims
approvals are disabled for the session, and stops at the gate in three milliseconds.

That case previously asked for the write in prose alone and passed — for the wrong reason,
since the offline selector cannot fill a two-argument write and the gate was never reached.
Second time this project has shipped a vacuous red-team case and had to notice; both are
now written to reach the thing they test.

### What M4 still does not have

Bulk approval (§9.2 requires each item expandable, not a single "approve 40"), approval
timeouts with `expired` as a terminal state, and notification delivery for an approval
that arrives while nobody is looking at the tab. All three matter the moment an agent
proposes more than one action at a time, which is M5 and M6 territory.

---

## D-17 — M5: four surfaces, and the one target it misses

**Built:** `inline`, `rule`, and `background` alongside `chat`, all four reachable from a
single unmodified `atlas-guide` manifest. Rules as four-field manifests (event, guard,
agent, principal) with a scheduler behind the `background` surface. Durable per-principal
notifications with an SSE stream. A document editor and an activity inbox in the demo.

### The inline surface needs no write skill

The agent proposes a diff; **accepting it is the host writing to its own document**, in
its own UI, on its own authority. That is Appendix A's Post Studio rule — "user publishes;
agent never posts" — and it means the inline path has no skill, no gate, and no CORTEX
code in it at all. The diff preview *is* the gate.

`applyEdit` in `adapters-host/atlas.ts` re-checks permission, refuses if the passage has
moved since the proposal was made, and re-indexes the document so the next answer is not
drawn from the version before the edit.

### A rule runs as the principal it names

Not as whoever caused the event. `decision-superseded` runs as a team lead, sees what that
lead sees, and notifies that lead — so the endpoint that emits host events is restricted to
service and admin principals. Without that restriction, any signed-in member could set
someone else's agent to work with someone else's permissions. `tests/server.test.ts` pins
it at the route layer, because that is the only layer it exists in.

### Two prompts, one manifest

`prompts: { inline: atlas-inline@1 }` is a per-surface override. §12 keeps surface
differences away from the agent author, but the prompt is not a difference the runtime can
invent: "rewrite this passage" and "answer this question" want opposite things from a
model. Sharing one prompt between them produced edits with citations in them.

### The miss: inline first token, 506ms against a 500ms target

§12 wants the inline surface under 500ms to first token. Measured, it is 506ms — and with
a real model it would be considerably worse.

**The cause is a decision, not a regression.** The egress guard releases text one completed
sentence at a time, because a guardrail that runs after the stream cannot guard anything
the reader has already seen, and a sentence is the smallest unit over which a redaction
decision can be made — an injected instruction cannot be recognised from half of it. So
"first token" on this surface is really "first sentence", and a long first sentence sets
the number.

Three things could close it, and none is free:

1. **Release on clause boundaries.** Halves the wait and breaks the guard: a clause could
   go out before the rest of its sentence reveals what it was part of.
2. **Stream unguarded text as a visible draft**, guarding only the final proposal. The UI
   already distinguishes drafting from proposed — but unguarded model output reaching a
   client is the exact thing the guard exists to prevent.
3. **Accept it.** The editor shows a drafting state immediately, so the surface is
   responsive even though the first *word* is not.

Taken option 3. `scripts/dod.ts` prints the number every run and labels it MISSED rather
than rounding it away; it does not fail the build, because it is a §12 target rather than
an M5 Definition of Done — both of those (four surfaces from one manifest, and a
background run notifying another device) are met.

### What M5 still does not have

Real push notification (this is SSE to an open client, which is what "notifies mobile"
means when both clients are browser tabs), cron expressions rather than intervals, and an
inline surface in anything but the demo's own editor.

---

## D-18 — M6: a second host, delegation, and the two things it changed

### The portability claim, tested

`docs/SECOND-HOST.md` is the report and should be read instead of this paragraph. The
short version: Harbor — a support desk with row-level permissions, API-key identity, and
no graph adapter — passes conformance 19/19 and ships green, and **not one line of the
orchestrator, grounding pipeline, router, guardrails, memory service, or run state
machine changed** to make that true.

Ten things outside its directory did change, in four groups, and two of them were real
bugs: `src/server` was calling `memory.inspect()` and `transport.notificationStream()`,
neither of which was on the adapter interfaces. A host implementing the published contract
faithfully would have compiled, passed conformance, and crashed on two routes. Both are
now in the interfaces where they belonged.

**Half the DoD is not claimed.** Harbor was built by the same author in the same session,
which removes the thing the test most wants to measure — whether the documentation is
enough for someone who was not in the room.

### Mode B, behind its flag

§9.1's supervisor/sub-agent mode, with every rule the PRD sets: max depth 2 and max
fan-out 5, both enforced at load *and* at runtime; a supervisor cannot grant a specialist
an entitlement its own visibility does not already guarantee; each sub-agent keeps its own
allow-list, its own budget, and its own trace; and a sub-agent run is a real `Run` with
`parent_run_id`, independently traceable and independently evaluable.

`orchestration.dynamic` stays **false**. With the flag off a supervisor is simply an agent
whose sub-agent list is never read, which is the first test in `tests/mode-b.test.ts`.

What this deliberately is not: a planner. The supervisor does not invent a decomposition —
it picks from a declared, validated set of specialists by description similarity. That is
the conservative half of Mode B, and it is the half that delivers the reason the PRD gives
for wanting it: parallel team development and modular quality evaluation.

### Host discovery is a convention, not a registry

`hosts/registry.ts` was a hand-maintained map until `cortex init` scaffolded a host and
the very next command failed with "add it to hosts/registry.ts". A step a generator cannot
do for you is a step someone forgets, so it now loads `hosts/<id>/index.ts` and expects
two exports: an adapter factory and a conformance fixture.

That also removed a caveat from the second-host report — the registry is no longer a repo
artifact a reader could mistake for required plumbing.

### `cortex init`

Scaffolds a host: eight adapters as stubs that compile and fail with a message naming the
checklist, a config, a service entry, and `CHECKLIST.md` in the order things break in if
you do them out of order.

It is not interactive. §17.1 sketches a questionnaire whose answers only decide which stub
to write; writing every stub with the question above it takes the same five minutes and
leaves the decision somewhere a reviewer can see it was made.

Running `doctor` against a fresh scaffold used to produce a stack trace from the unbuilt
fixture. It now says what that means and what to do next, because that is the first thing
a new integrator ever sees.

### Cost dashboard

Per-agent runs, failures, cost, tokens, and p50/p95, computed **live** from the traces
table for days whose detail still exists and read from `trace_daily_stats` for days the
retention sweep has collapsed. Reading only the rollup would show an empty dashboard until
the first nightly sweep — which is exactly when someone is looking, because they have just
turned tracing on.
