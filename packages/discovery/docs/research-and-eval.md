# Research and evaluation

The user-centric half of the program. This is where most self-directed portfolio projects are
weakest — they show craft with no evidence anyone needed the thing — and it is cheap to fix.

---

## The principle

For agentic products, the user need is almost never "I want an AI to do this." It is "I am
accountable for an outcome and I don't have enough time or attention." That reframe changes
everything: you are not designing a capability, you are designing a **transfer of accountability**.
Which means the research question is not "would you use this?" but:

> **What would have to be true for you to stop checking?**

Ask that question in every session, of every user, for every project. The answers are your
requirements.

---

## Lightweight research that is still real

You have three weeks per project, not three months. Five conversations done properly beats a
survey of fifty.

### Recruiting (be pragmatic)
- **`voice` — drivers.** Truck stops on NH-48 or NH-44, transport nagars, dhabas at meal times. Fleet
  operator WhatsApp groups. You will get 20 minutes, standing up, in noise — which is exactly the
  condition you're designing for, so don't try to move them somewhere comfortable.
- **`doc` and `work` — operators.** BPO/KPO ops teams, NBFC back-office, CA firms, insurance TPAs. LinkedIn cold
  outreach with a specific ask ("20 minutes, I want to understand your exception queue") converts
  surprisingly well because nobody ever asks these people anything.
- **`content` operators.** Marketing and content leads at Indian startups shipping in more than
  three languages, plus one freelance translator. The translator is the highest-value single
  conversation in the program — they know every way a localisation goes wrong.
- **`coding` — developers.** Local AI/ML meetups, Discord servers of Indian AI startups, r/developersIndia.
  Easiest group to reach and the most willing to be observed working.

### The interview shape (30 min)
1. **Last time.** "Walk me through the last time you did this. Not how it usually goes — the last
   actual time." Specific instances surface real behaviour; generalities surface self-image.
2. **The workaround.** "What do you do that your tools don't support?" Every workaround is an
   unmet need with a price attached.
3. **The check.** "What do you double-check, even when you're pretty sure it's fine? Why that?"
   This maps directly onto the confidence and provenance patterns.
4. **The consequence.** "What's the worst thing that's happened? What did it cost you?" This
   calibrates your Consequence Gate. Design friction proportional to *their* stated cost, not
   yours.
5. **The delegation ceiling.** "If something did this for you automatically, what would you still
   want to see?" Their answer is the specification for the minimum unit of legibility.

Never demo in the first session. You'll get politeness instead of information.

### What to record
Constraints, not opinions. Opinions don't survive contact with a prototype; constraints do.

| Record this | Not this |
|---|---|
| "Phone is on a dashboard mount, screen is cracked, direct sun 6 hours a day" | "He said the UI should be clean" |
| "Shares the handset with the second driver; no lock screen" | "Wants it to be simple" |
| "Never has both hands free between 6am and 2pm" | "Prefers voice" |
| "Data pack is 1.5GB/month, shared with family" | "Says internet is slow" |
| "Has been fined twice; both times for a log error, not a driving error" | "Cares about compliance" |

Each row on the left generates design requirements. Each row on the right generates nothing.

---

## Personas that are actually useful

Skip the demographic card with a stock photo. For agentic products the useful axes are different:

- **Accountability.** What are they personally on the hook for? Who finds out if it goes wrong?
- **Attention budget.** Continuous, glanceable, or interruptible-only? How many seconds do you get?
- **Verification cost.** How expensive is it for them to check the agent's work? This number
  determines how much legibility you must supply.
- **Delegation history.** Have they successfully handed this work to a person before? People who
  have managed a junior colleague delegate to agents very differently from people who haven't.
- **Failure asymmetry.** Is a false positive or a false negative worse, and by how much? This
  sets your default thresholds.

Write these as five lines per persona. Five useful lines beat a full page of fiction.

---

## Measuring trust (so your case study has numbers)

Do not measure task completion. Everything completes; that's the easy part. Measure the transfer
of accountability.

### The four metrics

**1. Time to verify.** Given an agent output, how long until the person is confident enough to
accept it? Measure with a stopwatch. This is your headline metric for `doc` — provenance and
confidence patterns exist to drive it down. Target: state your baseline (usually "re-read the
source," so minutes) and your result (seconds).

**2. Correction turns.** In voice, how many turns from wrong parse to correct state? Baseline is
the "sorry, try again" loop, which is often 3+. Repair Loop should get you to 1. This is your
headline metric for `voice`.

**3. Unsupervised depth.** How many consecutive agent actions will the person allow before
demanding to look? Measure it by counting where they interrupt. This is the truest measure of
trust, and it should go *up* across your design iterations. If it doesn't, your legibility isn't
working.

**4. Appropriate distrust.** Plant a deliberate error in the agent's output. Do they catch it?
This is the metric everyone forgets, and it's the most important one. An interface that produces
100% acceptance has not produced trust — it has produced compliance, which is worse than the
problem you started with. A good result is high acceptance of correct output *and* high catch rate
on the planted error. Report both.

Metric 4 is the one that will get you a callout in an interview. Almost nobody tests for it, and
it's the difference between designing trust and designing credulity.

### Test protocol (30 min, 3–5 participants per round)
1. Baseline task the way they do it today. Time it.
2. Same task with the prototype. Time it. Don't help.
3. **Inject a fault.** Bad ASR, a low-confidence extraction, a network drop, a wrong value.
   Use `agent-runtime.ts` fault injection so it's identical for every participant.
4. **Inject a planted error** the agent presents confidently. Note whether they catch it.
5. Ask the delegation ceiling question again. Compare with their pre-test answer.

Run this in the real environment. A voice prototype tested in a quiet room is not tested.

---

## Ethics and honesty in the write-up

- **Sample size.** Say "5 drivers" not "users." Small samples are fine if you don't inflate them.
- **Your bias.** You built it and you want it to work. Name that in the write-up. Have someone
  else run at least one session if you possibly can.
- **What you didn't test.** An explicit "what I'd test next with more time" section is a strength
  signal, not a weakness. It shows you know the difference between a prototype and a product.
- **Consent and data.** Verbal consent, recorded. No faces, no plates, no document contents.
  Synthetic data throughout — see the ground rules in the README.

---

## The case-study structure that works

Reviewers read the first screen and the last. Structure accordingly.

1. **The trade-off, in one sentence.** "Drivers need to log duty status hands-free, but certifying
   a log is a legal attestation — so the interface has to be frictionless and then deliberately
   not."
2. **The constraint list.** Five to eight lines from research. Concrete, physical, unglamorous.
3. **The state machine.** Show it. This is the artifact that proves you designed for
   non-determinism, and hardly anyone includes one.
4. **The three hardest moments.** Not a screen tour. Pick the three states where the design had to
   make a real decision, and show v1, what broke, and v2.
5. **The measurement.** Your four numbers, including appropriate distrust.
6. **What the pattern library inherited.** Which patterns came out of this project and how they
   changed the other two. This is what makes three case studies into one body of work.
7. **What's still wrong.** Two or three honest limitations.

Put a 60-second screen recording at the top. Assume half your readers won't scroll and none will
clone your repo.
