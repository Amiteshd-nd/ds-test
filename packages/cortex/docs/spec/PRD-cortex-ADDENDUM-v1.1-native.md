# PRD Addendum v1.1 — CORTEX Native-Only Dependency Policy

**Applies to:** `PRD-cortex-agent-layer.md` v1.0
**Status:** Amendment. Does not supersede v1.0.
**Reason for amendment:** the platform will be built with zero vendor-hosted dependencies and zero open-core products whose critical features sit behind a paid tier.

---

## 0. How to apply this document — READ BEFORE TOUCHING ANY CODE

Foundations from PRD v1.0 have already been built. This addendum exists to change a **small number of specific things** without disturbing that work.

**Governing rules for the implementing agent:**

1. **Default action is NO CHANGE.** If a section of v1.0 is not named in §4 of this document, it stands exactly as written and its implementation must not be touched.
2. **Do not refactor working code for stylistic consistency with this document.** If something already works and satisfies v1.0, leave it alone even if you would write it differently now.
3. **Audit before editing.** Complete §3 and output the report. Do not begin any change in §4 until the audit is done, because several changes are conditional on what already exists.
4. **Do not rename existing public interfaces** (adapter ABCs, Pydantic models, API routes) except where §4 explicitly instructs a rename, and then only with a deprecation alias kept for one milestone.
5. **Do not bump major versions of any existing dependency** as part of this work.
6. **One change per PR**, each mapped to a change ID from §4, each with its regression suite green.
7. If applying a change would require rewriting more than ~200 lines of already-working code, **stop and report the cost** rather than proceeding. Several changes in §4 are explicitly marked as not worth a rewrite.

---

## 1. What changed, and why

PRD v1.0 §18 named several third-party components as defaults: LangChain, LangGraph, LiteLLM, and LangSmith. Subsequent research into the ecosystem produced two findings that motivate this amendment.

**Finding 1 — open-core risk is real and it targets exactly the features that matter.** The clearest example in this space: Onyx, an otherwise strong MIT-licensed platform, keeps *permission synchronization* — the single most security-critical feature it offers — available only in its Cloud and Enterprise editions. This is the standard open-core pattern, and the features it reserves are reliably the governance, audit, multi-tenancy, and access-control ones. Those are precisely CORTEX's non-negotiables. A dependency that can move our hard requirement behind a paywall is a dependency we cannot carry.

**Finding 2 — the layers we were tempted to outsource are the ones we must own.** Permission filtering at retrieval is the system's primary security property. An ACL bug inside a third party's reranker is our data breach and our incident review, with none of our own instrumentation on the path. This must be first-party code.

**What did *not* change:** the architecture. The eight adapters, the manifest-driven agents, the mandatory HITL gates, permission-at-retrieval, the eval gates, and the design-system boundary are all unchanged and remain the point of the project. This amendment changes *what we depend on*, not *what we are building*.

---

## 2. Dependency policy (new — supersedes v1.0 §18's framing)

Every dependency must be classified before it is added. Record classifications in `docs/DEPENDENCIES.md`.

**Tier A — permitted.** A library that is:
- permissively licensed (MIT, Apache-2.0, BSD, PSF), and
- fully functional when self-hosted with no account, no API key, and no network call to the vendor, and
- has no feature set reserved for a paid edition, and
- is replaceable behind an existing CORTEX interface in under two weeks.

Examples already in use and explicitly approved: FastAPI, Pydantic, SQLAlchemy, Jinja2, pgvector, redis-py, httpx, opentelemetry-sdk, pytest, React.

**Tier B — prohibited.** Anything requiring a vendor account or hosted control plane; anything open-core where governance, audit, access control, multi-tenancy, or SSO sits in a paid tier; anything whose pricing is usage-metered.

**The single exception:** model provider APIs (Anthropic, OpenAI, Google, and self-hosted inference). These are the product, not infrastructure. They are isolated behind `ModelProvider` (§4.2) and every one of them is interchangeable by config.

**Protocols are not dependencies.** An open specification — MCP, OpenTelemetry's wire format, AG-UI's event vocabulary, Server-Sent Events — costs nothing to be compatible with and buys future interoperability. Implement specs natively; do not import a vendor's SDK to speak them.

---

## 3. Audit-first protocol — do this before any change

Inspect the repository as built and emit this report to `docs/AUDIT-v1.1.md`. Do not modify code during the audit.

```markdown
# CORTEX v1.1 Pre-Amendment Audit

## Milestones completed
- [ ] M1 Skeleton and contracts      status: ___  DoD passing: yes/no
- [ ] M2 Grounding and read-only     status: ___  DoD passing: yes/no
- [ ] M3 Chat surface and playground status: ___  DoD passing: yes/no
- [ ] M4 Memory, writes, HITL        status: ___  DoD passing: yes/no
- [ ] M5 Multi-surface               status: ___  DoD passing: yes/no
- [ ] M6 Multi-agent and graph       status: ___  DoD passing: yes/no

## Third-party inventory
For each dependency in pyproject.toml / package.json:
| package | version | tier | where used (files) | LOC coupled | removal cost |

## Specific questions (answer precisely)
1. Is LangGraph used? Which modules? Are checkpoints persisted to our Postgres
   or to a LangGraph-managed store?
2. Is LangChain used beyond tool-schema conversion? List each usage.
3. Is LiteLLM used? Is it imported directly anywhere outside router/?
4. Is LangSmith wired up? Is any trace data currently leaving our network?
   → If yes, this is the ONE item to fix immediately, before anything else.
5. Does OpenTelemetry instrumentation exist? Which exporter?
6. Are RunEvent type names finalised and consumed by sdk-ts?
7. Is PolicyAdapter.can_read batched, and what is its measured p95 at k=200?
8. Test coverage on packages/core, and is the module-boundary lint active?

## Recommendation
For each change C1–C7 in the addendum: APPLY / SKIP / DEFER, with reasoning.
```

**Stop after the audit and present it.** Do not proceed to §4 without confirmation.

---

## 4. Change list

Each change carries a scope label:
`REPLACE` (swap an implementation) · `CONDITIONAL` (depends on audit) · `ADDITIVE` (new code only, nothing removed) · `CONFIRM` (no code change; records a decision).

---

### C1 — Observability: self-hosted, native trace store `REPLACE` · **Priority 1**

**v1.0 said:** LangSmith in pre-production, OpenTelemetry in production.
**v1.1 says:** OpenTelemetry everywhere, exported to our own store, with a trace viewer built into the existing Playground.

LangSmith is a hosted product. Under §2 it is Tier B, and more urgently, if it is currently wired up then run data — prompts, retrieved content, possibly member PII — is leaving our network right now. **If the audit answers yes to question 4, fix this first, ahead of everything else in this document.**

**Implementation:**

1. Keep every existing OTel span and attribute. The span schema in v1.0 §16.1 is unchanged.
2. Add an OTel collector in the dev compose stack, exporting to Postgres.
3. Build the trace store:

```sql
CREATE TABLE traces (
  trace_id      TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id),
  agent_id      TEXT NOT NULL,
  agent_version INT  NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  duration_ms   INT,
  status        TEXT,
  cost_usd      NUMERIC(10,6),
  tokens_in     INT,
  tokens_out    INT
);

CREATE TABLE spans (
  span_id        TEXT PRIMARY KEY,
  trace_id       TEXT NOT NULL REFERENCES traces(trace_id) ON DELETE CASCADE,
  parent_span_id TEXT,
  kind           TEXT NOT NULL,   -- model | skill | retrieval | gate | subagent
  name           TEXT NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  duration_ms    INT,
  status         TEXT,
  attributes     JSONB NOT NULL DEFAULT '{}',
  payload_ref    TEXT             -- object-store key; payloads never inline
);

CREATE INDEX ON spans (trace_id, started_at);
CREATE INDEX ON traces (agent_id, started_at DESC);
CREATE INDEX ON traces USING BRIN (started_at);
```

4. **Payload handling.** Span rows hold metadata only. Full prompts, retrieved chunks, and model outputs go to blob storage keyed by `payload_ref`, with a retention policy: 30 days in dev, 7 days in production, and production payloads redacted through `PolicyAdapter.redact` before write. This is what makes self-hosting cheap — the row table stays small and the expensive part expires.
5. **Retention and partitioning.** Partition `spans` monthly. A nightly job drops partitions past retention and rolls per-agent aggregates into a `trace_daily_stats` table so dashboards never scan raw spans.
6. **Viewer.** Extend the Playground (v1.0 §16.4), do not build a separate app. Required views: trace waterfall with expandable spans; side-by-side diff of two runs on the same input; filter by agent, status, cost, latency; one-click "replay this run in the playground"; and a jump from any eval failure to its trace.

**Scope guard:** this is roughly 2–3 weeks of work. It is the largest single item in this amendment and the only one that adds meaningful schedule. It is worth it because tracing is where member data concentrates.

**Regression guard:** existing spans and attribute names must not change. Anything currently reading traces keeps working.

---

### C2 — Model router: native provider adapters `CONDITIONAL`

**Apply only if** the audit shows LiteLLM is thinly wrapped (< ~300 LOC of coupling, confined to `router/`). **Skip if** it is threaded through the codebase — the cost exceeds the benefit and v1.0 §8's interface already isolates it.

LiteLLM is MIT-licensed and self-hostable, so it is genuinely Tier A and there is **no urgency here**. The argument for going native is narrower: the router is on the critical path for cost control, data-residency policy, and per-provider retention flags, and it is a small amount of code.

**If applying:**

```python
class ModelProvider(ABC):
    @abstractmethod
    async def complete(self, req: CompletionRequest) -> CompletionResponse: ...
    @abstractmethod
    async def stream(self, req: CompletionRequest) -> AsyncIterator[Delta]: ...
    @abstractmethod
    def count_tokens(self, messages: list[Message]) -> int: ...
    @abstractmethod
    def price(self, tokens_in: int, tokens_out: int, model: str) -> Decimal: ...
    @property
    @abstractmethod
    def retention_posture(self) -> RetentionPosture: ...  # recorded in every trace
```

One implementation per vendor, each ~150–250 lines. Normalise to a single internal message format; do not leak provider-shaped payloads past the boundary. Keep the router's public interface identical so nothing upstream changes.

`CompletionRequest` must carry `no_training: bool` and `residency: str`, and each provider is responsible for translating those into whatever header or flag that vendor supports — and for raising if it cannot honour them.

**Do not apply this and C1 in the same PR.**

---

### C3 — Orchestration: keep LangGraph unless it is shallow `CONDITIONAL` · **default: KEEP**

LangGraph is MIT and self-hosted. It is Tier A. Its checkpointing and resumption are hard to reproduce correctly, and v1.0 §9.3's resumption requirement depends on getting it right.

**Default decision: keep it.** Replacing working durable-execution code is the single easiest way to introduce subtle, rare, production-only bugs.

**Two conditions to verify, and fix if violated:**

1. **Checkpoints must live in our Postgres**, in tables we own, readable without the library. If the audit finds checkpoints in a LangGraph-managed or opaque store, migrate the persistence backend only — keep the graph API.
2. **`packages/core/orchestrator/` is the only place LangGraph may be imported.** If it has leaked elsewhere, fix the imports. That containment is what keeps a future replacement a two-week job.

Only if the audit shows LangGraph is used for trivial linear chains with no checkpointing benefit should it be replaced, with a native `Run`/`Step` state machine over the existing Postgres tables.

---

### C4 — Event vocabulary: align names with AG-UI `ADDITIVE`

AG-UI is an open event protocol for agent-to-frontend communication, originated by CopilotKit and since adopted by Google, AWS, Microsoft, LangChain, and Mastra. It is becoming the common vocabulary for this exact wire.

**We adopt the vocabulary, not the framework.** No package is installed. We keep our own headless UI per v1.0 §13 and our own SSE implementation per §15. We simply name our events the way the rest of the ecosystem names theirs, so that a future client, a partner integration, or a debugging tool can speak to our stream without a translation layer.

**Action:** map existing `RunEvent` types to AG-UI-compatible names where they differ, keeping old names as aliases emitted alongside for one milestone, then removing them. Document the mapping in `docs/EVENTS.md`.

Low cost, no lock-in, real optionality. Skip if `sdk-ts` consumers are already numerous enough that renaming is disruptive — this is a nice-to-have, not a requirement.

---

### C5 — Permission filtering: harden and prove it `ADDITIVE` · **Priority 2**

No architectural change. v1.0 §11.1 already requires filtering at retrieval. This adds the proof.

Industry guidance is blunt on the failure mode: platforms that enforce permissions only at the chat-UI layer can leak content under adversarial prompts, whereas correct implementations inherit access controls from the source system at retrieval time and filter candidate chunks before passing context to the model. We already do the latter. We now need to demonstrate it continuously.

**Add:**

1. **A retrieval-boundary assertion.** A runtime check, enabled in all environments including production, that no `Chunk` reaches context assembly without a recorded `can_read = true` for the current principal. A violation raises and fails the run; it does not log-and-continue.
2. **A property-based test** (Hypothesis): generate random principal/entity permission matrices, run arbitrary queries, assert zero unauthorised chunks in assembled context. Minimum 1,000 cases in CI.
3. **A batching SLA test.** `PolicyAdapter.can_read` at k=200 must return within 50ms p95 against the host implementation. Slow permission checks are how teams get tempted to skip them — make the pressure visible.
4. **Extend the red-team suite** (v1.0 §14.4 items 1–2) with: permission revoked mid-run; permission inherited through a graph traversal two hops out; and a chunk authorised for retrieval but not for citation display.

This is additive test and assertion work. No existing code is removed.

---

### C6 — No third-party UI framework `CONFIRM`

No change. v1.0 §13 stands in full: headless hooks, host design system renders everything, zero styles shipped, ESLint rule enforcing it.

Recorded here because CopilotKit was evaluated and **rejected**. It is a capable MIT-licensed framework with generative UI and human-in-the-loop support, and it created the AG-UI protocol — but adopting it inverts Goal G2. Our design system would adapt to its component model rather than the reverse, in the one layer where coupling is most visible to users and most expensive to unwind. It also raised $27M in May 2026 and already operates an open-core split with premium features, which is the pattern §2 exists to avoid.

We take its protocol (C4) and none of its code.

---

### C7 — No external enterprise-search platform `CONFIRM`

No change. Recorded so it is not revisited.

Onyx was evaluated as a possible grounding backend. Rejected on architecture before licensing: its value is mirroring permissions across 40+ external SaaS tools whose knowledge is scattered. Our host has one canonical database and one permission model we already own. Adopting it would mean standing up a second index, second sync pipeline, and second auth model to solve a problem we do not have — and its permission sync is Enterprise-only regardless.

Its permission-at-retrieval pattern informed C5. We take the idea and none of the system.

---

## 5. Replacement for PRD v1.0 §18 (drop-in)

> ### 18. Technology decisions — native-first
>
> **Policy:** zero vendor-hosted dependencies, zero open-core products, zero metered services. Model provider APIs are the only exception and are isolated behind one interface. Open *protocols* are adopted freely; vendor SDKs to speak them are not.

| Concern | Choice | Tier | Note |
|---|---|---|---|
| Core language | Python 3.12 | — | Unchanged. |
| App framework | FastAPI + Pydantic v2 | A | Unchanged. |
| Orchestration | LangGraph, contained in `orchestrator/`, checkpoints in our Postgres | A | Keep. Containment is the replaceability guarantee. |
| Agent glue | LangChain, thin, tool-schema conversion only | A | Do not grow this usage. |
| Prompts | Jinja2 + versioned files in git | A | Native already. |
| Tools | MCP, client implemented natively | protocol | Unchanged. |
| Model access | Native `ModelProvider` per vendor (C2) | — | Isolates cost, residency, retention posture. |
| Transport | Redis Streams + SSE | A | Native already. |
| Event vocabulary | AG-UI-compatible names, own implementation (C4) | protocol | Interoperability at zero cost. |
| State | Postgres | A | Unchanged. |
| Vectors | pgvector | A | Unchanged. |
| Background jobs | arq | A | Temporal only if multi-day workflows appear; it is Tier A self-hosted. |
| Tracing | OpenTelemetry SDK → own collector → Postgres (C1) | protocol + A | **No hosted tracing. Ever.** |
| Trace viewer | Built into the Playground (C1) | — | First-party. |
| Evals | pytest harness + LLM judge via our own router | A | Unchanged. |
| Client | TypeScript SDK + headless React hooks | A | Unchanged; no UI framework (C6). |
| Grounding | First-party retrieval pipeline | — | Never outsourced (C7). |

> **Deferred, not rejected:** self-hosted inference (vLLM). The `self_hosted` provider slot exists so this is a config change when volume justifies it.

---

## 6. Milestone delta

Do not renumber existing milestones. These are amendments to whatever remains, plus one new milestone.

| Milestone | Change |
|---|---|
| M1–M2 | If complete: no change. C5's assertions attach to M2's retrieval path. |
| M3 | Playground gains the trace viewer (C1). If M3 is done, this is a follow-on PR, not a reopen. |
| M4–M5 | No change. |
| M6 | Remove any LangSmith reference from the DoD; substitute the native viewer. Portability DoD — a second host integrated in ≤5 days — is unchanged and remains the real proof. |
| **M-OBS (new, 2–3 wks)** | C1 in full: collector, trace store, retention and partitioning, payload blob store, Playground viewer. Insert wherever it fits; block nothing on it except the immediate LangSmith disconnection. |
| **M-HARD (new, 1 wk)** | C5 in full: boundary assertion, property tests, SLA test, extended red team. |

**Sequencing:** disconnect LangSmith immediately if connected → M-HARD → M-OBS → C2/C4 opportunistically. C3, C6, C7 require no work.

---

## 7. What building natively costs — state this plainly

Going native is the right call here, and it is not free. Budget for it honestly rather than discovering it:

- **~3–4 weeks of net new work** (C1 and C5), not recovered elsewhere.
- **Ongoing provider maintenance.** Every new model, every API change, every deprecation is our ticket. Expect a few days per quarter, permanently.
- **No community bug-finding.** Bugs in our router and our trace store are found by us, in production, by our users.
- **A trace viewer that will be worse** than a mature commercial one for at least a year. Accept this; scope the viewer to debugging and eval triage only, and resist feature creep toward analytics.

What it buys: no feature we depend on can move behind a paywall; no run data leaves our network; the security-critical path is fully instrumented by us; and a second host integration has no third-party accounts to provision.

---

## 8. Regression guard — must stay green throughout

Before merging any change in §4, and after:

- [ ] Adapter conformance suite passes against mock adapters
- [ ] Module-boundary lint: zero host imports in core; LangGraph confined to `orchestrator/`
- [ ] All agent golden sets at or above their `min_pass_rate` — **no regression is acceptable**
- [ ] Red-team suite 100%
- [ ] A run interrupted mid-execution resumes correctly after process restart
- [ ] An `awaiting_approval` run survives a deploy and is still approvable
- [ ] `sdk-ts` consumers unbroken (event aliases present if C4 applied)
- [ ] No production trace payload written without passing through `redact`

Any change that reddens one of these is reverted, not patched forward.

---

## 9. Open items

1. **Blob store for trace payloads** — MinIO self-hosted, or the host's existing object storage? Prefer the host's; one fewer system to run.
2. **Trace retention in production** — 7 days proposed. Confirm against whatever incident-investigation window security expects.
3. **ClickHouse for spans** if volume exceeds Postgres comfort. Postgres with monthly partitions and BRIN indexes should hold to roughly 50M spans/month. Revisit past that; it is Tier A either way.
4. **Who owns provider adapters** after C2? Name a rotation. Unowned integration code is how a deprecated API takes down production on a Sunday.
