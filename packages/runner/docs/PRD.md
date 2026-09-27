# PRD: General AI Agent for Small Businesses (working name: "Forge")

**Version:** 0.1 · **Date:** 26 Sep 2026 · **Owner:** [Your name]
**Audience:** Claude Code (implementer) and the product owner

---

## 0. Instructions for Claude Code (read first)

1. Build **one phase at a time** (Section 9). Do not start a phase until the previous phase meets its acceptance criteria and the owner confirms.
2. Before writing each module, **study the reference repos** listed for it (Section 6). Clone them into `/references/` (git-ignored) and read how they solve the problem. Adopt their patterns; do not blindly copy.
3. **License rule:** code from MIT / Apache-2.0 repos may be adapted with attribution in `THIRD_PARTY_NOTICES.md`. Do **not** copy code from AGPL, Elastic License, or unlicensed repos; study them for patterns only. Verify each repo's license before reuse.
4. Every external service sits behind an **interface** (`SandboxProvider`, `LLMProvider`, `SearchProvider`, `DeployProvider`, `MemoryStore`) so vendors can be swapped without touching agent logic.
5. Check current model IDs and SDK APIs in official docs before coding (e.g. https://docs.claude.com). Do not rely on memory for model names or prices.
6. Keep a running `DECISIONS.md` log: any time you deviate from this PRD, record what and why.
7. Ask the owner before creating paid accounts, entering API keys, or deploying anything publicly.

---

## 1. Problem & Vision

Small businesses (1–5 people: agencies, consultants, local service businesses) need a website, pitch decks, market research, and marketing, but can't afford separate tools, freelancers, or engineers.

**Vision:** one AI agent that **builds, runs and grows** a small business from plain-language requests, remembering the business across every task.

**Positioning vs. competitors:** Runable, Manus, Genspark (general agents); Lovable, Bolt, Replit (builders). Our wedge is **end-to-end outcomes with persistent business context**, starting narrow and reliable rather than broad and flaky.

## 2. Target User

- **Primary:** non-technical small-business owner. Can describe what they want; cannot code.
- **Jobs to be done:** "Get me online", "Make me look credible to clients/investors", "Help me find customers."

## 3. Goals & Non-Goals

**Goals (v1)**
- A user describes their business once and gets a **live, deployed landing page** in under 10 minutes.
- Every later task (deck, research, content) reuses stored business context without re-asking.
- Task success rate is measurable from day one and improves weekly.

**Non-goals (v1)**
- Training or fine-tuning our own models.
- Mobile apps, voice calls, paid-ad management (later phases).
- Fully autonomous irreversible actions (sending, publishing, spending always need approval).

## 4. Success Metrics

| Metric | Definition | v1 target |
|---|---|---|
| Task success rate | Tasks completed and accepted by user without restart | ≥ 70% at Phase 1 exit, ↑ weekly |
| Step success rate | Tool calls that succeed without retry | ≥ 95% |
| Time to first artifact | Prompt → first visible output (preview) | < 3 min |
| Cost per task | LLM + sandbox + API cost per completed task | Tracked per task type; must trend down |
| Prompt-cache hit rate | Cached input tokens / total input tokens | ≥ 70% |
| Week-1 retention | Users who run a 2nd task within 7 days | Tracked from launch |

---

## 5. Architecture Overview

```
┌───────────────── Frontend (Next.js) ─────────────────┐
│ Chat · Plan/progress panel · Live preview · Files     │
└───────────────┬──────────────────────────────────────┘
                │ REST + SSE (streamed progress)
┌───────────────▼──────────────────────────────────────┐
│ API (FastAPI)  · auth · projects · tasks · approvals  │
└───────────────┬──────────────────────────────────────┘
                │ enqueue task
┌───────────────▼──────────────────────────────────────┐
│ Durable workflow runtime (Inngest; Temporal later)    │
│   └─ Orchestrator agent loop (custom, on LLM API)     │
│        ├─ Tools: shell_ file_ browser_ search_        │
│        │         deploy_ image_ ask_user_             │
│        └─ Sub-agents (isolated context):              │
│             research · web_builder · slides · content │
└──────┬───────────────┬──────────────┬────────────────┘
       │               │              │
┌──────▼─────┐  ┌──────▼──────┐ ┌─────▼───────────────┐
│ Sandbox    │  │ Postgres    │ │ Langfuse            │
│ (E2B, per  │  │ (Supabase)  │ │ traces · evals ·    │
│ task)      │  │ + pgvector  │ │ prompt versions     │
│ files,     │  │ + S3/R2     │ └─────────────────────┘
│ browser,   │  └─────────────┘
│ code       │
└────────────┘
```

### Key architectural decisions (from research)

| Decision | Choice | Rationale |
|---|---|---|
| Overall blueprint | Follow the Suna (Kortix) architecture: FastAPI + Next.js + Supabase + Redis + per-task sandbox + LiteLLM | Closest open-source match to our product; proven shape |
| Agent loop | **Custom thin loop on the LLM API**, not a heavy framework | Full control over prompt caching, context compaction, and step checkpointing (Manus rebuilt its framework several times for this reason). Claude Agent SDK may be used as the coding sub-agent *inside* the sandbox if it proves better. |
| Sandbox | **E2B** (Firecracker microVMs) behind `SandboxProvider` | Hardware-level isolation for untrusted, user-driven code in a multi-tenant product; open source; mature SDK. Daytona is faster/persistent but its core went closed-source in June 2026. Keep swappable. |
| Durable execution | **Inngest** for MVP, Temporal as scale path | Fastest path to production for small teams; Temporal's determinism rules force restructuring an LLM-driven loop. |
| Observability | **Langfuse** (MIT, self-hostable) | Tracing, evals, prompt management in one; free self-host |
| Memory | **Postgres first** (structured Business Profile + workspace files); add Mem0 in Phase 2 only if needed | Simplest thing that works; avoid a graph DB until temporal reasoning is proven necessary |

---

## 6. Module Specs & Reference Repos

For each cluster: what it must do, which repos to study, what to adopt, and where we do better.

### 6.1 Orchestrator (general agent core)

**Must:** accept a goal, write a plan, execute via tools, verify, recover from errors, stream progress, ask the user when blocked.

**Study:**
- `kortix-ai/suna` (Apache-2.0): overall system layout, tool registry, sandbox integration. Note: the repo has evolved into a broader "AI management system"; study earlier Suna-era architecture in git history.
- `FoundationAgents/OpenManus`, `Simpleyyt/ai-manus`: minimal Manus-style loops.
- Manus blog: "Context Engineering for AI Agents: Lessons from Building Manus".
- Anthropic engineering posts: "Building effective agents" and the multi-agent research system write-up.

**Adopt (best practices):**
1. **Stable prompt prefix.** No timestamps or dynamic content at the top of the system prompt; append-only context; deterministic JSON serialization. Enables prompt caching (~10× cheaper input tokens).
2. **Stable tool set.** Don't add/remove tools mid-task (breaks cache and confuses the model). Namespace tools by prefix (`browser_`, `shell_`, `file_`, `deploy_`) and restrict via `tool_choice` / state machine instead.
3. **Plan as a file.** Agent maintains `todo.md` in the sandbox and rewrites it as it progresses, keeping the goal in recent attention.
4. **Filesystem as memory.** Large observations (web pages, files) are written to the sandbox; context keeps only paths + summaries. Compression must be restorable (a URL or path can re-fetch the full content).
5. **Keep errors in context.** Failed actions and stack traces stay visible so the model doesn't repeat them.
6. **Compaction policy.** When context exceeds a threshold, summarize the oldest turns into structured JSON, keep the last N turns raw.
7. **Sub-agents get isolated context** and return compressed results; never share the full parent context.

**Do better:** explicit **verification step** after every artifact (screenshot + LLM check against the request) before marking a todo item done.

### 6.2 Sandbox & execution

**Must:** per-task isolated Linux environment with filesystem, shell, Python/Node, headless browser; pause/resume; hard timeouts; no access to our secrets.

**Study:** E2B SDK docs & `e2b-dev/fragments` (example app); Suna's sandbox tooling.
**Adopt:** custom sandbox template with Node, Python, Playwright, and common site scaffolds preinstalled (cuts cold start). Secrets are brokered server-side, never placed in the sandbox or model context.

### 6.3 Web builder sub-agent (Phase 1 core)

**Must:** generate a responsive landing page from business profile, show live preview, accept edits in chat, deploy to a public URL.

**Study:**
- `stackblitz-labs/bolt.diy` (MIT): prompt structure for code generation, file-action protocol, multi-provider setup.
- `dyad-sh/dyad` (check license per folder): local-first builder, templates, Supabase integration, versioning.

**Adopt:** generate into a **fixed template** (Next.js static export or Astro + Tailwind) rather than blank-slate; edit via file diffs, not full rewrites; git-commit each version inside the sandbox for undo.
**Do better:** automatic visual QA (Playwright screenshots at mobile + desktop widths → vision-model critique → fix loop, max 2 iterations).
**Deploy:** `DeployProvider` with Vercel or Cloudflare Pages API; one project per user site.

### 6.4 Research sub-agent (Phase 2)

**Must:** answer market/competitor questions with cited sources; write findings to workspace.

**Study:** `langchain-ai/open_deep_research` (MIT; supervisor + parallel researchers + compression step), `assafelovic/gpt-researcher` (planner → executors → publisher).
**Adopt:** plan research questions → parallel sub-researchers with isolated context → compress each → synthesize report with citations. Search via `SearchProvider` (Tavily default), scraping via Firecrawl or in-sandbox browser.

### 6.5 Slides sub-agent (Phase 2)

**Must:** produce an on-brand deck from a prompt or doc; export editable PPTX and PDF.

**Study:** `presenton/presenton` (check license): HTML + Tailwind templates → editable PPTX/PDF export; `icip-cas/PPTAgent`: edit-based generation from reference slides and the **PPTEval** rubric (Content, Design, Coherence).
**Adopt:** outline → pick layouts from a template library → fill → render HTML → export. Use PPTEval dimensions as our slide eval rubric.

### 6.6 Business memory (Phase 2)

**Must:** persist business name, offer, audience, tone, brand colors/fonts, logo, links, past artifacts; every agent reads it.

**Design:** structured `business_profile` table (source of truth) + `memories` table with pgvector for unstructured facts. Memory **writes are gated**: the agent proposes updates, the user confirms profile changes. Never store secrets/PII in retrievable memory.
**Upgrade path:** Mem0 (simplest drop-in) or Zep/Graphiti if facts change over time and history matters.

### 6.7 Growth actions (Phase 3)

**Must:** draft and schedule social posts; draft cold emails; all sending/publishing requires explicit user approval.

**Study:** `gitroomhq/postiz-app` (verify license; likely copyleft, so integrate via its **public API** or self-hosted instance rather than copying code). Note: platform app approvals (Meta, TikTok, YouTube) can take weeks; start them early.
**Adopt:** `approvals` table + UI; agent pauses the workflow (durable wait) until approve/reject.

### 6.8 Observability & evals (Phase 0 onward, non-negotiable)

**Must:** trace every LLM call, tool call, sub-agent, cost and latency per task; maintain an eval suite.
**Stack:** Langfuse (self-host or cloud).
**Eval harness:**
- `evals/golden_tasks/`: 30+ realistic prompts per task type (start with 30 landing-page briefs across business types).
- Automated checks: site builds, deploys, Lighthouse score, mobile rendering, required sections present.
- LLM-as-judge rubric (relevance to brief, visual quality, copy quality) with human spot checks.
- **Every production failure becomes a new golden task.** Run the suite before merging any prompt/tool change; block on regression.

---

## 7. Tech Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces (`apps/web`, `apps/api`, `packages/*`) |
| Frontend | Next.js (App Router), TypeScript, Tailwind, shadcn/ui |
| Backend API | Python 3.12, FastAPI, Pydantic, SQLAlchemy/SQLModel |
| Agent loop | Custom, on Anthropic Messages API with prompt caching; LiteLLM for multi-provider routing |
| Models | Top-tier Claude model for planning/hard code; mid-tier for most steps; small/fast model for summaries & classification (check current IDs) |
| Durable jobs | Inngest (Python SDK) |
| Sandbox | E2B, custom template |
| Browser | Playwright + browser-use inside sandbox |
| Search / scrape | Tavily, Firecrawl |
| DB / auth / storage | Supabase (Postgres, Auth, Storage) + pgvector; Redis for rate limits/cache |
| Deploy (user sites) | Vercel or Cloudflare Pages API |
| Images | Image-generation API behind `ImageProvider` |
| Observability | Langfuse; Sentry for app errors |
| Billing | Stripe, credit-based (Phase 4) |
| Hosting (our app) | Vercel (web) + Railway/Fly/Render (API + workers) |

---

## 8. Data Model (initial)

- `users` (id, email, plan, created_at)
- `projects` (id, user_id, name) — one per business
- `business_profiles` (project_id, name, offer, audience, tone, brand_json, links_json, updated_at)
- `tasks` (id, project_id, type, prompt, status, cost_usd, started_at, finished_at)
- `task_steps` (id, task_id, seq, kind[llm|tool|subagent], name, input_ref, output_ref, status, tokens_in, tokens_cached, tokens_out, cost_usd, error)
- `artifacts` (id, task_id, kind[site|deck|report|image|post], storage_url, public_url, version)
- `memories` (id, project_id, text, embedding, source_task_id, confirmed)
- `approvals` (id, task_id, action_type, payload_json, status, decided_at)
- `credit_ledger` (Phase 4)

---

## 9. Phased Delivery Plan

### Phase 0 — Foundation
- Monorepo, Supabase auth, project CRUD.
- `SandboxProvider` (E2B), `LLMProvider` (with caching), Langfuse tracing wired in.
- Minimal agent loop with tools: `shell_exec`, `file_read/write`, `ask_user`; `todo.md` planning.
- SSE progress stream to a basic chat UI.

**Acceptance:** agent can take "create a hello-world Python script and run it" end to end in a sandbox; every step visible in Langfuse; cache hit rate reported per task.

### Phase 1 — "Describe your business → live landing page"
- Onboarding interview (5–7 questions) → `business_profile`.
- Web builder sub-agent with template, live preview (sandbox port → iframe), chat edits, versioning/undo.
- Visual QA loop; one-click deploy to public URL.
- Golden-task eval suite (30 briefs) + CI gate.

**Acceptance:** ≥ 70% of golden tasks produce a deployed site passing automated checks; median time to first preview < 3 min; cost per site tracked.

### Phase 2 — Memory, research, slides
- Business memory with gated writes; all agents read profile.
- Research sub-agent with citations.
- Slides sub-agent with PPTX/PDF export; PPTEval-style rubric in evals.

**Acceptance:** a deck and a competitor report generated without the user repeating business info; eval suites per task type.

### Phase 3 — Growth actions
- Social post drafting + scheduling (Postiz API or equivalent), cold-email drafting.
- Approval gates for every send/publish.
- Content calendar view.

**Acceptance:** no irreversible action can execute without a logged approval.

### Phase 4 — Monetization & scale
- Stripe credits, per-task cost metering, model routing tuned for margin.
- Rate limits, abuse prevention, sandbox quotas.
- Evaluate Temporal migration if Inngest limits are hit.

---

## 10. Non-Functional Requirements

- **Security:** per-task sandbox; no secrets in sandbox or prompts; server-side credential brokering; RLS on all Supabase tables; sanitize user content rendered in previews.
- **Reliability:** every step checkpointed; retries with backoff on transient errors; resumable tasks after crash.
- **Cost control:** per-task token and time budgets; hard stop + user notice when exceeded; model routing by step type.
- **Performance:** first streamed token < 2 s; sandbox ready < 5 s (prewarmed template).
- **Privacy:** user data never used for training; deletion of a project removes files, memories, and deployments.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Negative unit economics (token burn) | Caching, routing, budgets, cost dashboards from Phase 0 |
| Long-chain unreliability | Verification steps, eval gates, failure → golden task loop |
| Model providers ship the same features | Narrow wedge, business memory, outcome-focused workflows |
| Social platform API approvals slow | Apply in Phase 1; start with platforms that approve fast |
| License contamination | Section 0 rule 3; `THIRD_PARTY_NOTICES.md` |

## 12. Open Questions (owner to decide)

1. Target niche for launch (general small business vs. a specific vertical)?
2. Hosted user sites on our domain (`*.forge.site`) or custom domains from day one?
3. Budget ceiling per free-tier user per month?
4. Product name and brand.
