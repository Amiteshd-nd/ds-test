/**
 * The closed loop of PRD §4 — the actual product.
 *
 * Instead of choosing a quality setting we choose a fidelity floor and search
 * for the setting that just barely clears it. A naive binary search costs 6–7
 * encode-and-score cycles per image; the three optimisations from §4 bring the
 * common case to two or three:
 *
 *  - a predictive seed, so the search starts near the answer (`seedQuality`);
 *  - an early exit on free wins, handled by the caller before it gets here —
 *    resolution the page cannot show is not a quality decision;
 *  - a content-addressed cache, also the caller's, so the same logo on 200
 *    pages is searched once.
 *
 * The invariant this function exists to hold: it never returns a candidate that
 * scored below the floor. When nothing clears the floor it returns nothing, and
 * the caller keeps the original stream.
 */

export interface Attempt<T> {
  artifact: T;
  bytes: number;
  score: number;
  quality: number;
}

export interface SearchResult<T> {
  /** Lowest-quality candidate that cleared the floor, or null if none did. */
  best: Attempt<T> | null;
  iterations: number;
}

export interface SearchParams<T> {
  floor: number;
  seed: number;
  min: number;
  max: number;
  /** Stop when the bracket is this narrow — finer steps are below JPEG's own
   *  quantisation granularity and cost a cycle to learn nothing. */
  tolerance?: number;
  maxIterations?: number;
  /** PRD §11 fast mode: take the seed's prediction, verify once, never search. */
  fast?: boolean;
  encode: (quality: number) => Promise<Attempt<T>>;
}

export async function searchQuality<T>(params: SearchParams<T>): Promise<SearchResult<T>> {
  const { floor, min, max, encode } = params;
  const tolerance = params.tolerance ?? 4;
  const maxIterations = params.fast ? 1 : (params.maxIterations ?? 5);
  const seed = clampInt(params.seed, min, max);
  /** How far to step off the seed before falling back to bisection. Sized to
   *  the seed model's typical error: a good prediction lands within one step,
   *  which is what keeps the common case at two or three cycles rather than the
   *  five a bisection from `min` would cost. */
  const step = 8;

  let iterations = 0;
  let best: Attempt<T> | null = null;

  const first = await encode(seed);
  iterations += 1;
  if (first.score >= floor) best = first;

  if (params.fast) {
    // Fast mode still runs the gate — it just does not search. A prediction that
    // missed is rejected here rather than shipped.
    return { best, iterations };
  }

  // `low` is the highest quality known to fail, `high` the lowest known to pass.
  let low = min - 1;
  let high = max + 1;
  let probe: number;

  if (best) {
    high = seed;
    probe = seed - step;
  } else {
    low = seed;
    probe = seed + step;
  }

  while (iterations < maxIterations && high - low > tolerance) {
    const next = clampInt(probe, min, max);
    if (next <= low || next >= high) break;

    const attempt = await encode(next);
    iterations += 1;

    if (attempt.score >= floor) {
      // Keep the smallest passing candidate. Quality and size are not perfectly
      // monotonic, and size is what we owe the user.
      if (!best || attempt.bytes < best.bytes) best = attempt;
      high = next;
      // Still descending on a passing streak: keep stepping until something
      // fails, then bisect the bracket that failure creates.
      probe = low === min - 1 ? next - step : Math.round((low + high) / 2);
    } else {
      low = next;
      probe = high === max + 1 ? next + step : Math.round((low + high) / 2);
    }
  }

  return { best, iterations };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}
