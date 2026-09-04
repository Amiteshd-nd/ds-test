# Representing uncertainty: three ways, one shipped

PRD §7 Phase 3 asks for the evidence variant to ship and the two rejected
alternatives to be written up with reasoning. This is that write-up. PRD §10
calls it the centrepiece of the case study, so the argument matters more than
the conclusion.

The problem in one sentence: **the app knows a tanker is on 2nd Cross, and does
not know when it will leave.** How it says the second half decides whether Meena
trusts the first half.

---

## What is actually uncertain

Three different things, and collapsing them is the trap.

| | What it is | Where it comes from |
|---|---|---|
| **Is it there?** | Whether the obstruction exists right now | Corroboration: 1 report or 2, from how many people, how long ago |
| **How long?** | When it will clear | Dwell priors by type — *currently placeholders* |
| **Does it matter?** | Whether a car can pass | Road width minus vehicle width. **Not uncertain at all** once the width is surveyed |

The third is geometry, and the panel should never hedge it. The first two are
genuinely uncertain and are uncertain in different ways: one is about evidence,
the other about prediction. Any representation that gives them the same
treatment is lying about one of them.

---

## Variant A — the range

> **Tanker on 2nd Cross east**
> Clears in 10–40 minutes

**Why it is tempting.** It is honest about the spread. It is one line. It
matches how weather and transit apps already talk, so nobody has to learn it.

**Why it was rejected.**

A range does not survive contact with the decision. Meena is not choosing
between "10" and "40" — she is choosing between two roads, now. A 30-minute
window makes both ends of it her problem: she has to work out which end to plan
for, which is precisely the reasoning the panel was supposed to do for her. In
practice people resolve a range by taking the pessimistic end and treating it as
a point estimate, at which point the honesty has bought nothing and cost her the
better road.

Worse, the range's width is doing double duty. A wide range could mean "tankers
vary a lot" or "we have barely any data". Those call for opposite responses —
wait it out, or go look — and the range renders them identically.

And with `n = 0` in every prior, an honest range today would read *2–180
minutes*, which is not a range but a shrug.

## Variant B — the confidence tier

> **Tanker on 2nd Cross east** · Medium confidence
> Usually clears by 08:37

**Why it is tempting.** It separates the claim from the certainty. It is
compact, sortable, and easy to compute from corroboration count and prior `n`.

**Why it was rejected.**

Three reasons, escalating.

1. **The tiers are uncalibrated and unfalsifiable.** "Medium" means whatever the
   threshold in the code says it means. Nobody can check it, so nobody can
   correct it, and a number that cannot be wrong cannot be trusted either.

2. **It merges the two uncertainties.** A tanker reported by four people whose
   clearing time is a wild guess, and a tanker reported by one person that
   follows a well-measured 25-minute pattern, both land in "medium". Those are
   completely different situations for someone deciding whether to leave now.

3. **Tiers get ignored, and then they get gamed.** Users learn within a week
   that "low confidence" still usually means the tanker is there, and start
   reading every tier as "yes". The label survives as decoration while the
   information dies — and it teaches people that the app hedges, which is exactly
   the credibility this product cannot afford to spend.

## Variant C — the evidence *(shipped)*

> **Water tanker since 08:15** · 22 min ago
> Usually clears by **08:37**
> 4.0 m road, 1.5 m gap. A car cannot pass.
> 2 reports from 2 people · corroborated · 23 past stops here

**What it does differently.** It states no confidence at all. It shows what it
knows and lets the reader calibrate, because in this domain the reader is better
at it than the app is. Meena knows that on a Tuesday the 08:15 tanker is usually
gone by half past; the app does not. Anita knows the borewell lorry comes twice
on Thursdays.

Each line does one job:

- **Cause and start time** — the claim, and how stale it is.
- **Duration** — a prediction, always stated, and always attributed to a pattern
  ("usually") rather than asserted as fact.
- **Consequence** — the part that is geometry, stated flatly with no hedge,
  because a 1.5 m gap is not a matter of opinion.
- **Evidence** — the raw material of the confidence judgement, in place of the
  judgement itself: how many reports, from how many *people*, and how often this
  road has carried one before.

"2 reports from 2 people" and "2 reports from 1 person" are visibly different,
which is the distinction the corroboration rule turns on. A tier would have
flattened them.

**What it costs.** It is four lines instead of one, and the panel is denser than
a navigation app. That is the trade — and it is affordable precisely because the
list is two to four habitual exits, not every road in Bengaluru.

---

## Honesty when there is nothing to say

Two states get their own explicit language rather than falling back to silence:

**No reports.** The row reads *"Nothing reported right now — no obstruction on
record. **Whether anyone has looked is unknown.**"* A blank row would read as
"clear", and the app cannot tell the difference between a clear road and a road
nobody has walked down. Saying so is the difference between an absence of
evidence and evidence of absence.

**Past its usual dwell.** *"Past the 25 min these usually last — **nobody has
checked since**"*, alongside the recheck prompt. The prediction has been
outlived, and the row says that instead of quietly extending it.

**Placeholder priors.** While `PRIORS_ARE_PLACEHOLDERS` is true, a banner above
the whole panel says the clearing times are estimates rather than measurements,
and names why. The instant Phase 0 lands, the flag flips and the banner goes.

---

## What would falsify this choice

The evidence variant is a bet that people calibrate better than a tier does.
It is testable, and the 5-user test in MANUAL.md is where:

- If users read the evidence line at all — eye-tracking or think-aloud — the bet
  is live. If they skip straight to the duration, the evidence line is costing
  four lines for nothing, and Variant B gets cheaper.
- If users treat "usually clears by 08:37" as a promise rather than a pattern,
  the wording is wrong regardless of which variant wins.
- If users cannot tell "2 people" from "1 person" without prompting, the
  corroboration rule is invisible and the panel needs to say it louder.

The decision to revisit first, if any of the above fail: showing the duration
only once `n` is large enough to mean something, and showing *nothing but the
evidence* below that threshold.
