# Decisions

PRD section 0, rule 6: every deviation from the PRD, what and why.
Newest first.

---

## D32 - The eval finds its own sandbox, not the newest one (Phase 4 fix)

**The bug**: `eval.ts` located a task's working directory by taking the newest
directory under `.runner/sandboxes`. With `RUNNER_KEEP_SANDBOX=1` that directory
is shared with every previous run, so a suite passed or failed depending on what
had been run before it - the landing suite went green alone and red immediately
after an acceptance run.

**We did**: look it up by task id. `LocalSandboxProvider` names each directory
after the task that owns it.

**Why it is worth an entry**: an eval whose result depends on what ran
beforehand is worse than no eval, because it is believed. This one was found by
running the two scripts back to back, which is exactly how they will be run.

---

## D31 - The owner's own photographs come first (Phase 4 fix)

**The problem** (D13): Picsum returns a real photograph chosen at random by a
seed, so a hedgelaying page got a flat lay of sunglasses. Every surface said so,
which was honest and did not make the page any better.

**What we did instead of a generator**: somewhere to put the photographs the
business already has. Uploads go to `.runner/assets/<project>/`; `seedSite`
copies them into the site project's `public/assets/`, which Astro copies into
`dist/`. So `/assets/hedge.jpg` is a working path in the preview, in the
published site and in an export, with no rewriting at serve time.

**Why this beats an image API**: a small business has better photographs of its
own work than any model will generate, and they are already on the owner's
phone. The `ImageProvider` seam stays for the slots nobody has a photograph for.

**What is enforced**: a description is required on upload, because it becomes
the alt text *and* it is how the builder decides which slot a photograph belongs
in. Anything under 800px wide is refused - it looks soft as a hero and nobody
notices until it is live. Dimensions are read from the file header rather than
by adding `sharp`, which is a native build and forty megabytes to answer "how
wide is it".

---

## D30 - Stale credit holds are swept by the scheduler (Phase 4)

**The bug**: a task reserves its budget before it starts and settles when it
ends. A process that dies in between leaves a user's credit held against a task
that will never finish.

**We did**: `releaseStaleHolds` runs on every scheduler tick, releasing holds
older than an hour whose task is still marked running.

**Why an hour**: a long research fan-out can legitimately hold its budget for
several minutes, and releasing a hold from a task that is still running would
let it overspend. Reserving too long is the safer error.

**Why the scheduler**: it is the only thing in the process that outlives a
crashed task. That is also a weak place to put it, and
`docs/durable-execution.md` says so - the sweeper has the same lifetime as the
thing whose failure it compensates for. It is a stopgap and it is labelled one.

---

## D29 - Inngest, but not yet; Temporal, probably never (Phase 4)

**PRD says** (section 9, Phase 4): "Evaluate Temporal migration if Inngest
limits are hit."

**We did**: the evaluation, in `docs/durable-execution.md`. The recommendation
is **Inngest when there is a second user, and Temporal only if Inngest's limits
actually bite**.

**Why not now**: the three failures a durable runtime would fix - a task not
surviving a restart, `ask_user` dying with the process, the scheduler not firing
while the server is down - all currently cost one developer rerunning one task.
Adopting a hosted dependency in the path of every task, for work that is still
changing shape every phase, is the more expensive mistake.

**Why probably not Temporal**: its determinism rules require replayable workflow
code, and an LLM loop is the least deterministic thing one could write. Every
model and tool call would move into an activity and the workflow would become a
thin coordinator - a real restructuring, and the specific thing the PRD's own
architecture table warns about.

**What was done instead**: the doc lists what would have to change, and it is a
short list. The invariants Phase 0 chose - append-only messages, checkpoint
before the work, results appended rather than thrown - are the same ones a step
function needs.

---

## D28 - Credits are a ledger with holds, not a balance column (Phase 4)

**PRD says** (section 8): a `credit_ledger` table; (section 9) "Stripe credits,
per-task cost metering".

**We did**: an append-only ledger. Every movement is a row; a balance is never
stored anywhere as a mutable number.

**Why**: when somebody disputes a bill the question is not "what is the balance"
but "how did it get there", and an overwritten column cannot answer it. Each row
carries `balance_after`, written in the same transaction, so the balance is one
read *and* reconcilable against the sum of everything before it. The acceptance
test checks that reconciliation.

**The part that matters is the hold.** A task reserves its budget before it
starts and settles the difference when it ends. Without it, a user with fifty
cents could start a task with a two dollar ceiling; and two tasks starting at
once would both see the same balance and both spend it. The check and the hold
happen in one transaction, so neither can happen. A settle is capped by the
hold, so a mispriced provider or a bug in the loop's accounting cannot drive a
balance negative.

**Holds and debits are separate rows** rather than one net adjustment, so the
history reads the way it happened.

---

## D27 - Stripe credits on the webhook, never on the redirect (Phase 4)

**We did**: `BillingProvider` with a local implementation that adds credit
directly, and a Stripe adapter that has never run.

**The one thing worth stating loudly**: with Stripe, credit is added by the
`checkout.session.completed` webhook and by nothing else. `/api/billing/confirm`
refuses outright when the provider is not local.

**Why**: a browser arriving at a success URL means the browser arrived. It does
not mean the payment settled, and crediting on the redirect is how an account
gets paid for a card that later declines. The webhook also needs its signature
verified and needs to be idempotent on the event id, because Stripe retries -
both noted in the file, neither written, because a webhook handler nobody has
ever received a webhook for is a guess rather than an implementation.

---

## D26 - The scheduler starts on the first request, not at boot (Phase 3)

**Intended**: `instrumentation.ts`, which is Next's hook for exactly this.

**What happened**: Next compiles that file for the edge and client runtimes as
well as for Node, and webpack resolves a dynamic import inside it regardless of
the `NEXT_RUNTIME` check guarding it. `better-sqlite3` ended up in the browser
bundle and the app would not compile.

**We did**: `ensureScheduler()`, called from the root page and the queue route.
Idempotent, so every caller can just call it.

**What this costs**: the catch-up pass runs on the first request after a restart
rather than at process start. For an app somebody opens in a browser those are
the same moment. For a server sitting idle overnight they are not, and it is one
more reason this belongs on Inngest in Phase 4.

---

## D25 - Drafts are checked against the law, not only against taste (Phase 3)

**PRD says** (section 6.7): "draft and schedule social posts; draft cold
emails."

**We did**: `validateAction` refuses a cold email with no `from_identity` or no
`opt_out`, in the same place and the same way it refuses a post over X's 280
characters.

**Why they are in the same function**: because to the agent they are the same
kind of thing - a rule the draft has to satisfy before it can be queued - and
separating them would make the legal ones optional in a way the platform ones
are not. Sending an unsolicited marketing email without identifying the sender
or offering a way to stop is unlawful under PECR in the UK and the GDPR in the
EU. It is not a style preference and it is not the owner's oversight to catch.

**Not claimed**: this is not legal compliance. It is two specific requirements
that are cheap to enforce and expensive to miss. Anyone running real cold email
campaigns needs advice this file is not.

---

## D24 - The outbox records, and every surface says it did not send (Phase 3)

**PRD says** (section 6.7): integrate Postiz or equivalent.

**We did**: `PublishProvider` and `EmailProvider` with a local outbox that
writes exactly what would have gone out to `.runner/outbox.jsonl`, plus a Postiz
adapter and a Resend adapter that have never run.

**Why the emphasis on labelling**: a "sent" badge on something that never left
the machine is the worst outcome this phase could produce - worse than not
building it, because the owner would believe the post is live. So the provider
returns `local: true`, the API passes it through as `sent_externally`, the
calendar says "recorded, not actually sent", and the footer says it too.

**Unlike the local sandbox**, the outbox is *not* refused in production. An
outbox in production is a product that does not send, which is visible within a
day; the local sandbox in production is a security hole, which is not.

---

## D23 - Postiz is AGPL, so the integration is HTTP only (Phase 3)

**PRD says** (section 6.7): "`gitroomhq/postiz-app` (verify license; likely
copyleft, so integrate via its **public API** or self-hosted instance rather
than copying code)."

**Verified**: AGPL-3.0, both the `LICENSE` file and the `package.json` field.
The PRD's caution was right.

**We did**: `postiz.ts` talks HTTP to a running instance. Nothing from that
repository is present, adapted, or used as a structural reference.

**The practical warning worth repeating**: Postiz is the easy half. Connecting
Meta, TikTok or YouTube needs platform app review, which takes weeks. Section
6.7 says to start those early and it is right.

---

## D22 - Approvals queue the action, not the agent (Phase 3)

**PRD says** (section 6.7): "agent pauses the workflow (durable wait) until
approve/reject."

**We did**: the agent drafts, writes an approval row carrying the action itself,
and finishes. Approving executes the payload directly - no agent involved.

**Why**: the PRD asks for a *durable* wait, and our loop runs in-process. A
paused agent dies with the server, which is the gap D7 has flagged since Phase
0. Queuing the action rather than the agent is durable with nothing added: the
row is the pending work, and the row is in SQLite.

**The property this buys**, which is the phase's whole acceptance criterion:
`execute` is the only path to a provider, and every provider method requires an
`ExecutionToken` whose brand is a symbol `gate.ts` never exports. No other
module can construct one, so **the compiler enforces that nothing sends without
going through the gate**, and the gate refuses any row that is not approved,
already executed, or not yet due.

The claim is a conditional UPDATE, so a double click racing the scheduler cannot
double-send: exactly one caller gets `changes === 1`. A claimed action that then
fails stays claimed with the error recorded, because retrying a send that may
have half-succeeded is worse than leaving it visibly failed.

`gate.test.ts` checks this from both sides - that the gate refuses what it
should, and that no other file in `src/core` calls a provider.

---

## D21 - Dev and production builds no longer share `.next` (Phase 2)

**PRD says** nothing. This is a bug fix.

**What happened**: running `next build` while `next dev` was live left the two
writing over each other's chunk manifests, and the app died with
`Cannot find module './341.js'` naming a chunk that was plainly sitting in
`.next/server/chunks/`. The surviving `webpack-runtime.js` was from the other
build and looked for it somewhere else.

**We did**: `distDir` reads `NEXT_DIST_DIR`, and the build and start scripts set
it to `.next-build`. Dev keeps `.next`. They cannot collide.

**Why not just delete `.next`**: because the obvious thing to do while working -
check that a change compiles, without stopping the server - would break it
again, and the error names a file that exists, which sends you looking in
entirely the wrong place.

---

## D20 - Search has no offline stand-in, and the suite says so (Phase 2)

**PRD says** (section 6.4): "Search via `SearchProvider` (Tavily default)."

**We did**: the interface, a Tavily adapter that has never run, and a fixture
provider that replays recorded results for the queries the evals ask and returns
**nothing** for anything else.

**Why the strictness**: a loose fixture matcher would answer questions it has no
results for, and a researcher handed the wrong sources writes a confident report
about the wrong thing. Returning nothing looks worse and is honest, and the
researcher's prompt tells it to say what it could not find.

**The consequence, stated plainly**: the research eval suite **cannot be signed
off offline**. It reports N/A rather than passing, because a research suite that
passes on recorded answers is measuring the fixtures. It needs `TAVILY_API_KEY`.

---

## D19 - Citation numbers belong to us, not to the model (Phase 2)

**PRD says** (section 6.4): "synthesise report with citations."

**We did**: a `SourceRegistry` per report. Every URL a search returns or a
researcher opens is registered and given a stable number; researchers are told
to cite those numbers, and the synthesiser is handed the same list.

**Why**: six researchers running in parallel, each numbering its own sources,
produces six conflicting numberings for one report. Asking the synthesiser to
reconcile them yields `[3]` pointing at a different page in each half, which is
worse than no citation because it looks checked. The eval asserts every bracket
in the report resolves to a listed source.

**Also**: compression is the researcher's own final message rather than a second
model call over its transcript. It already knows what it found and what it
discarded; a compressor that did not gather the sources loses them, which is
what open_deep_research's compression prompt spends most of its words guarding
against.

---

## D18 - Memory recall is FTS5, not embeddings (Phase 2)

**PRD says** (section 6.6): "`memories` table with pgvector for unstructured
facts."

**We did**: SQLite FTS5 with porter stemming and bm25 ranking. The `embedding`
column exists and stays NULL.

**Why**: SQLite has no vector index, and Anthropic has no embeddings endpoint -
so an embedding would mean a third vendor for one feature. For a store holding a
few dozen short facts about one business, FTS5 returns the rows a vector search
would. The upgrade is a backfill, not a migration.

**One thing to know**: query terms are OR-ed, not AND-ed, so a fact sharing one
word with the question still comes back, ranked lower. For a store this size
that is the right trade: an AND query that returns nothing is a worse failure
than a list with one loose match at the bottom.

---

## D17 - Memory writes are gated by the query, not by the UI (Phase 2)

**PRD says** (section 6.6): "Memory **writes are gated**: the agent proposes
updates, the user confirms."

**We did**: `remember` writes an unconfirmed row and `recall` returns confirmed
rows only. An agent physically cannot act on a fact nobody has agreed to,
because the query does not return it.

**Why it is not a UI rule**: a convention enforced in a component is one
refactor away from not being enforced at all. This one is enforced in SQL, and
`memory.test.ts` asserts it directly.

**The review is batched** rather than blocking, which the owner chose. Facts
queue in a panel; nothing interrupts a task to ask. That is only defensible
*because* of the query above: an unread queue is safe.

**Also**: `looksSensitive` refuses credentials, card numbers and NI numbers
before they reach the table, because memory is read back into prompts. Its first
version matched `password: x` and missed "the password **is** x" - which is
exactly how an agent writing prose would phrase it. The Phase 2 acceptance test
caught that.

---

## D16 - A deck is a model with two renderers (Phase 2)

**PRD says** (section 6.5): "render HTML, export editable PPTX and PDF."

**We did**: a deck is structured data. The HTML render is printed to PDF by the
same browser that measures it; the PPTX is built from the same model with
PptxGenJS, as real text boxes.

**Why not one source**: a deck authored as HTML can be printed but not edited;
one authored as PPTX cannot be rendered faithfully in a browser. Section 6.5 is
specific that the PPTX is editable, and a deck of slide images in a PPTX
wrapper is a PDF with a different extension.

**What this costs**: the two will never match pixel for pixel, because CSS
layout and PowerPoint's layout model do not correspond. The PDF is the faithful
one and the PPTX is the one somebody can edit on a train. The agent's summary
says which is which rather than implying they are the same.

**The check that earns its place**: text overflowing a slide. A slide is a fixed
box, and neither the model that wrote the JSON nor anyone reading it can see
that six bullets of nineteen words will run off the bottom. The browser can, and
an overflow fails the build.

---

## D15 - The deck shares the site's palettes, duplicated and tested (Phase 2)

**PRD says** (section 6.6): the profile remembers brand colours and fonts.

**We did**: the six palettes and four type pairings exist twice - as CSS custom
properties in the landing template, and as TypeScript for the deck renderer and
the PPTX writer.

**Why duplicate**: a stylesheet cannot be imported into a PPTX writer, and a
deck that does not look like the business's website is the opposite of
remembering its brand.

**How the drift is handled**: `design.test.ts` parses the template's actual CSS
and fails if the two disagree on a name or a hex value. Duplication with a test
is a trade; duplication without one is a bug waiting.

---

## D14 - The onboarding interview is a form, not an agent (Phase 1)

**PRD says** (section 9): "Onboarding interview (5-7 questions) to
`business_profile`."

**We did**: six fixed steps in the UI, each input bound to exactly one profile
field. No model call anywhere in it.

**Why**: a model-driven interview costs a call per answer, takes longer, and can
drift off the fields it exists to fill - and the owner cannot see how many
questions are left. A form fills every field, every time, for nothing. Where a
model does earn its place is the gaps afterwards, and the orchestrator still has
`ask_user` for those.

**Cost**: no adaptive follow-ups. A plumber and a barrister get the same six
questions. If that shows up as thin briefs, the fix is a seventh step that asks
one model-chosen question, not replacing the whole flow.

---

## D13 - Picsum images are stand-ins, and every surface says so (Phase 1)

**PRD says** (section 7): "Images: image-generation API behind `ImageProvider`."

**We did**: the `ImageProvider` seam exists (`core/providers/images.ts`) with a
Picsum implementation behind it. No generation provider, because that is another
paid account.

**Why it matters more than it sounds**: Picsum returns a real photograph chosen
at random by a seed. A hedgelaying page gets a flat lay of sunglasses and a
wristwatch. The layout is honest and the visual checks are meaningful, and the
page is not usable by a customer.

Because that is easy to miss on a page that otherwise looks finished, it is
stated in three places rather than one: the template's `AI_RULES.md` tells the
builder to hand the site over with the caveat, the preview repeats it under
every page, and this entry records it. Replacing Picsum is the single biggest
quality win available in Phase 2.

---

## D12 - Published sites are local until the owner says otherwise (Phase 1)

**PRD says** (section 6.3): "`DeployProvider` with Vercel or Cloudflare Pages
API; one project per user site."

**We did**: `DeployProvider` with a local implementation that copies the built
site into `.runner/deployments/<slug>/` and serves it at `/s/<slug>/`, plus a
Cloudflare Pages adapter that has never run.

**Why**: PRD rule 7 says ask before deploying anything publicly, and the owner
chose local for now. The local path is a real, stable, openable URL, so the
whole flow - build, check, choose a version, publish, get a link, record it
against the version - is exercisable end to end. It is not public, and the UI
says "on this machine only, not public" wherever it shows the URL. A link that
looks live and is not would be worse than no link.

**Also**: the Cloudflare adapter shells out to `wrangler pages deploy` rather
than calling the direct upload API. The API path is three calls with a
content-hash manifest, and writing that from the docs without being able to run
it would produce more speculative code, not less.

---

## D11 - The template enforces the design rules at build time (Phase 1)

**PRD says** (section 6.3): generate into a fixed template. It does not say what
the template should do about quality.

**We did**: `templates/landing/src/guard.ts` runs inside `astro build` and fails
the build on a named list of content rules - no em dashes anywhere a visitor can
read, headline at most 52 characters, hero subtext at most 20 words, CTA label
at most three words, no filler verbs, no placeholder names, at least three real
images with dimensions and alt text.

**Why**: a design rule written only in a prompt is a suggestion. The same rule
as a build error is a rule. The agent cannot preview or publish a page that
breaks one, and the error message names the field and says what to change, so it
fixes it rather than arguing with it. It caught the template's own example
content on the first build.

The rules themselves come from `.claude/skills/taste-skill`, and the mechanical
half of its pre-flight is what `core/site/checks.ts` measures in the browser.

---

## D10 - The visual QA loop splits measuring from judging (Phase 1)

**PRD says** (section 6.3, "do better"): "Playwright screenshots at mobile +
desktop widths, vision-model critique, fix loop, max 2 iterations."

**We did**: both halves, deliberately separated. A real browser measures 20-odd
things exactly - heading line counts, whether the hero message fits the screen,
WCAG contrast ratios, image dimensions, duplicate CTA intent, eyebrow count -
and those failures block. A vision model then looks at the same screenshots and
comments on what a browser cannot see, and its notes are advisory.

**Why**: a vision model is good at "this looks cramped" and unreliable at "this
heading is three lines". A browser is exact about the second and has no opinion
about the first. Blocking on the model's opinion of a page it has seen once
would make builds flaky for reasons nobody could reproduce.

**Two iterations** is the PRD's number and it is right: the first pass fixes real
mistakes, the second fixes what the first missed, and a third spends money
rewriting a page that was already fine.

---

## D9 - The template varies by design axes, not just content (Phase 1)

**PRD says** (section 6.3): "generate into a **fixed template** rather than
blank-slate."

**We did**: one template, with four axes the builder chooses per business -
palette (six families), type pairing (four), hero rhythm (three), radius system
(three). 216 combinations before a word of copy is written.

**Why**: a template with one fixed look turns thirty different businesses into
thirty copies of the same page, which is the exact failure a template is
supposed to prevent. The eval suite checks this at the suite level: thirty pages
that each pass on their own but share one palette is a failure only the suite
can see.

The palettes deliberately exclude the beige-and-brass family that every
AI-generated "artisan" page reaches for, and the type pairings exclude Inter,
Fraunces and Instrument Serif for the same reason.

---

## D8 - The loop was extracted so sub-agents share it (Phase 1)

**PRD says** (section 6.1, adopt 7): sub-agents get isolated context and return
compressed results.

**We did**: the loop moved from `loop.ts` into `agent/engine.ts`, and both the
orchestrator and the web builder are now a spec passed to it. `loop.ts` keeps
what is true of a *task* rather than of an agent: the task row, the sandbox
lifecycle, the run bus, the pause while the owner answers, and capturing the
result as a version.

**Why**: copying two hundred lines to get a second agent would mean fixing every
future bug twice, and Phase 2 adds two more agents.

**Risk taken**: this refactored code that Phase 0 had already accepted. The 36
tests at the time were run before and after and stayed green, which is most of
the reason they exist.

---

## D1 — TypeScript everywhere, not Python + FastAPI

**PRD says** (section 7): Python 3.12, FastAPI, Pydantic, SQLAlchemy for the API.

**We did**: Next.js App Router route handlers, TypeScript throughout.

**Why**: `cloud-march` is a pnpm/TypeScript monorepo with no Python toolchain in
any of its ten packages. A FastAPI service would add uv, a virtualenv and a
second test runner to a repo whose guardrails are about keeping one shape.
Nothing in Phase 0 needs Python: the agent loop is I/O, the store is SQLite, and
the sandbox runs Python *inside* itself either way. Confirmed with the owner
before any code was written.

**Costs**: the PRD's reference repos for the orchestrator are Python, so their
code is read rather than adapted. Inngest's Python SDK (section 7) becomes the
TypeScript one.

**Reversible?** The interfaces in `src/core/providers/interfaces.ts` are the
contract, not the language. A FastAPI service would reimplement them; the agent
loop would move wholesale.

---

## D2 — Local development stand-ins for E2B, Anthropic, Supabase and Langfuse

**PRD says** (section 5): E2B sandboxes, Anthropic API, Supabase Postgres,
Langfuse tracing.

**We did**: each of those sits behind an interface with a working local
implementation — a scratch-directory sandbox, a scripted LLM, SQLite, JSONL
traces — selected by `registry.ts`. The Anthropic provider is real and used the
moment `ANTHROPIC_API_KEY` is present.

**Why**: PRD rule 7 forbids creating paid accounts without the owner. It is also
better engineering: the acceptance test runs offline, free and deterministically,
and the interface boundary that makes that possible is the one rule 4 asks for
anyway.

**Costs and risks**, stated plainly:
- The local sandbox is **not isolation**. It is a directory and a child process.
  `registry.ts` refuses to hand it out when `NODE_ENV=production`.
- `sandbox-e2b.ts` is **written but never executed**. Its method names are our
  expectation of the E2B SDK, not verified fact. Check them against E2B's docs
  before the first real run.
- The scripted LLM's cache-hit figure is **simulated**, derived from the real
  prefix/suffix split. It exercises the measurement plumbing and is not evidence
  that caching works. Only a run against `AnthropicProvider` is.
- SQLite has no row-level security. PRD section 10 requires RLS on every table;
  that arrives with Supabase and cannot be approximated here.
- There is no real authentication. `src/core/auth.ts` is one user from a cookie.

---

## D3 — `kortix-ai/suna` is Elastic Licence 2.0, not Apache-2.0

**PRD says** (section 6.1): "`kortix-ai/suna` (Apache-2.0)".

**Found**: the repository's `LICENSE` at the current HEAD is **Elastic Licence
2.0**. PRD rule 3 puts Elastic in the do-not-copy list.

**We did**: studied it for structure only. The one idea taken — a tool registry
as pure data, with a prefix fallback so a new tool in an existing family needs no
registry change — is reimplemented from scratch in `src/core/agent/tools.ts`.
Recorded in `THIRD_PARTY_NOTICES.md`.

**Action for the owner**: correct section 6.1 of the PRD. The repo has also
moved on from the Suna-era architecture the PRD points at, as section 6.1 itself
anticipates.

---

## D4 — Reference repos shallow-cloned, not fully cloned

**PRD says** (section 0, rule 2): clone the reference repos into `/references/`
and read how they solve the problem.

**We did**: `git clone --depth 1` of the four repositories relevant to Phase 0 and
Phase 1 (suna, OpenManus, fragments, bolt.diy). `/references/` is git-ignored.

**Why**: the owner asked for the clones to inform the approach without paying for
full history. The Phase 2 and 3 repos (open_deep_research, gpt-researcher,
presenton, PPTAgent, postiz-app) are not cloned yet and should be when those
phases start.

---

## D5 — No `terminate` tool; termination is `stop_reason`

**PRD says** nothing explicit. The Manus-style reference loops (OpenManus) use a
special `terminate` tool the model must call to finish.

**We did**: the loop ends when a model turn contains no `tool_use` blocks.

**Why**: a termination tool is a tool the model can forget, and forgetting it
costs a full extra turn every time. `stop_reason` is already the signal, and it
cannot be forgotten. The cost is that "the model stopped calling tools" and "the
model finished the work" are the same event here — which is exactly why the
system prompt makes verification a rule and Phase 1's visual QA loop matters.

---

## D6 — Compaction is deterministic, not model-written

**PRD says** (section 6.1, adopt 6): "summarize the oldest turns into structured
JSON, keep the last N turns raw."

**We did**: `compaction.ts` builds the JSON summary by walking the tool calls —
tools used, files touched, commands run, errors, assistant one-liners — with no
model call.

**Why**: a summarisation call inside a loop that is already running long is a
cost, a latency spike and a source of flake, and what a summary of an agent
transcript actually needs (which files exist, what failed) is structured data we
already have. Compaction also invalidates the cached prefix, so it is skipped
when it would reclaim less than a third of the transcript.

**Revisit if**: tasks start failing after compaction because the model loses
reasoning that was in prose rather than in tool calls.

---

## D7 — Phase 0 runs the loop in-process, not on Inngest

**PRD says** (section 5): Inngest for durable execution from the start.

**We did**: `POST /api/tasks` starts the loop as a detached promise in the Next
server process and returns 202. Progress goes over SSE from an in-memory bus;
every step is still checkpointed to the store as it happens.

**Why**: Inngest is an account and a tunnel, and Phase 0's acceptance criterion
is a task that finishes in seconds. What this does buy is the client contract
that does not change when Inngest lands: the POST returns immediately and
progress arrives on a separate channel.

**What is genuinely missing until it lands**: a task does not survive a server
restart, and `ask_user` cannot park for longer than the process lives. Phase 3's
approval gates need a durable wait and should not ship without it.
