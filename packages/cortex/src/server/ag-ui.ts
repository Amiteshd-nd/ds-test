// AG-UI vocabulary on the wire. Addendum C4.
//
// The addendum's instruction is to adopt the vocabulary and not the framework: no package
// is installed, the headless UI stays ours, the SSE implementation stays ours, and the
// events are simply *named* the way the rest of the ecosystem names theirs.
//
// Adjusted in one way, deliberately. C4 proposes renaming `RunEvent` and keeping the old
// names as aliases for a milestone. This translates at the SSE boundary instead, behind
// `?protocol=ag-ui`, and leaves the internal names alone. Two reasons:
//
//   · Dual-named events are ambiguous for exactly as long as they exist, and every
//     consumer written during that window picks one at random.
//   · The mapping is not one-to-one. One `token` may produce two AG-UI events; one
//     `block` produces three; `approval_requested` becomes a *terminal* event in AG-UI's
//     model. A rename cannot express that, and a translator can.
//
// The field names below come from the published spec (docs.ag-ui.com/concepts/events),
// read rather than remembered. The `type` discriminator is SCREAMING_SNAKE: the prose
// uses PascalCase headings, but the spec's own deprecation table pairs `THINKING_START`
// with `REASONING_START`, which is the wire form.

import type { Block, RunEvent } from '../core/adapters/types.ts';

export interface AgUiEvent {
  type: string;
  timestamp: number;
  [key: string]: unknown;
}

export class AgUiTranslator {
  readonly threadId: string | null;
  readonly runId: string;
  #messageId: string | null = null;
  #stepNames = new Map<string, string>();
  #toolCalls = 0;

  constructor(runId: string, threadId: string | null) {
    this.runId = runId;
    this.threadId = threadId;
  }

  translate(event: RunEvent): AgUiEvent[] {
    const at = Date.now();
    const e = (type: string, fields: Record<string, unknown> = {}): AgUiEvent => ({ type, timestamp: at, ...fields });

    switch (event.type) {
      case 'run_started':
        return [e('RUN_STARTED', { threadId: this.threadId, runId: this.runId })];

      case 'step_started':
        this.#stepNames.set(event.stepId, event.name);
        // `label` is the human name the UI shows ("Searching Atlas"); AG-UI's stepName is
        // the machine one. Both go out: the spec allows extra fields under metadata.
        return [e('STEP_STARTED', { stepName: event.name, metadata: { label: event.label, kind: event.kind } })];

      case 'step_completed':
        return [e('STEP_FINISHED', {
          stepName: this.#stepNames.get(event.stepId) ?? event.stepId,
          metadata: { status: event.status, latencyMs: event.latencyMs },
        })];

      case 'token': {
        const out: AgUiEvent[] = [];
        if (!this.#messageId) {
          this.#messageId = `msg_${this.runId}`;
          out.push(e('TEXT_MESSAGE_START', { messageId: this.#messageId, role: 'assistant' }));
        }
        // The spec requires a non-empty delta.
        if (event.text) out.push(e('TEXT_MESSAGE_CONTENT', { messageId: this.#messageId, delta: event.text }));
        return out;
      }

      case 'block':
        return this.#block(event.block, e);

      // Nothing in AG-UI covers citations, permission notices, or progress lines. That is
      // what CUSTOM is for, and the spec asks teams to document their custom events —
      // docs/EVENTS.md.
      case 'citation':
        return [e('CUSTOM', { name: 'cortex.citation', value: { sourceId: event.sourceId, ref: event.ref, title: event.title } })];

      case 'notice':
        return [e('CUSTOM', { name: 'cortex.notice', value: { kind: event.kind, message: event.message } })];

      case 'progress':
        return [e('CUSTOM', { name: 'cortex.progress', value: { message: event.message, pct: event.pct } })];

      case 'approval_requested':
        // AG-UI models a human-in-the-loop pause as a *terminal* RunFinished carrying an
        // interrupt outcome; the client resumes by starting a new run that answers it.
        // That is a better fit for our approval gate than any custom event would be — the
        // run really has stopped, durably, and may sit for days.
        return [
          ...this.#closeMessage(e),
          e('RUN_FINISHED', {
            outcome: {
              type: 'interrupt',
              interrupts: [{
                id: event.stepId,
                reason: 'approval_required',
                action: event.payload.action,
                args: event.payload.args,
                description: event.payload.human,
                costUsd: event.payload.costUsd,
              }],
            },
          }),
        ];

      case 'run_completed':
        return [
          ...this.#closeMessage(e),
          e('RUN_FINISHED', { outcome: { type: event.status === 'succeeded' ? 'success' : 'interrupt' }, result: { status: event.status } }),
        ];

      case 'run_failed':
        return [...this.#closeMessage(e), e('RUN_ERROR', { message: event.error.message, code: event.error.kind })];

      default:
        return [];
    }
  }

  #closeMessage(e: (type: string, fields?: Record<string, unknown>) => AgUiEvent): AgUiEvent[] {
    if (!this.#messageId) return [];
    const out = [e('TEXT_MESSAGE_END', { messageId: this.#messageId })];
    this.#messageId = null;
    return out;
  }

  #block(block: Block, e: (type: string, fields?: Record<string, unknown>) => AgUiEvent): AgUiEvent[] {
    if (block.type === 'skill_call') {
      // Start → Args → End, the spec's streaming triad, emitted together because our
      // skill arguments are complete by the time the block exists.
      const toolCallId = `tc_${this.runId}_${this.#toolCalls++}`;
      return [
        e('TOOL_CALL_START', { toolCallId, toolCallName: block.skill, parentMessageId: this.#messageId ?? undefined }),
        e('TOOL_CALL_ARGS', { toolCallId, delta: JSON.stringify(block.args) }),
        e('TOOL_CALL_END', { toolCallId, metadata: { state: block.state } }),
      ];
    }
    // Generative-UI blocks have no AG-UI equivalent; they are ours, and CUSTOM is the
    // sanctioned way to say so rather than inventing a type name in someone else's
    // namespace.
    return [e('CUSTOM', { name: `cortex.block.${block.type}`, value: block })];
  }
}
