/**
 * Content addressing for the image cache (PRD §4, §10).
 *
 * The same logo on 200 pages should be searched once. Keys are the image
 * stream's hash plus every parameter that could change the answer, so a cache
 * hit is always an exact hit — never an approximate one.
 */

/** FNV-1a, 64-bit, as two 32-bit halves. Fast, dependency-free, and we are
 *  deduplicating within one document rather than defending against collisions
 *  from an attacker — `crypto.subtle` is async and this runs per object. */
export function hashBytes(data: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < data.length; i += 1) {
    h1 ^= data[i];
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + Math.imul(data[i] + i, 0x85ebca6b)) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}

export function cacheKey(streamHash: string, params: Record<string, string | number | boolean>): string {
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`);
  return `${streamHash}|${parts.join(",")}`;
}

/** A plain Map wrapper so the call sites read as intent, and so hit rate —
 *  a target in PRD §11 — is measurable rather than guessed at. */
export class ResultCache<T> {
  private readonly store = new Map<string, T>();
  private hits = 0;
  private misses = 0;

  get(key: string): T | undefined {
    const value = this.store.get(key);
    if (value === undefined) this.misses += 1;
    else this.hits += 1;
    return value;
  }

  set(key: string, value: T): void {
    this.store.set(key, value);
  }

  get stats(): { hits: number; misses: number; rate: number } {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, rate: total === 0 ? 0 : this.hits / total };
  }
}
