# The source documents

These three are reproduced **verbatim**, exactly as they were handed over. Nothing in this
directory has been edited, and nothing in it should be: the implementation cites them by
section number several dozen times, and a specification that quietly drifts toward what
was built is worse than no specification.

| File | What it is |
|---|---|
| `PRD-cortex-agent-layer.md` | The original PRD, v1.0. Every `§n` reference in this package's code and docs points here. |
| `PRD-cortex-ADDENDUM-v1.1-native.md` | The native-only dependency amendment. Every `C1`–`C7` reference points here. |
| `SKILL-as-given.md` | The skill as originally written, before it was installed. |

## Where they diverge from what was built

They diverge in a lot of places, and every one is written down rather than reconciled
silently — PRD rule 7 asks for exactly that:

- **`../DECISIONS.md`** — eighteen entries. Each names what the document says, what was
  built instead, what it cost, and how to reverse it. D-1 (TypeScript rather than Python)
  is the one everything else follows from.
- **`../AUDIT-v1.1.md`** — the pre-amendment audit the addendum's §3 requires, including
  the finding that its most urgent item did not apply here.
- **`../SECOND-HOST.md`** — the M6 Definition of Done, and the half of it that is not
  claimed.

## The installed skill is not this file

`SKILL-as-given.md` is the original. The one that actually runs lives at
`.claude/skills/cortex-agent-layer/SKILL.md` and differs: it gained a section pointing at
this implementation, and the three `reference/` files it promised but did not ship were
written. Both are in the repo so the difference is visible.
