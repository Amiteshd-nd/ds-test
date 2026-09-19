// A working RetrievalAdapter for hosts that have no search backend. The PRD's stand-in
// is `PgVectorRetrieval`; this is the same idea one rung down (docs/DECISIONS.md D-3):
// BM25-ish keyword scoring, plus cosine over the local hash embedder, fused.
//
// It is a default, not a recommendation. A host with a search engine should wrap that
// instead — this one holds every document in memory.

import type { RetrievalAdapter } from '../adapters/retrieval.ts';
import type { Chunk, Document, EntityRef, Principal, Query } from '../adapters/types.ts';
import { cosine, embedText } from '../router/providers/local.ts';

interface Indexed {
  doc: Document;
  /** Documents are chunked on paragraph breaks — the smallest span worth citing. */
  chunks: { text: string; terms: string[]; vec: Float32Array }[];
}

const STOP = new Set('the a an of to in for on and or is are was were with by from at as that this it'.split(' '));
const tokens = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

export class LocalRetrieval implements RetrievalAdapter {
  #docs = new Map<EntityRef, Indexed>();
  #df = new Map<string, number>();
  #avgLen = 1;

  constructor(documents: Document[]) {
    for (const doc of documents) this.#index(doc);
    this.#recomputeStats();
  }

  /**
   * Re-index one document. A host whose content changes — someone accepts an inline edit
   * — must not keep answering from the version before it, and rebuilding the whole index
   * for one paragraph is the kind of thing that works in a fixture and never in a host.
   */
  upsert(doc: Document): void {
    this.#index(doc);
    this.#recomputeStats();
  }

  #index(doc: Document): void {
    const paras = doc.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const chunks = (paras.length ? paras : [doc.body]).map((text) => ({
      text,
      terms: tokens(`${doc.title} ${text}`),
      vec: embedText(`${doc.title}. ${text}`),
    }));
    this.#docs.set(doc.ref, { doc, chunks });
  }

  #recomputeStats(): void {
    this.#df = new Map();
    let total = 0;
    let n = 0;
    for (const { chunks } of this.#docs.values()) {
      for (const c of chunks) {
        total += c.terms.length;
        n++;
        for (const t of new Set(c.terms)) this.#df.set(t, (this.#df.get(t) ?? 0) + 1);
      }
    }
    this.#avgLen = n ? total / n : 1;
    this.#chunkCount = n;
  }

  #chunkCount = 0;

  async search(q: Query, principal: Principal): Promise<Chunk[]> {
    void principal; // This host cannot push ACLs into the index; §11.1 filters after.
    const qTerms = tokens(q.text);
    const qVec = embedText(q.text);
    const out: Chunk[] = [];

    for (const { doc, chunks } of this.#docs.values()) {
      if (q.sources?.length && !q.sources.includes(doc.type)) continue;
      chunks.forEach((c, i) => {
        const bm25 = this.#bm25(qTerms, c.terms);
        const vec = cosine(qVec, c.vec);
        // Fusion weight chosen so an exact term match outranks a vague semantic one:
        // with a hash embedder the vector leg is the weaker signal and should not lead.
        const score = bm25 * 0.7 + vec * 0.3;
        if (score <= 0) return;
        out.push({
          sourceId: '', // assigned by the pipeline, which owns citation stability
          ref: doc.ref,
          title: doc.title,
          text: c.text,
          score,
          via: bm25 >= vec ? 'keyword' : 'vector',
        });
        void i;
      });
    }

    out.sort((a, b) => b.score - a.score);
    return out.slice(0, q.k ?? 24);
  }

  async fetch(refs: EntityRef[], principal: Principal): Promise<Document[]> {
    void principal;
    return refs.map((r) => this.#docs.get(r)?.doc).filter((d): d is Document => Boolean(d));
  }

  #bm25(qTerms: string[], dTerms: string[]): number {
    const k1 = 1.2;
    const b = 0.75;
    const counts = new Map<string, number>();
    for (const t of dTerms) counts.set(t, (counts.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of new Set(qTerms)) {
      const f = counts.get(t);
      if (!f) continue;
      const df = this.#df.get(t) ?? 1;
      const idf = Math.log(1 + (this.#chunkCount - df + 0.5) / (df + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dTerms.length) / this.#avgLen)));
    }
    // Normalised so the fusion weights above mean something stable across corpora.
    return score / (score + 4);
  }
}
