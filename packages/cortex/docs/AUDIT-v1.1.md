# CORTEX v1.1 Pre-Amendment Audit

Per addendum §3. Produced by inspection and measurement, before any code was changed.

**Headline: the amendment's urgent item does not apply here.** No LangSmith, no LangChain,
no LangGraph, no LiteLLM was ever taken. No run data is leaving this network, and none
ever has. What remains of the addendum is real work, but none of it is a disconnection.

The reason is not foresight about open-core risk — it is that this implementation is
TypeScript rather than Python (docs/DECISIONS.md D-1), and the Python-ecosystem defaults
in PRD v1.0 §18 were never reachable. D-5 records the orchestration decision on its own
merits: the PRD's instruction to wrap the framework "deliberately thin" meant that at this
size the wrapper *was* the graph.

---

## Milestones completed

| Milestone | Status | DoD passing |
|---|---|---|
| M1 Skeleton and contracts | complete | **yes** — `tests/durability.test.ts` SIGKILLs a real child mid-run and asserts resumption at the next node |
| M2 Grounding and read-only skills | complete | **yes** — `grounded_ratio` 1.00 over 5 applicable golden cases (DoD ≥ 0.85), red-team permission items 100%. Measured by `scripts/dod.ts` |
| M3 Chat surface and playground | complete | **yes** — first token p95 219ms (DoD < 800ms); one agent usable in the real app, rendered entirely in host components |
| M4 Memory, writes, HITL | **partial (~half)** | no — memory, provenance, and the inspect-and-delete screen are done; approval gates are built and durable but no write skill exists to exercise one (deliberate, D-7) |
| M5 Multi-surface and async | **not started** | no — `inline` and `rule` are typed, configured, and validated, but nothing triggers them |
| M6 Multi-agent, graph, hardening | **partial** | no — graph adapter, graph grounding, `doctor`, and the integration guide exist; supervisor/sub-agent mode, `cortex init`, cost dashboards, and the second-host proof do not |

Caveat carried forward from the M2 measurement: `grounded_ratio` of 1.00 is measured
against the offline rehearsal provider, which cites every sentence it emits by
construction. It says the citation pipeline is wired correctly, not that a model resisted
inventing something.

---

## Third-party inventory

Runtime dependencies, in full. There are three.

| package | version | tier | where used | LOC coupled | removal cost |
|---|---|---|---|---|---|
| `better-sqlite3` | ^12.5.0 | **A** | `src/core/runtime/store.ts` only | ~40 | One file. It is the only thing in core that knows SQL. |
| `js-yaml` | ^4.1.0 | **A** | config, agent registry, skill registry, prompt meta, eval runner, `scripts/dod.ts` | ~12 | Trivial — parse calls only, no types leak. |
| `nunjucks` | ^3.2.4 | **A** | `src/core/prompts/store.ts` only | ~15 | One file. Jinja2-compatible, which is the reason it is here. |
| `@cloud-march/motion` | workspace | **A** | demo UI only, never core | ~8 | Repo-internal; wraps motion.dev. |

Development-only: `typescript`, `vite`, `@vitejs/plugin-react`, `react`, `react-dom`,
`@types/*`. All Tier A, none reachable from the published surface.

**Tier B dependencies present: none.** A grep for `langchain|langgraph|litellm|langsmith|
copilotkit|onyx` across the package returns four hits, all of them prose: two comments
citing the PRD, one lint pattern that *bans* those imports, and one `cortex.config.yaml`
comment. Zero imports.

---

## Specific questions

**1. Is LangGraph used? Which modules? Where do checkpoints live?**
No. `src/core/orchestrator/graph.ts` is a hand-written state graph, ~120 lines
(docs/DECISIONS.md D-5). Checkpoints are rows in our own `checkpoints` table, one per run,
written after every node, readable with `SELECT` and no library at all. The addendum's C3
condition 1 — "checkpoints must live in our Postgres, in tables we own, readable without
the library" — is satisfied by construction. C3 condition 2 (import containment) is vacuous:
there is nothing to contain.

**2. Is LangChain used beyond tool-schema conversion?**
Not used at all. Tool schemas are hand-written JSON Schema in the skill manifests,
validated by `src/core/skills/schema.ts`.

**3. Is LiteLLM used? Imported outside `router/`?**
Not used. `src/core/router/router.ts` is the egress proxy and the only caller of providers;
`src/core/router/providers/` holds the only `fetch` in core, enforced by
`scripts/lint-boundaries.mjs` (rule `direct-network`). The provider interface already
exists and is already native — but it is **thinner than the addendum's `ModelProvider`**
(see recommendation for C2).

**4. Is LangSmith wired up? Is trace data leaving our network?**
**No, and no.** There is no tracing SDK of any kind. `src/core/telemetry/trace.ts` is a
~60-line span recorder with a pluggable sink; the only sink registered writes to stderr
when `CORTEX_TRACE=1`. The single outbound network call in the entire package is
`src/core/router/providers/anthropic.ts`, which fires only when `ANTHROPIC_API_KEY` is set
— the sanctioned §2 exception. **Nothing needs disconnecting.**

**5. Does OpenTelemetry instrumentation exist? Which exporter?**
Partially, and honestly: the *span shape* follows §16.1 — `run_id`, `agent_id`, `model_id`,
`provider`, `tokens_in/out`, `cost_usd`, `latency_ms`, `retrieval_k`, `gate_outcome` — and
`hashPrincipal()` enforces the rule that a raw principal id never reaches a span. But there
is no OTel SDK, no collector, and no exporter. Spans are in-process only; the durable
record is the `traces` table, which is our own shape, not OTel's.

**Two gaps the addendum's C1 is right about:** trace payloads are stored **inline** in
`traces.payload_json` with no `payload_ref` indirection, and there is **no retention policy
and no redaction on write**. Today's payloads are small metadata, but the run-level
regression guard "no production trace payload written without passing through `redact`"
is currently unenforceable because nothing routes through `redact`.

**6. Are `RunEvent` type names finalised and consumed by `sdk-ts`?**
Finalised in `src/core/adapters/types.ts` and consumed by `src/sdk/client.ts` and the
reducer in `src/ui-headless/thread-state.ts`. **Consumer count outside this repo: zero.**
The disruption cost of the C4 rename is therefore about as low as it will ever be.

**7. Is `PolicyAdapter.can_read` batched, and what is p95 at k=200?**
Batched by signature — an array in, an aligned array out — and the conformance suite
already asserts alignment and ordering. Measured against the Atlas implementation, 500
samples after warm-up:

```
k=200   p50 0.006ms   p95 0.008ms   p99 0.014ms   max 1.861ms
```

Against the addendum's 50ms p95 SLA this is not close; it is three orders of magnitude
under. That number is only honest about Atlas, which is an in-memory `Map` over 27 records.
The value of C5's SLA test is that it will still be running when a host wires this to a
real authorization service, which is when the number starts to mean something.

**8. Test coverage on core, and is the module-boundary lint active?**
Lint: **active**, four rules, no allowlist, wired into CI, and verified to bite (a probe
file with a host import, a bare `fetch`, and a 290-character string literal was caught on
all three).

Coverage under `node --test`: **75.21% lines, 73.52% branches**. The distribution is the
interesting part, and it is a real gap:

| Area | Lines | Why |
|---|---|---|
| guardrails (`egress`, `injection`, `pii`) | 95–100% | direct unit tests |
| `grounding/local-retrieval`, `blocks`, `skills/registry` | 94–100% | unit + conformance |
| `orchestrator/workflow`, `runtime/engine` | 59–60% | exercised by the eval suite, which runs outside `node --test` |
| `skills/invoker`, `skills/selector`, `grounding/pipeline`, `playground` | 40–47% | same — the eval and demo paths cover them, the unit tier does not |
| `guardrails/limits` | 37% | rate limits and idempotency have no write skill to exercise them |
| `router/providers/anthropic` | 37% | the network path is unreachable without a key |

So the true covered fraction is higher than 75% once evals are counted, and the reported
number is the one that gates CI. `limits.ts` is the honest hole: it is real code with a
real contract and nothing but a manifest-level test behind it.

---

## Recommendation

| Change | Verdict | Reasoning |
|---|---|---|
| **C1** Native trace store + viewer | **APPLY, adjusted** | The urgent half is already true — nothing to disconnect. The rest is real and unbuilt: `payload_ref` indirection, retention, redaction on write, and a viewer. Adjust the Postgres DDL to SQLite (D-2): no monthly partitions and no BRIN; a retention sweep plus an index over `(trace_id, started_at)` does the same job at this scale. Blob store is a local directory behind an interface, per §9 item 1's "prefer the host's storage". |
| **C2** Native provider adapters | **APPLY, adjusted** | The stated change — replace LiteLLM — is already done and was never otherwise. What is genuinely missing is the addendum's *contract*: `countTokens`, `price`, and `retentionPosture` on the provider, and `noTraining` / `residency` on the request, with a provider obliged to **raise rather than silently ignore** a residency or no-training requirement it cannot honour. That last clause is the one with teeth, and we do not have it. Small: ~120 lines. |
| **C3** Keep LangGraph | **CONFIRM — no work** | Nothing to keep. Both conditions the addendum sets are satisfied by construction. Recorded in DECISIONS.md so it is not revisited. |
| **C4** AG-UI event names | **APPLY** | Zero external consumers, so the rename is nearly free today and gets more expensive every week. Aliases emitted alongside for one milestone as instructed, plus `docs/EVENTS.md`. |
| **C5** Prove the permission boundary | **APPLY — first** | The highest-value item in the amendment for this codebase, and §6 sequences it ahead of C1. The boundary assertion in particular closes a real gap: today the pipeline filters correctly, but nothing *proves* at runtime that an unfiltered chunk cannot reach context assembly. A property test with a randomised permission matrix is worth more than the six red-team cases it generalises. Note: no Hypothesis in this ecosystem, and a property-testing library would be a new dependency for one test file — a seeded generator written here is ~40 lines and stays Tier A by not existing. |
| **C6** No UI framework | **CONFIRM — no work** | Already true and lint-enforced. |
| **C7** No external search platform | **CONFIRM — no work** | Already true; retrieval is first-party behind `RetrievalAdapter`. |

**Sequencing** (addendum §6, with the first step struck out as inapplicable):
~~disconnect LangSmith~~ → **C5 (M-HARD)** → **C1 (M-OBS)** → **C2**, **C4**.

**Scope note, per §0 rule 7.** None of these requires rewriting more than ~200 lines of
working code. C1 is the largest and is almost entirely additive: the existing `traces`
table and `RunStore.trace()` stay, and the new span store sits beside them. The one
genuine edit to working code is C4's event rename, which is mechanical and alias-guarded.
