# Things only you can do

Everything in this file needs a person: an account, a card, a domain, a decision,
or somebody else's approval. None of it can be done from inside the codebase,
and most of it has a waiting period.

Runner works today with none of it. Every external service has a local stand-in,
and the app tells you which one is live in its footer. This file is the list of
what each real one buys you, and what it costs to get.

---

## Where keys go

One file, never committed:

```
packages/runner/.env.local
```

`.gitignore` already covers it, via `.env.*` at the repository root. Copy the
shape from
[`.env.example`](../.env.example); it lists every variable with a comment.

After adding a key, restart the dev server. The footer will show the new
provider, and `curl localhost:6184/api/meta` prints all of them.

**Nothing here should ever be pasted into a chat, a commit, or a screenshot.**
If one leaks, revoke it at the provider before doing anything else.

---

## The order to do them in

| # | Task | Unblocks | Effort | Waiting |
| --- | --- | --- | --- | --- |
| 1 | [Anthropic API key](#1-anthropic-api-key) | **Everything.** Nothing is real without it | 10 min | none |
| 2 | [Tavily API key](#2-tavily-api-key) | Research reports | 10 min | none |
| 3 | [E2B account](#3-e2b-account) | Safe sandboxes. **Required before anyone but you uses this** | 1 hour | none |
| 4 | [A domain](#4-a-domain) | Published sites, email, everything customer-facing | 20 min | up to 48h for DNS |
| 5 | [Cloudflare Pages token](#5-cloudflare-pages-token) | Publishing sites to a public URL | 20 min | none |
| 6 | [Image generation API](#6-image-generation-api) | Photographs for businesses with none | 20 min | none |
| 7 | [Resend + DNS](#7-resend-and-email-dns) | Sending cold email | 1 hour | 1-24h for DNS |
| 8 | [Langfuse](#8-langfuse) | Trace UI, prompt versioning, eval history | 30 min | none |
| 9 | [Supabase](#9-supabase) | Real auth, multi-user, row-level security | half a day | none |
| 10 | [Postiz + social apps](#10-postiz-and-the-social-platforms) | Publishing posts | 2 hours | **weeks** |
| 11 | [Stripe](#11-stripe) | Taking money. **Needs code first** | 2 hours | days for account review |

Steps 1 and 2 are worth doing today. Step 3 is the one that matters before a
second person touches it. Step 10 is the one to start early, because the waiting
is measured in weeks and nothing you do shortens it.

Prices below are orders of magnitude and drift. Check each provider's current
pricing rather than trusting this table.

---

## 1. Anthropic API key

**Why**: every agent in the system. Without it, Runner uses a scripted test
double that replays fixed answers and does not read the prompt. It proves the
machinery works and nothing about whether the output is any good.

**Do**

1. Create an account at [console.anthropic.com](https://console.anthropic.com).
2. Add a payment method and set a monthly spend limit. Start low, $20 or so.
3. Create an API key. Name it something you will recognise later.
4. Put it in `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

**Verify**

```bash
cd packages/runner
node scripts/acceptance.ts 1
```

The header should say `llm=anthropic` rather than `llm=scripted`, and the cache
hit rate should no longer say `SIMULATED`.

**Cost**: roughly 2 to 20 cents per task depending on type. A landing page is
the expensive end. `node scripts/margin.ts` reports what yours actually cost.

**Watch for**: the first thing to spend money on is
`node scripts/eval.ts landing --limit 5`, about a pound. It is the only way to
find out whether the pages are any good, and every acceptance check passing
tells you nothing about that.

---

## 2. Tavily API key

**Why**: the research sub-agent. Without it, search falls back to recorded
fixtures that only answer the handful of queries they were recorded for, and the
research eval suite reports N/A rather than passing.

**Do**

1. Create an account at [tavily.com](https://tavily.com).
2. Create an API key.
3. Put it in `.env.local`:
   ```
   TAVILY_API_KEY=tvly-...
   ```

**Verify**

```bash
node scripts/eval.ts research --limit 1
```

It should run rather than printing the fixture warning.

**Cost**: a fraction of a cent per search. A report makes 10 to 30 of them, so
it is a rounding error next to the model calls.

---

## 3. E2B account

**Why**: this is the one with a real consequence. Runner's default sandbox is a
scratch directory and a child process running as your user, on your machine,
with your network. It is fine while you are the only person using it and it is
not isolation. `registry.ts` refuses to hand it out when `NODE_ENV=production`,
which is a guardrail and not a substitute.

**Do**

1. Create an account at [e2b.dev](https://e2b.dev) and create an API key.
2. Install the SDK, which is deliberately absent until you decide to:
   ```bash
   corepack pnpm --filter runner add @e2b/code-interpreter
   ```
3. Build a custom template with Node, Python, Playwright and the site
   scaffolding preinstalled. This is not optional for speed: a fresh sandbox
   doing `npm install` costs 40 to 60 seconds per task, and PRD section 10 wants
   a sandbox ready in five.
4. Put it in `.env.local`:
   ```
   E2B_API_KEY=e2b_...
   E2B_TEMPLATE=your-template-id
   SANDBOX_PROVIDER=e2b
   ```

**Verify**

```bash
node scripts/acceptance.ts 0
```

**Read first**: `src/core/providers/sandbox-e2b.ts` has **never run**. Its method
names are our expectation of the SDK, not verified fact, and `exportDir` is not
implemented at all - it needs a tar-and-download path, and without it a built
site cannot come back out of the sandbox. Check the adapter against E2B's
current docs before the first real run, and expect to write that one method.

**Cost**: per-second compute. Cheap per task; the template build is the effort.

---

## 4. A domain

**Why**: everything customer-facing. Published sites need somewhere to live,
cold email needs a sending domain, and Stripe needs a real origin.

**Decide first**: PRD section 12 asks whether user sites live on a subdomain of
yours (`something.forge.site`) or on the customer's own domain from day one.
Subdomains are far less support work and look less professional on an invoice;
custom domains mean helping non-technical owners edit DNS. This is still open.

**Do**

1. Register a domain. Any registrar.
2. Point its nameservers at whoever will host - Cloudflare if you are using
   Pages, which makes step 5 and step 7 easier.
3. Set `RUNNER_ORIGIN` in `.env.local` once Runner itself is hosted somewhere.

**Waiting**: DNS changes propagate in minutes usually, up to 48 hours
occasionally. Do this before the things that depend on it, not alongside them.

---

## 5. Cloudflare Pages token

**Why**: publishing a site to a URL anyone can open. Without it, "publish"
copies the site to `.runner/deployments/` and serves it at `localhost:6184/s/…`
- a real, working URL that only exists on your machine. Every surface says so.

**Do**

1. Create a Cloudflare account.
2. Create an API token with the **Cloudflare Pages: Edit** permission. Scope it
   to the one account; do not use a global key.
3. Find your account id in the dashboard URL or the account home page.
4. Put both in `.env.local`:
   ```
   DEPLOY_PROVIDER=cloudflare
   CLOUDFLARE_API_TOKEN=...
   CLOUDFLARE_ACCOUNT_ID=...
   ```

**Verify**: publish a site from the UI. The footer stops saying "published sites
stay on this machine" and the URL becomes a `pages.dev` one.

**Read first**: `deploy-cloudflare.ts` shells out to `npx wrangler pages deploy`
and has **never run**. The first deploy will create the Pages project.

**Cost**: free for this volume.

**Alternative**: Vercel works the same way. There is no adapter for it; writing
one is an afternoon against the same interface.

---

## 6. Image generation API

**Why**: the single biggest quality gap on a generated site, for businesses with
no photographs of their own.

Runner already prefers the owner's uploads - a small business has better
pictures of its own work than any model will produce, and they are on the
owner's phone. Slots with no photograph fall back to Picsum, which returns a
real image at the right shape and of nothing in particular. A hedgelaying page
gets a flat lay of sunglasses. The builder names which slots are placeholders.

**Do**: pick a provider, then write an adapter against `ImageProvider` in
`src/core/providers/images.ts`. The seam exists and has one implementation;
there is no second one to configure yet.

```
IMAGE_PROVIDER=picsum   # the only value that works today
```

**Effort**: the account is twenty minutes. The adapter is an afternoon,
including deciding what a good prompt for a trade photograph looks like.

---

## 7. Resend and email DNS

**Why**: actually sending the cold emails Runner drafts. Without it they are
written to `.runner/outbox.jsonl` and the calendar says "recorded, not actually
sent".

**Do this in order. The DNS part is not optional.**

1. Create an account at [resend.com](https://resend.com).
2. Add your domain and follow its instructions to add **SPF, DKIM and DMARC**
   records.
3. Wait for verification. Usually under an hour, sometimes a day.
4. Create an API key.
5. Put it in `.env.local`:
   ```
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_...
   EMAIL_FROM="Your Name <you@yourdomain.co.uk>"
   ```

**Why the DNS matters more than the key**: sending cold email from a domain
without SPF, DKIM and DMARC is the fastest way to get the business's *real* mail
delivered to spam. That is a considerably worse outcome than the campaign not
running. Do not skip it, and do not send from the domain the business uses for
customer email until you have.

**The law, briefly**: Runner refuses to queue a cold email without a sender
identity and an opt-out line, because both are required under PECR in the UK and
the GDPR in the EU. That is two specific requirements, enforced because they are
cheap to enforce. It is not legal advice and it is not compliance. If you are
running real cold outreach at volume, get advice.

**Read first**: `resend.ts` has **never run**.

---

## 8. Langfuse

**Why**: traces currently go to `.runner/traces/*.jsonl`, which has everything
you need and no interface. Langfuse gives you the trace viewer, prompt
versioning and eval history that PRD section 6.8 asks for.

**Do**

1. Either use Langfuse Cloud or self-host it. It is MIT licensed.
2. Create a project and get its keys.
3. Write an adapter against `TraceSink` in `src/core/providers/interfaces.ts`.
   `trace-jsonl.ts` is 60 lines and shows the shape.
4. Set `TRACE_SINK=langfuse` once it exists.

**Effort**: half a day including the adapter. Worth doing before the eval suites
start running regularly, because comparing runs is the thing it is for.

---

## 9. Supabase

**Why**: real authentication and row-level security. Today `src/core/auth.ts` is
one user resolved from a cookie, with no password and no session, and SQLite has
no RLS equivalent. PRD section 10 requires RLS on every table.

**This is the one to do before a second person has an account.** Until then,
there is exactly one user and the distinction is academic.

**Do**

1. Create a project at [supabase.com](https://supabase.com).
2. Port `src/core/db/schema.sql` to Postgres. It was written to port: TEXT ids,
   ISO timestamps, no SQLite-only types. The two things that will not carry over
   are the FTS5 virtual table for memory recall (use pgvector or Postgres full
   text search) and the partial unique index on the credit grant, which Postgres
   supports with the same syntax.
3. Add RLS policies on every table, keyed on `user_id` through `projects`.
4. Replace `auth.ts` with Supabase Auth.

**Effort**: half a day for the schema and auth, longer for the policies if you
want them right. `src/core/__tests__/routes.test.ts` currently enforces the
ownership check per route handler; keep it until RLS replaces it.

---

## 10. Postiz and the social platforms

**This is the long pole. Start it before you need it.**

**Why**: publishing the posts Runner drafts. Without it, approved posts are
recorded to the outbox and nothing leaves the machine.

**Postiz itself is the easy half.**

1. Self-host [Postiz](https://github.com/gitroomhq/postiz-app) or use their
   hosted version. It is AGPL-3.0, which is why Runner talks to it over HTTP and
   contains none of its code.
2. Connect each social account in Postiz's own interface.
3. Find each connected channel's integration id.
4. Put it in `.env.local`:
   ```
   PUBLISH_PROVIDER=postiz
   POSTIZ_URL=https://postiz.yourdomain.com
   POSTIZ_API_KEY=...
   POSTIZ_CHANNELS=x:abc123,linkedin:def456,instagram:ghi789
   ```

**The platforms are the hard half.** Posting on someone's behalf means a
reviewed app on each platform, and review is measured in weeks.

| Platform | What you need | Roughly |
| --- | --- | --- |
| LinkedIn | A LinkedIn app, plus access to the posting products. Company page verification | 1-3 weeks |
| Meta (Facebook, Instagram) | A Meta app, Business Verification, App Review for the publishing permissions. Instagram posting requires a Business or Creator account linked to a Page | 2-6 weeks |
| X | A developer account and a paid API tier. Posting is not on the free tier | days, plus a monthly bill |
| TikTok, YouTube | Developer apps and review | weeks |

**Start with whichever platform the first customers actually use.** For most
small trades that is Facebook and nothing else; for consultants it is LinkedIn.
Reviewing four platforms for a product with no users is weeks spent on nothing.

**What to expect from review**: they ask for a screencast of the flow, a privacy
policy at a real URL, and a plausible description of why your app needs the
permission. Have those before you apply rather than after they reject you.

### About ad accounts

Runner **does not run paid advertising**, and that is deliberate: PRD section 3
lists paid-ad management as an explicit non-goal for v1. Nothing in the codebase
touches Meta Ads, Google Ads or any ad API, so there is no ad account to create
and no key to add.

If you decide to add it later, the shape is the same as everything else - an
interface, an adapter, and an approval gate in front of anything that spends
money - and the account work is its own project: a Meta Business Manager, an ad
account with billing, Business Verification, and in most cases a separate app
review for the Marketing API. Do not start it before the posting integration
works, because it is strictly more of the same paperwork.

---

## 11. Stripe

**Read this before you start: Stripe cannot be finished today.**

There is a checkout adapter in `src/core/billing/provider.ts` and there is **no
webhook route**. Credit is added by the `checkout.session.completed` webhook and
by nothing else, on purpose - a browser arriving at a success URL means the
browser arrived, not that the payment settled, and crediting on the redirect is
how an account gets paid for a card that later declines.

So switching `BILLING_PROVIDER=stripe` right now gives you a checkout that takes
money and grants no credit. Write the webhook first.

**Do**

1. Create a Stripe account. Business details and a bank account; review takes
   days.
2. Work in **test mode** until the whole flow works. Test mode charges nothing
   and uses the same code path.
3. Write the webhook route. It needs to:
   - verify the signature against `STRIPE_WEBHOOK_SECRET`,
   - be idempotent on the Stripe event id, because Stripe retries,
   - call `store.ledger.purchase(userId, amount, eventId)` once.
   The user id and amount are already on the session as `metadata.user_id` and
   `metadata.amount_usd`; `provider.ts` puts them there.
4. Then set:
   ```
   BILLING_PROVIDER=stripe
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   RUNNER_ORIGIN=https://your-real-origin
   ```

**Verify**: buy credit in test mode with Stripe's test card, then check the
ledger shows a `purchase` row and the balance moved.

**Effort**: an afternoon for the webhook, plus however long account review
takes.

---

## Decisions that are yours

PRD section 12. Three are still open, and two of them shape work above.

1. **Launch niche.** General small business, or one vertical? A vertical makes
   the landing template's copy rules much sharper and the research fixtures
   genuinely reusable.
2. **Site hosting.** Your subdomain or the customer's own domain from day one?
   This decides step 4 and how much DNS support you sign up for.
3. **Product name.** "Forge" is the PRD's working title and appears nowhere in
   the code; the package is called `runner` and the UI says "Runner".

Answered: the free tier is **$5 a month** (`FREE_TIER_USD`), about one landing
page with a couple of edits.

---

## When something is live, check this

After switching any provider from a stand-in to the real thing:

- [ ] The footer at `localhost:6184` names the real provider, not the stand-in.
- [ ] `node scripts/acceptance.ts` still passes end to end.
- [ ] The relevant eval suite runs rather than reporting N/A.
- [ ] You have done one real action by hand - published one site, sent one
      email to yourself, bought one credit in test mode - and seen it arrive.
- [ ] The key is in `.env.local` and nowhere else. Not in a commit, not in a
      screenshot, not in a chat.
