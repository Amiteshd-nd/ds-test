# Accessibility — four questions I didn't answer for you

`CLAUDE.md` says to surface these rather than picking silently, so here they are with what the
surface does today, why, and what the alternatives cost. All four are design decisions dressed as
implementation questions. Three came out of `coding`; the fourth came out of `doc` and is the one
I'd spend real time on.

---

## 1. What does a live region announce during a stream?

**What it does now.** One `role="status" aria-live="polite"` region in the run header, announcing
at the *phase* level: "Waiting on you. Run the migration against the staging database?" Token
arrival, node progress and individual file changes announce nothing.

**Why.** Wiring `aria-live` to per-token updates either announces nothing (the region is replaced
faster than it's read) or announces everything repeatedly. Phase is the coarsest unit that still
carries the two things the brief says matter: where it is, and whether to worry.

**What it misses.** A sighted user watching the plan sees a step go from `working` to `done` every
few seconds and reads progress from that rhythm. A screen-reader user currently gets nothing until
the phase changes, which on a clean run is twice in forty minutes. That's not equivalent access;
it's quieter access.

**The options, and what each costs.**

- **Announce every node transition.** Equivalent information, and unusable — twelve steps in a
  four-minute burst is a wall of speech, and it talks over anything the person is reading.
- **Announce on a timer**: "three steps done, working on the adapter", every 30s while the phase
  holds. Predictable, ignorable, and it invents a cadence nobody asked for.
- **Announce only what needs a person**, plus an on-demand summary bound to a key. Least noise,
  and it makes the person poll for progress rather than receive it.

I'd take the third. It's your call, and it's worth testing with someone who uses a screen reader
daily rather than with the two of us guessing.

---

## 2. What is the tab order through a plan?

**What it does now.** The plan is an ordered list of non-focusable rows; the only tab stops are the
buttons inside a blocked row and the fold control. So a keyboard user reaches every *action* but
cannot walk the plan itself.

**Why.** A dependency graph has no natural linear order, and coding's plan is currently a chain, so
DOM order is honest here — but it won't be in `work`, where the graph fans out. Inventing an order
now and having it silently break later is the worse outcome.

**The options.**

- **DOM order, as now.** Correct while the plan is a chain. Arbitrary the moment it branches.
- **Roving tabindex with arrow-key navigation** inside the list — one tab stop for the whole plan,
  arrows to move. Standard, works for a chain, and needs a real answer for branches (down = next
  sibling or next dependent?).
- **A tree** (`role="tree"`), which is what a DAG-flattened-by-dependency actually is. Honest
  structure, more machinery, and it implies a hierarchy the graph may not have.

`work` will force this. Deciding it there and back-porting is cheaper than deciding it here twice.

---

## 3. What happens to focus when the agent blocks?

**What it does now.** Nothing moves. The ask appears in the flow, the status region announces it,
and the person reaches it by tabbing.

**Why.** Stealing focus mid-typing is the worse harm, and `CLAUDE.md` rules it out.

**What it misses.** The one state that costs something if it's missed is also the one this treats
most passively. A sighted user gets the reserved blue channel in peripheral vision; a screen-reader
user gets one polite announcement they may talk over.

**The middle option** worth designing: don't move focus, but expose a persistent "go to what needs
you" affordance — a skip link that appears only while something is blocked, and a shortcut. The
person keeps control of when they move, and getting there is one action rather than fifteen tabs.

---

## 4. What is provenance for someone who cannot see the highlight? (from `doc`)

**What it does now.** Selecting a field dims the page and rings its region. The footer says
"Showing where address was read, page 1" — so a screen-reader user learns *that* a location exists
and which page it's on, and nothing else. The ring itself is `aria-hidden`, correctly: announcing
"rectangle at 30%, 32.5%" is worse than silence.

**Why this is the interesting one.** The whole surface exists to make verification cheap, and its
central move is a visual one. For a sighted reviewer the cost of checking a value drops from
"open the document and read it" to "glance right". For a blind reviewer it doesn't drop at all —
which means the surface's core claim is conditional on sight in a way nothing on screen admits.

**Three things it could do instead, none free:**

- **Read the neighbourhood.** Announce the text immediately around the region: the printed label,
  the value, the line above and below. That's what a sighted person actually uses the highlight
  for — context — and it's speakable. It needs the document's text layer, which pdf.js gives you
  and a photograph does not.
- **Announce the disagreement, not the location.** For a conflict, the useful thing is "PAN card
  says X, bank statement says Y", which is already text. Provenance-as-location may simply be the
  wrong affordance for this user, and the honest version is a different one rather than a described
  version of the same one.
- **Say what it cannot do.** If a value's provenance is a region on a photograph with no text
  layer, then verification is genuinely unavailable, and saying so plainly beats implying parity.

I'd build the first and the third, and treat the second as a separate design question. But this is
the most original question in the program and it should be yours, not mine.

---

## Not yet done

`axe` hasn't been run on any surface. Ask and I'll run it and report what it says rather than
fixing the cosmetic half — the four questions above are the substance, and none of them is
something axe can see.
