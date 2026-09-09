# 2026-09-09 — content, three decisions

`projects/content/states.md` went out with three open questions and one limitation. All decided.

---

## 1. Fluency and fidelity stay two axes. Nothing names their corner.

**Decided:** no `FLUENT_BUT_UNFAITHFUL` state.

The corner where fluency is high and fidelity is low is the failure the whole surface exists to
catch, so naming it is tempting. It stays unnamed because a named state gets read as a third score,
and the one rule this surface cannot break is that these are two different questions.

**What it costs, and where the cost lands.** Suspicion ranking now has to be derived — the board
sorts on the pair, not on a flag — and the row has to make "reads well, says something else" legible
from the two axes alone. That's a copy and layout problem rather than a data one, and it is the
right place for the difficulty to sit.

**What would reverse it.** Testers reading the two axes and not noticing the combination. If the
detection-rate experiment shows the mirror works but the *board* doesn't surface which variants to
open, the honest fix is a row label — plain language, explicitly not a score — rather than a state.

---

## 2. Consent warns loudly and allows both — deliberately the weakest option

**Decided:** generate and publish are both allowed without a consent record; the interface warns,
and the acknowledgement goes in the trail.

This was the weakest of the three options on offer and it was chosen on purpose. Refusing to
generate is the position a responsible product should take, and a prototype that takes it teaches
nobody anything: the interesting design question is what a person does when the tool lets them
proceed, and that question only exists if the tool lets them.

**So the trail is the only guard, which puts weight on three things:**
- The warning names *whose* voice, what the consent covered, and when it expired. "Consent missing"
  is not a warning, it's a shrug.
- The acknowledgement records who clicked past it. An unattributed override is not a record.
- The copy must not imply the question has been handled. No "consent verified" anywhere, no green
  tick, nothing that reads as clearance. This is the over-claiming rule and it applies hardest here,
  because the legal exposure is real and the interface is choosing not to block.

**What would reverse it.** If a tester reads the warning as permission — "the tool let me, so it
must be fine" — then warning is worse than refusing and the gate moves to publish.

---

## 3. Transliteration in both scripts

**Decided:** Latin and Kannada, side by side.

Priya reads English and Kannada; the next reviewer may read neither. Latin travels and loses
aspiration and retroflex distinctions, which is exactly where brand names break; Kannada keeps them
and is useless to anyone else. Two rows per flag is the cost of both audiences being real.

**Flagged:** I cannot verify that my transliterations are accurate, and this is the one place in the
program where a wrong transliteration would actively mislead — it is the evidence, not the label.
Every transliteration in the runtime script is invented and needs checking by someone who reads the
script before it goes in front of a tester.

---

## The limitation: there is no audio, and it will not be faked

No key, no TTS. The browser's own speech synthesis could make something play, and it would be worse
than silence: this surface exists to judge pronunciation, voice consistency and register in nine
languages, and a browser voice reading Tamil would misrepresent the exact thing under review while
looking like a working demo.

So: a silent waveform proxy, the aligned transcript, the transliteration, and the interface saying
plainly that nothing plays. `PRONUNCIATION_SUSPECT` and `VOICE_INCONSISTENT` are designed and not
testable until there's a key — which makes them the first two things to re-test when there is one.
