# doc — the state list

**Status: confirmed 2026-09-09.** The brief names 14 states; this adds 19 its hard moments imply
but don't enumerate. Three questions were open when it was proposed and all three are decided in
`grammar/log/2026-09-09-doc-decisions.md`: `CONFLICTING` and `CONFUSABLE` stay separate (flagged as
a bet that testing could reverse), `OUT_OF_RANGE` stays in scope with a hard boundary of three
validation rules, and the source document is synthetic with every guessed assumption listed.

Thirty-three states. Kavitha's happy path is two of them.

## Per field

| State | From the brief | What the interface owes |
|---|---|---|
| `EXTRACTED_CONFIDENT` | ✅ | Read directly, high score. Skippable in a bulk accept. |
| `EXTRACTED_UNCERTAIN` | ✅ | Flagged. **Un**-skippable in a bulk accept — the band changes behaviour or it's decoration. |
| `INFERRED` | ✅ | A derived fact is not a read fact. Different treatment, not a lighter one. |
| `CONFLICTING` | ✅ | Two sources, neither wrong. Both values, both provenances, and no default selection. |
| `ILLEGIBLE` | ✅ | A property of the document, not a model failure. Next action: get a better scan. |
| `ABSENT` | ✅ | Genuinely not there, with the search boundary named. Next action: ask the applicant. |
| `CORRECTED_BY_HUMAN` | ✅ | Who, when, and the value it replaced — the auditor reads this, not her. |
| `REVIEWED_UNCHANGED` | ✅ | She looked and agreed. Distinct from unreviewed, and the audit needs the distinction. |
| `UNREVIEWED` (field) | added | The default. Must be countable at a glance, because accepting turns it into a decision. |
| `EXTRACTED_FROM_HANDWRITING` | added | Different failure modes from print, so a different confidence treatment. Not a badge. |
| `CONFUSABLE` | added | ௧/௭, 1/7, ०/९. The model is confident *and* the glyph pair is ambiguous — those are different things. |
| `STRUCK_THROUGH` | added | The applicant crossed it out and wrote another. Two values on the page, one of them void. |
| `OUT_OF_RANGE` | added | Read correctly, and impossible — a 1987 date on a 2026 form. Validation is not confidence. |

## Repair — the correction flow

| State | What the interface owes |
|---|---|
| `REPAIR_OFFERED` | The model's ranked alternates, not an empty box. Disambiguation over open retry. |
| `REPAIR_NO_ALTERNATES` | It has nothing to offer. Then it must say so rather than showing an empty list. |
| `REPAIR_TYPED` | She typed a value the model never proposed. Attributed differently from picking an alternate. |
| `REPAIR_EXHAUSTED` | Two attempts, per the pattern's cap. Escalate; three failures is a design failure, not hers. |
| `SYSTEMATIC_SUSPECTED` | The same field wrong across documents of this type. Hard moment #3, and it has no home in any tool I've seen. |

## Provenance and source

| State | What the interface owes |
|---|---|
| `PROVENANCE_EXACT` | Region-level. Click the value, the region highlights, same screen, no modal. |
| `PROVENANCE_APPROXIMATE` | It knows the page, not the box. Say which, because "page 4" is not provenance. |
| `PROVENANCE_UNAVAILABLE` | No coordinates at all. The value may still be right; the *verification* is what's lost. |
| `SOURCE_DEGRADED` | ✅ Rotated, blurred, cut off. Provenance still has to work — hard moment #2. |
| `SOURCE_MULTIPAGE` | The field's region is on page 3 of 7. Getting there must not lose her place. |
| `SCRIPT_FALLBACK` | The font can't render a glyph. Invisible to a non-reader of that script, so it must be loud. |

## Document

| State | From the brief | What the interface owes |
|---|---|---|
| `UNREVIEWED` | ✅ | Nothing looked at yet. |
| `IN_REVIEW` | ✅ | Partial progress, and *which* fields — the count is the honest part. |
| `ACCEPTED` | ✅ | Behind a Consequence Gate: accepting is a credit decision, not a save. |
| `ACCEPTED_PARTIALLY_VERIFIED` | added | 22 values, 4 verified. Hard moment #4. The trail must say exactly that, without shaming her. |
| `REJECTED` | ✅ | Sent back. In her words — "sent back", not "validation failure". |
| `ESCALATED` | ✅ | To a person, with what they need to decide and nothing else. |

## Export — where it stops being the agent's output

| State | What the interface owes |
|---|---|
| `EXPORT_READY` | JSON / CSV / Markdown / DOCX, chosen by what happens next, not by a dropdown's default. |
| `EXPORT_LOSSY` | CSV drops the nesting; DOCX drops the provenance. Say what each format loses *before* she picks. |
| `EXPORT_BLOCKED` | Unreviewed uncertain fields still open. Refuse, and name them. |

---

## Notes while writing this — the three questions, now answered

- **`CONFLICTING` and `CONFUSABLE` are not the same shape.** Conflicting is two sources disagreeing
  (a document problem). Confusable is one glyph with two readings (a script problem). I've kept them
  apart because the next action differs — reconcile versus zoom in. **Decided: separate, and
  flagged** — if testers describe both in the same words, they merge. See the decision log.
- **`OUT_OF_RANGE` may be out of scope.** It's validation, not epistemics, and the brief scopes this
  to "the cost of verification". It stays, because a confidently-read impossible value is exactly
  where a reviewer's trust should break and no confidence band catches it. **Decided: in scope**,
  bounded to three hardcoded rules.
- **`STRUCK_THROUGH` needs a real handwriting sample to design against.** I can synthesise the
  document, but I can't verify that my Tamil reads naturally or that a struck-through correction
  looks the way it does on a real hand-filled NBFC form. Flagging per the Indic rule in `CLAUDE.md`
  rather than guessing quietly. **Decided: synthesise it and flag what was guessed** — the four
  specific assumptions are listed in the decision log, including that "confusable in a font" and
  "confusable in someone's handwriting" are different claims and I can only make the first.
- No `SOURCE_DEGRADED` sub-states (rotated vs blurred vs cut off) yet. They may each deserve one —
  the recovery action differs — but three states for one condition needs evidence first.
