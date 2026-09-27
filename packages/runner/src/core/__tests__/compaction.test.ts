import { describe, expect, it } from 'vitest';

import { compact, shouldCompact, transcriptSize, KEEP_RECENT_TURNS } from '../agent/compaction.ts';
import type { LLMMessage } from '../providers/interfaces.ts';

const bulk = (n: number) => 'x'.repeat(n);

function transcript(turns: number, bytesPerTurn: number): LLMMessage[] {
  const messages: LLMMessage[] = [{ role: 'user', content: 'the original goal' }];
  for (let i = 0; i < turns; i += 1) {
    messages.push({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: `c${i}`, name: 'file_write', input: { path: `file${i}.txt` } },
      ],
    });
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: `c${i}`, content: bulk(bytesPerTurn) }],
    });
  }
  return messages;
}

describe('compaction', () => {
  it('leaves a short transcript alone', () => {
    const messages = transcript(3, 100);
    expect(shouldCompact(messages)).toBe(false);
    expect(compact(messages)).toBe(messages);
  });

  it('folds the old turns once the transcript is large', () => {
    const messages = transcript(40, 10_000);
    const compacted = compact(messages);
    expect(compacted).not.toBe(messages);
    expect(transcriptSize(compacted)).toBeLessThan(transcriptSize(messages));
  });

  it('never compacts the first message, which carries the goal', () => {
    const messages = transcript(40, 10_000);
    expect(compact(messages)[0]).toBe(messages[0]);
  });

  it('keeps the most recent turns verbatim', () => {
    const messages = transcript(40, 10_000);
    const compacted = compact(messages);
    const tail = messages.slice(-KEEP_RECENT_TURNS);
    expect(compacted.slice(-KEEP_RECENT_TURNS)).toEqual(tail);
  });

  it('records the paths it folded away, so they can be reread', () => {
    const messages = transcript(40, 10_000);
    const summary = JSON.stringify(compact(messages)[1].content);
    expect(summary).toContain('file0.txt');
    expect(summary).toContain('files_touched');
  });

  it('carries failures through the fold', () => {
    // PRD section 6.1, adopt 5. A summary that drops errors lets the model walk
    // into the same dead end again twenty turns later.
    const messages = transcript(40, 10_000);
    messages.splice(3, 0, {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'x',
          content: 'ModuleNotFoundError: no module named pandas',
          is_error: true,
        },
      ],
    });
    const summary = JSON.stringify(compact(messages)[1].content);
    expect(summary).toContain('ModuleNotFoundError');
  });

  it('skips a fold that would not pay for the cache miss it causes', () => {
    // All the weight in the recent turns: folding the head reclaims almost
    // nothing, and the invalidated prefix costs more than it saves.
    const messages: LLMMessage[] = [
      { role: 'user', content: 'goal' },
      ...Array.from({ length: 4 }, (): LLMMessage => ({ role: 'assistant', content: 'short' })),
      ...Array.from(
        { length: KEEP_RECENT_TURNS },
        (): LLMMessage => ({ role: 'user', content: bulk(60_000) }),
      ),
    ];
    expect(compact(messages)).toBe(messages);
  });
});
