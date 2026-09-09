# work
### Agents acting inside your working life, with an audit trail that holds up

**Covers:** Work Agents · human-in-the-loop review · admin and permissions · audit trails ·
delegation · enterprise trust surfaces · long-running agent supervision

**Build order:** #4 of 6.
**Time:** ~2 weeks.

> **Reframed.** An earlier version framed this as a document-ops supervisor at a lender. Sarvam's
> Work Agents is a knowledge-work agentic workspace: email triage, morning briefings, internal
> helpdesk, lead follow-up, wired into Gmail, Slack and Notion — heavy on trust surfaces, with
> every agent action logged and traceable, role-based access, audit trails and data residency
> controls. The patterns transfer exactly; the user and domain don't.

---

## The trade-off

An agent with access to your inbox, your team's Slack and your company wiki can save you two hours
a day. The same access means it can email a customer the wrong number, or read something it
shouldn't have, in your name.

**Everything an agent does here is done as *you*.** That's the difference from every other project
in the program: in `doc` Kavitha reviews an agent's output, but here the agent *acts*, and the acts
are attributed to a person. Delegation stops being about accuracy and becomes about authority.

The trust surfaces are not compliance decoration. They're the product.

---

## The user

**Anand, 38.** Head of partnerships at a 200-person SaaS company in Bengaluru. Inbox at 300
unread, four Slack channels he's accountable for, a Notion wiki nobody maintains. Six timezones of
follow-up he's perpetually behind on.

What he wants delegated: triage, briefing, chasing. What he will not delegate: anything a customer
reads with his name on it — until he trusts it, which is a moving line.

His constraints, from research:
- He has managed people. That matters enormously: people who have delegated to a junior colleague
  before delegate to agents completely differently from people who haven't. He expects to review
  early work closely and taper off, and he expects the tool to support tapering.
- His fear is not a wrong summary. It's an agent replying to a customer without him seeing it.
- He works in fifteen-minute gaps between meetings. Attention is fragmented, not scarce.
- His company has a security review. Data residency and access scoping are procurement blockers,
  not features — which means they belong in the design, not in a settings page nobody opens.

Second user: **the IT admin** who scopes what agents may touch, org-wide. Third: **the auditor**,
reading a history they weren't present for. Both are real and both are usually designed last.

---

## Scope

Three surfaces.

1. **The morning brief.** The agent worked overnight. What does he need to know, what did it do,
   and what is it asking permission for? A durable artifact, not a chat log.
2. **The action ledger.** Every agent action, attributable, traceable, reversible where possible.
   This is the trust surface and it should be beautiful, not buried.
3. **The delegation envelope.** What may this agent do unsupervised, on what data, on whose behalf?
   With a consequence preview, and with the admin's org-level scope visible as a ceiling he can't
   exceed.

Out of scope: building the integrations, a full inbox client, team management.

---

## The state list

**Action states**
- `PROPOSED` — drafted, awaiting him
- `AUTO_EXECUTED` — done under his envelope without asking
- `EXECUTED_APPROVED` — he approved it first
- `BLOCKED_ON_HUMAN` — needs him. Loudest treatment in the product.
- `BLOCKED_ON_PERMISSION` — the envelope forbids it. Structurally different from needing his
  judgement, and the distinction matters: one is a decision, the other is a policy problem.
- `REVERSED` — undone, with the reversal itself logged
- `IRREVERSIBLE_DONE` — sent, and unsendable. Must look different from everything else.
- `FAILED_MIDWAY` — a multi-step action that partially completed. The worst state in any workspace
  agent and the one every product handles badly.

**Access states**
- `SCOPE_GRANTED`, `SCOPE_EXPIRED`, `SCOPE_REVOKED`
- `ACCESSED_SENSITIVE` — it read something flagged. Logged whether or not it was permitted.
- `SCOPE_BREACH_ATTEMPTED` — it tried to exceed its envelope. Log loudly; never silently deny.
- `RESIDENCY_CONSTRAINED` — an action is impossible because the data can't leave a region. A real
  enterprise state that essentially no product designs for.

**Attribution states**
- `ACTED_AS_USER` — the agent acted in his name. The recipient cannot tell. Design honestly for
  this; it's the ethical centre of the project.
- `ACTED_AS_AGENT` — disclosed as an agent
- `ATTRIBUTION_AMBIGUOUS` — a draft he edited before sending. Who wrote it? Both. The audit trail
  needs a real answer.

---

## Patterns this project must earn

| Pattern | Where |
|---|---|
| Delegation Envelope | Primary, with the admin ceiling made visible |
| Consequence Gate | Anything a customer reads; anything irreversible |
| Commit Boundary | The overnight run as reviewable segments, not one blob |
| Exception Queue | The brief is an exception queue wearing a friendlier name |
| Provenance Link | Every claim in the brief links to the email or message it came from |
| Non-finding | "Nothing needed you in these three channels" is a result worth stating |
| Behaviour Spec | Defining what this agent does and never does |
| Fleet Handoff | Triage agent handing to a drafting agent |

---

## Design direction

Reference: a **ledger** and a **briefing note**. Not a chat window, and not a dashboard.

- **The brief is a document, not a transcript.** This is axiom 2 at its most literal: the chat is
  where he adjusts things, the brief is what persists and accumulates. If his morning summary
  scrolls away, the product has failed.
- **The action ledger is a feature, not an audit dump.** Most products bury the log in settings.
  Here it's the thing that makes delegation rational, so it deserves real typographic care: dense,
  scannable, tabular figures, attributable at a glance.
- **Irreversible actions look irreversible.** A sent email and a drafted email must not share a
  visual language. This is the one place in the program where you should consider a genuinely
  different container shape rather than just a colour.
- **Muted chrome, so agent state can be loud.** Same discipline as `doc`: reserve saturated colour
  for state, reserve the loudest treatment for `BLOCKED_ON_HUMAN`.
- **Permissions are inline, not in settings.** When the envelope blocks something, the block
  appears where the action would have been, with the reason and the path to change it.
- **Fifteen-minute gaps.** The brief must be resumable. He'll read a third of it, go to a meeting,
  and come back. Design for interruption as the normal case, not the edge case.

---

## The hard moments

1. **`ACTED_AS_USER`.** The agent sent something and the recipient believes Anand wrote it. Design
   the interface that makes him comfortable with that, and be honest about whether he *should* be.
   This is the ethical centre of the project and worth a section in the write-up.
2. **`FAILED_MIDWAY`.** It updated the CRM, sent the email, and failed before logging the task.
   Partial completion across three external systems. What does the interface show, and what can he
   actually do about it?
3. **The tapering envelope.** He wants to review closely for two weeks then stop. Design a control
   for *earned* autonomy that isn't just a slider he forgets to move.
4. **Data residency as an interaction.** An action is impossible because the data can't cross a
   border. Almost nobody designs this and it's a procurement blocker for exactly the enterprise
   customers this product targets.
5. **The empty brief.** Nothing needed him. Most products show a blank state and waste the moment.
   A confident, specific "here's what I checked and why none of it needed you" is the single
   highest-trust thing this product can say — and it's a Non-finding.

---

## What you'll learn building this

- Modelling authority and attribution as data. Harder and more interesting than it sounds, and the
  core of every enterprise agent product.
- Designing an audit trail someone actually wants to read.
- Why permission UI belongs inline. You'll build the settings-page version first and watch someone
  never find it.
- Partial failure across external systems — the state nobody plans for and everybody hits.

---

## Measurement targets

- **Unsupervised depth over time.** How many actions will he let pass unreviewed in week one
  versus week three? Should rise. Truest trust measure in the program.
- **Time to answer "what did it do?"** Given a customer complaint about an email, how fast can he
  reconstruct what happened from the ledger? This is what the audit trail is *for*.
- **Appropriate distrust.** Plant an agent action that's plausible and wrong. Does he catch it in
  the brief? If the brief is pleasant enough that nobody audits it, you've built compliance.
- **Envelope comprehension.** Show him a configured envelope and ask what the agent may do. If he
  can't say, the control has failed regardless of how it looks.
