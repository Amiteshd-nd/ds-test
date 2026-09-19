# Events

Two vocabularies over one stream. The internal one is what the core emits and the SDK
consumes; the AG-UI one is what anybody else's client speaks.

```
GET /v1/runs/{id}/events                  → CORTEX events (default)
GET /v1/runs/{id}/events?protocol=ag-ui   → AG-UI events
```

Both are SSE, both resume with `Last-Event-ID`, and both carry the same sequence numbers,
so a client can switch protocols mid-stream without losing its place.

## Why a translator and not a rename

Addendum C4 proposes renaming `RunEvent` types to AG-UI names and keeping the old ones as
aliases for one milestone. This does it at the boundary instead. Two reasons, both about
the mapping rather than about churn:

- **Dual-named events are ambiguous for as long as they exist.** Every consumer written
  during the alias window picks one at random, and the removal milestone breaks half of
  them.
- **The mapping is not one-to-one.** One `token` can produce two AG-UI events; one `block`
  produces three; `approval_requested` becomes a *terminal* event in AG-UI's model. A
  rename cannot express any of that.

No package is installed. The headless UI is still ours, the SSE implementation is still
ours, and the only thing adopted is the vocabulary — which is what C4 asks for.

## Mapping

Field names are from the published spec at `docs.ag-ui.com/concepts/events`, read rather
than recalled. The `type` discriminator is SCREAMING_SNAKE: the prose uses PascalCase
headings, but the spec's own deprecation table pairs `THINKING_START` with
`REASONING_START`, which is the wire form.

| CORTEX event | AG-UI | Notes |
|---|---|---|
| `run_started` | `RUN_STARTED` | `{threadId, runId}` |
| `step_started` | `STEP_STARTED` | `stepName` is the machine name; the human label ("Searching Atlas") rides in `metadata`, since AG-UI has one name field and we show a different string than we log |
| `step_completed` | `STEP_FINISHED` | Our event carries only a step id; the translator remembers the name from the matching start |
| `token` | `TEXT_MESSAGE_START` + `TEXT_MESSAGE_CONTENT` | The first token of a run opens the message. An empty delta is dropped — the spec requires content to be non-empty |
| `block` (`skill_call`) | `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END` | All three at once: our arguments are complete by the time the block exists, so there is nothing to stream |
| `block` (other) | `CUSTOM` · `cortex.block.<type>` | Generative-UI blocks have no AG-UI equivalent |
| `citation` | `CUSTOM` · `cortex.citation` | |
| `notice` | `CUSTOM` · `cortex.notice` | The §13.4 states: permission filtered, fallback model used, no answer, untrusted content removed |
| `progress` | `CUSTOM` · `cortex.progress` | |
| `approval_requested` | `RUN_FINISHED` with `outcome: {type: "interrupt", interrupts: [...]}` | The best thing in this mapping — see below |
| `run_completed` | `TEXT_MESSAGE_END` + `RUN_FINISHED` | `outcome: {type: "success"}` |
| `run_failed` | `TEXT_MESSAGE_END` + `RUN_ERROR` | Our `ErrorKind` travels as AG-UI's `code`, so `budget_exceeded` stays distinguishable from a crash |

### The approval mapping

AG-UI models a human-in-the-loop pause as a run that *ends* with an interrupt outcome,
resumed by a new run that answers it. That is exactly what an `awaiting_approval` run is
here: the run really has stopped, durably, and it may sit for days before anyone answers.

Emitting a `CUSTOM` event for this would have been easier and would have thrown away the
one place where the protocol already understands our hardest requirement. The interrupt
carries the step id, the action, the arguments, the human-readable description, and the
projected cost — which is the approval payload from PRD §9.2, field for field.

## CORTEX extension events

The spec asks teams to document their custom events. These are all of them:

| `name` | `value` |
|---|---|
| `cortex.citation` | `{sourceId, ref, title}` — a source that was retrieved and is citable |
| `cortex.notice` | `{kind, message}` — a first-class UI state that is not an error |
| `cortex.progress` | `{message, pct?}` — async surfaces |
| `cortex.block.entity_card` | the host renders this in its own component |
| `cortex.block.diff_proposal` | inline surface |
| `cortex.block.choice` | |
| `cortex.block.text` | a block that degraded to text |

Anything a client does not recognise should be ignored, not rendered raw — the same rule
the block renderer follows on our own side.

## What is not implemented

`STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT`, the reasoning events, and
`TOOL_CALL_RESULT` have no CORTEX equivalent yet. They are not stubbed: a client reading
this stream will simply never see them. Reasoning events become interesting the moment a
reasoning model is configured, and `TOOL_CALL_RESULT` the moment a skill returns
something a UI should render on its own rather than as part of an answer.
