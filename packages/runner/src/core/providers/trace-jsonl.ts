/**
 * Tracing, Phase 0 style: one JSON object per line under `.runner/traces/`.
 *
 * PRD section 6.8 calls observability non-negotiable from Phase 0, and it is
 * right — a loop you cannot see is a loop you cannot improve. It also names
 * Langfuse, which needs an account nobody has authorised yet. A JSONL file gives
 * the same three things Phase 0 actually needs (every LLM call, every tool call,
 * cost and latency per task) with nothing to sign up for, and `TraceSink` keeps
 * the swap to one line in the registry.
 *
 * What this does not give you: the UI, the eval runner, and prompt versioning.
 * Those are the reason to move to Langfuse, and they should arrive with Phase 1's
 * eval gate rather than after it.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { TraceEvent, TraceSink } from './interfaces.ts';

export class JsonlTraceSink implements TraceSink {
  readonly name = 'jsonl';
  private buffer: string[] = [];
  private readonly file: string;

  constructor(dir = path.join(process.cwd(), '.runner', 'traces')) {
    const day = new Date().toISOString().slice(0, 10);
    this.file = path.join(dir, `${day}.jsonl`);
  }

  async record(event: TraceEvent): Promise<void> {
    this.buffer.push(JSON.stringify(event));
    // Small buffer, flushed often. A crash should cost at most a step of
    // history, because the failed step is usually the one worth reading.
    if (this.buffer.length >= 8) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.join('\n') + '\n';
    this.buffer = [];
    await mkdir(path.dirname(this.file), { recursive: true });
    await appendFile(this.file, lines, 'utf8');
  }
}

/** Sinks nothing. For unit tests that do not care about traces. */
export class NullTraceSink implements TraceSink {
  readonly name = 'null';
  async record(): Promise<void> {}
  async flush(): Promise<void> {}
}
