// Grounding. PRD §11.
//
//   query → rewrite → parallel (keyword | vector | graph walk)
//         → permission filter, batched
//         → rerank → dedupe → budget trim
//         → context assembly with stable citation ids
//
// The permission filter runs here, before the model sees anything. That ordering is the
// single most important security property in the system: retrieve broadly and filter at
// render, and every summary, every follow-up, and every "what else is there?" becomes a
// leak with a nice font.

import type { GraphAdapter } from '../adapters/graph.ts';
import type { PolicyAdapter } from '../adapters/policy.ts';
import type { RetrievalAdapter } from '../adapters/retrieval.ts';
import type { Chunk, EntityRef, Principal } from '../adapters/types.ts';
import type { CortexConfig } from '../config/config.ts';
import { span } from '../telemetry/trace.ts';

export interface GroundingRequest {
  question: string;
  principal: Principal;
  runId: string;
  sources: string[];
  graph?: { enabled: boolean; seed: string[]; edgeTypes: string[]; depth: number };
  maxContextTokens: number;
  /** Prior turns, used only to rewrite a short follow-up into a standalone query. */
  history?: string[];
}

/**
 * The retrieval boundary. Addendum C5.
 *
 * The pipeline already filters on permission before context assembly — that is §11.1 and
 * it has been true since M2. What was missing is a check that it *did*, one that runs in
 * every environment including production and fails the run rather than logging.
 *
 * The distinction matters because the filter is correct today and the failure mode is a
 * future edit: someone adds a retrieval leg, or a cache, or a "just this once" path that
 * appends a chunk after the filter has run. This throws on that edit, in the environment
 * where it would otherwise have been a breach.
 *
 * It is a cheap check on purpose — a set membership per chunk — so there is never an
 * argument for switching it off in production, which is the argument that ends with it
 * switched off in production.
 */
export class PermissionBoundaryViolation extends Error {
  readonly refs: EntityRef[];
  constructor(refs: EntityRef[]) {
    super(
      `Retrieval boundary violated: ${refs.length} chunk(s) reached context assembly with no recorded can_read=true for this principal (${refs.slice(0, 5).join(', ')}). ` +
        'This is a Sev-1 class of bug. The run was failed rather than answered.',
    );
    this.name = 'PermissionBoundaryViolation';
    this.refs = refs;
  }
}

export function assertPermissionBoundary(chunks: Chunk[], authorised: ReadonlySet<EntityRef>): void {
  const violations = [...new Set(chunks.map((c) => c.ref))].filter((ref) => !authorised.has(ref));
  if (violations.length) throw new PermissionBoundaryViolation(violations);
}

export interface GroundingResult {
  chunks: Chunk[];
  /** How many candidates the permission filter removed. Surfaced as a §13.4 notice. */
  filteredCount: number;
  rewritten: string;
  tokensUsed: number;
}

/** Cheap and consistent: the same approximation everywhere, so budgets compare. */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

export class GroundingPipeline {
  readonly retrieval: RetrievalAdapter;
  readonly policy: PolicyAdapter;
  readonly graph: GraphAdapter | undefined;
  readonly config: CortexConfig;

  constructor(retrieval: RetrievalAdapter, policy: PolicyAdapter, config: CortexConfig, graph?: GraphAdapter) {
    this.retrieval = retrieval;
    this.policy = policy;
    this.config = config;
    this.graph = graph;
  }

  async run(req: GroundingRequest): Promise<GroundingResult> {
    return span('grounding', req.runId, { sources: req.sources.join(',') }, async (set) => {
      const rewritten = rewrite(req.question, req.history ?? []);
      const k = this.config.grounding.k_initial;

      // Parallel legs. A graph walk that fails must not take the answer down with it:
      // partial grounding beats no answer, and the trace records what was missing.
      const [lexical, graphChunks] = await Promise.all([
        this.retrieval.search({ text: rewritten, sources: req.sources, k }, req.principal),
        this.#graphLeg(req),
      ]);

      const candidates = [...lexical, ...graphChunks];

      // -- the filter. Batched, once, over every candidate ref. ---------------
      const refs = [...new Set(candidates.map((c) => c.ref))];
      const allowed = await this.policy.canRead(req.principal, refs);
      const allowedSet = new Set(refs.filter((_, i) => allowed[i]));
      const permitted = candidates.filter((c) => allowedSet.has(c.ref));
      const filteredCount = candidates.length - permitted.length;

      const ranked = rerank(rewritten, permitted);
      const deduped = dedupe(ranked);

      // The relevance floor. Weak matches are not free: eight loosely related chunks is
      // exactly the input that produces a confident answer to a question the corpus
      // cannot answer. Below the floor, the pipeline returns nothing and the workflow
      // says so.
      //
      // The floor is a judgement about *lexical* relevance, so it is applied to the
      // keyword and vector legs only. A graph neighbour earned its place structurally —
      // it is two hops from something the principal owns — and scoring it against term
      // overlap is a category error. Applying the floor to it uniformly, as this did
      // when the floor was introduced, silently switched the graph leg off: neighbours
      // enter at a flat 0.25 and the floor is 0.30, so only neighbours that *also*
      // matched on terms survived, which is precisely the set the graph was not needed
      // for. The C5 two-hop red-team case is what surfaced it.
      //
      // Graph chunks are therefore admitted past the floor, but only as context around a
      // real hit: if nothing cleared the floor lexically, the question is unanswerable
      // and pulling in the principal's neighbourhood would manufacture an answer out of
      // whatever they happen to own.
      const scored = deduped.filter((c) => c.via !== 'graph');
      const top = scored[0]?.score ?? 0;
      const floor = Math.max(this.config.grounding.min_score, top * this.config.grounding.min_score_ratio);
      const cleared = scored.filter((c) => c.score >= floor);
      const neighbours = cleared.length > 0 ? deduped.filter((c) => c.via === 'graph') : [];
      const relevant = [...cleared, ...neighbours].sort((a, b) => b.score - a.score);

      // -- budget trim + stable citation ids ----------------------------------
      const budget = Math.min(req.maxContextTokens, this.config.grounding.max_context_tokens);
      const chunks: Chunk[] = [];
      let tokensUsed = 0;
      for (const c of relevant.slice(0, this.config.grounding.k_final)) {
        const cost = estimateTokens(c.text) + 24; // the wrapper tags cost tokens too
        if (tokensUsed + cost > budget) break;
        tokensUsed += cost;
        chunks.push({ ...c, sourceId: `s${chunks.length + 1}` });
      }

      // Last thing before the chunks leave this function and become model context.
      // `allowedSet` is the only record of a positive answer from PolicyAdapter.canRead
      // in this run; anything not in it has no business being here.
      assertPermissionBoundary(chunks, allowedSet);

      set({ retrieval_k: candidates.length, kept: chunks.length, filtered: filteredCount, below_floor: deduped.length - relevant.length, tokens: tokensUsed });
      return { chunks, filteredCount, rewritten, tokensUsed };
    });
  }

  async #graphLeg(req: GroundingRequest): Promise<Chunk[]> {
    if (!this.graph || !req.graph?.enabled) return [];
    try {
      const seeds = await this.#resolveSeeds(req);
      const found: EntityRef[] = [];
      for (const seed of seeds) {
        const sub = await this.graph.neighbors(seed, req.graph.edgeTypes, req.graph.depth);
        found.push(...sub.nodes);
      }
      const docs = await this.retrieval.fetch([...new Set(found)].slice(0, 12), req.principal);
      return docs.map((d) => ({
        sourceId: '',
        ref: d.ref,
        title: d.title,
        text: d.body.split(/\n{2,}/)[0],
        // Below the lexical legs by default: a neighbour is context, not an answer,
        // and it should only win when nothing was retrieved directly.
        score: 0.25,
        via: 'graph' as const,
      }));
    } catch {
      return [];
    }
  }

  async #resolveSeeds(req: GroundingRequest): Promise<EntityRef[]> {
    const seeds: EntityRef[] = [];
    for (const seed of req.graph?.seed ?? []) {
      if (seed === 'principal.self') seeds.push(`person:${req.principal.id}`);
      else if (seed.startsWith('mention:')) {
        const hits = (await this.graph?.resolveMention(req.question, seed.slice('mention:'.length))) ?? [];
        seeds.push(...hits.slice(0, 3));
      } else seeds.push(seed);
    }
    return seeds;
  }
}

/**
 * §11.1's rewrite step. The PRD assumes a model call here; this is deterministic —
 * a short follow-up ("and his manager?") inherits the nouns from the previous turn.
 * It costs nothing and cannot hallucinate a new query, and it is plainly weaker than a
 * model would be at reformulating. Swap in `router.text('fast.cheap', …)` when a real
 * model is configured and the eval set says it helps.
 */
export function rewrite(question: string, history: string[]): string {
  const words = question.split(/\s+/).filter(Boolean);
  const isFollowUp = words.length <= 6 || /^(and|what about|who else|why|how about)\b/i.test(question.trim());
  if (!isFollowUp || history.length === 0) return question;
  const prior = history[history.length - 1];
  const nouns = prior.split(/\s+/).filter((w) => /^[A-Z][a-z]{2,}|[a-z]{5,}/.test(w)).slice(0, 8);
  return `${question} (context: ${nouns.join(' ')})`;
}

/**
 * §11.1's rerank step. The PRD wants a cross-encoder or a `fast.cheap` model; this is
 * coverage-plus-diversity, which is deterministic and keeps evals stable. The seam is
 * here: replace this function, keep everything around it.
 */
export function rerank(query: string, chunks: Chunk[]): Chunk[] {
  const q = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const seenRefs = new Map<EntityRef, number>();
  return [...chunks]
    .map((c) => {
      const t = c.text.toLowerCase().split(/[^a-z0-9]+/);
      const coverage = [...q].filter((w) => t.includes(w)).length / Math.max(q.size, 1);
      return { ...c, score: c.score * 0.6 + coverage * 0.4 };
    })
    .sort((a, b) => b.score - a.score)
    .map((c) => {
      // Diversity: the third chunk from one document is worth less than the first from
      // another, or one long document crowds out the answer.
      const seen = seenRefs.get(c.ref) ?? 0;
      seenRefs.set(c.ref, seen + 1);
      return { ...c, score: c.score * (seen === 0 ? 1 : seen === 1 ? 0.6 : 0.3) };
    })
    .sort((a, b) => b.score - a.score);
}

export function dedupe(chunks: Chunk[]): Chunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = `${c.ref}::${c.text.slice(0, 80).toLowerCase().replace(/\s+/g, ' ')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
