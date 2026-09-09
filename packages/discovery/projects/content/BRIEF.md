# content
### Approving media in a language you cannot evaluate

**Covers:** Content Agents · Indian language and context diversity · non-deterministic output ·
trust signalling · script rendering · text expansion · voice and media review

**Build order:** #3 of 6.
**Time:** ~1.5 weeks.

> **Reframed.** An earlier version framed this as marketing copy localisation. Sarvam's Content
> Agents is Content Studio: AI voices, voice cloning, transcription, video dubbing and live
> translation, usable standalone or chained into workflows. So the medium is audio and video, not
> text. The core design problem gets *harder*, and the Back-translation Mirror still applies.

---

## The trade-off

A content agent dubs a 4-minute product video into nine Indian languages in eight minutes. The
person accountable for the output understands two of them.

**Verification isn't expensive here — it's impossible.** That's the difference from `doc`, where
Kavitha can read the source if she's willing to spend the time.

And audio makes it worse than text in three specific ways: you can't scan it, so checking is
linear and real-time; a cloned voice carries an implicit claim of authenticity; and mispronounced
proper nouns are the single most common failure and the least visible in any transcript-based
review.

The failure that matters is not a bad dub. It's a **fluent and wrong** one, because that's the one
nobody catches.

---

## The user

**Priya, 29.** Content lead at a Bengaluru health-insurance company. Ships explainer videos and
IVR audio in Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, Malayalam, Gujarati and English.
Reads English and Kannada, speaks Hindi. The rest are opaque.

Today: freelance voice artists and translators, four to six days, and she finds out something was
wrong when a customer calls in confused.

Her constraints, from research:
- Regulated category. A mistranslated exclusion in a health-insurance explainer is a legal problem,
  not a tone problem.
- **Proper nouns are the recurring failure.** Product names, hospital network names, the company
  name. A TTS system that mispronounces the brand in Malayalam is unusable, and she can't hear that
  it's wrong.
- Brand terms must not be translated at all. "Cashless," "network hospital," "co-pay" have accepted
  English forms in Indian usage; translating them makes the copy read as foreign.
- Cloned voices raise a consent question she has not thought about and will need to. Design for it
  anyway.
- Register varies by language in ways that don't transfer. The same warmth reads as respectful in
  Tamil and presumptuous in Bengali.
- Her audience code-switches. Formal Hindi is *less* trustworthy to a young urban listener than
  Hindi with English loanwords, and register is an actual API parameter — so it becomes a design
  control rather than a hope.

Second user: **the native reviewer** — a colleague or freelancer, one language, one time, no
context. Design for a reviewer with zero onboarding, because that's what you'll get.

---

## Scope

Three surfaces.

1. **The multi-language review board.** One source video, nine dubbed variants, per-variant states,
   ranked by suspicion. The core question: what can you show Priya that makes approval rational?
2. **Timeline-level review.** Where in the 4 minutes is the problem? A dub is a time-based artifact
   and a list of sentences throws away the thing that matters most about it.
3. **The escalation path.** She can't judge this one. What does she send to a native reviewer, and
   what exactly does she ask them? Aiming a scarce reviewer budget is the real job.

Out of scope: editing audio, a video editor, publishing, asset management.

---

## The state list

Per language variant:

- `GENERATED` — produced, unreviewed
- `BACK_TRANSLATION_MATCHES` — round-tripped and the meaning held
- `BACK_TRANSLATION_DIVERGES` — meaning shifted. **The most important state in the project.** The
  only mechanism by which Priya can detect fluent-and-wrong output.
- `TERM_VIOLATION` — a protected term got translated
- `PRONUNCIATION_SUSPECT` — a proper noun probably came out wrong. Needs its own state because it's
  the most common real failure and it's invisible in a transcript.
- `REGISTER_MISMATCH` — formality doesn't match what was asked for
- `TIMING_OVERRUN` — the dub is longer than the video segment it has to fit. Text expansion, but in
  the time dimension: Tamil audio for an English line simply doesn't fit the shot.
- `VOICE_INCONSISTENT` — the cloned voice drifts across the clip
- `SCRIPT_FALLBACK` — the font can't render a glyph in the subtitle track. Tofu, invisible to a
  reader who doesn't know the script.
- `NEEDS_NATIVE_REVIEW` → `NATIVE_APPROVED` / `NATIVE_REJECTED`, with the reviewer named
- `APPROVED_UNVERIFIED` — she approved without being able to check. Record it honestly. Pretending
  this state doesn't exist is precisely how the category fails today.

---

## Patterns this project must earn

| Pattern | Where |
|---|---|
| Back-translation Mirror | Primary — pattern 13, and the most original thing in the program |
| Confidence Without Numbers | Fluency and fidelity as *separate* axes, never one score |
| Non-finding | "No accepted Tamil term exists for this concept" is a real, useful result |
| Repair Loop | Fixing one term or one pronunciation without regenerating the whole dub |
| Consequence Gate | Publishing regulated medical claims you cannot evaluate |
| Provenance Link | Which source segment produced this segment — timeline alignment |
| Simulation Sweep | Sweeping one job across nine languages and reading the aggregate |

---

## Design direction

The reference is **proofing** — a print proof, an edit suite, a translator's workbench. Not a
media player with a language dropdown, and not nine identical cards in a grid.

- **The source is fixed and central; variants are comparanda.** Every variant is a claim about the
  same meaning, so the layout should make the source the reference.
- **Time is the primary axis.** A dub is a time-based artifact. Problems have timecodes. Align
  variants against the source timeline, not against each other as blocks of text.
- **Show drift, don't score it.** Diff highlighting on the back-translation does the real work.
  Colour marks *change* and nothing else on the screen may use that treatment.
- **Rank by suspicion, collapse the clean ones.** Nine variants is a lot of screen. The ones
  needing attention come first; clean ones become one line. Same logic as Exception Queue.
- **This is the typography project.** Nine scripts in subtitle tracks and transcripts, on one
  screen. Per-script line heights keyed off `lang`, correct fallback chains, visible tofu
  detection, honest expansion handling. If your Malayalam subtitle clips its own descenders, the
  portfolio's Indic claim collapses — and getting it right is the most concrete evidence you can
  offer for the brief's last bullet.
- **Audio needs a visual proxy.** She cannot scan audio. Waveform plus aligned transcript plus
  flagged timecodes is how a four-minute linear artifact becomes scannable. That translation —
  making time-based media reviewable at a glance — is the second-best design problem here.

---

## The hard moments

1. **Fluent and wrong.** Reads and sounds beautiful, says something else. Everything you build is
   in service of making this detectable.
2. **Separating fluency from fidelity.** Two different confidences. Collapsing them into one number
   is the standard mistake in every translation tool that exists.
3. **Pronunciation she can't hear.** The brand name is wrong in Malayalam. How does the interface
   flag a phonetic problem to someone who doesn't know the phonology? Probably: transliterate the
   *actual* output back into a script she reads, and let her see that it doesn't match.
4. **`TIMING_OVERRUN`.** Tamil audio doesn't fit the shot. Text expansion in the time dimension —
   a constraint that only exists in this medium and that nobody has designed for.
5. **Cloned-voice consent.** A real ethical surface. Design where consent lives and what the
   interface refuses to do. Handling this thoughtfully rather than ignoring it is a differentiator.
6. **`APPROVED_UNVERIFIED`.** Design a state that admits she couldn't check.

---

## What you'll learn building this

- Multi-script typography under real pressure. Nine scripts, one screen, one type system. You'll
  discover things about your font stack no amount of reading would have taught you.
- Timeline alignment between two time-based artifacts, and why it's harder than sentence alignment.
- Making linear media scannable — a genuinely transferable interaction problem.
- Bulbul's voice, pace and pronunciation controls as design affordances. Where an API's own
  parameters become UI controls, which is a useful thing to have thought about for a role at an
  API company.
- How to design an affordance that helps without over-claiming. Hardest writing problem here.

---

## Measurement targets

- **Detection rate on planted meaning-drift.** Inject a variant where a key clause is subtly wrong.
  Does she catch it with the Back-translation Mirror? Without it? Headline number, unusually clean
  experiment.
- **False alarm rate.** How often does the mirror flag drift a native speaker says is fine? A tool
  that cries wolf gets switched off. Report both or neither means anything.
- **Escalation precision.** Of the variants she sends to native review, how many actually needed
  it? This measures whether you helped her *aim* a scarce budget.
- **Time to ship nine languages:** baseline four to six days → target?
