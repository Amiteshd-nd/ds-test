# Running Runner

How to set it up, use it, change it safely, and work out what went wrong.

For the accounts and keys behind any of this, see [MANUAL.md](MANUAL.md). For
why the code is shaped the way it is, [DECISIONS.md](../DECISIONS.md).

---

## First run, once per machine

```bash
corepack pnpm install                    # from the repo root
corepack pnpm --filter runner seed       # installs the site template, ~1 min
corepack pnpm --filter runner browsers   # downloads Chromium, ~150MB
corepack pnpm --filter runner dev        # http://localhost:6184
```

The two middle steps are once, not per session. `seed` is what makes a site task
start in under a second instead of spending a minute on `npm install` inside
every sandbox; `browsers` is what lets Runner measure a page it has built.

**Check it works** before doing anything else:

```bash
cd packages/runner
node scripts/acceptance.ts
```

88 checks, about a minute, no API key needed. If they pass, the machinery is
sound. They say nothing about whether the agent is any good - see
[Changing a prompt](#changing-a-prompt-a-tool-or-a-template).

---

## Every day

### Starting a business

Open `localhost:6184`. A new project runs the six-question interview. Answer it
once; every task afterwards reads the answers and does not ask again.

The three that carry the most weight:

- **What makes you different** usually becomes the headline. The real answer,
  not the brochure one.
- **How it should sound** is what stops every page reading the same.
- **Trading since** and accreditations are used only if given. Blank means the
  page is written without them rather than with invented ones.

### Uploading photographs

The single biggest thing you can do for a site's quality. Pictures the owner
already has beat anything generated, and they are on their phone.

Upload with a description of what the photograph shows. The description becomes
the alt text *and* tells the builder which slot the picture belongs in, which is
why it is required. Anything under 800px wide is refused: it looks soft as a
hero and nobody notices until it is live.

Slots with no photograph fall back to a real image of nothing in particular, and
the builder names which slots those are.

### Asking for work

Plain sentences. "Build me a landing page." "Make the headline shorter." "What
do competitors charge?" "Draft three posts for the new season." "Build a deck
for a meeting with an estate manager."

Watch the **Work** tab while it runs. Each step is a card; failures stay visible
rather than being swallowed.

### Reviewing a page

The **Page** tab shows the built site at desktop and phone widths, with the
browser checks beside it. Blocking failures are already fixed before you see it
- the builder gets two rounds to fix what a browser measured. What reaches you
is what passed.

Publish when you are happy. Locally that is a real URL on this machine and the
footer says so.

### Reviewing the queue

The **Queue** tab is the approval gate. Posts and emails wait there, in full, and
nothing is sent until you approve it - not by convention but because the only
code path to a provider requires an approval row.

Read the whole text before approving. It is shown in full rather than behind an
expander for exactly that reason. Approving is the irreversible moment.

- **Send it** publishes now, or at its scheduled time if it has one.
- **Throw it away** deletes it. There is no undo and there does not need to be.

### Confirming what it has learned

The **What Runner knows** panel collects facts the agent picked up. Nothing
there reaches a prompt until you confirm it. Unread is safe; that is the whole
point of batching it.

Confirm the true ones. Reject anything wrong - a confirmed fact is repeated to
every later task, so a wrong one compounds.

---

## Changing a prompt, a tool or a template

**The rule: run the suite for that task type before and after, and compare pass
rates rather than reading the diff.**

A prompt change that looks obviously better and is not is the normal case.

```bash
cd packages/runner
node scripts/eval.ts landing --limit 5     # sanity check, ~£1
node scripts/eval.ts landing               # the real gate, 30 briefs
```

| You changed | Run |
| --- | --- |
| `prompt.ts`, orchestrator section | `basics`, then the suite for whatever you touched |
| The web builder prompt or `templates/landing/` | `landing` |
| The research prompts, `search.ts`, `sources.ts` | `research` (needs `TAVILY_API_KEY`) |
| The deck prompt, `deck.ts`, `render.ts` | `slides` |
| The drafter prompt or `actions.ts` | `growth` |
| `engine.ts`, `tools.ts`, `compaction.ts` | all of them. It is shared by every agent |

The runner exits non-zero below a 70% pass rate, which is PRD section 9's bar.

**Watch the suite-level numbers, not only the per-task ones.** The landing suite
reports design variety across all 30; thirty pages that each pass alone and share
one palette is a failure only the suite can see.

**When a task fails in production, add it to the suite before fixing it.** That
is the loop PRD section 6.8 describes and the only one that makes the suite grow
in the right direction. A basics task is one JSON file; a landing, research,
slides or growth task is one entry in that suite's `tasks` array.

---

## Watching the money

```bash
node scripts/margin.ts        # everything traced
node scripts/margin.ts 7      # the last week
```

Reports cost by agent and by model, the cache hit rate, and what the same tokens
would have cost on each tier.

**Two numbers to watch:**

- **Cache hit rate.** Target is 70% (PRD section 4). If it drops, something has
  started varying in the cacheable prefix - a date in a system prompt, a tool
  list that is no longer sorted, compaction running too often.
  `src/core/__tests__/cache.test.ts` guards the usual causes.
- **Cost per task.** Should trend down. If it jumps, look at which agent
  moved before assuming it is the model.

The tier counterfactuals at the bottom are arithmetic, not evidence. Before
moving a step down a tier, run that task type's suite on both and compare pass
rates, not the bill.

---

## Weekly

- [ ] `node scripts/margin.ts 7` - cost per task and cache rate.
- [ ] Clear the memory queue. Unconfirmed facts are inert but they pile up.
- [ ] Skim `.runner/outbox.jsonl` if posting is still local - it is the record
      of what would have gone out.
- [ ] Check the queue for approved items that never fired. Nothing fires while
      Runner is stopped; it catches up on the next start and says how late.

## Monthly

- [ ] Run every suite that has keys. Note the pass rates somewhere you will find
      them next month - the trend is the point.
- [ ] Check against [MANUAL.md](MANUAL.md): has anything moved from stand-in to
      real, and is that reflected in the footer?
- [ ] Free credit resets on the 1st. Grants are idempotent per user per month,
      so nothing needs doing.

---

## When it goes wrong

### A task will not start

The message says why, and it is written to be read.

| It says | What it is | Fix |
| --- | --- | --- |
| "Something is already running" | Free plan allows one at a time | Wait, or stop the other |
| "You have started N tasks in the last day" | Daily quota | It frees up as the oldest pass 24h |
| "You have used this month's $5 of free credit" | Out of credit | Add credit, or wait for the 1st |

### A task stopped mid-way

Look at the last step card. Budget exhaustion says so explicitly. A provider
error shows the provider's own message.

If the *server* restarted mid-task, the task is gone - the loop runs in-process.
The step rows survive, so you can see how far it got. Rerun it. This is the
known gap; see [docs/durable-execution.md](durable-execution.md).

### A site will not build

The template fails its own build on the content rules, and the message names the
field and says what to change. That is working as intended: those rules are the
difference between a page somebody designed and a page nobody chose.

If the builder cannot fix it in two rounds it hands back which check failed.
Usually the brief is asking for something the template cannot express, and the
fix is the brief or a new section component.

### An approved post did not go out

Check the footer. If it says `social outbox`, nothing ever leaves the machine -
it is recorded in `.runner/outbox.jsonl` and the calendar says so on every item.
See [MANUAL.md](MANUAL.md#10-postiz-and-the-social-platforms).

If a real provider is configured, the calendar row carries the error.

### Credit looks wrong

The ledger is append-only, so the history is the answer:

```bash
curl -s localhost:6184/api/billing | python3 -m json.tool
```

Every movement is a row with the balance after it. A `hold` with no matching
`release` is a task that never finished; the scheduler releases those after an
hour. If a balance and its rows disagree, that is a real bug - the acceptance
test checks the reconciliation, so it should be impossible.

### `Cannot find module './341.js'` or similar

A stale `.next`. Dev and production builds use separate directories
(`.next` and `.next-build`) precisely so this cannot happen, but if it does:

```bash
rm -rf .next .next-build && corepack pnpm --filter runner dev
```

### Something is stale and you want to start over

```bash
# stop the dev server FIRST. Deleting this under a running server leaves
# SQLite writing to a deleted file and everything looking broken.
rm -rf packages/runner/.runner
```

That removes the database, sandboxes, site versions, deployments, traces, the
outbox and the credit ledger. Uploaded photographs go with it.

---

## Before a real customer sees it

Not a checklist to tick on a good day. Every one of these has a reason.

- [ ] **`SANDBOX_PROVIDER=e2b`.** The local sandbox is not isolation. The
      registry refuses it in production; do not work around that.
- [ ] **Real auth.** `auth.ts` is one user from a cookie. Supabase before a
      second account exists.
- [ ] **Photographs are real.** Check the site for Picsum URLs. The builder says
      which slots are placeholders; believe it.
- [ ] **`node scripts/eval.ts landing`** has been run against a real key and
      passes 70%. This has never been measured.
- [ ] **Email DNS.** SPF, DKIM and DMARC before a single cold email, or the
      business's real mail starts going to spam.
- [ ] **The deployed site is on a real host**, not `localhost:6184/s/…`.
- [ ] **Stripe's webhook exists** if you are taking money. Checkout without it
      takes payment and grants nothing.

---

## Commands, all of them

```bash
# running it
corepack pnpm --filter runner dev          # localhost:6184
corepack pnpm --filter runner build        # writes .next-build
corepack pnpm --filter runner start        # production, same port

# once per machine
corepack pnpm --filter runner seed         # site template
corepack pnpm --filter runner browsers     # Chromium

# checking it  (from packages/runner)
corepack pnpm --filter runner test         # 129 unit tests, <1s
corepack pnpm --filter runner typecheck
node scripts/acceptance.ts                 # all five gates, 88 checks
node scripts/acceptance.ts 2               # one phase
node scripts/eval.ts                       # all suites
node scripts/eval.ts landing --limit 5     # one suite, five briefs
node scripts/margin.ts 7                   # cost, last 7 days

# poking at it
curl -s localhost:6184/api/meta            # which providers are live
curl -s localhost:6184/api/billing         # balance and ledger
```

Scripts read from the package root. Run them from `packages/runner`.

---

## Where things are on disk

```
packages/runner/
  .env.local            your keys. Never committed
  .runner/              all local state. Safe to delete with the server stopped
    runner.db             projects, tasks, steps, memories, approvals, credits
    sandboxes/            per-task working directories
    sites/<project>/v1/   every site version: src, dist, meta
    deployments/<slug>/   locally published sites
    artifacts/            reports and decks
    assets/<project>/     uploaded photographs
    traces/*.jsonl        every LLM and tool call
    outbox.jsonl          what would have been posted or emailed
  templates/landing/    the site template. Its AI_RULES.md is the contract
  evals/golden_tasks/   the five suites
  docs/                 the PRD, this file, MANUAL.md, durable-execution.md
```
