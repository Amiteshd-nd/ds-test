# Learning ledger

One line per thing you didn't know before. Dated. Terse.

Two reasons this exists: it makes the "how it evolved" story concrete, and by project four you
will have forgotten how much project one taught you.

Format: `YYYY-MM-DD · project · thing`

---

## coding
- 2026-09-09 · coding · SSE can't be read with `EventSource` if you need to POST options; `fetch` + `response.body.getReader()` and splitting on `\n\n` is about ten lines and gives you the abort signal for free.
- 2026-09-09 · coding · `requestAnimationFrame` stops firing in a hidden tab, so a frame-batched stream renders nothing until you look at it. Correct behaviour, surprising the first time — the events queue and land in one flush.
- 2026-09-09 · coding · A `mix-blend-mode` or a `z-index` on a wrapper makes it a stacking context, and children then blend against *its* backdrop instead of the page. Cost an hour on the studies water layer.
- 2026-09-09 · coding · `speed` in the runtime multiplies delays, so `4` is four times *slower*. A slider labelled "4×" next to a stopwatch is a trap; label controls by what they do.
- 2026-09-09 · coding · An exhaustive `switch` over a discriminated union with a `never` default really does do design work: adding an event to the grammar breaks the reducer until you decide what the surface does about it.
- 2026-09-09 · coding · Marking a value "provisional" convincingly needs *less* commitment in the treatment (dashed rule, lower contrast, italic), not a different colour. Colour reads as a category; weight reads as confidence.

## doc
- 2026-09-09 · doc · A coordinate overlay is trivial if the regions are normalised (0-1) and the highlight is a *child* of the page element: rotate or blur the page and the box comes with it, no maths.
- 2026-09-09 · doc · Dimming everything to make one thing readable only works if you exempt the thing. Obvious written down; invisible in the code until you look at it.
- 2026-09-09 · doc · "Two sources disagree" and "one glyph, two readings" feel like the same state and aren't: one is reconciled, the other is looked at. Whether Kavitha experiences that difference is a real question, not a settled one.
- 2026-09-09 · doc · `.normalize('NFC')` on anything typed, before it's compared or stored. Two identical-looking Tamil strings can be different bytes.
- 2026-09-09 · doc · A confidence band that doesn't change what the bulk action can touch is decoration. Putting that rule in the reducer instead of the component is what makes it real.

## content
- 2026-09-09 · content · Register is not a quality axis, it is a *request*. "Formal" is only wrong if you asked for code-mixed — and asking for one register across nine languages is itself the error, because it doesn't transfer.
- 2026-09-09 · content · The honest way to flag a pronunciation nobody in the room can hear is to transliterate what it actually said back into a script the reader knows, and put it next to what it should have said. The transliteration is then evidence, which means it has to be right.
- 2026-09-09 · content · Text expansion has a time dimension. Tamil audio for an English line is longer than the shot, and drawing the overhang *outside* the segment says "collision" where a badge would have said "property".
- 2026-09-09 · content · A planted-error experiment that plants in every variant measures nothing. One variant, in a language the tester cannot read, is the experiment.
- 2026-09-09 · content · Refusing to fake the audio was the right call and it costs two states: pronunciation and voice drift are designed and untestable until there's a key.

## work
-

## voice
-

---

## Things that surprised me
*(the good stuff for a case study — where your prior belief was wrong)*
- The state gallery paid for itself in the first ten minutes: two states read as "nothing needs you" that badly needed someone, and both were invisible on the happy path. I expected the gallery to be a chore before the real work.
- Writing the state list first meant the runtime, not the screen, was the thing being designed. The screen took an afternoon; the state list is what the argument rests on.
- Three copies of the same hook is not a smell to note, it's the rule firing. Promoting on the third use took twenty minutes and deleted more code than it added.
- The cold-read line wants *two* clocks — since start and since last progress — and STALLED is the state that proves it. One clock lies in exactly the case that matters.
