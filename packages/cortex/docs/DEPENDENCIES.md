# Dependency policy

From PRD addendum v1.1 §2. Every dependency is classified before it is added, and the
classification is recorded here.

## The rule

**Tier A — permitted.** Permissively licensed (MIT, Apache-2.0, BSD, PSF); fully
functional self-hosted with no account, no API key, and no call home; no feature reserved
for a paid edition; replaceable behind an existing CORTEX interface in under two weeks.

**Tier B — prohibited.** Anything needing a vendor account or a hosted control plane.
Anything open-core where governance, audit, access control, multi-tenancy, or SSO sits in
a paid tier. Anything usage-metered.

The distinction is not about licences in the abstract. It is that the features open-core
products reserve are reliably the governance and access-control ones — which are exactly
this project's non-negotiables. A dependency that can move a hard requirement behind a
paywall cannot be carried.

**The single exception:** model provider APIs. They are the product, not infrastructure.
They are isolated behind one interface and interchangeable by config.

**Protocols are not dependencies.** MCP, OpenTelemetry's wire format, AG-UI's event
vocabulary, Server-Sent Events — implement the spec, do not import a vendor's SDK to speak
it.

## What is actually installed

Runtime, in full. There are three, plus one workspace package used only by the demo.

| package | version | tier | where | removal cost |
|---|---|---|---|---|
| `better-sqlite3` | ^12.5.0 | A | `src/core/runtime/store.ts` | One file — the only thing in core that knows SQL |
| `js-yaml` | ^4.1.0 | A | config and manifest loading | Trivial; parse calls only |
| `nunjucks` | ^3.2.4 | A | `src/core/prompts/store.ts` | One file; chosen because it is Jinja2-compatible |
| `@cloud-march/motion` | workspace | A | demo UI only, never core | Repo-internal |

Development only: `typescript`, `vite`, `@vitejs/plugin-react`, `react`, `react-dom`,
`@types/*`. All Tier A.

**Tier B present: none.** Never was — see `docs/AUDIT-v1.1.md`.

### Things deliberately not installed

| Considered | Verdict | Why |
|---|---|---|
| LangSmith | rejected | Hosted. Run data — prompts, retrieved content, member PII — would leave the network. Tier B on the clearest possible grounds. |
| LangChain / LangGraph | not taken | Tier A, and no objection to either. This core simply never needed them: the orchestrator is ~120 lines and the PRD's own instruction was to wrap thin. See DECISIONS.md D-5. |
| LiteLLM | not taken | Tier A. The router is on the critical path for cost, residency, and retention posture, and it is small enough to own. |
| CopilotKit | rejected | Capable, MIT, and the origin of AG-UI — but adopting it inverts goal G2: the host's design system would adapt to its component model, in the one layer users see. Open-core split already in place. We take its protocol and none of its code. |
| Onyx | rejected | Rejected on architecture before licensing: its value is mirroring permissions across dozens of external SaaS tools. This host has one database and one permission model we already own. Its permission sync is Enterprise-only regardless. Its permission-at-retrieval pattern informed the hardening work; the system itself is not needed. |
| A property-testing library | not taken | Would be a new dependency for one test file. The seeded generator in `tests/permission-property.test.ts` is about forty lines and stays Tier A by not existing. |

## Technology decisions — native-first

The addendum's §5 replacement for PRD §18, adjusted to what this implementation actually
is. Rows that differ from the addendum say why.

| Concern | Choice | Tier | Note |
|---|---|---|---|
| Core language | **TypeScript on Node 24** | — | Differs from the addendum's Python. DECISIONS.md D-1; decided before any code was written. Node strips types natively, so there is no build step and no second toolchain. |
| App framework | `node:http` + hand-written types | — | Differs from FastAPI + Pydantic for the same reason. Eleven routes did not warrant a framework, and the repo's hub is dependency-free on the same argument. |
| Orchestration | First-party state graph, checkpoints in our own tables | — | Differs from "keep LangGraph" only because there is no LangGraph to keep. Both of the addendum's C3 conditions hold by construction: checkpoints are rows we own, readable with `SELECT`. |
| Agent glue | none | — | Tool schemas are hand-written JSON Schema in the manifests. |
| Prompts | Jinja2-compatible templates, versioned in git | A | Unchanged. |
| Tools | MCP, when a host needs it — implemented natively | protocol | Not yet built; `SkillAdapter` is the seam. |
| Model access | Native `Provider` per vendor | — | Already native. Carries token counting, pricing, and retention posture, and refuses a request whose residency or no-training requirement it cannot honour. |
| Transport | In-process fan-out over a durable event log + SSE | A | Differs from Redis Streams: DECISIONS.md D-4. The durable half — the part that makes resumption real — is implemented. |
| Event vocabulary | AG-UI-compatible names, own implementation | protocol | `docs/EVENTS.md`. Interoperability at zero cost. |
| State | SQLite | A | Differs from Postgres: DECISIONS.md D-2. One file knows SQL; the swap is local. |
| Vectors | Local hash embedder behind `RetrievalAdapter` | A | A stand-in, not a result: DECISIONS.md D-3. |
| Background jobs | not built | — | M5. |
| Tracing | OTel-shaped spans → our own store → SQLite | protocol + A | **No hosted tracing. Ever.** No SDK either, yet: the span shape follows the spec so an exporter is additive. |
| Trace viewer | Built into the Playground | — | First-party. Scoped to debugging and eval triage; not analytics. |
| Evals | `node --test` + golden set + red team, judge via our own router | A | Unchanged. |
| Client | TypeScript SDK + headless React hooks | A | No UI framework. |
| Grounding | First-party retrieval pipeline | — | Never outsourced. |

**Deferred, not rejected:** self-hosted inference. The `local` provider slot exists so it
is a config change when volume justifies it.

## What native costs

Stated plainly, per addendum §7, and true of this codebase specifically:

- **Provider maintenance is permanently ours.** Every new model id, every API change, every
  deprecation is a ticket here. `src/core/router/providers/anthropic.ts` is the whole
  surface, which is the mitigation, not an escape.
- **No community finds our bugs.** The egress guard and the router are read by the people
  who wrote them. The eval and red-team suites exist because of this, not in spite of it.
- **The trace viewer will be worse** than a commercial one for a long time. It is scoped to
  debugging and eval triage on purpose. Feature creep toward analytics is the failure mode
  to watch for.

What it buys: nothing we depend on can move behind a paywall, no run data leaves the
network, and a second host integration needs no third-party accounts provisioned.
