// Generative UI. PRD §13.3 — the model emits typed blocks that map to host components,
// not prose lists of records.
//
// Blocks arrive inside a token stream, so they are parsed incrementally: a line that
// starts with `{"type":` is held back until it completes, then emitted as a block. A
// line that never completes (the model stopped mid-JSON) is emitted as text rather than
// swallowed — losing the sentence is worse than showing a stray brace.

import type { Block } from '../adapters/types.ts';

const KNOWN: Block['type'][] = ['text', 'entity_card', 'diff_proposal', 'skill_call', 'choice'];

export type ParsedPiece = { kind: 'text'; text: string } | { kind: 'block'; block: Block };

export class BlockStreamParser {
  #buffer = '';

  /** Feed a chunk; get back whatever became complete. */
  push(chunk: string): ParsedPiece[] {
    this.#buffer += chunk;
    const out: ParsedPiece[] = [];

    for (;;) {
      const nl = this.#buffer.indexOf('\n');
      if (nl < 0) break;
      const line = this.#buffer.slice(0, nl);
      this.#buffer = this.#buffer.slice(nl + 1);
      const piece = classify(line);
      if (piece) out.push(piece);
      else if (line.trim()) out.push({ kind: 'text', text: line + '\n' });
    }

    // Emit plain text eagerly so the UI streams; hold anything that looks like the
    // start of a block until its line ends.
    if (!this.#buffer.trimStart().startsWith('{') && this.#buffer.length > 0) {
      out.push({ kind: 'text', text: this.#buffer });
      this.#buffer = '';
    }
    return out;
  }

  /** Call once the stream ends. */
  flush(): ParsedPiece[] {
    if (!this.#buffer.trim()) {
      this.#buffer = '';
      return [];
    }
    const piece = classify(this.#buffer);
    const rest = piece ?? { kind: 'text' as const, text: this.#buffer };
    this.#buffer = '';
    return [rest];
  }
}

function classify(line: string): ParsedPiece | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as { type?: string };
    // §13.3 — an unregistered block type degrades to text. Never crash on one.
    if (!parsed.type || !KNOWN.includes(parsed.type as Block['type'])) {
      return { kind: 'text', text: line };
    }
    return { kind: 'block', block: parsed as Block };
  } catch {
    return null; // incomplete — the caller keeps buffering
  }
}
