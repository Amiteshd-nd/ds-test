# content — the state list

**Status: confirmed 2026-09-09.** The brief names 13 per-variant states; this adds 20 its hard
moments imply but don't enumerate. Three decisions and one limitation are recorded in
`grammar/log/2026-09-09-content-decisions.md`.

Thirty-three states. Priya's happy path is one of them, and she can't verify it.

## The job — nine languages at once

| State | From the brief | What the interface owes |
|---|---|---|
| `JOB_QUEUED` | added | Position, and what it will cost. Nine languages is nine bills. |
| `JOB_RUNNING` | added | Which languages are done, not a single bar. They finish at different times. |
| `JOB_PARTIAL` | added | Seven of nine landed. The two that didn't are the news. |
| `LANGUAGE_UNSUPPORTED` | added | Malayalam does speech-to-text but not this voice. Say it before she waits. |
| `SWEEP_SHAPE` | added | The aggregate across nine: outcome shape first, never a pass rate. |

## Meaning — the half she cannot check

| State | From the brief | What the interface owes |
|---|---|---|
| `GENERATED` | ✅ | Produced, unreviewed. Not "ready". |
| `BACK_TRANSLATION_MATCHES` | ✅ | Agreement is not information. One line, collapsed. |
| `BACK_TRANSLATION_DIVERGES` | ✅ | **The most important state here.** The only way she can see fluent-and-wrong. Mark the changed clause, not the variant. |
| `TERM_VIOLATION` | ✅ | A protected term got translated. Which term, where, and what it became. |
| `NO_ACCEPTED_TERM` | added | There is no accepted Tamil form for this concept. A real result, not a gap — the Non-finding pattern. |
| `REGISTER_MISMATCH` | ✅ | Asked for code-mixed, got formal. Register is an API parameter, so this is a control she can turn. |
| `CLAUSE_DROPPED` | added | The dub omits an exclusion. In a regulated category this is the legal one, not a tone note. |

## Sound — the half she cannot hear

| State | From the brief | What the interface owes |
|---|---|---|
| `PRONUNCIATION_SUSPECT` | ✅ | The brand name is probably wrong. Invisible in a transcript, which is why it needs its own state. |
| `TRANSLITERATION_MISMATCH` | added | The mechanism behind the state above: what it *actually said*, written back in a script she reads, next to what it should have said. |
| `VOICE_INCONSISTENT` | ✅ | The cloned voice drifts. Where in the four minutes, not "somewhere". |
| `AUDIO_UNAVAILABLE` | added | No audio to play. See the limitation at the bottom — this may be most of the prototype. |

## Time — expansion in a dimension nobody designs for

| State | From the brief | What the interface owes |
|---|---|---|
| `TIMING_FITS` | added | The dub fits the shot. Needs a name so the failures have a baseline. |
| `TIMING_OVERRUN` | ✅ | Tamil audio is longer than the shot. By how much, and on which segment. |
| `TIMING_UNDERRUN` | added | Shorter than the shot: dead air over a moving picture. Different fix from overrun. |
| `SEGMENT_ALIGNED` | added | This dub segment came from that source segment. Provenance, in time. |
| `SEGMENT_UNALIGNED` | added | It cannot say which source segment produced this. Then the timeline is decoration. |

## Typography — nine scripts on one screen

| State | From the brief | What the interface owes |
|---|---|---|
| `SCRIPT_FALLBACK` | ✅ | Tofu. Invisible to someone who doesn't read the script, so it must be loud. |
| `SUBTITLE_OVERFLOW` | added | The Malayalam subtitle doesn't fit its safe area. Show it inside the container it must live in. |
| `CLIPPED_DESCENDER` | added | Per-script line height wrong. The brief says the Indic claim collapses here, so it gets a state. |

## Consent — the ethical surface

| State | From the brief | What the interface owes |
|---|---|---|
| `CONSENT_ON_FILE` | added | Whose voice, granted for what, until when. |
| `CONSENT_MISSING` | added | Warns and allows, per the decision. So the warning has to name whose voice and what was never granted, and the override has to be attributed. |
| `CONSENT_EXPIRED` | added | Granted once, for something else, last year. The most likely real case. |
| `CONSENT_SCOPE_EXCEEDED` | added | Consent for IVR, used in an ad. Same voice, different claim. |

## Escalation — aiming a scarce reviewer

| State | From the brief | What the interface owes |
|---|---|---|
| `NEEDS_NATIVE_REVIEW` | ✅ | Ranked by suspicion, so her budget goes where it earns most. |
| `ESCALATED_WITH_QUESTION` | added | Not "please review" — one question, one timecode, one clause. |
| `NATIVE_APPROVED` | ✅ | Named reviewer, and what they were actually asked. |
| `NATIVE_REJECTED` | ✅ | With the reason in their words. |
| `NATIVE_REVIEW_TIMED_OUT` | added | Nobody came back. Guaranteed, and undesigned everywhere. |

## Approval and publishing

| State | From the brief | What the interface owes |
|---|---|---|
| `APPROVED_UNVERIFIED` | ✅ | She approved what she could not check. Recorded plainly — pretending this state doesn't exist is how the category fails today. |
| `PUBLISH_BLOCKED` | added | A regulated claim with unresolved divergence. Refuse, and name the clause. |
| `REPAIR_TERM_PINNED` | added | One term fixed and pinned, without regenerating four minutes of audio. |
| `REPAIR_SEGMENT_ONLY` | added | One segment regenerated. Cheaper than the whole dub, and the rest keeps its review. |

---

## The three decisions, and the limitation

**1. No `FLUENT_BUT_UNFAITHFUL` state.** Fluency and fidelity stay two axes and nothing names their
worst corner, because a named quadrant invites being read as a third score. Consequence: ranking by
suspicion has to be *derived* from the two axes rather than read off a state, and the row copy has
to make the combination legible without labelling it.

**2. Consent warns loudly and allows both.** The weakest of the three positions and chosen
deliberately: it is what tools actually do, and showing that honestly is more useful than a
prototype that pretends the problem is solved by a disabled button. The cost is that the trail
becomes the only guard, so the acknowledgement has to be specific — whose voice, granted for what,
who clicked past it — and the copy must not imply the consent question has been handled.

**3. Transliteration comes back in both scripts.** Latin for any reviewer, Kannada for Priya. Two
rows per flag, on the grounds that she and the native reviewer genuinely need different things.

**The limitation: there is no audio.** No key, no TTS, so nothing plays, and I won't fake it with
the browser's speech synthesis — this surface exists to judge pronunciation and voice quality, and
a fake voice would misrepresent exactly the thing under review. The audio is a silent waveform proxy
plus the aligned transcript plus the transliteration, and the interface says so out loud.
`PRONUNCIATION_SUSPECT` and `VOICE_INCONSISTENT` are therefore *designed but not testable* until
there is a key.
