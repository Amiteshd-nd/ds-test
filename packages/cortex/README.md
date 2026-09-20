# @cloud-march/cortex

A portable AI agent layer. It installs into a product that already has data, APIs, auth,
and a design system, and turns it into one with native AI chat and agents — without the
agent layer ever learning which product it is in.

Built from the PRD, its v1.1 native-only addendum, and the `cortex-agent-layer` skill —
all three in `docs/spec/`, verbatim. Section numbers in the code and in this file refer to
the PRD; C-numbers refer to the addendum. Where the implementation departs from either,
`docs/DECISIONS.md` says so and why.

**Zero vendor-hosted dependencies, and no run data has ever left this network.** Three
runtime packages, all MIT, all replaceable in a day: see `docs/DEPENDENCIES.md`.

```bash
pnpm dev:cortex     # Atlas demo → http://localhost:6181   (agent service on :6182)
```

No API key needed. With `ANTHROPIC_API_KEY` set, the identical run goes to Claude
instead — that swap being a config change and nothing else is the point of §8.

---

## The one idea

Everything the host knows sits behind **eight adapters**, and nothing in `src/core/`
imports anything else. `pnpm lint` fails the build on a violation, and there is no
allowlist, because an allowlist is how the boundary dies.

| # | Adapter | What the host answers |
|---|---|---|
| 1 | `IdentityAdapter` | who is asking |
| 2 | `PolicyAdapter` | what they may see and do — **batched**, because retrieval filters hundreds of refs per turn |
| 3 | `RetrievalAdapter` | grounding in host truth |
| 4 | `GraphAdapter` | the semantic layer (optional, and worth more than the other five combined when the data supports it) |
| 5 | `SkillAdapter` | the host's APIs as callable tools |
| 6 | `MemoryAdapter` | where memory lives |
| 7 | `TransportAdapter` | delivery and durability |
| 8 | `DesignSystemAdapter` | every pixel |

Orchestration, prompts, routing, guardrails, tracing, and evals are **not** pluggable
(§5.4). That is what keeps this one platform instead of six.

## What is here

```
src/core/            the agent layer. Imports nothing from any host, ever.
  adapters/          the eight interfaces and the shared vocabulary
  orchestrator/      the fixed workflow (§9.1 Mode A) and the state graph
  grounding/         hybrid retrieval → permission filter → rerank → citations
  router/            logical model classes, policies, fallback, one egress proxy
  guardrails/        injection, PII, limits, and the egress guard
  memory/            one service, two record types, one retrieval call
  prompts/           versioned Jinja2 with a variable contract and a rollout ramp
  runtime/           durable Run/Step state, event log, resumption
  telemetry/         self-hosted span store, payload blobs, retention (C1)
  playground/        assembled-context inspection and prompt diffs (§16.4)
adapters-host/       THE ONLY HOST-COUPLED CODE — a demo host called Atlas
demo/                Atlas's own React app and design system
manifests/           agents and skills, as YAML
prompts/             the prompt store, with shared fragments
evals/               golden set, red team, runner
tests/conformance/   the suite any host runs against its own adapters
```

## Two hosts

**Atlas** is the demo host — an internal knowledge base. **Harbor** is the second one, and
it exists to test the claim this whole project rests on: a support desk with row-level
permissions instead of label buckets, API-key identity instead of sessions, and no graph
adapter at all. It passes conformance 19/19 and ships green, and not one line of the
orchestrator, grounding pipeline, router, guardrails, or run state machine changed to make
that true.

Ten things outside its directory did change, two of which were real bugs the conformance
suite caught. `docs/SECOND-HOST.md` is the honest report, including the half of the M6
Definition of Done that **is not claimed**: Harbor was built by the same author in the
same session, which removes the thing that test most wants to measure.

```bash
CORTEX_CONFIG=hosts/harbor/cortex.config.yaml node scripts/doctor.ts
node scripts/init.ts <your-host>     # scaffolds the same shape, plus a checklist
```

## Atlas, the demo host

27 records, 31 edges, three people in different permission positions, and one document
with a prompt injection planted in it. It exists so the substrate is runnable rather than
only described.

Open the demo and change who you are signed in as. Ananya cannot see hiring records;
Bharath can; Wren is in another organisation and can see none of Atlas. Ask the same
question as each. The answers differ because the **permission filter runs at retrieval**,
before a model exists — never at render, where every summary and every follow-up becomes
a leak with a nice font.

## Try it

```bash
pnpm --filter @cloud-march/cortex guard     # everything below, in fail-fast order
pnpm --filter @cloud-march/cortex test      # 51 tests, including kill-the-process-and-resume
pnpm --filter @cloud-march/cortex eval      # golden set + red team
pnpm --filter @cloud-march/cortex doctor    # adapter conformance + graph health
pnpm --filter @cloud-march/cortex dod       # the PRD's two numeric Definitions of Done
pnpm --filter @cloud-march/cortex lint      # the module boundary
```

Current state: **85 tests pass · golden 9/9 · red team 14/14 · doctor green on both hosts ·
boundaries clean · M1–M6 Definitions of Done met**, with one exception stated below. One unmodified manifest runs on all four
surfaces; a background run notifies every other client that person has open; no write
skill can execute without a recorded approval. One §12 latency *target* is missed on
purpose and says so every run — see docs/DECISIONS.md D-17.
`guard` is the addendum §8 regression list as one command — a checklist in a document is a
checklist nobody runs. The eval numbers are measured against the offline provider, so they measure the
pipeline — permissions, citations, skill choice, grounding — not answer quality. Judge
rubrics are reported as skipped, never as passes.

## Four surfaces, one manifest

`atlas-guide` declares `chat`, `inline`, `rule`, and `background`, and the runtime decides
what each one means — which workflow runs, whether it streams, whether it notifies. The
agent author writes none of that down.

- **chat** — ask a question, watch it answer, see what it read.
- **inline** — select a passage in a document and ask for a change. The agent proposes a
  diff; accepting it is Atlas writing to its own document. No skill, no gate: the diff
  preview *is* the gate.
- **rule** — a host event wakes an agent. Rules are four fields (event, guard, agent,
  principal) and nothing more; §3 is explicit that this is a trigger surface, not a
  no-code builder. A rule runs as the principal it names, which is why emitting host
  events is restricted to the host itself.
- **background** — a schedule, a notification, and nobody watching.

## Two agents

**Atlas Guide** is read-only. **Atlas Scribe** can leave a comment on a record — and
cannot do it without you. The action stops at a gate, the run goes durably to
`awaiting_approval` and survives a restart there, and the arguments are editable in the
card before you approve, because the common case is a draft that is nearly right.

Read-only shipped first and earned it: `write_skills.enabled` was false until the
read-only evals passed, and the registry refuses to load a side-effecting manifest while
it is. A fresh host starts the same way.

## What is deliberately absent

- **No bulk approval and no approval timeouts.** Both matter the moment an agent proposes
  more than one action at a time. An approval waiting on an async surface *does* notify.
- **No real push.** "Notifies mobile" here means SSE to any other client signed in as the
  same person; there is no APNs or FCM behind it.
- **No cron.** Scheduled rules take an interval in seconds.
- **No dynamic planning.** §9.1 Mode B is behind `orchestration.dynamic`, which is off.
  Fixed workflows first.
- **No real embedder, no Postgres, no Redis, no LangGraph.** Each is a documented
  substitution with a named seam — docs/DECISIONS.md D-2 through D-5.

## Tracing

Self-hosted, first-party, and nothing is exported anywhere. Span rows hold metadata;
prompts, retrieved chunks, and model output live beside them in a content-addressed blob
store, redacted through the host's own `PolicyAdapter.redact` in production and dropped on
a retention schedule that keeps the daily aggregates and deletes the detail.

The viewer is a tab in the demo, not a separate app: waterfall, filters, the exact prompt
a run was given, a span-by-span comparison of two runs, and one click back to the
playground with that question loaded. A failing eval case prints its trace id for the same
reason.

## Three things worth reading the code for

**The egress guard** (`src/core/guardrails/egress.ts`). The first version of this was an
ordinary response post-processor, exactly as the PRD describes. It passed its tests and
was useless: by the time it ran, the tokens were already on the user's screen, and the
cleaned copy only went to memory — so the transcript disagreed with what had been read.
The guard now sits *inside* the stream and releases one completed sentence at a time,
after that sentence has passed citation verification, URL stripping, injection redaction,
and PII masking. The cost is one sentence of latency.

**The durability test** (`tests/durability.test.ts`). It spawns a real child process,
`SIGKILL`s it mid-answer, brings up a fresh engine over the same database, and asserts
the run resumes at the node after the last one that completed. That is the M1 Definition
of Done, and it is the kind of claim that is worth failing a build over.

**The conformance suite** (`tests/conformance/suite.ts`). Twenty-two checks a host runs
against its own adapters before writing a single agent. Each one states what it is
protecting, because a check whose purpose is unclear gets deleted rather than fixed.

**The permission property test** (`tests/permission-property.test.ts`). A thousand
randomised permission matrices against one invariant: no chunk reaches context assembly
that its principal cannot read. It generalises the red-team cases someone thought of into
the ones nobody did — and the accompanying two-hop graph case is what caught a relevance
floor that had silently switched the entire graph retrieval leg off.

## Docs

- `docs/DECISIONS.md` — every place this deviates from the PRD or its addendum, what it
  cost, and how to reverse it. Fifteen entries.
- `docs/INTEGRATION.md` — the Phase 0 audit of Atlas, and the five-day path for a second
  host.
- `docs/DEPENDENCIES.md` — the tier policy, what is installed, and what was evaluated and
  declined.
- `docs/AUDIT-v1.1.md` — the pre-amendment audit: milestone status, dependency inventory,
  measured `canRead` p95, coverage by area.
- `docs/EVENTS.md` — the event vocabulary, and the AG-UI mapping served at
  `?protocol=ag-ui`.
- `docs/spec/` — **the source documents**, verbatim: the PRD, the v1.1 addendum, and the
  skill as originally written. Every `§n` and `C1`–`C7` reference in this package resolves
  there. They are reproduced unedited on purpose — a specification that drifts toward what
  was built is worse than none.
- `cortex.config.yaml` — the one file a host edits after implementing its adapters.

## Adding an agent

1. Write skill manifests in `manifests/skills/`. The description must say when to use the
   skill **and when not to** — the registry rejects it otherwise, because bad skill
   descriptions are the single largest source of wrong tool calls.
2. Write `manifests/agents/<id>.agent.yaml`. Validation at load: every skill exists, the
   entitlements line up, the surfaces match the output formats, the prompt resolves, and
   any side-effecting skill has a matching approval gate.
3. Write the prompt in `prompts/<id>/v1/`, with a `meta.yaml` declaring its variables.
   Rendering with an undefined variable raises; it never quietly emits an empty string.
4. Write at least twenty golden cases before you ship it, and run the red team.

A write skill additionally needs `side_effect`, an idempotency key, a rate limit, and an
agent whose manifest declares a matching `require_approval` gate — the validator fails the
build without one, and the invoker refuses the call without an approval recorded against
that exact step.
