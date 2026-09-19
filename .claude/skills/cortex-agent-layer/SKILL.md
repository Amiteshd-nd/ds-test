---
name: cortex-agent-layer
description: >
  Add a portable, multi-model AI agent layer to an existing application that already has
  data, APIs, auth, and a design system. Use when the user asks to add AI chat, an AI
  assistant, an AI wrapper, agents, a copilot, or a chat agent to an existing product; when
  they want agents that can call the app's own APIs and take actions; or when they mention
  grounding, RAG over their own data, tool calling against internal services, human-in-the-loop
  approval, or rendering AI output in their own design system. Also use when refactoring
  scattered one-off LLM calls into a shared platform. Do NOT use for standalone chatbots with
  no host application, for model training or fine-tuning, or for simple one-shot LLM API calls.
---

# CORTEX — portable AI agent layer

Build an agent layer that installs into an existing product behind eight adapters, so the
core never knows which product it is running in.

## Non-negotiables

Violating any of these produces a system that cannot be maintained or trusted. Do not
negotiate them away under time pressure; surface the tradeoff to the user instead.

1. **Core imports nothing from the host.** All host coupling lives behind the eight adapters.
2. **Permission filtering happens at retrieval, never at render.**
3. **Read-only skills ship before write skills.** No write skill until read-only evals pass.
4. **Every state-changing action passes a human approval gate** with editable arguments.
5. **Fixed workflows before dynamic planning.** Dynamic mode stays behind a config flag.
6. **No prompt strings in code.** Versioned Jinja2 files only.
7. **No prompt/skill/router change merges without an eval diff.**
8. **Zero styles in the agent layer.** The host's design system renders everything.

## Procedure

### Phase 0 — Audit before writing any code

Do not scaffold until you can answer these from the actual repo:

- **Auth:** how is the current user resolved? What entitlement or role model exists?
- **Permissions:** is there a central authorization service, or are checks scattered in handlers?
  Can it answer "can this user read these 200 ids?" in one batched call? If not, that is the
  first thing to build.
- **Data:** what are the core entity types and the relationships between them? Is there a
  search backend? Is anything already vectorized?
- **APIs:** is there an OpenAPI spec, a GraphQL schema, or only internal service clients?
- **Design system:** what package, what tokens, what component primitives?
- **Messaging:** does the host have a message/event system with FIFO ordering, retries, and
  history? If yes, back the transport layer with it rather than building a new one.

Write the answers to `docs/INTEGRATION.md`. Flag every gap.

### Phase 1 — Adapter contracts

Create the eight interfaces plus a conformance test suite. See `reference/adapters.md`.

`IdentityAdapter` · `PolicyAdapter` · `RetrievalAdapter` · `GraphAdapter` ·
`SkillAdapter` · `MemoryAdapter` · `TransportAdapter` · `DesignSystemAdapter`

Add a module-boundary lint that fails the build on any host import inside core. Do this in
Phase 1, not later — retrofitting it is a rewrite.

### Phase 2 — Grounding

Hybrid retrieval (keyword + vector + optional graph walk) → **batched permission filter** →
rerank → dedupe → budget-trimmed context with stable citation ids. Verify every citation the
model emits was actually retrieved; drop and log the ones that weren't.

Run a data health check before promising quality: ownership coverage, orphan rate, duplicate
names, neighborhood size. A messy graph produces a confidently wrong agent.

### Phase 3 — Skills

Declare skills as manifests, never as ad-hoc functions. Each carries: JSON input/output
schema, a description stating *when to use and when not to use*, required entitlements,
`side_effect` class, rate limit, idempotency key, timeout, retry policy.

Generate first-draft manifests from OpenAPI where possible. Prefer MCP for external tools.
Add a build-time embedding-similarity check to catch duplicate skills, plus a human review
gate via CODEOWNERS.

### Phase 4 — Agents as manifests

An agent is YAML, not a class: id, version, surfaces, model policy by logical class,
prompt reference, skill allow-list, grounding config, memory config, HITL gates, eval
golden set. Validate at load: every skill exists, entitlements are consistent, any
side-effecting skill has a matching gate.

### Phase 5 — Orchestration and surfaces

LangGraph fixed workflow first. Runs are durable in Postgres and resumable after restart —
an `awaiting_approval` run may sit for days. Support four surfaces from one manifest:
`chat`, `inline`, `rule`, `background`.

### Phase 6 — Native UI

Headless hooks only. The model emits typed blocks (`entity_card`, `diff_proposal`,
`skill_call`, `choice`) that map to host components, streamed progressively with skeletons.
Unknown block types degrade to text, never crash.

Specify every state: empty-with-suggestions, loading, streaming, tool-running, awaiting
approval, partial success, permission denied, rate limited, budget exceeded, no answer,
human handoff. The empty state carries 3–5 context-aware suggested prompts — it is the
highest-leverage screen in the feature.

### Phase 7 — Guardrails and evals

Treat all retrieved content as hostile: delimit it, forbid it from authorizing actions, strip
constructed URLs carrying context. Run a red-team suite covering permission leakage,
cross-tenant access, injection, unauthorized action, exfiltration, and budget exhaustion —
100% pass required before any ramp.

Evals in three tiers: deterministic unit checks, a 50–200 case golden set per agent gating
merges, and nightly red team. Trace with LangSmith in dev and OpenTelemetry in production.

Build the developer playground (impersonate principals, inspect assembled context, diff two
prompt versions on the same input) early — it pays for itself within a month.

## Default stack

Python 3.12 · FastAPI · Pydantic v2 · LangChain (thin wrapper) · LangGraph · Jinja2 prompts ·
LiteLLM behind one internal egress proxy · MCP for tools · Postgres + pgvector · Redis Streams ·
SSE · TypeScript SDK + React headless hooks · LangSmith (dev) + OpenTelemetry (prod) · pytest
eval harness.

Substitute freely, but keep the seams: the model gateway must present one OpenAI-compatible
surface so swapping providers is a config change, and the agent framework must be wrapped
thinly enough to replace in under two weeks.

## References

- `reference/adapters.md` — full interface definitions and conformance tests
- `reference/manifests.md` — agent and skill manifest schemas with annotated examples
- `reference/checklist.md` — per-phase Definition of Done

## A working implementation lives in this repo

`packages/cortex/` is this skill applied end to end: the eight adapters, the conformance
suite, the fixed workflow, the router, the prompt store, the guardrails, the evals, and a
demo host called Atlas to install it into. When a question here has an answer in code,
that is where it is.

Two things in it are worth copying rather than re-deriving:

- **`src/core/guardrails/egress.ts`** — the citation, exfiltration, injection, and PII
  checks run *inside* the token stream, releasing one completed sentence at a time. The
  obvious implementation is a post-processor, and a post-processor is too late: the user
  has already read the tokens, and only the stored copy gets cleaned.
- **`tests/durability.test.ts`** — kill a real process mid-run with `SIGKILL`, restart,
  assert the run resumes at the next node. Write this on day one; a run that only
  survives a graceful shutdown is not durable.

Read `packages/cortex/docs/DECISIONS.md` before substituting anything in the default
stack. It is nine entries of what was swapped, what it cost, and how to reverse it.
