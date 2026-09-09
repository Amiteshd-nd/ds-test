# doc
### Reviewing what an agent read out of a document you didn't

**Covers:** Doc Agents · human-in-the-loop review · provenance · confidence signalling ·
document-processing workflows · Indian script rendering

> **Aligned as written.** Sarvam's Doc Agents does extraction and digitisation of invoices, KYC,
> land deeds and handwritten manuscripts into JSON, CSV, Markdown or DOCX — described as
> review-queue and confidence-state territory. Vision 2.0 adds native key-value extraction and
> Indic handwriting support, which makes handwritten Tamil forms a real input rather than a
> hypothetical one. Two additions to scope below.

**Build order:** #2 of 6. After `coding`, before `content`.
**Time:** ~1.5 weeks.

---

## The trade-off

An agent extracted 22 fields from a photograph of a handwritten Tamil loan application. You are
accountable for those 22 values. Verifying them by reading the document defeats the purpose of
the agent; accepting them without verification is not something you can defend in an audit.

**The whole design problem is the cost of verification.** Drive it low enough and delegation
becomes rational. Leave it high and the agent is decorative.

This is the narrow, deep project: one document, one reviewer, one screen. No orchestration — that's
`work`. Keeping it narrow is what makes it doable in ten days and what makes the findings sharp.

---

## The user

**Kavitha, 34.** Senior ops reviewer at a mid-size NBFC in Chennai. Loan applications: KYC
documents, bank statements, property papers, income proofs. Roughly 40% in Tamil, Hindi or
Kannada, many of them photographs of photocopies of hand-filled forms.

She is accountable to a compliance audit. The question asked when something goes wrong is never
"did the AI do it?" — it's "who approved this, and what did they see when they approved it?"
Her career risk lives in the audit trail, not in the model.

Attention pattern: eight-hour shift, desk, two monitors, continuous. Unlike the driver in `voice`
she has all the attention in the world. What she lacks is time. So the design pressure inverts
completely: **density is a feature here.** This is the project where you prove you can do dense,
expert, information-first tooling — which is the opposite of `voice`, and that contrast is itself
a portfolio asset.

Second reader: **the auditor**, who was never there and reads only the history. Design the trail
for them.

---

## Scope

One screen, done properly.

1. **The review pane.** Extracted fields on one side, source document on the other, with
   region-level provenance linking them. Click a value, the source region highlights.
2. **The correction flow.** She disagrees with a value. One action to fix, and the fix is
   attributed.
3. **The epistemic states.** Extracted vs inferred vs conflicting vs absent vs illegible, each
   rendered so she can tell them apart without reading a legend.

4. **The output format decision.** The same extraction can leave as JSON, CSV, Markdown or DOCX,
   and the right choice depends on what happens next. A small surface, but it's where the agent's
   output stops being the agent's and becomes someone's file — a real design moment that most
   extraction tools reduce to a dropdown.
5. **Handwriting as an input class.** Vision 2.0 handles Indic handwriting, so handwritten Tamil
   is a first-class case. Handwriting has different failure modes from print — confusable digits,
   inconsistent baselines, corrections struck through — and deserves its own confidence treatment.

Out of scope: the queue and orchestration (that's `work`), batch operations, auth, reporting.

---

## The state list

Write this before you draw. Per-field:

- `EXTRACTED_CONFIDENT` — read directly from the source, high score
- `EXTRACTED_UNCERTAIN` — read, but flagged
- `INFERRED` — not present in the source, derived from other values. Must **look** different from
  extracted; a derived fact and a read fact are not the same kind of thing.
- `CONFLICTING` — two sources disagree. Neither is wrong. This is the most interesting state on
  the list and traditional forms have no vocabulary for it.
- `ILLEGIBLE` — the source is unreadable. A property of the document, not a model failure, and
  the distinction matters because the next action differs.
- `ABSENT` — genuinely not in the document (the Non-finding pattern)
- `CORRECTED_BY_HUMAN` — with who and when
- `REVIEWED_UNCHANGED` — she looked and agreed. Distinct from unreviewed, and the audit needs it.

Document-level:

- `UNREVIEWED`, `IN_REVIEW`, `ACCEPTED`, `REJECTED`, `ESCALATED`
- `SOURCE_DEGRADED` — rotated, blurred, partially cut off. Provenance still has to work.

---

## Patterns this project must earn

| Pattern | Where |
|---|---|
| Provenance Link | Primary — field to source region and back |
| Confidence Without Numbers | The three bands, on ≥2 non-colour channels |
| Non-finding | `ABSENT` and `ILLEGIBLE` reported as results, not gaps |
| Repair Loop | The correction flow |
| Consequence Gate | Accepting the document (it becomes a credit decision) |

---

## Design direction

Not a SaaS dashboard. The reference is a **ledger** — rules and alignment carrying hierarchy
instead of cards, tight leading, tabular figures, near-neutral chrome so that agent state is the
only saturated thing on the screen.

- **Density is respect.** Kavitha knows this domain better than you. Whitespace that helps a
  first-timer hurts an expert on their four-hundredth document. Design for the four-hundredth.
- **Provenance must be same-screen.** No modal, no navigation, nothing that loses her place. The
  moment verification costs her a context switch she stops doing it.
- **Inferred values get a different treatment from extracted ones.** Italic plus a dashed
  underline in the tokens, but the point is that it's a *different kind of fact* and must not
  share a visual language with a read one.
- **Document content is Tamil/Hindi/Kannada while the chrome is English**, on the same screen at
  different sizes. Get the cross-script vertical rhythm right or the whole thing looks broken.
  This is where the `lang`-keyed line heights in `grammar/tokens.css` earn their keep.
- **Tabular figures in every column of numbers.** Non-tabular figures in a data column is the
  fastest way to look amateur here.

---

## The hard moments

1. **`CONFLICTING`.** The PAN card says one name, the bank statement says another. Not an error,
   not low confidence — a genuinely new result type. Design it.
2. **Provenance on a photograph of a photocopy.** The pattern assumes you can point at a region.
   What happens when the region is blurry, rotated and handwritten? The degenerate case *is* the
   design problem.
3. **The correction that reveals a systematic error.** She fixes one field and realises the agent
   got the same field wrong on every document of this type. What does the interface do with that?
4. **Accepting without reading.** Design the moment she accepts 22 values having verified four.
   It has to be honest about what she did and didn't check.

---

## What you'll learn building this

- Coordinate-space overlay on a rendered document (pdf.js + a highlight layer). Fiddly, and a
  genuinely useful skill.
- Real Sarvam Vision output, which is imperfect in *interesting* ways — its failure modes will
  give you states you wouldn't have imagined.
- Cross-script vertical rhythm, for real, with mixed-size mixed-script content on one screen.
- Why confidence percentages are a trap. You'll want to print `0.58` and you'll watch a tester
  misread it.

---

## Measurement targets

- **Time to verify one field:** baseline is opening the source and reading it, 30–60s → target
  under 5s. Headline number.
- **Correction rate** and whether corrections cluster by field type.
- **Appropriate distrust:** plant a confidently-wrong value (`planted_error` in the runtime).
  Does she catch it? If 5/5 accept it, your confidence signalling failed no matter how good the
  usability numbers look.
