// The offline fallback. docs/DECISIONS.md D-8.
//
// This is not a language model and does not pretend to be one. It reads the SOURCES
// block out of the rendered prompt, scores sentences against the question, and streams
// back the best few with their real citation ids and an entity card per source it used.
//
// It exists so that the substrate is demonstrable and evaluable with no API key: the
// eval cases in evals/golden assert on the pipeline — did retrieval respect permissions,
// were the citations real, was the right skill chosen — not on prose quality. Set
// ANTHROPIC_API_KEY and the identical run goes to Claude instead, which is the property
// §8 exists to give you.

import type { CompletionChunk, CompletionRequest, CompletionResult, Provider } from '../types.ts';

interface ParsedSource { sourceId: string; ref: string; title: string; text: string }

const SOURCE_RE = /<untrusted source_id="([^"]+)" title="([^"]*)" ref="([^"]*)">([\s\S]*?)<\/untrusted>/g;

function parse(prompt: string): { sources: ParsedSource[]; question: string } {
  const sources: ParsedSource[] = [];
  for (const m of prompt.matchAll(SOURCE_RE)) {
    sources.push({ sourceId: m[1], title: m[2], ref: m[3], text: m[4].trim() });
  }
  const q = prompt.match(/QUESTION\n([\s\S]*)$/);
  return { sources, question: (q?.[1] ?? '').trim() };
}

const STOP = new Set('the a an of to in for on and or is are was were with by from at as that this it be who what which how when where why do does did can could i we you they'.split(' '));

function terms(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

function sentences(s: string): string[] {
  return s.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 20);
}

/**
 * The offline stand-in for an inline edit.
 *
 * A rewrite is a model's job and this is not a model, so it does the one kind of edit a
 * deterministic function can honestly make: mechanical tightening. Filler words out,
 * a few stock phrases shortened, whitespace collapsed. Nothing is rephrased, nothing is
 * reordered, and no fact can change — which makes it a safe stand-in and a poor editor.
 *
 * It exists so the inline surface can be exercised end to end with no API key: selection
 * in, diff out, accept or reject. Set ANTHROPIC_API_KEY and the same path gets a real
 * rewrite through the same guard and the same diff preview.
 */
const TIGHTENINGS: [RegExp, string][] = [
  [/\bin order to\b/gi, 'to'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin the event that\b/gi, 'if'],
  [/\bis able to\b/gi, 'can'],
  [/\butili[sz]e\b/gi, 'use'],
  [/\b(very|really|quite|actually|basically|simply|just) \b/gi, ''],
];

export function mechanicalEdit(selection: string): string {
  let out = selection;
  for (const [pattern, replacement] of TIGHTENINGS) out = out.replace(pattern, replacement);
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1').trim();
  // Capitalisation can be lost when a leading filler word goes.
  return out.replace(/^([a-z])/, (m) => m.toUpperCase());
}

function parseInline(prompt: string): { selection: string } | null {
  const m = /THE SELECTED PASSAGE\n([\s\S]*?)\n\nWHAT THEY ASKED FOR/.exec(prompt);
  return m ? { selection: m[1].trim() } : null;
}

export function composeAnswer(prompt: string, question: string): string {
  const inline = parseInline(prompt);
  if (inline) return mechanicalEdit(inline.selection);

  const parsed = parse(prompt);
  const q = new Set(terms(question || parsed.question));
  if (parsed.sources.length === 0) {
    return "I don't have anything in the sources I can see that answers that.";
  }

  const scored: { sentence: string; sourceId: string; ref: string; title: string; score: number }[] = [];
  for (const src of parsed.sources) {
    for (const sentence of sentences(src.text)) {
      const t = terms(sentence);
      const overlap = t.filter((w) => q.has(w)).length;
      if (overlap === 0) continue;
      // Favour density over length: a short sentence that is mostly about the question
      // beats a long one that mentions it once.
      scored.push({ sentence, sourceId: src.sourceId, ref: src.ref, title: src.title, score: overlap / Math.sqrt(t.length) });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  // One document can arrive as two chunks with overlapping text, and picking by score
  // alone then quotes the same sentence twice. Real models do not do this; the stand-in
  // should not either, or the demo reads as broken when the pipeline is fine.
  const seen = new Set<string>();
  const picked = scored
    .filter((p) => {
      const key = p.sentence.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  if (picked.length === 0) {
    return "The sources I can see mention those records but none of them answers that directly.";
  }

  const lines = picked.map((p) => `${p.sentence.replace(/\s+/g, ' ')} [^${p.sourceId}]`);
  const refs = [...new Set(picked.map((p) => p.ref))].filter(Boolean).slice(0, 3);
  const cards = refs.map((ref) => {
    const hit = picked.find((p) => p.ref === ref) as (typeof picked)[number];
    return JSON.stringify({ type: 'entity_card', ref, density: 'compact', reason: hit.title.slice(0, 48) });
  });
  return [lines.join(' '), ...cards].join('\n');
}

export function createRehearsalProvider(): Provider {
  let last: Omit<CompletionResult, 'text'> = {
    tokensIn: 0, tokensOut: 0, costUsd: 0, modelId: 'extractive-v1', provider: 'rehearsal', dataHandling: 'local',
  };

  return {
    name: 'rehearsal',
    available: () => true,

    async *complete(model: string, req: CompletionRequest): AsyncIterable<CompletionChunk> {
      const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const user = req.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
      const answer = composeAnswer(system + '\n' + user, user);

      // Streamed in word-sized pieces because every surface downstream — the SSE route,
      // the hooks, the progressive block renderer — has to handle partial text, and a
      // provider that returns one lump would let all of that rot untested.
      const pieces = answer.split(/(\s+)/);
      for (const piece of pieces) {
        if (req.signal?.aborted) return;
        yield { text: piece };
        if (piece.trim()) await new Promise((r) => setTimeout(r, 12));
      }

      last = {
        tokensIn: Math.ceil((system.length + user.length) / 4),
        tokensOut: Math.ceil(answer.length / 4),
        costUsd: 0,
        modelId: model,
        provider: 'rehearsal',
        dataHandling: 'local',
      };
    },

    usage: () => last,
    countTokens: (messages) => Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4),
    price: () => 0,
    retentionPosture: 'local',
    assertCanHonour: () => undefined,
  };
}
