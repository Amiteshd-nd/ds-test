/**
 * Context compaction (PRD section 6.1, adopt 6).
 *
 * When the transcript grows past a threshold, the oldest turns are replaced by
 * one structured summary and the most recent turns are kept verbatim. Two
 * properties matter and are easy to lose:
 *
 * **It must be restorable.** The summary records the paths a turn touched, not
 * the file contents, because a path can be reread and a paraphrase cannot. This
 * is the same reason the tools write large output to disk in the first place.
 *
 * **It must not break the cache prefix.** Compaction rewrites the head of
 * `messages`, so the request after a compaction is a guaranteed full-price miss.
 * That is acceptable once in a long task and ruinous every third turn — hence a
 * threshold high enough that most tasks never reach it, and a floor on how much
 * is reclaimed so a compaction that barely saves anything is skipped.
 *
 * Everything here is deterministic: no model call, so no cost and no flake.
 */

import type { LLMMessage } from '../providers/interfaces.ts';

/** Characters, not tokens — a cheap proxy, ~4 chars per token. */
export const COMPACT_THRESHOLD_CHARS = 240_000;
/** Turns kept raw at the end, whatever else happens. */
export const KEEP_RECENT_TURNS = 8;

export function transcriptSize(messages: LLMMessage[]): number {
  return messages.reduce((n, m) => n + JSON.stringify(m.content).length, 0);
}

interface Summary {
  compacted_turns: number;
  tools_used: Record<string, number>;
  files_touched: string[];
  commands_run: string[];
  errors: string[];
  assistant_notes: string[];
}

export function shouldCompact(messages: LLMMessage[]): boolean {
  return (
    messages.length > KEEP_RECENT_TURNS + 2 &&
    transcriptSize(messages) > COMPACT_THRESHOLD_CHARS
  );
}

/**
 * Returns a new message list, or the original when compaction would not pay for
 * the cache invalidation it causes.
 */
export function compact(messages: LLMMessage[]): LLMMessage[] {
  if (!shouldCompact(messages)) return messages;

  // The first message is the task context — the goal and the business profile.
  // It is short and it is the thing the model most needs to still be true at
  // turn forty, so it is never compacted.
  const [head, ...rest] = messages;
  const keep = rest.slice(-KEEP_RECENT_TURNS);
  const fold = rest.slice(0, rest.length - KEEP_RECENT_TURNS);
  if (fold.length === 0) return messages;

  const summary = summarise(fold);
  const summaryMessage: LLMMessage = {
    role: 'user',
    content: [
      {
        type: 'text',
        text:
          'Earlier turns have been compacted to save context. Structured summary of what happened:\n\n' +
          '```json\n' +
          JSON.stringify(summary, null, 2) +
          '\n```\n\n' +
          'Every file listed above still exists in the sandbox and can be reread with `file_read`.',
      },
    ],
  };

  const compacted = [head, summaryMessage, ...keep];
  // If the rewrite saves less than a third, the cache miss costs more than the
  // context it frees. Leave it alone and try again once it has grown.
  if (transcriptSize(compacted) > transcriptSize(messages) * 0.67) return messages;
  return compacted;
}

function summarise(messages: LLMMessage[]): Summary {
  const summary: Summary = {
    compacted_turns: messages.length,
    tools_used: {},
    files_touched: [],
    commands_run: [],
    errors: [],
    assistant_notes: [],
  };

  for (const message of messages) {
    if (typeof message.content === 'string') continue;
    for (const block of message.content) {
      if (block.type === 'tool_use') {
        summary.tools_used[block.name] = (summary.tools_used[block.name] ?? 0) + 1;
        const input = block.input as Record<string, unknown> | null;
        const path = input && typeof input.path === 'string' ? input.path : null;
        if (path && !summary.files_touched.includes(path)) summary.files_touched.push(path);
        if (input && typeof input.command === 'string') summary.commands_run.push(input.command);
      } else if (block.type === 'tool_result' && block.is_error) {
        // Failures survive compaction (adopt rule 5). A summary that drops them
        // lets the model rediscover the same dead end twenty turns later.
        summary.errors.push(firstLine(block.content));
      } else if (block.type === 'text' && message.role === 'assistant') {
        const line = firstLine(block.text);
        if (line) summary.assistant_notes.push(line);
      }
    }
  }

  summary.commands_run = summary.commands_run.slice(-20);
  summary.assistant_notes = summary.assistant_notes.slice(-12);
  summary.errors = summary.errors.slice(-12);
  return summary;
}

const firstLine = (s: string) => s.split('\n')[0]?.slice(0, 200) ?? '';
