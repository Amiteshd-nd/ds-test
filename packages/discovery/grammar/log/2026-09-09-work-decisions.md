# 2026-09-09 — work, two decisions

`projects/work/states.md` went out with two open questions. Both decided.

---

## 1. `ACTED_AS_USER` — ledger-only, with a per-channel opt-in

**Decided:** the recipient is told nothing. "Send as me" is switched on per channel, and every such
send is unmissable in the ledger.

**Why this and not disclosure.** Disclosure is the ethically safer product and it is not the one
being designed: these tools send as the person, that is what they are for, and a prototype that
disclaims its way out of the problem teaches nothing about how to live with it. The interesting
question — what makes a person comfortable with an agent writing in their name, and whether they
*should* be — only exists if the tool actually does it.

**So the weight moves entirely to the ledger, and three things follow:**
- **The wording is blunt.** "The recipient sees this as coming from you. Nothing tells them
  otherwise." No euphemism, and nothing that implies the recipient was informed.
- **It appears only where it is true.** The first build put that line on blocked and drafted
  actions too, where nothing had reached anyone. That is the same over-claim pointing the other way
  and it was fixed the moment the ledger rendered.
- **Attribution is on every row**, including `ambiguous` — a draft he edited before sending. Both
  hands wrote it and the trail says so, rather than picking one.

**What would reverse it.** A tester reading the ledger and *not* being able to say which things went
out in his name. If the ledger cannot answer that in one pass, ledger-only disclosure is not a
position, it is a hiding place.

---

## 2. The tapering envelope — the agent proposes, he confirms

**Decided:** after a run of clean actions of one kind, the agent asks to stop asking, and shows the
record that earned it. He accepts or declines.

**Why not the slider.** The brief warns specifically against "a slider he forgets to move", and it
is right: a control that requires him to notice that his own trust has changed will not be used.
Nor time-boxed grants, which turn into a recurring dialog people learn to click through.

**What makes the ask honest:** evidence first, request second. "Meeting reschedules with existing
partners: 14 in a row since 29 August, none of them pulled back" is a claim he can check, and it is
the thing being traded for authority. A proposal without the record would be a nag.

**The risk, named:** an agent that asks for more authority every time it does well is an agent with
an incentive to look good. The counterweight in this build is that the evidence is specific and
narrow — one kind of action, a real count, and the number of reversals stated even when it is zero.
If reversals were hidden, the ask would be marketing.

---

## What partial failure turned out to need

Not a decision, but the thing this surface taught: `FAILED_MIDWAY` is not one state, it is a list of
legs — and the leg that matters is the one whose outcome is *unknown*. The CRM write was sent and
nothing came back. Rendering it as failed invites a duplicate write; rendering it as done invites a
silent gap. So the row says exactly that, offers the compensations that are possible, names the one
that isn't (an email cannot be unsent), and hands him the check rather than guessing.
