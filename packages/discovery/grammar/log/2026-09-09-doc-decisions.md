# 2026-09-09 — doc, three decisions and what was flagged

The state list in `projects/doc/states.md` was proposed with three open questions. All three are now
decided. Recording them here because two of them are the kind of thing that looks arbitrary in six
weeks, and one of them is a known weakness in the evidence rather than in the design.

---

## 1. `CONFLICTING` and `CONFUSABLE` stay separate — flagged

**Decided:** two treatments, not one.

**The case for separating them.** They fail for different reasons and the next action differs:

| | `CONFLICTING` | `CONFUSABLE` |
|---|---|---|
| What happened | Two sources give different values | One glyph has two plausible readings |
| Where the problem lives | In the documents | In the script |
| Next action | Reconcile — decide which source governs | Zoom in — look at the mark |
| Can the model help | No. Both readings are correct reads | Yes. It has a ranked alternate |

**Why it's flagged.** This is a bet that Kavitha experiences them as different problems. It could be
wrong in a way that only testing shows: if she treats both as "the system is unsure, show me the
document", then two treatments are two things to learn for one behaviour, and the second one is
waste. Watch for that in testing — specifically whether she says the same sentence out loud when
she hits each of them.

**What would reverse it.** Any of these:
- Testers describing both in the same words.
- Nobody using the alternate-picker on `CONFUSABLE`, i.e. everyone goes to the source anyway.
- The two treatments needing to co-occur on one field, at which point the screen has to say
  "two sources disagree *and* one of them is ambiguous" and a merged vocabulary would be simpler.

If it reverses, the merged state is "two candidate values, one field" and the difference moves into
the *reason* line rather than the treatment.

---

## 2. `OUT_OF_RANGE` stays in

**Decided:** in scope.

A value read correctly that cannot be true — a 1987 date on a 2026 form — is invisible to every
confidence band, because the model's read *was* right. It's the cleanest available demonstration
that confidence and correctness are different axes, which is the argument the whole surface is
making. Cost is one more state and a validation rule per field type, which is small.

The risk is scope creep into a validation engine. Boundary: three rules total (date plausibility,
amount against a stated total, ID format), each hardcoded, and no rule builder. If it starts
growing, it goes.

---

## 3. The source document is synthetic — flagged, with specifics

**Decided:** synthesise it, and flag what was guessed.

Sarvam's Vision 2.0 handles Indic handwriting, which makes a hand-filled Tamil loan application a
real input class rather than a hypothetical one. There is no key in this repo and no real form, so
the document is fabricated. Everything below is an assumption I could not verify, listed so it can
be corrected by someone who can:

- **That my Tamil reads naturally.** The strings are grammatical as far as I can tell and I cannot
  judge whether an NBFC form would phrase them that way. Someone who reads Tamil should look.
- **That ௧ and ௭ are confusable in handwriting.** I chose that pair because U+0BE7 and U+0BED are
  structurally similar, but "similar in a font" and "confusable when hand-written by a stranger with
  a ballpoint" are different claims and I can only make the first.
- **That a struck-through correction looks the way I've drawn it.** On real forms people strike
  through, write above, initial the change, or write in the margin. I picked strike-through-and-write
  above because it's the most common one I've seen, which is not evidence.
- **That the field set is plausible.** 22 fields on a loan application, named from the brief's
  vocabulary. A real form would have its own layout logic and probably a section I haven't imagined.

**Not guessed, and worth saying:** the coordinate-space overlay behaves identically over a synthetic
document and over pdf.js output, because provenance regions are normalised (0–1 of page width and
height) either way. Swapping in a real PDF is a renderer change, not a design change.

**Also deferred:** pdf.js itself. The brief names it, and it earns its place when there's a real PDF
to render. Adding a document-rendering dependency to display a document I generated would be
theatre.
