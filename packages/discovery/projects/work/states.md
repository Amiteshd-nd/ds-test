# work — the state list

**Status: proposed, not confirmed.** The brief names 16 states across actions, access and
attribution; this adds 18 its hard moments imply. Two questions at the bottom.

Thirty-four states. The one he'll see most is the one most products don't build: nothing needed him.

## Actions — every one of these is done *as him*

| State | From the brief | What the interface owes |
|---|---|---|
| `PROPOSED` | ✅ | Drafted, waiting. Editable before it goes. |
| `AUTO_EXECUTED` | ✅ | Done under his envelope without asking. Findable later, or the envelope is a blindfold. |
| `EXECUTED_APPROVED` | ✅ | He approved it first. Different line in the trail from the one above. |
| `BLOCKED_ON_HUMAN` | ✅ | Needs his judgement. Loudest treatment in the product. |
| `BLOCKED_ON_PERMISSION` | ✅ | The envelope forbids it. A policy problem, not a decision — and the block appears where the action would have been, with the path to change it. |
| `REVERSED` | ✅ | Undone, with the reversal itself logged as an action. |
| `IRREVERSIBLE_DONE` | ✅ | Sent, unsendable. A different container shape, not a different colour. |
| `FAILED_MIDWAY` | ✅ | Partial completion across three external systems. The worst state in any workspace agent. |
| `REVERSAL_WINDOW_OPEN` | added | Undo has a clock. Saying how long is the difference between an undo and a promise. |
| `REVERSAL_WINDOW_CLOSED` | added | The clock ran out. It becomes `IRREVERSIBLE_DONE` and should visibly *become* it. |
| `QUEUED_BEHIND_APPROVAL` | added | Waiting on an earlier action he hasn't looked at. Reads as waiting, not as stuck. |

## Partial failure — the state nobody plans for

| State | What the interface owes |
|---|---|
| `SYSTEM_DONE` | This leg landed. Named system, named record. |
| `SYSTEM_FAILED` | This leg didn't. Retryable on its own, not as part of the whole. |
| `SYSTEM_UNKNOWN` | **The real one.** The CRM write may or may not have landed and the agent cannot tell. Never render this as failed, and never as done. |
| `COMPENSATION_OFFERED` | Here is what would undo the legs that did land. |
| `COMPENSATION_IMPOSSIBLE` | One leg was an email. It cannot be unlanded, so the offer has to be honest about what it can't fix. |

## Access and residency

| State | From the brief | What the interface owes |
|---|---|---|
| `SCOPE_GRANTED` | ✅ | What, on whose data, until when. |
| `SCOPE_EXPIRED` | ✅ | Lapsed rather than revoked. Different cause, different fix. |
| `SCOPE_REVOKED` | ✅ | Withdrawn, and in-flight work halted — revocation that doesn't stop work isn't revocation. |
| `ACCESSED_SENSITIVE` | ✅ | It read something flagged. Logged whether or not it was permitted. |
| `SCOPE_BREACH_ATTEMPTED` | ✅ | It tried to exceed the envelope. Loud. Never a silent deny. |
| `RESIDENCY_CONSTRAINED` | ✅ | Impossible because the data can't leave a region. Say the region and the rule. |
| `ADMIN_CEILING` | added | The org-level scope he cannot exceed, visible as a ceiling on his own control rather than a hidden failure. |
| `ENVELOPE_BELOW_CEILING` | added | Room he has and hasn't taken. The tapering control needs somewhere to go. |

## Attribution — the ethical centre

| State | From the brief | What the interface owes |
|---|---|---|
| `ACTED_AS_USER` | ✅ | The recipient believes he wrote it. See question 1. |
| `ACTED_AS_AGENT` | ✅ | Disclosed. The recipient knows. |
| `ATTRIBUTION_AMBIGUOUS` | ✅ | He edited a draft before sending. Both wrote it, and the trail needs a real answer rather than a coin toss. |
| `ATTRIBUTION_DISPUTED` | added | He says he didn't send it; the ledger says he did. The state an audit exists for. |

## The brief — a document, not a transcript

| State | What the interface owes |
|---|---|
| `BRIEF_BUILDING` | The overnight run, still going. |
| `BRIEF_READY` | A durable artifact, resumable — he reads a third of it between meetings. |
| `BRIEF_PARTIALLY_READ` | Where he stopped, without a progress bar pretending it's a course. |
| `BRIEF_EMPTY` | **Nothing needed him.** A confident, specific account of what was checked and why none of it needed him — the highest-trust thing this product can say, and a Non-finding. |
| `SEGMENT_REVIEWED` | The overnight run as reviewable boundaries, not one blob. |

## Provenance and fleet

| State | What the interface owes |
|---|---|
| `SOURCE_LINKED` | Every claim in the brief points at the email or message it came from. |
| `SOURCE_UNAVAILABLE` | The message was deleted or moved. The claim stands and the evidence doesn't — say so. |
| `HANDOFF_CLEAN` | Triage handed to drafting with everything it needed. |
| `HANDOFF_LOSSY` | Context dropped at the seam. The seam is the object, not the agents. |

---

## Two questions

**1. `ACTED_AS_USER` — what does the interface actually do?** The brief calls this the ethical
centre and asks whether he *should* be comfortable. The options differ in what the recipient sees,
which makes this a product decision rather than a UI one.

**2. The tapering envelope.** He wants to review closely for two weeks and then stop. The brief
says design for *earned* autonomy and warns against "a slider he forgets to move". There are three
honest mechanisms and they imply different products.
