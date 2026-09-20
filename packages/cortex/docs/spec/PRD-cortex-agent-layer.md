# PRD — CORTEX: A Portable AI Agent Layer

**Status:** Draft v1.0
**Audience:** Claude Code (primary implementer), engineering, design, product
**Codename:** `cortex` — rename freely; it appears only as a package name and config namespace.

---

## 0. How to use this document (read first, Claude Code)

This PRD specifies a **library + service**, not a feature. It is designed to be dropped into an existing product that already has data, APIs, auth, and a design system, and to turn that product into one with native AI chat and agents.

**Rules of engagement for the implementing agent:**

1. **Build in the milestone order in §17.** Do not skip ahead. Each milestone has a Definition of Done that must pass before starting the next.
2. **Never let core code import host-application code.** Every host-specific concern goes behind one of the eight adapters in §5. If you find yourself writing `import { LinkedInProfileService }` inside `packages/core`, stop — that belongs behind an adapter.
3. **Fixed workflows before dynamic planning.** §9 specifies both. Ship the fixed path first. Dynamic planning is gated behind a config flag and must not be enabled by default.
4. **Read-only tools before write tools.** No skill with side effects ships until the read-only path has passing evals.
5. **Every prompt lives in a versioned file**, never inline in code. See §8.3.
6. **Every PR that touches a prompt, skill, or router rule must update the eval golden set** and show the before/after score.
7. When a decision in this document conflicts with something you discover in the host codebase, **write the conflict into `docs/DECISIONS.md` and ask** rather than silently deviating.

**Reference architecture credit:** the structural choices here follow patterns published by LinkedIn's GenAI platform team (skill registry, prompt source of truth, split memory, messaging-as-orchestration, LangSmith/OTel split) and Atlassian's Rovo (semantic graph as grounding layer, multi-model routing, agents invocable on multiple native surfaces, MCP for external tools). Where this document deviates from them, it says so and why.

---

## 1. Problem statement

Products accumulate three things over years: **data**, **APIs**, and **workflows users do by hand**. Adding AI today usually means one of two failures:

- **The bolt-on bubble.** A third-party chat widget that knows nothing about the logged-in user, cannot see permissioned data, cannot take actions, and renders plain text in a font that doesn't match the app. Users try it twice.
- **The bespoke rebuild.** Each product team hand-rolls its own prompt handling, model calls, memory, retries, and tracing. Six teams, six stacks, no shared evals, no shared guardrails, and every model upgrade is six migrations.

LinkedIn's platform team names exactly this second failure as their motivation: early GenAI work was siloed, with each product team building its own scaffolding for prompts, model calls, and memory management — which slowed iteration and duplicated effort.

**CORTEX is the shared substrate that prevents both.** It is installed once per product, configured through adapters, and thereafter every agent any team ships inherits grounding, permissions, memory, streaming, guardrails, tracing, and evals for free.

---

## 2. Goals

| # | Goal | How we'll know |
|---|---|---|
| G1 | **Portable.** Installable into any product with data + APIs in under one engineering week. | A second, unrelated host app is integrated in ≤5 days using only the adapter surface. |
| G2 | **Native.** Chat and agent output render in the host's own design system, inside the host's own screens, under the host's own session. | Zero CORTEX-owned colors, fonts, or spacing values reach production DOM. |
| G3 | **Multi-model.** No lock-in to a single provider; route per task. | Swapping the default model is a config change, zero code change, and evals re-run automatically. |
| G4 | **Multi-surface.** Agents are invocable from chat, from inline editing, from automation rules, and as background jobs. | The same agent definition runs unmodified on all four surfaces. |
| G5 | **Safe by construction.** Permissions enforced at retrieval, not at render. Writes gated by human approval. | Red-team suite in §16.4 passes with zero permission leaks. |
| G6 | **Measurable.** Every run is traced; every change is evaluated. | Golden-set regression runs in CI on every PR touching prompts/skills. |

---

## 3. Non-goals

- **Not** training or fine-tuning foundation models. CORTEX consumes models; a separate ML platform may later produce them (see §18 future work).
- **Not** a general workflow automation engine. Automation rules are a *trigger surface*, not a no-code builder.
- **Not** a replacement for the host's existing search. CORTEX wraps host search behind `RetrievalAdapter`.
- **Not** fully autonomous agents. Human-in-the-loop gates on all state-changing actions are a hard requirement, not a toggle.
- **Not** a UI component library. CORTEX ships headless logic; the host's design system supplies every pixel.

---

## 4. Concepts and glossary

Use these words exactly and consistently in code, docs, and UI copy.

| Term | Definition |
|---|---|
| **Host** | The existing product CORTEX is installed into. |
| **Adapter** | A host-implemented interface that gives CORTEX access to one host capability. Eight total (§5). |
| **Surface** | A place an agent can be invoked from: `chat`, `inline`, `rule`, `background`. |
| **Agent** | A declaratively-defined worker with a role, a system prompt, an allowed skill set, a model policy, and HITL rules. Stored as a versioned manifest, not code. |
| **Skill** | One callable capability exposed to a model: name, JSON input schema, output schema, description, permission requirement, side-effect class. Wraps a host API or an MCP tool. |
| **Grounding** | Retrieval of host truth (documents, records, graph relationships) into model context. |
| **Entity Graph** | The host's semantic layer: typed nodes (people, posts, jobs, companies) and typed edges. Grounding's highest-value source. |
| **Run** | One invocation of one agent, from trigger to terminal state. Has an id, a trace, and a durable state row. |
| **Step** | One unit inside a run: a model call, a skill call, a retrieval, or an approval gate. |
| **Approval Gate** | A pause point where the run blocks awaiting a human decision. |
| **Router** | The component that picks which model serves a given step. |
| **Trace** | The full ordered record of a run's steps, prompts, tokens, latencies, and costs. |

---

## 5. Architecture

### 5.1 Layer diagram

```
┌──────────────────────────────────────────────────────────────┐
│  HOST APPLICATION (unchanged)                                │
│  auth · database · APIs · search · design system · UI        │
└───────────────┬──────────────────────────────────────────────┘
                │  implements 8 adapters (§5.3)
┌───────────────▼──────────────────────────────────────────────┐
│  CORTEX ADAPTER BOUNDARY  — the only host-aware code         │
├──────────────────────────────────────────────────────────────┤
│  SURFACES     chat · inline · rule · background               │
├──────────────────────────────────────────────────────────────┤
│  ORCHESTRATOR supervisor → sub-agents · plan · gates · state  │
├───────────┬──────────────┬─────────────────┬─────────────────┤
│  MEMORY   │  SKILLS      │  GROUNDING      │  ROUTER         │
│  session  │  registry    │  search · RAG   │  model policy   │
│  profile  │  MCP client  │  entity graph   │  fallback       │
├───────────┴──────────────┴─────────────────┴─────────────────┤
│  GUARDRAILS   policy · PII · injection · rate · cost          │
├──────────────────────────────────────────────────────────────┤
│  OBSERVABILITY  traces · evals · replay · cost accounting     │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Repository layout

Monorepo. Claude Code should create exactly this structure.

```
cortex/
├─ packages/
│  ├─ core/                    # Python. No host imports. Ever.
│  │  ├─ cortex/
│  │  │  ├─ adapters/          # ABC definitions only (§5.3)
│  │  │  ├─ agents/            # manifest loader, validator, registry
│  │  │  ├─ skills/            # registry, schema validation, MCP client
│  │  │  ├─ orchestrator/      # LangGraph graphs, supervisor, gates
│  │  │  ├─ memory/            # session + profile stores
│  │  │  ├─ grounding/         # retrieval pipeline, graph traversal
│  │  │  ├─ router/            # model selection, fallback, budgets
│  │  │  ├─ guardrails/        # policy, PII, injection, limits
│  │  │  ├─ prompts/           # Jinja2 loader + version resolution
│  │  │  ├─ telemetry/         # OTel spans, trace writer
│  │  │  └─ runtime/           # Run/Step state machine, durability
│  │  └─ tests/
│  ├─ server/                  # FastAPI service: HTTP + SSE (§15)
│  ├─ sdk-ts/                  # TypeScript client: streaming, run state
│  └─ ui-headless/             # React hooks + unstyled primitives (§13)
├─ manifests/
│  ├─ agents/                  # *.agent.yaml
│  └─ skills/                  # *.skill.yaml
├─ prompts/                    # versioned Jinja2, one dir per prompt id
├─ evals/
│  ├─ golden/                  # cases: input → expected assertions
│  ├─ redteam/                 # §16.4 suite
│  └─ runner/
├─ adapters-host/              # THE ONLY host-coupled package
├─ docs/
│  ├─ DECISIONS.md
│  └─ INTEGRATION.md
└─ cortex.config.yaml
```

### 5.3 The portability contract — eight adapters

This is the heart of "plug and play." A host integrates CORTEX by implementing these and nothing else. Define each as a Python ABC in `packages/core/cortex/adapters/`, with a matching Pydantic model set and a conformance test suite in `packages/core/tests/conformance/` that any host implementation must pass.

**1. `IdentityAdapter` — who is asking**

```python
class IdentityAdapter(ABC):
    async def resolve(self, session_token: str) -> Principal: ...
    async def entitlements(self, principal: Principal) -> set[str]: ...
```
`Principal` carries `id`, `type` (`member` | `recruiter` | `admin` | `service`), `org_id`, `locale`, `tz`. `entitlements` returns capability strings (`"search.candidates"`, `"message.send"`) used by the skill registry and by policy.

**2. `PolicyAdapter` — what may they see and do**

```python
class PolicyAdapter(ABC):
    async def can_read(self, principal: Principal, refs: list[EntityRef]) -> list[bool]: ...
    async def can_invoke(self, principal: Principal, skill_id: str, args: dict) -> Decision: ...
    async def redact(self, principal: Principal, doc: Document) -> Document: ...
```
Batched by design — retrieval filters hundreds of candidates per turn. `Decision` is `allow | deny | require_approval` with a reason string surfaced to the user.

**3. `RetrievalAdapter` — grounding in host truth**

```python
class RetrievalAdapter(ABC):
    async def search(self, q: Query, principal: Principal) -> list[Chunk]: ...
    async def fetch(self, refs: list[EntityRef], principal: Principal) -> list[Document]: ...
```
The host may back this with its own search engine, a vector store, or both. CORTEX ships `PgVectorRetrieval` as a default implementation for hosts without one.

**4. `GraphAdapter` — the semantic layer** *(optional but strongly recommended)*

```python
class GraphAdapter(ABC):
    async def neighbors(self, ref: EntityRef, edge_types: list[str], depth: int = 1) -> Subgraph: ...
    async def resolve_mention(self, text: str, hint: EntityType | None) -> list[EntityRef]: ...
    def schema(self) -> GraphSchema: ...
```
Rationale: Rovo's quality comes from a structured map of people, teams, projects, and content and the relationships between them — the agent traverses relationships rather than reading isolated documents. Expect the same lift. Also expect the same failure mode their own community documents: **if host data has fuzzy ownership and inconsistent naming, the agent inherits that mess.** §16.5 specifies a graph health check that surfaces this before launch.

**5. `SkillAdapter` — the host's APIs as callable tools**

```python
class SkillAdapter(ABC):
    async def list_skills(self) -> list[SkillManifest]: ...
    async def invoke(self, skill_id: str, args: dict, ctx: InvocationContext) -> SkillResult: ...
```
Two built-in implementations ship with core: `OpenAPISkillAdapter` (generates manifests from an OpenAPI spec) and `MCPSkillAdapter` (speaks Model Context Protocol). A host with neither implements this directly.

**6. `MemoryAdapter` — persistence for session and profile memory**

```python
class MemoryAdapter(ABC):
    async def append_turn(self, thread_id: str, turn: Turn) -> None: ...
    async def recent(self, thread_id: str, limit: int) -> list[Turn]: ...
    async def semantic(self, thread_id: str, q: str, k: int) -> list[Turn]: ...
    async def get_profile(self, principal_id: str) -> ProfileMemory: ...
    async def upsert_profile(self, principal_id: str, patch: dict, provenance: str) -> None: ...
```
Default implementation is Postgres + pgvector. A host with existing messaging infrastructure should back `append_turn`/`recent` with it — see §10.3.

**7. `TransportAdapter` — delivery and durability**

```python
class TransportAdapter(ABC):
    async def emit(self, run_id: str, event: RunEvent) -> None: ...
    async def subscribe(self, run_id: str) -> AsyncIterator[RunEvent]: ...
    async def notify(self, principal_id: str, notification: Notification) -> None: ...
```
Default: Redis Streams + SSE. **Strong recommendation for social platforms:** back this with the host's own messaging system. LinkedIn made exactly this call, reusing Messaging because it already provided FIFO ordering, automatic retries, history lookup, and parallel threads, which made multi-agent coordination reliable and let them replay message history when debugging failures. If your host has a messaging service with those four properties, use it and delete a quarter of your infrastructure work.

**8. `DesignSystemAdapter` — rendering** *(TypeScript, not Python)*

```ts
interface DesignSystemAdapter {
  tokens: DesignTokens;
  components: {
    Bubble: FC<BubbleProps>;
    EntityCard: FC<{ ref: EntityRef; density: "compact" | "full" }>;
    SkillCallCard: FC<SkillCallProps>;
    ApprovalPrompt: FC<ApprovalProps>;
    CitationChip: FC<{ source: Source }>;
    StreamingCursor: FC;
    ErrorState: FC<{ kind: ErrorKind; retry?: () => void }>;
    EmptyState: FC<{ suggestions: Suggestion[]; onPick: (s: Suggestion) => void }>;
  };
}
```
Full contract in §13. CORTEX ships a reference implementation used only in Storybook and tests; it must never be importable from the production bundle. Enforce with an ESLint rule.

### 5.4 What is explicitly *not* behind an adapter

Orchestration, prompt management, model routing, guardrails, tracing, and eval running are **core**, identical across every host. Resist all requests to make them pluggable — that is how a platform becomes six platforms again.

---

## 6. Data model

All schemas are Pydantic v2 in core, mirrored as Zod in `sdk-ts`. Generate the TS from the Python at build time; do not hand-maintain both.

### 6.1 Agent manifest — `manifests/agents/*.agent.yaml`

Agents are **declared, not coded.** This is what makes them "configurable teammates."

```yaml
id: profile-coach
version: 3
name: Profile Coach
description: Helps a member strengthen their profile for a target role.
owner: growth-team

surfaces: [chat, inline]          # where this agent may be invoked
visibility: { entitlements: ["profile.edit"] }

model_policy:
  default: reasoning.balanced      # logical name, resolved by router (§8)
  steps:
    plan: reasoning.strong
    summarize: fast.cheap
  max_cost_usd_per_run: 0.15
  max_latency_ms_p95: 6000

prompt: profile-coach@3            # id@version, resolved from prompts/ (§7)

skills:                            # allow-list; anything absent is uncallable
  - profile.read
  - profile.suggest_edit           # side_effect: proposes, never writes
  - jobs.search
  - skills_graph.gap_analysis

grounding:
  sources: [profile, job_postings, skills_taxonomy]
  graph:
    enabled: true
    seed: [principal.profile]
    edge_types: [HAS_SKILL, WORKED_AT, SIMILAR_ROLE]
    depth: 2
  max_context_tokens: 12000

memory:
  session: { turns: 12, semantic_recall: true }
  profile: { read: [tone, target_roles, locale], write: [target_roles] }

hitl:
  gates:
    - on: skill.side_effect != "none"
      mode: require_approval
    - on: cost_projection > 0.10
      mode: notify

output:
  formats: [text, entity_card, diff_proposal]

evals:
  golden_set: evals/golden/profile-coach/
  min_pass_rate: 0.90
```

**Validation rules Claude Code must enforce at load:**
- Every `skills[]` entry exists in the registry and the agent's `visibility.entitlements` are a subset of what those skills require.
- Every `surfaces[]` entry is supported by the agent's declared `output.formats`.
- `prompt` resolves to an existing versioned file.
- An agent with any `side_effect != none` skill **must** declare a matching HITL gate. Fail the build otherwise.

### 6.2 Skill manifest — `manifests/skills/*.skill.yaml`

```yaml
id: messaging.send_intro
version: 2
name: Send introduction message
description: >
  Sends a connection-request message from the current member to one
  other member. Use only after the member has approved the exact text.
owner: messaging-team

input_schema:                       # JSON Schema; this is what the model sees
  type: object
  required: [recipient_ref, body]
  properties:
    recipient_ref: { type: string, description: "Entity ref of the recipient" }
    body: { type: string, maxLength: 300 }
output_schema:
  type: object
  properties: { message_id: { type: string }, sent_at: { type: string } }

side_effect: write                  # none | write | irreversible | external
requires_entitlements: ["message.send"]
rate_limit: { per_principal_per_day: 25 }
idempotency: { key_fields: [recipient_ref, body], window_minutes: 10 }
timeout_ms: 4000
retry: { attempts: 2, on: [timeout, 5xx] }

binding:
  kind: openapi                     # openapi | mcp | native
  operation_id: sendConnectionMessage
```

**Registry governance (§ borrowed directly from LinkedIn's approach).** Downstream teams declare what they provide; applications discover and invoke at runtime rather than each app wrapping the same API. Two controls prevent sprawl:

- **Automated similarity check at build time.** Embed each new skill's `name + description + input_schema` and flag any cosine similarity > 0.88 against an existing skill. Build warns; CI fails on > 0.94.
- **Human review gate.** A CODEOWNERS rule on `manifests/skills/` requires a platform-team approval before any new skill merges.

Also enforce a **description quality lint**: descriptions must state *when to use* and *when not to use*, and must be ≥ 20 words. Bad skill descriptions are the single largest source of wrong tool calls.

### 6.3 Run and Step

```python
class Run(BaseModel):
    id: str
    agent_id: str; agent_version: int
    principal_id: str
    surface: Literal["chat","inline","rule","background"]
    thread_id: str | None
    status: Literal["queued","running","awaiting_approval","succeeded","failed","cancelled","expired"]
    trigger: Trigger
    created_at: datetime; updated_at: datetime
    cost_usd: float; tokens_in: int; tokens_out: int
    parent_run_id: str | None      # sub-agent lineage

class Step(BaseModel):
    id: str; run_id: str; seq: int
    kind: Literal["model","skill","retrieval","gate","subagent"]
    name: str
    input_digest: str               # hash, not payload — payloads live in trace store
    status: Literal["ok","error","denied","timeout","awaiting"]
    latency_ms: int; cost_usd: float
    model_id: str | None
```

Runs are **durable**. A process restart must resume an `awaiting_approval` run days later. Store in Postgres; never hold run state only in memory.

---

## 7. Prompt management — the source of truth

Prompts are product surface. Treat them like code with a release process.

```
prompts/
└─ profile-coach/
   ├─ v1/system.j2
   ├─ v2/system.j2
   ├─ v3/system.j2
   ├─ v3/meta.yaml          # model hints, variables, owner, changelog
   └─ fragments/            # symlinked shared partials
```

**Requirements:**

1. **Jinja2 templating** with a declared variable contract in `meta.yaml`. Rendering with an undefined variable raises, never silently emits empty string.
2. **Shared fragments.** Safety rules, output-format instructions, citation rules, and tone guidance live in `prompts/_shared/` and are `{% include %}`-ed. One edit propagates everywhere — this is the whole point of a central prompt store.
3. **Versioned, ramped.** An agent pins `prompt: id@version`. Rollout is a config-driven percentage ramp (`v2: 90%, v3: 10%`) so a bad prompt never hits all users at once.
4. **No prompt strings in Python.** Add a CI grep that fails on any string literal over 200 chars inside `packages/core`.
5. **Rendered prompt is attached to the trace** (hashed in prod if it contains member data, full in dev).

---

## 8. Multi-model router

### 8.1 Why

Per Rovo's approach: pick the best model for the job, avoid provider lock-in. Concretely, one product has three different jobs — cheap high-volume classification, mid-tier drafting, and expensive multi-step reasoning — and paying frontier prices for all three is how AI features die in the budget review.

### 8.2 Logical model names

Agents never name a vendor. They name a **capability class**, resolved by `cortex.config.yaml`:

```yaml
router:
  classes:
    reasoning.strong:
      primary:  { provider: anthropic, model: claude-opus-latest }
      fallback: [{ provider: openai, model: gpt-5 }]
    reasoning.balanced:
      primary:  { provider: anthropic, model: claude-sonnet-latest }
      fallback: [{ provider: google, model: gemini-pro-latest }]
    fast.cheap:
      primary:  { provider: anthropic, model: claude-haiku-latest }
      fallback: [{ provider: self_hosted, model: llama-3.3-70b-instruct }]
    embed.default:
      primary:  { provider: self_hosted, model: bge-m3 }
  policies:
    - if: "principal.org.data_residency == 'eu'"
      restrict_providers: [self_hosted, anthropic_eu]
    - if: "run.surface == 'background'"
      prefer_class: fast.cheap
    - if: "step.retry_count >= 1"
      escalate_class: true
```

### 8.3 Implementation

- One **unified client** exposing an OpenAI-compatible surface so swapping providers is zero application-code change. Use LiteLLM as the gateway unless a benchmark shows it's a latency problem; wrap it thinly.
- **A single egress proxy** all traffic passes through — this is where safety checks, quota enforcement, streaming normalization, and cost metering live. Do not let any package call a provider SDK directly.
- **Streaming is mandatory** for `chat` and `inline` surfaces.
- **Structured output**: prefer native structured-output/tool-calling APIs over "respond in JSON" prompting. Validate against the schema and retry once with the validation error appended before failing.
- **Budgets** enforced at three levels: per step, per run (`max_cost_usd_per_run`), per principal per day. Exceeding a budget is a first-class `ErrorKind`, not a 500.

---

## 9. Orchestration

### 9.1 Two modes, in order

**Mode A — Fixed workflow (default, ship first).** A LangGraph state graph with explicit nodes, authored per agent. Deterministic, cheap, debuggable, and adequate for roughly 80% of real agents.

```
ingest → resolve_entities → retrieve → [skill calls in parallel] → compose → gate? → emit
```

**Mode B — Supervisor / sub-agent (gated behind `orchestration.dynamic: true`).** A supervisor agent decomposes intent and delegates to specialist sub-agents. This mirrors LinkedIn's path: they moved from simple prompt chains to a supervisor–sub-agent model specifically because it enabled parallel team development and modular quality evaluation.

Rules for Mode B:
- Sub-agents are ordinary agent manifests; a supervisor's `skills` list may include `agent:<id>` entries.
- **Max depth 2.** A sub-agent may not spawn sub-agents. Enforce in the runtime.
- **Max fan-out 5** parallel sub-agents per supervisor step.
- Each sub-agent has its **own** skill allow-list and budget. A supervisor cannot grant a sub-agent capabilities it lacks.
- A sub-agent run is a real `Run` with `parent_run_id` set, independently traceable and independently evaluable.

### 9.2 Human-in-the-loop gates

Non-negotiable. LinkedIn pauses for approval at critical decision points such as sending candidate outreach or modifying search filters, combining automation efficiency with human accountability. Replicate exactly.

Gate semantics:
- Run transitions to `awaiting_approval`, emits an `approval_requested` event, and **persists**. It may sit for days.
- The approval payload contains: the exact action, the exact arguments, a human-readable rendering, the reasoning that led here, and the cost of proceeding.
- Three outcomes: `approve`, `approve_with_edits` (arguments are editable — critical for message drafts), `reject_with_reason` (the reason is fed back into the run and into experiential memory).
- **Bulk approval** is supported but must show each item; never a single "approve 40 messages" button without an expandable list.
- Timeout policy per agent; default 72h then `expired`.

### 9.3 Failure and resumption

- Every step is idempotent or carries an idempotency key.
- Transient failures retry with jittered backoff per the skill manifest.
- A failed run is **resumable from the last successful step**, not restarted.
- Partial results are always emitted. "I found 8 of 10 candidates; the skills service timed out" beats a generic error.

---

## 10. Memory

### 10.1 Two layers — but one interface

LinkedIn splits conversational memory (raw interaction history, with semantic search and summarization so only relevant history is fed back to the model) from experiential memory (derived preferences like tone, default locations, notification channel). They also report, in hindsight, that they would have preferred a **unified cognitive memory system from the start** rather than separate layers, to reduce complexity and speed experimentation.

**Take their retrospective, not their history.** CORTEX ships one `MemoryAdapter` and one `MemoryService` with two *record types* behind a single retrieval call:

```python
async def assemble(self, ctx: RunContext, budget_tokens: int) -> MemoryBundle:
    """Returns ranked, budget-trimmed memory: recent turns, semantically
    recalled turns, and applicable profile facts — as one ordered list."""
```

### 10.2 Record types

| Type | Written by | TTL | Example |
|---|---|---|---|
| `turn` | every interaction, automatically | 180d default | the raw user/assistant messages |
| `summary` | rollup job when a thread exceeds N turns | thread lifetime | "Member is targeting PM roles in Bengaluru" |
| `fact` | explicit agent write, schema-constrained | until contradicted | `target_roles: ["Product Manager"]` |
| `preference` | derived, requires 2+ observations | 365d | `tone: concise` |

**Every `fact` and `preference` carries provenance** (run_id, the evidence, timestamp) and is **user-inspectable and user-deletable**. Build the "what does it remember about me" screen in Milestone 4, not later.

### 10.3 Storage

Default: Postgres (records) + pgvector (semantic recall) + a tree-structured index over summaries for fast incremental update. LinkedIn moved off GraphRAG toward a tree-structured memory precisely because incremental updates were faster — take the shortcut.

If the host has messaging infrastructure, back `turn` storage with it rather than duplicating. You get history, sync, and retries for free.

### 10.4 Hard rules

- Memory is **scoped to `(principal_id, host_tenant_id)`**. Cross-principal leakage is a Sev-1.
- Memory is **filtered through `PolicyAdapter.redact`** on read, because entitlements can be revoked after a fact was written.
- Memory is **never** used as a grounding source for factual claims about host data. It shapes behavior; retrieval supplies facts.

---

## 11. Grounding

### 11.1 Pipeline

```
query → rewrite (context + memory) → parallel:
        ├─ keyword/BM25  (RetrievalAdapter.search)
        ├─ vector        (RetrievalAdapter.search)
        └─ graph walk    (GraphAdapter.neighbors)
   → permission filter (PolicyAdapter.can_read, batched)
   → rerank (cross-encoder or fast.cheap model)
   → dedupe + budget trim
   → context assembly with stable citation ids
```

**Permission filtering happens here, before the model sees anything.** Never retrieve broadly and filter at render. This is the single most important security property in the system.

### 11.2 Citations

Every retrieved chunk gets a stable `source_id`. The prompt instructs the model to cite `[^source_id]`. The response post-processor:
1. Verifies every cited id was actually retrieved (drop hallucinated citations, log as a quality signal).
2. Maps ids to `CitationChip` props for the UI.
3. Flags any factual sentence with **zero** citations in a `grounded_ratio` metric tracked per agent.

### 11.3 Graph health check

Before any agent using `graph.enabled: true` ships, run `cortex doctor graph`:

- % of entities with a resolved owner
- % of edges with a valid type in the schema
- orphan rate, duplicate-name rate per entity type
- median neighborhood size (a node with 40k neighbors is useless for grounding)

Publish the report. If ownership is fuzzy, the agent will not know who to route work to — fix data before shipping the feature.

---

## 12. Surfaces

The same agent manifest runs on all four. Surface differences are handled by the runtime, not by the agent author.

| Surface | Trigger | Latency target | Streaming | HITL style |
|---|---|---|---|---|
| **`chat`** | user message in a panel or thread | first token < 800ms | sync SSE | inline approval card |
| **`inline`** | user selects content and invokes an action in an editor | first token < 500ms | sync SSE | diff preview, accept/reject |
| **`rule`** | host automation rule fires on a host event | none (async) | async | notification → approval screen |
| **`background`** | schedule or long-running delegation | none | async with progress | notification → approval screen |

**Why four and not one:** Rovo agents are invocable in chat, inside automation rules, and while editing — three native surfaces rather than a single chat window. The chat box is the *least* used surface in a mature deployment. Design for the others from day one.

**Cross-device requirement:** a run started on web must stream progress to mobile and deliver a push notification on completion or approval-needed. LinkedIn added push notifications, cross-device state sync, and incremental streaming to their clients for exactly this. The `TransportAdapter` plus `sdk-ts` must support it in Milestone 5.

**Background agents** should be scheduled into off-peak windows where latency doesn't matter — this is an observed production pattern and materially reduces cost.

---

## 13. Native UI and the design-system contract

### 13.1 The rule

**CORTEX ships zero styles.** `ui-headless` exports hooks and unstyled primitives; the host supplies every component through `DesignSystemAdapter`. Enforcement:

- ESLint rule banning `className`, `style`, and any CSS import inside `packages/ui-headless/src/**`.
- A build-time check that the production bundle contains no color literals from the reference theme.

### 13.2 Hooks API

```ts
const { messages, send, status, approve, reject, cancel } = useAgentThread({
  agentId: "profile-coach",
  threadId,
  context: { entityRef: currentProfileRef },   // surface context, auto-injected
});

const { run, progress, result } = useAgentRun(runId);          // background/rule
const { proposal, accept, reject } = useInlineAgent({ agentId, selection }); // inline
```

### 13.3 Generative UI — rendering host components, not markdown

The model does not emit prose lists of candidates. It emits **typed blocks** that map to host components:

```json
{"type":"entity_card","ref":"person:12345","density":"compact","reason":"7 years in fintech PM"}
{"type":"diff_proposal","target":"profile.headline","before":"...","after":"..."}
{"type":"skill_call","skill":"messaging.send_intro","args":{...},"state":"awaiting_approval"}
{"type":"choice","prompt":"Which role are you targeting?","options":[...]}
```

Requirements:
- Blocks are **streamed and rendered progressively**; a partially-received `entity_card` renders as the host's skeleton component.
- Any block type the host hasn't registered falls back to text. Never crash on an unknown block.
- Block schemas are versioned alongside skill schemas.

### 13.4 Required states (design must spec all of these)

Blank / empty with suggested prompts · loading with first-token skeleton · streaming · tool-running (with the skill's human name: "Searching job postings…") · awaiting approval · partial success · permission denied (with a reason and a path to request access) · rate-limited · budget-exceeded · model-unavailable-fallback-used · no-answer-found · human handoff.

The **empty state is the highest-leverage screen in the product.** Nobody knows what to type into a blank box. It must carry 3–5 context-aware suggested prompts derived from what the user is currently looking at.

### 13.5 Trust affordances

- Every agent response labels which agent produced it and, on expand, which skills it called and which sources it read.
- Reasoning steps are visible but collapsed by default.
- A persistent, one-click "this was wrong" control writing to the eval corpus (§16.3).

---

## 14. Guardrails and security

### 14.1 Layer siloing

Enforce strict separation between three layers, with policy-governed interfaces, strong authn/authz, and auditable access between them: **client data**, **memory**, **agent lifecycle**. No component reaches across two boundaries. LinkedIn treats this as the core of scaling AI without sacrificing trust; encode it as a module-boundary lint rule, not a convention.

### 14.2 Prompt injection

Assume all retrieved content is hostile. A member's profile "About" section, a post body, and a document title are all attacker-controlled on a social platform.

- **Wrap all retrieved content** in delimited, clearly-labeled untrusted blocks with a standing instruction (in `prompts/_shared/untrusted.j2`) that content inside is data, never instruction.
- **Never let retrieved content authorize an action.** A skill invocation whose arguments were derived solely from untrusted content and which has `side_effect != none` must escalate to an approval gate regardless of agent config.
- **Ban indirect exfiltration:** the response post-processor strips URLs that were constructed from retrieved content and contain query parameters carrying context data.
- Maintain a red-team corpus of injection payloads harvested from real host content; run it in CI.

### 14.3 PII and data handling

- PII detection on both ingress (user message) and egress (model output), with configurable action per class: `allow | mask | block`.
- Provider calls carry a `no_training` / zero-retention flag where the provider supports it; the router records per-provider data-handling posture in the trace so compliance can audit it.
- Member-level opt-out of data use for model improvement, respected at the router and at the eval-corpus writer.
- Data residency enforced as a router policy (§8.2), not as an application concern.

### 14.4 Red-team suite (`evals/redteam/`)

Must pass at 100% before any production ramp:

1. **Permission leakage** — for each entity class, a principal without access asks the agent directly, indirectly, via summarization, and via a follow-up referencing prior context.
2. **Cross-tenant** — principal in org A attempts retrieval and memory reads scoped to org B.
3. **Injection** — instruction-bearing content planted in profiles, posts, documents, filenames, and skill outputs.
4. **Unauthorized action** — attempts to make the agent invoke a write skill without an approval gate, including via sub-agent delegation.
5. **Exfiltration** — attempts to route member data into a URL, an outbound message, or a skill argument.
6. **Budget / DoS** — pathological prompts that induce unbounded tool loops.

### 14.5 Rate limiting and abuse

Per principal, per agent, per skill, per org. Budget exceedance returns a typed error the UI renders as a first-class state (§13.4), never a crash.

---

## 15. Service API

FastAPI. All endpoints authenticate via the host session through `IdentityAdapter`.

```
POST   /v1/threads                          → create thread
POST   /v1/threads/{id}/messages            → send; returns run_id
GET    /v1/runs/{id}/events                 → SSE stream of RunEvent
GET    /v1/runs/{id}                        → run state (poll fallback)
POST   /v1/runs/{id}/approve                → {step_id, decision, edited_args?}
POST   /v1/runs/{id}/cancel
POST   /v1/agents/{id}/invoke               → non-chat surfaces (inline/rule/background)
GET    /v1/agents                           → agents visible to this principal
GET    /v1/memory/me                        → inspectable memory
DELETE /v1/memory/me/{record_id}            → user deletion
GET    /v1/health  /v1/ready
```

**`RunEvent` types:** `run_started`, `step_started`, `token`, `block`, `citation`, `approval_requested`, `step_completed`, `run_completed`, `run_failed`, `progress`.

SSE with `Last-Event-ID` resumption. Long-running runs must survive client disconnect and be re-attachable.

---

## 16. Observability and evaluation

### 16.1 Tracing — two systems, two jobs

Adopt the split LinkedIn uses: **LangSmith tracing in pre-production**, integrated with LangChain/LangGraph, capturing step-by-step execution including prompts, skill calls, and control flow so engineers can debug logic before deploy; **OpenTelemetry spans in production**, emitted privacy-safely, correlated across services to reconstruct end-to-end workflows, and fed into evaluation datasets for offline regression and prompt tuning.

Required span attributes: `run_id`, `agent_id@version`, `prompt_id@version`, `model_id`, `provider`, `tokens_in/out`, `cost_usd`, `latency_ms`, `retrieval_k`, `grounded_ratio`, `gate_outcome`, `principal_type` (never `principal_id` in prod spans — use a salted hash).

### 16.2 Evals

Three tiers, all runnable via `cortex eval`:

- **Unit (deterministic).** Schema conformance, skill-selection correctness, citation validity, refusal correctness. Runs on every PR, < 60s.
- **Golden set (per agent, 50–200 cases).** Real inputs with assertions: must-call-skill-X, must-cite, must-not-contain, LLM-judge rubric score ≥ threshold. Runs on every PR touching that agent's prompt, skills, or router class. **Blocks merge below `min_pass_rate`.**
- **Red team (§14.4).** Nightly and pre-release.

**Rule: no prompt, skill, or router change merges without an eval diff in the PR description.** Automate the comment.

### 16.3 Feedback loop

Thumbs-down and "this was wrong" write `{run_id, trace, user comment}` into a triage queue. Weekly, the owning team converts triaged failures into golden cases. This is how the golden set stays alive rather than rotting at launch quality.

### 16.4 Developer playground

An internal sandbox where engineers prototype agents and skills without deploying: inspect assembled memory and context, impersonate principals to test identity and authorization rules, view real-time traces, and diff two prompt versions side by side on the same input. LinkedIn credits their equivalent with a large share of their velocity. Build it in Milestone 3, not "later" — it is a force multiplier, not a nice-to-have.

---

## 17. Installation and configuration — the plug-and-play story

### 17.1 `cortex init`

A CLI that scaffolds an integration into an existing repo:

```
$ npx cortex init
? Host language for adapters       → TypeScript / Python
? Auth source                      → JWT / session cookie / custom
? Do you have an OpenAPI spec?     → yes → generates draft skill manifests
? Do you have a search backend?    → Elasticsearch / none (install pgvector)
? Do you have a design system?     → package name → generates adapter stubs
? Do you have messaging infra?     → yes → generates TransportAdapter binding

Created: adapters-host/, cortex.config.yaml, manifests/agents/hello.agent.yaml
Next:    pnpm cortex doctor
```

### 17.2 `cortex doctor`

Runs the conformance suite against the host's adapter implementations and reports a readiness score. Checks: every adapter implemented, policy batching performs within SLA at k=200, retrieval returns stable ids, graph health (§11.3), design-system adapter provides all required components, transport delivers ordered events under restart.

**A host cannot ship to production below a green `doctor` report.** This is the gate that makes "5 days to integrate" honest.

### 17.3 `cortex.config.yaml`

One file. Router classes (§8.2), storage DSNs, telemetry endpoints, budget defaults, feature flags (`orchestration.dynamic`, `surfaces.enabled`), prompt ramp percentages, data-residency policies.

---

## 18. Technology decisions

| Concern | Choice | Why / note |
|---|---|---|
| Core language | **Python 3.12** | The GenAI ecosystem moves fastest here. LinkedIn made this exact Java→Python shift for ecosystem, developer familiarity, and to avoid duplicating logic across offline and online paths. |
| App framework | **FastAPI + Pydantic v2** | Async, native SSE, schemas that generate TS types. |
| Agent framework | **LangChain, thin wrapper** | Chosen over AutoGen, LlamaIndex, CrewAI, and building in-house on ecosystem maturity, developer velocity, and low-level control. **Wrap it deliberately thin** — internal logging, instrumentation, and storage only — so migration stays cheap if something better arrives. |
| Control flow | **LangGraph** | Explicit state graphs; extend with custom providers bound to CORTEX memory and transport. |
| Prompts | **Jinja2 + versioned files** | §7. |
| Tools | **MCP first**, OpenAPI generator second | Open protocol for tool discovery; LinkedIn is incrementally moving off their proprietary skill registry toward MCP and A2A for exactly this interoperability reason. Do not build a proprietary registry protocol in 2026. |
| Model gateway | **LiteLLM behind one internal proxy** | OpenAI-compatible surface means swapping models is zero application-code change. |
| Transport | **Redis Streams + SSE**, or host messaging | §5.3 adapter 7. |
| State | **Postgres** (runs, steps, manifests, memory) | Durability is a hard requirement. |
| Vectors | **pgvector** default | One fewer system; swap behind `RetrievalAdapter` if scale demands. |
| Background jobs | **arq** (Redis) default; **Temporal** for hosts needing multi-day durable workflows | Keep behind an interface. |
| Client | **TypeScript SDK + React headless hooks** | §13. |
| Tracing | **LangSmith (dev) + OpenTelemetry (prod)** | §16.1. |
| Evals | **pytest harness + LLM-judge**, results to Postgres | §16.2. |
| CI | Eval gates + similarity check + module-boundary lint | §6.2, §14.1. |

**Explicitly deferred:** self-hosted inference (vLLM/PyTorch/DeepSpeed) and fine-tuning. LinkedIn moved there and found fine-tuned open models often matched proprietary quality at lower cost and latency — but only after volume justified it. Revisit at >10M runs/month. The router's `self_hosted` provider slot exists so this is a config change when the time comes.

---

## 19. Milestones

Each milestone is a shippable increment with a hard Definition of Done. **Do not proceed on a red DoD.**

### M1 — Skeleton and contracts (week 1–2)
Monorepo per §5.2. All eight adapter ABCs + Pydantic models + conformance test suite. `cortex.config.yaml` loader. Run/Step state machine with Postgres durability. Router with one provider and one fallback. OTel wiring.
**DoD:** a trivial echo agent completes a durable run end-to-end; conformance suite runs green against in-memory mock adapters; killing the process mid-run and restarting resumes it.

### M2 — Grounding and read-only skills (week 3–4)
`RetrievalAdapter` with pgvector default. Permission filtering batched at retrieval. Citation pipeline. Skill registry, manifest validation, similarity check, OpenAPI generator. Three real read-only skills against the host.
**DoD:** `grounded_ratio` ≥ 0.85 on the first golden set; red-team permission-leakage suite (§14.4 items 1–2) passes 100%; a principal without access provably cannot retrieve a restricted entity through any phrasing in the suite.

### M3 — Chat surface and playground (week 5–6)
Fixed-workflow orchestrator. SSE streaming with resumption. `sdk-ts` + `ui-headless` hooks. Design-system adapter with the reference theme. Developer playground (§16.4). Eval runner in CI.
**DoD:** one agent usable by internal staff in the real app, rendered entirely in host components; first token p95 < 800ms; every merge runs the golden set.

### M4 — Memory, write skills, HITL (week 7–9)
Unified memory service, both record types, provenance, user-inspectable memory screen. Approval gates with `approve_with_edits`. First write skill with idempotency and rate limits.
**DoD:** no write skill can execute without a recorded approval; red-team items 3–5 pass 100%; a user can view and delete any fact the system holds about them.

### M5 — Multi-surface and async (week 10–12)
Inline surface with diff proposals. Rule-triggered runs. Background runs with scheduling and push notification. Cross-device state sync.
**DoD:** the same unmodified agent manifest runs on all four surfaces; a run started on web completes in background and notifies mobile.

### M6 — Multi-agent, graph, hardening (week 13–16)
`GraphAdapter` + graph grounding. Supervisor/sub-agent mode behind a flag. Full red-team. Cost dashboards. `cortex init` and `cortex doctor`. Integration guide.
**DoD (and the real proof of this whole PRD):** a **second, unrelated host application** is integrated by a team that did not build CORTEX, in ≤5 days, touching only `adapters-host/` and `cortex.config.yaml`.

---

## 20. Success metrics

**Platform (does the substrate work?)**
- Time-to-first-agent for a new host: **≤ 5 days** (target), ≤ 10 (acceptable).
- Time-to-new-agent within an integrated host: **≤ 1 day**.
- % of agent code that is manifest vs bespoke Python: **> 80% manifest**.
- Adapter-boundary violations in core: **0**.

**Quality**
- `grounded_ratio` per agent: **≥ 0.90**.
- Golden-set pass rate: **≥ 0.90**, no regression merged.
- Hallucinated citation rate: **< 1%**.
- Red-team pass: **100%**, always.

**Experience**
- First token p95: **< 800ms** (chat), **< 500ms** (inline).
- Task completion rate (run reaches `succeeded` with user acceptance).
- Approval acceptance rate — **if users reject >30% of proposed actions, the agent is wrong, not the users.**
- Thumbs-down rate, trending down release over release.

**Business**
- Time saved per completed task vs the manual baseline. Measure the baseline *before* you ship. For reference, LinkedIn reports Hiring Assistant saving recruiters roughly four hours per role and cutting candidate profile reviews by 62% — that's the shape of claim you should be able to make, with your own numbers.
- Cost per completed task, trending down.

---

## 21. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Host data quality is too poor for grounding | **High** | `cortex doctor graph` (§11.3) runs before any commitment; publish the report to stakeholders early so "fix the data" becomes a funded workstream, not a surprise. |
| Adapter boundary erodes under deadline pressure | High | Module-boundary lint in CI from M1. A violation fails the build. No exceptions, no allowlist. |
| Skill sprawl — 400 near-duplicate skills in 18 months | Medium | Similarity check + CODEOWNERS human review from M2 (§6.2). |
| Cost runs away | Medium | Three-tier budgets from M1; per-agent cost dashboards in M6; `fast.cheap` preferred for background. |
| Users don't know what to type | **High** | Empty-state suggested prompts are a launch blocker, not a polish item (§13.4). |
| Prompt injection via user-generated content | High on a social platform | §14.2 in full; red-team corpus built from real host content. |
| Regulatory exposure where agents touch hiring, credit, or housing | Medium-High | Any agent influencing employment decisions requires a documented bias assessment before launch; keep humans as the deciding party and the agent as recommender. Get counsel involved at spec time, not launch. |
| Framework churn (LangChain/LangGraph replaced) | Medium | Thin wrapper (§18). Migration budget ≤ 2 weeks by design. |

---

## 22. Appendix A — Reference instantiation: a professional social platform

Concrete first-wave agents for a LinkedIn-shaped host, to make the abstractions legible.

**Entity graph:** `Person`, `Post`, `Comment`, `Company`, `Job`, `Skill`, `School`, `Group`.
**Edges:** `FOLLOWS`, `CONNECTED_TO`, `WORKED_AT`, `HAS_SKILL`, `POSTED`, `APPLIED_TO`, `HIRING_FOR`, `ENDORSED`.

| Agent | Surfaces | Key skills | HITL gate |
|---|---|---|---|
| **Profile Coach** | chat, inline | `profile.read`, `profile.suggest_edit`, `jobs.search`, `skills.gap_analysis` | diff preview before any profile write |
| **Network Scout** | chat, background | `graph.find_paths`, `people.search`, `messaging.draft_intro` | approval per message, editable text |
| **Post Studio** | inline | `post.draft`, `post.critique`, `media.suggest_alt_text`, `trends.read` | user publishes; agent never posts |
| **Inbox Triage** | background, rule | `messages.list`, `messages.classify`, `messages.draft_reply`, `calendar.find_slots` | approval to send any reply |
| **Opportunity Radar** | background | `jobs.search`, `profile.read`, `company.read`, `notify.digest` | notification only, no writes |
| **Recruiter Sourcer** *(supervisor)* | chat, background | sub-agents: `criteria-builder`, `candidate-finder`, `outreach-drafter` | approval per outreach batch, each item expandable |

**Start with Profile Coach.** Read-only, high frequency, clearly valuable, and its worst failure is a bad suggestion the user ignores. Do not start with Recruiter Sourcer — it is the highest-value and the highest-risk, and it needs every guardrail in this document already working.

---

## 23. Appendix B — Packaging CORTEX as a reusable Claude Code skill

Once M6 lands, the *pattern* itself is worth packaging so Claude Code can apply it to any future repo. Create `.claude/skills/cortex-agent-layer/SKILL.md` (a starter version ships alongside this PRD). It should:

- Trigger on: "add AI chat", "build an agent", "AI assistant for this app", "agent layer", "chat agent", "AI wrapper".
- Instruct the agent to: audit the host's data, APIs, auth, and design system **first**; generate the eight adapter stubs; scaffold one read-only agent; and refuse to write a write-skill until read-only evals pass.
- Carry `reference/adapters.md`, `reference/manifests.md`, and `reference/checklist.md` as progressive-disclosure files rather than inlining everything.

---

## 24. Open questions

1. **Does the host have messaging infrastructure with FIFO, retries, and history?** If yes, `TransportAdapter` is a two-day job instead of a two-week one. Answer this before M1 estimates are committed.
2. **Who owns prompts?** Engineering, product, or a content-design function? This determines whether `prompts/` needs a non-engineer editing path.
3. **Sync or async default for the chat surface?** Sync is simpler; async survives long tool chains. Recommendation: sync with automatic promotion to async past 15s.
4. **Tenancy model** — single-tenant per deployment or multi-tenant? Affects memory scoping and router residency policies materially.
5. **Eval judge model** — using a frontier model as judge costs real money at CI scale. Budget it or use a fine-tuned small judge.
