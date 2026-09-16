# 2026-09-09 — voice, two decisions

---

## 1. The go-live gate caps rather than blocks

**Decided:** an untested hard constraint does not prevent going live. It lowers the cap — the first
25 calls, then the gate returns with real evidence.

**Why.** Blocking on an untested rule sounds responsible and traps her behind rules that are
genuinely hard to provoke in simulation: "never confirm a payment as received" needs a caller who
claims to have paid, and if the synthetic population never produces one, the agent can never ship.
A typed acknowledgement is the other option and it is a click-through with extra steps.

A cap turns the untested rule into a **measurement**. Twenty-five real calls either exercise it or
they don't, and either way she learns something the simulation could not tell her.

**What still blocks, and this is the only hard block:** no sweep at all, or a sweep whose spec has
since been edited. Evidence that describes a different agent is worse than no evidence, because it
looks like evidence.

**The line that matters in the copy:** the cap is presented as a way to get real evidence, never as
a safety guarantee. "Start with 25 real calls, then look again" — not "safe to start with 25".

---

## 2. The sweep leads with shape, then clusters

**Decided:** one distribution bar across all seven outcomes, no number, with failure clusters
beneath it. Not a pass rate, and not the change-since-last-time.

**Why not change-first.** Regression is the thing most likely to be missed, which argues for
leading with it — but it is incomprehensible on a first run, and a surface that only makes sense
the second time you use it is a surface that gets abandoned the first time. Regression instead gets
a reserved treatment *above* the clusters: loud, unmissable, and not the opening move.

**Why not breaches split out.** Tempting, because `constraint_breached` is categorically different
from a caller hanging up and it is the one with legal consequences. But lifting it out makes it a
single number at the top of the screen, which is exactly the pass-rate failure in a different
costume. It stays in the bar, with a reserved colour, a white inset rule so six calls in a thousand
are still visible, and its own line in the legend.

---

## The hardest writing in the program, and where it landed

The brief asks how to make a 94% sweep read as evidence rather than a promise without hedging into
uselessness. Three things carry it:

1. **No pass rate anywhere.** Not in the events, not in the UI. A test fails if one appears.
2. **A paragraph that says what the thousand calls *are*:** conversations with callers the system
   invented, who are more patient, clearer and more cooperative than the people who will actually
   pick up. It ends "read this as a way to find problems, not as a measure of how it will go."
3. **Caveats as content.** Three of them, in the flow, not footnoted: an untested constraint, clean
   audio versus 8kHz telephony, and an unrepresentative caller population.

The calibration metric in the brief is the test of whether this worked: show someone the sweep and
ask them to predict the production pass rate. If they say the sweep number, the writing failed no
matter how much they liked it.

## Flagged

Hindi and Marathi transcripts are synthetic and unchecked, as everywhere else in this program. The
exemplar turn is the one place it matters most — it is the evidence a person would act on, and the
breach it demonstrates ("Late fee ₹450 होगा sir") needs a reader who can confirm it says what I
think it says.
