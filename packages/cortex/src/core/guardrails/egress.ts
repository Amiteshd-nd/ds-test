// The egress guard: §11.2, §14.2, and §14.3 applied *inside* the stream.
//
// The PRD describes these as a response post-processor, and the first implementation
// here was exactly that — verify citations, strip constructed URLs, redact repeated
// injected instructions, mask PII, and store the result. It passed its own tests and was
// useless: by the time the post-processor ran, the tokens had already been streamed to
// the browser and the user had read them. The cleaned copy was what got written to
// memory, which meant the transcript disagreed with the screen.
//
// So the guard sits in the stream. Text is released one completed sentence at a time,
// and a sentence is only released after it has passed every check. The cost is latency
// of one sentence rather than one token; the alternative is a guardrail that cannot
// guard anything a user has already read.

import type { Chunk, NoticeKind } from '../adapters/types.ts';
import type { InjectionFinding } from './injection.ts';
import { redactInjectedInstructions, stripExfiltratingUrls } from './injection.ts';
import { applyPiiPolicy } from './pii.ts';

export interface GuardNotice { kind: NoticeKind; message: string }

export interface GuardOutput {
  /** Cleaned text, safe to emit. */
  text: string;
  notices: GuardNotice[];
}

export interface GuardStats {
  hallucinatedCitations: string[];
  strippedUrls: string[];
  redactedSentences: string[];
  maskedPii: string[];
  /**
   * Share of factual-looking sentences carrying at least one verified citation, or
   * `null` when the question is not applicable — nothing was retrieved, so the answer
   * makes no claims to ground. Reporting 0 there punishes the agent for correctly
   * saying it does not know; reporting 1 inflates the number with refusals.
   */
  groundedRatio: number | null;
  released: string;
}

/**
 * Sentences, with any trailing citation markers attached.
 *
 * The prompt asks for `[^s3]` *after* the full stop, which is where a reader wants it.
 * Splitting on `(?<=[.!?])\s+` therefore tears every citation off the sentence it
 * supports and hands it to the next one — which made grounded_ratio read 0.67 on an
 * answer where all three sentences were cited.
 */
export function segment(text: string): string[] {
  return (text.match(/[^.!?\n]*[.!?]+(?:\s*\[\^[A-Za-z0-9_-]+\])*/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

const SENTENCE_END = /[.!?]["')\]]?\s/;

export class EgressGuard {
  readonly #validSourceIds: Set<string>;
  readonly #findings: InjectionFinding[];
  readonly #contextTerms: string[];

  #buffer = '';
  #released = '';
  #hallucinated: string[] = [];
  #stripped: string[] = [];
  #redacted: string[] = [];
  #masked: string[] = [];

  constructor(chunks: Chunk[], findings: InjectionFinding[], contextTerms: string[]) {
    this.#validSourceIds = new Set(chunks.map((c) => c.sourceId));
    this.#findings = findings;
    this.#contextTerms = contextTerms;
  }

  /** Feed raw model text; get back whatever has cleared every check. */
  push(text: string): GuardOutput {
    this.#buffer += text;
    let out = '';
    const notices = new Map<NoticeKind, string>();

    for (;;) {
      const m = SENTENCE_END.exec(this.#buffer);
      if (!m) break;
      const end = m.index + m[0].length;
      const sentence = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end);
      const cleaned = this.#clean(sentence, notices);
      out += cleaned;
    }

    this.#released += out;
    return { text: out, notices: toNotices(notices) };
  }

  /** Call when the model stream ends; releases the trailing partial sentence. */
  flush(): GuardOutput {
    const notices = new Map<NoticeKind, string>();
    const out = this.#buffer ? this.#clean(this.#buffer, notices) : '';
    this.#buffer = '';
    this.#released += out;
    return { text: out, notices: toNotices(notices) };
  }

  #clean(sentence: string, notices: Map<NoticeKind, string>): string {
    // 1. §11.2 — a citation id that was never retrieved is dropped and counted.
    let text = sentence.replace(/\[\^([A-Za-z0-9_-]+)\]/g, (match, id: string) => {
      if (this.#validSourceIds.has(id)) return match;
      this.#hallucinated.push(id);
      return '';
    });

    // 2. §14.2 — a URL built out of retrieved text and carrying context is not a link,
    //    it is an exfiltration channel.
    const urls = stripExfiltratingUrls(text, this.#contextTerms);
    if (urls.stripped.length) {
      this.#stripped.push(...urls.stripped);
      notices.set('untrusted_content_removed', 'A link in this answer carried parts of your question in its address, so its parameters were removed.');
    }
    text = urls.text;

    // 3. §14.2 — an instruction planted in a document must not be repeated back, even
    //    as a quotation. The whole sentence goes.
    const redacted = redactInjectedInstructions(text, this.#findings);
    if (redacted.removed.length) {
      this.#redacted.push(...redacted.removed);
      notices.set('untrusted_content_removed', 'Part of this answer repeated instructions planted inside a retrieved document, so it was removed before you saw it.');
      return '';
    }

    // 4. §14.3 — PII on egress.
    const pii = applyPiiPolicy(text);
    if (pii.masked.length) this.#masked.push(...pii.masked);
    if (pii.blocked.length) {
      this.#masked.push(...pii.blocked);
      notices.set('untrusted_content_removed', `A sentence was withheld because it contained ${pii.blocked.join(' and ')}.`);
      return '';
    }
    return pii.text;
  }

  stats(): GuardStats {
    const sentences = segment(this.#released).filter((s) => s.length > 30 && !s.startsWith('{'));
    const grounded = sentences.filter((s) => /\[\^[A-Za-z0-9_-]+\]/.test(s)).length;
    return {
      hallucinatedCitations: this.#hallucinated,
      strippedUrls: this.#stripped,
      redactedSentences: this.#redacted,
      maskedPii: this.#masked,
      groundedRatio: this.#validSourceIds.size === 0 ? null : sentences.length ? grounded / sentences.length : null,
      released: this.#released,
    };
  }
}

function toNotices(map: Map<NoticeKind, string>): GuardNotice[] {
  return [...map].map(([kind, message]) => ({ kind, message }));
}
