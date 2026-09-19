// The local embedder. docs/DECISIONS.md D-3 — a stand-in for a real model, not a result.
//
// Character 4-gram hashing into a fixed-width vector. It behaves like a weak semantic
// search: "who owns onboarding" finds a document about onboarding ownership, and it is
// deterministic, which is what keeps eval cases from flaking. It does not understand
// synonyms and should not be quoted as retrieval quality.

import type { Provider } from '../types.ts';

const DIM = 256;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function embedText(text: string): Float32Array {
  const v = new Float32Array(DIM);
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  for (let i = 0; i + 4 <= t.length; i++) v[hash(t.slice(i, i + 4)) % DIM] += 1;
  // Whole words too, so a rare exact term outweighs the n-gram mush around it.
  for (const w of t.split(' ')) if (w.length > 2) v[hash('w:' + w) % DIM] += 2;
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export const localProvider: Provider = {
  name: 'local',
  available: () => true,
  async *complete() {
    throw new Error('local provider does embeddings only');
  },
  usage: () => ({ tokensIn: 0, tokensOut: 0, costUsd: 0, modelId: 'lexical-hash-v1', provider: 'local', dataHandling: 'local' }),
  async embed(_model, texts) {
    return texts.map(embedText);
  },
  countTokens: (messages) => Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4),
  price: () => 0,
  retentionPosture: 'local',
  // Nothing leaves the process, so every residency and no-training requirement is
  // satisfied by construction. This is the only provider that can say that honestly.
  assertCanHonour: () => undefined,
};
