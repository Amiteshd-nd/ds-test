# runner

The general small-business agent from the Forge PRD. **All four phases.**

One agent that builds, runs and grows a small business from plain-language
requests, remembering the business across every task. Answer six questions and
it gives you a landing page you can publish, a competitor report with citations,
a deck you can edit in PowerPoint, and a queue of posts and emails waiting for
you to say yes. It asks those six questions once, and it never sends anything
you have not approved.

```bash
corepack pnpm --filter runner seed      # once: installs the site template
corepack pnpm --filter runner browsers  # once: downloads Chromium
corepack pnpm --filter runner dev       # http://localhost:6184
```

With no `ANTHROPIC_API_KEY` set it runs entirely offline on development
stand-ins, and the footer of the UI says so. Nothing here needs an account.

**Two documents to read before doing anything real**:
[docs/SOP.md](docs/SOP.md) for how to run and change it, and
[docs/MANUAL.md](docs/MANUAL.md) for everything that needs a person - accounts,
keys, DNS, platform app reviews, and the three decisions still open.

---

## What exists

**Phase 0** is the foundation: a thin loop on the Messages API, every external
service behind an interface, every step checkpointed to a store and streamed to
the UI. Its gate is one sentence from PRD section 9 - *create a hello-world
Python script and run it*, end to end, with the cache hit rate reported.

**Phase 1** is *describe your business, get a live landing page*: a six-question
interview, a web-builder sub-agent with isolated context, a fixed Astro template
it fills, a verification loop that measures the result in a real browser at
phone and desktop widths, versioning, and one-click publish.

**Phase 2** is *memory, research and slides*. Its exit criterion is one
sentence - "a deck and a competitor report generated without the user repeating
business info" - and the second half is the part that matters. The acceptance
test's prompts are "Research what competitors charge." and "Build me a deck."
Neither says who the business is.

**Phase 3** is *growth actions*, and its exit criterion is a security property:
"no irreversible action can execute without a logged approval." The agent
drafts posts and cold emails into a queue; the owner approves each one; only
then does anything go out.

**Phase 4** is *monetisation and scale*: a credit ledger with holds, per-task
metering, plan quotas, and a cost-routing report. The free tier is $5 a month
(PRD section 12.3, set by the owner).

```bash
node scripts/acceptance.ts     # all five gates, 88 checks
node scripts/eval.ts           # five suites, one per task type
node scripts/margin.ts         # where the money goes, and what it would cost elsewhere
```

**The PRD is finished.** What is left is not a phase: it is the stand-ins,
listed under *Things to know* below, and `docs/durable-execution.md` for the
loop.

---

## How a landing page gets made

```
  owner answers six questions          Interview.tsx, core/business/profile.ts
             │                         one input per field, no model call
             ▼
  orchestrator writes a plan           core/agent/loop.ts
  and calls site_create with a brief   the builder cannot see this conversation
             │
             ▼
  sandbox is seeded from the template  core/site/seed.ts
  (or from a previous version)         node_modules cloned, not installed
             │
             ▼
  web builder fills src/site.ts        core/site/builder.ts, its own context
  picks palette, type, rhythm, radius  and its own six tools
             │
             ▼
  astro build                          templates/landing/src/guard.ts fails the
                                       build on em dashes, long headlines,
             │                         filler verbs, missing alt text
             ▼
  browser measures the page            core/site/checks.ts, both widths
  vision model looks at it             advisory only
             │
             ├── blocking failures? ───► back to the builder, at most twice
             ▼
  version captured out of the sandbox  core/site/workspace.ts
  src + dist + meta, kept forever      this is also the undo
             │
             ▼
  preview, then publish                /api/sites/…/  then  /s/<slug>/
```

### The agents

Four of them now, all on the same engine (`agent/engine.ts`) with different
specs. The difference that matters is context: a specialist never sees the
orchestrator's conversation, so its brief is the whole of what it knows, and it
hands back a summary rather than its transcript (PRD section 6.1, adopt 7).

| Agent | Tools | Returns |
| --- | --- | --- |
| Orchestrator | shell, files, memory, and one tool per specialist | the answer |
| Web builder | files, `site_build`, `site_check` | a summary and the check results |
| Researcher (one per question, in parallel) | `search_web`, `read_page` | a finding, with citations |
| Deck builder | files, `slides_build` | a summary and two exported files |
| Content drafter | files, `growth_queue` | what is now waiting for approval |

Tool sets are disjoint on purpose. The builder has no shell and no way to ask
the owner anything; the orchestrator cannot reach into either specialist's
workspace. Tests assert both.

### How research fans out

```
  research_run("what do competitors charge")
             │
             ▼
  planner: one call, top tier        3 to 6 questions, no tools
             │
   ┌─────────┼─────────┐             researchers in parallel, isolated context,
   ▼         ▼         ▼             each with its own budget slice
  Q1        Q2        Q3
   │         │         │             every URL searched or read is registered
   └─────────┼─────────┘             and numbered by us, not by them
             ▼
  synthesiser: one call, top tier    given the findings and the numbered list
             │
             ▼
  a report whose every [n] resolves
```

Compression is each researcher's own final message rather than a second call
over its transcript. It already knows what it found and what it discarded; a
compressor that did not gather the sources loses them.

### How a deck is made

A deck is structured data, not markup, which is what lets one model render two
ways: the HTML is printed to PDF by the same browser that measures it, and the
PPTX is written from the same model with real, editable text boxes. They will
never match pixel for pixel, and the agent says which is which rather than
implying otherwise.

`slides_build` fails on the rules that decide whether a deck is any good -
drawn from PPTAgent's PPTEval dimensions - and on the one a browser can see and
nobody else can: **text running off the bottom of a slide**.

### How the approval gate works

This is the phase's whole acceptance criterion, so it is enforced by the
compiler rather than by everyone remembering.

```
  growth_draft("three posts for the new season")
             │
             ▼
  drafter writes, growth_queue validates      platform limits, copy rules,
             │                                and the two things a cold email
             ▼                                needs by law
  one approvals row per item, pending         the row carries the action itself,
             │                                not a reference to a paused agent
             ▼
  the owner reads the full text and decides   approve · reject · schedule
             │
             ▼
  gate.execute(approvalId)                    the only path to a provider
             │
      ┌──────┴───────┐
   refuses         mints an ExecutionToken
   not approved    ──────────────────────►  publish() / send()
   already sent
   not yet due
```

Every provider method requires an `ExecutionToken`. Its brand is a symbol
`gate.ts` never exports, so **no other module can construct one** and therefore
no other module can call a provider. The claim is a conditional `UPDATE`, so a
double click racing the scheduler cannot double-send: exactly one caller wins.

[`gate.test.ts`](src/core/__tests__/gate.test.ts) checks it from both sides -
that the gate refuses what it should, and that no other file in `src/core`
calls a provider at all.

### How credit works

Append-only. Every movement is a row and a balance is never stored anywhere as a
mutable number, because when somebody disputes a bill the question is "how did
it get there", not "what is it".

```
  grant      +5.00   ->  5.00     once per calendar month, idempotent
  hold       -2.00   ->  3.00     reserved before the task starts
  release    +2.00   ->  5.00     the whole hold back, when it ends
  debit      -0.41   ->  4.59     what it actually used
```

The **hold** is the part that matters. Without it, a user with fifty cents could
start a task with a two dollar ceiling, and two tasks starting at once would
both see the same balance and both spend it. The check and the hold happen in
one transaction, so neither can. A settle is capped by the hold, so a mispriced
provider cannot drive a balance negative.

A hold left behind by a crashed process is released by the scheduler after an
hour. That sweeper has the same lifetime as the thing whose failure it
compensates for, which is a stopgap and is labelled one in
[docs/durable-execution.md](docs/durable-execution.md).

### How memory is gated

PRD section 6.6 says memory writes are gated. Here that is a property of the
query, not of the interface: `remember` writes an unconfirmed row, and `recall`
returns confirmed rows only. An agent cannot act on a fact nobody has agreed to,
because it never sees it.

The owner reviews the queue when they want, in a panel, and nothing interrupts a
task to ask. That is only safe *because* of the query above. `looksSensitive`
refuses credentials, card numbers and NI numbers before they reach the table,
because memory is read back into prompts.

### Why the template has design axes

A fixed template is the PRD's answer to blank-slate generation, and it is right.
But one fixed *look* turns thirty businesses into thirty copies of one page,
which is the failure a template exists to prevent. So `site.design` carries four
axes the builder chooses from the brief:

| Axis | Options |
| --- | --- |
| `palette` | forest · cobalt · terracotta · olive · ink · signal |
| `type` | grotesk · warm · character · heritage |
| `rhythm` | split · offset · frame (never centered) |
| `radius` | sharp · soft · pill (locked page-wide) |

216 combinations before a word of copy. The eval suite checks the spread across
all thirty pages, because thirty pages that each pass alone but share one
palette is a failure only the suite can see.

The palettes exclude the beige-and-brass family that every AI-generated
"artisan" page reaches for; the type pairings exclude Inter, Fraunces and
Instrument Serif for the same reason.

### Why the build can fail on a design rule

`templates/landing/src/guard.ts` runs inside `astro build`. No em dashes
anywhere a visitor can read, headline at most 52 characters, hero subtext at
most 20 words, CTA label at most three words, no filler verbs, no placeholder
names, at least three real images with dimensions and alt text.

A design rule written only in a prompt is a suggestion. The same rule as a build
error is a rule. It caught the template's own example content on the first run.

### Why the checks are measured, not judged

`core/site/checks.ts` runs in a real browser and measures about twenty things
exactly: heading line counts, whether the hero message fits the first screen,
WCAG AA contrast on every text node, image dimensions, duplicate call-to-action
intent, how many uppercase eyebrow labels there are relative to section count.
Those failures block.

A vision model then looks at the same screenshots and says whether the page
reads as a template nobody adapted. Those notes are advisory. A model is good at
"this looks cramped" and unreliable at "this heading is three lines"; a browser
is exact about the second and has no opinion about the first.

---

## How it is put together

```
src/core/
  types.ts            the persisted rows (PRD section 8) and the stream events
  auth.ts             a single-user development identity - a Supabase stand-in
  providers/
    interfaces.ts     SandboxProvider, LLMProvider, DeployProvider, TraceSink, …
    registry.ts       which implementation this process uses, from the env
    llm-anthropic.ts  the real provider: caching, streaming, model tiers, cost
    llm-scripted.ts   a routed test double, for offline runs
    sandbox-local.ts  a scratch directory and a child process - NOT isolation
    sandbox-e2b.ts    the production sandbox, written, unexercised
    browser-playwright.ts  screenshots and the in-page measurements
    deploy-local.ts   publish to this machine
    deploy-cloudflare.ts   written, unexercised
    images.ts         the ImageProvider seam. Picsum behind it, for now
    trace-jsonl.ts    one JSON object per step, on disk - a Langfuse stand-in
  agent/
    engine.ts         the loop, shared by both agents
    loop.ts           the orchestrator: task rows, sandbox, bus, versions
    prompt.ts         both frozen system prompts
    tools.ts          the stable, prefix-namespaced tool registry
    tool-labels.ts    names to labels, with no server imports (the UI uses it)
    compaction.ts     fold old turns into structured JSON, keep the recent ones
    bus.ts            run events, between the loop and the SSE endpoint
  site/
    assets.ts         the owner's own photographs, and how they reach a page
    builder.ts        the web builder sub-agent and its verification loop
    checks.ts         what gets measured, as it runs inside the page
    seed.ts           template into sandbox without an npm install
    workspace.ts      versioned sites: src, dist, meta, forever
    server.ts         a throwaway static server, so the browser has a URL
    serve-file.ts     serving a site under a path it was not built for
    deploy.ts         publishing, and the approval gate in front of it
  business/
    profile.ts        the interview, and the brief it becomes
    memory.ts         gated facts, FTS5 recall, and what will not be stored
  research/
    agent.ts          plan, fan out, compress, synthesise
    search.ts         Tavily, and recorded fixtures for offline runs
    fetch.ts          reading a page with the browser that is already here
    sources.ts        citation numbering, owned by us
  slides/
    deck.ts           the model, and the rules that fail a build
    render.ts         deck to HTML, with the fonts inlined
    export.ts         HTML to PDF, model to editable PPTX
    agent.ts          the deck sub-agent
  growth/
    actions.ts        posts and emails, and the rules a draft must satisfy
    gate.ts           the only door. Nothing sends without going through it
    scheduler.ts      the ticker, and the catch-up pass
    outbox.ts         records what would have gone out, and says it did not
    postiz.ts         AGPL, so HTTP only. Written, unexercised
    resend.ts         written, unexercised
    agent.ts          the content drafter
  billing/
    ledger.ts         credits, holds, settlement, and the stale-hold sweep
    plans.ts          what a plan allows: grant, per-task cap, quotas
    admission.ts      whether a task may start, and what to say if not
    provider.ts       local credit, and a Stripe adapter that has never run
  design/
    palettes.ts       the six palettes, shared with the site template
  artifacts.ts        where reports and decks live after the sandbox is gone
  db/
    schema.sql        the data model, written to port to Postgres
    store.ts          SQLite behind it
templates/landing/    the Astro template, with its own AI_RULES.md and guard
src/app/              Next App Router - the workbench and the REST + SSE API
src/components/       the workbench UI
evals/golden_tasks/   the suites (PRD section 6.8)
scripts/              acceptance.ts, eval.ts, seed-template.ts
```

### Prompt caching

PRD section 4 wants a cache hit rate at or above 70%. That is not a tuning
exercise, it is a set of constraints on how the request is built:

| Constraint | Where | Why |
| --- | --- | --- |
| Both system prompts frozen for the life of a run | `prompt.ts` | One varying byte at the top invalidates every cached token beneath it |
| Tool list fixed at start, sorted by name | `engine.ts` | The same tools in a different order is a different prefix |
| Cache breakpoints at the end of tools and of system | `llm-anthropic.ts` | Tools render before system, so one breakpoint covers both |
| Per-run context in the first user message | `prompt.ts`, `builderContext` | After the breakpoint. The template's AI_RULES go here for the same reason |
| Compaction skipped unless it reclaims a third | `compaction.ts` | Rewriting history is a guaranteed miss; make it pay for itself |

`src/core/__tests__/cache.test.ts` guards each of these. They are the tests
worth keeping when everything else changes: every one protects a change that
looks harmless in review and costs 10x on input tokens.

### Model tiers

`plan` to `claude-opus-5`, `step` to `claude-sonnet-5`, `fast` to
`claude-haiku-4-5`. The first turn of a run plans and goes to the top tier;
everything after it to the mid tier. For the builder that first turn is where it
chooses the design axes and writes every word on the page, which is the
judgement-heavy part and worth paying for once.

---

## Running it

```bash
corepack pnpm --filter runner dev        # the workbench, port 6184
corepack pnpm --filter runner seed       # install the site template (once)
corepack pnpm --filter runner browsers   # download Chromium (once)
node scripts/acceptance.ts               # both phase gates
node scripts/acceptance.ts 1             # just Phase 1
node scripts/eval.ts landing --limit 5   # five golden briefs
corepack pnpm --filter runner test       # unit tests
corepack pnpm --filter runner typecheck
```

Scripts read from the package root - run them from `packages/runner`.

### Configuration

Everything is optional; see [.env.example](.env.example). The ones that change
what actually happens:

```bash
ANTHROPIC_API_KEY=sk-ant-...     # switches the LLM provider to the real one
TAVILY_API_KEY=tvly-...          # real web search; without it research uses fixtures
SANDBOX_PROVIDER=e2b             # with E2B_API_KEY; required in production
DEPLOY_PROVIDER=cloudflare       # with a token and account id; publishes publicly
PUBLISH_PROVIDER=postiz          # with POSTIZ_URL and POSTIZ_API_KEY; posts for real
EMAIL_PROVIDER=resend            # with RESEND_API_KEY and EMAIL_FROM; sends for real
RESEARCH_BUDGET_USD=1.5          # ceiling per report; researchers run in parallel
```

### Local state

`.runner/` (git-ignored) holds `runner.db`, the JSONL traces, the task
sandboxes, every site version and every local deployment. Delete it to start
clean. `RUNNER_KEEP_SANDBOX=1` keeps a task's sandbox on disk after the run.

---

## Things to know before trusting a run

- **Nothing is actually sent.** `PUBLISH_PROVIDER` and `EMAIL_PROVIDER` default
  to an outbox that writes what would have gone out to `.runner/outbox.jsonl`.
  The calendar says "recorded, not actually sent" on every item and the footer
  says it too. Switching to Postiz or Resend is a config change; connecting
  Meta, TikTok or YouTube is weeks of platform app review.
- **Nothing fires while Runner is stopped.** The scheduler is a timer inside the
  server. It catches up on the first request after a restart, and says how late
  each item is. A real scheduler is Phase 4.
- **The draft rules are not legal compliance.** A cold email is refused without
  a sender identity and an opt-out, because both are required under PECR and the
  GDPR and both are cheap to enforce. That is two specific requirements, not
  advice.
- **Research cannot be signed off offline.** Without `TAVILY_API_KEY` the
  fixture provider replays recorded results for the queries the evals ask and
  returns nothing for anything else. The research suite reports N/A rather than
  passing, because a suite that passes on recorded answers is measuring the
  fixtures.
- **Photographs**: the owner's own uploads are used first, and they are the
  right answer - a small business has better pictures of its own work than any
  model will generate. Slots with no photograph fall back to Picsum, which
  returns a real image at the right shape and of nothing in particular. The
  builder names which slots are still placeholders.
- **No payment is taken.** `BILLING_PROVIDER=local` adds credit straight to the
  ledger. With Stripe, credit comes from the webhook and never from the success
  redirect, because a browser arriving at a page is not a payment settling.
- **The local sandbox is not isolation.** A directory and a child process
  running as you, on your machine. `registry.ts` refuses to hand it out when
  `NODE_ENV=production`. Untrusted, model-written code needs E2B.
- **The scripted provider is a test double.** It replays fixed scripts and does
  not read the prompt. A green acceptance run against it proves the pipeline -
  the loop, the store, the sandbox, the template, the browser checks, the
  capture, the publish - and nothing about whether the agent writes a good page.
- **Its cache figure is simulated.** Derived from the real prefix/suffix split,
  so the measurement plumbing is exercised. Only a run against the Anthropic
  provider is evidence that caching works.
- **A local deployment is not public.** It is a real URL served by this app on
  this machine, and it stops working when Runner stops.
- **There is no real authentication and no row-level security.** `auth.ts` is
  one user from a cookie. PRD section 10 requires RLS on every table; that
  arrives with Supabase and has no SQLite equivalent.
- **A task does not survive a server restart.** The loop runs in-process. Step
  rows and site versions survive; the live stream does not, and an `ask_user`
  waiting for an answer dies with the process.
- **`sandbox-e2b.ts` and `deploy-cloudflare.ts` have never run.** Check their
  API calls against current docs before the first real use.

Every one of these is logged, with its reasoning, in [DECISIONS.md](DECISIONS.md).

---

## The UI

Three panes: what you are asking for, what is happening, what exists now. The
direction came from `.claude/skills/ui-ux-pro-max` - the Dark Mode (OLED) style,
its palette, and the JetBrains Mono / IBM Plex Sans pairing. There is no light
theme: the style's own guidance is against one, and a console you watch a
long-running process in should not flip white halfway through a run.

Motion runs through `@cloud-march/motion`, weighted Emil-primary per
`.claude/skills/design-motion-principles` (productivity tool). What that came to:

- **Step cards and check results animate in**, opacity plus an 8px rise on
  `tokens.spring.firm`. They arrive while the reader is looking elsewhere, and
  the movement is what says something landed. That is orientation.
- **The interview animates between steps.** Someone does it once per business,
  so the frequency gate does not apply, and a step replacing another in the same
  box needs to say which direction it came from.
- **Streaming text, the composer, the device switch and the view switch do
  not.** All frequent or keyboard-initiated. Instant is correct. The device
  switch is also a width change, which is a layout property and the wrong thing
  to animate at any frequency.
- **Plan ticks and status pills are CSS transitions**, 120 to 180ms, colour
  only. Feedback, not staging.
- **Nothing pulses, glows or breathes.** The one loop in the app is the caret on
  streaming text, which is the terminal convention for "output is still
  arriving" and carries information no static treatment does. Reduced motion
  gets a solid caret rather than none, so its position stays legible.

`prefers-reduced-motion` is handled by the motion tokens and by `useMotionSafe`;
nothing disappears for that reader, it just stops travelling.

---

## Where this goes next

The PRD's four phases are done. What is left is in three piles.

**Measure the quality.** Every acceptance check passes against a scripted test
double, which proves the machinery and nothing about the output. The landing
suite's 70% bar has never actually been measured. That is the first thing worth
spending money on, and it costs about a pound for five briefs.

**Swap the stand-ins.** E2B, Langfuse, Supabase, Tavily, Postiz, Resend, Stripe,
an image generation API. Each is one file and one registry line, and each has
never talked to the real service - check its calls against current docs before
the first run.

**Make the loop durable.** [docs/durable-execution.md](docs/durable-execution.md)
is the evaluation PRD section 9 asks for. Short version: Inngest when there is a
second user, Temporal probably never, and there are two things worth doing
first.

Four questions in PRD section 12 are still the owner's: the launch niche,
whether user sites live on our domain or custom ones, and the product name.
The free-tier ceiling is now answered - $5 a month.

---

## See also

- [docs/SOP.md](docs/SOP.md) - how to run it, change it safely, and work out
  what went wrong
- [docs/MANUAL.md](docs/MANUAL.md) - everything that needs a person: accounts,
  keys, domains, platform app reviews, and the decisions that are yours
- [docs/PRD.md](docs/PRD.md) - the spec this is built to, checked in verbatim
- [docs/durable-execution.md](docs/durable-execution.md) - what to do about the
  in-process loop, and when
- [DECISIONS.md](DECISIONS.md) - every deviation from the PRD, and why
- [templates/landing/AI_RULES.md](templates/landing/AI_RULES.md) - the contract
  the builder reads before it touches the template
- [evals/README.md](evals/README.md) - the suites, and what is deliberately not
  in them yet
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) - licences, and what was
  studied rather than copied
