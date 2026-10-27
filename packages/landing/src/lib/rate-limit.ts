/**
 * In-memory token bucket, keyed by caller (IP).
 *
 * Good enough for v1 on one long-lived server. On Vercel each function instance
 * keeps its own map and instances come and go, so the effective limit is looser
 * than it reads: a determined client can land on several cold instances.
 *
 * TODO: move to Upstash Redis (@upstash/ratelimit, slidingWindow(5, '1 m')) so
 * the limit is shared across instances. Keep this signature and swap the body.
 */

const CAPACITY = 5;
const REFILL_PER_MS = CAPACITY / 60_000; // 5 tokens a minute
const MAX_KEYS = 10_000;

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

export function takeToken(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: CAPACITY, updatedAt: now };
  const refilled = Math.min(CAPACITY, bucket.tokens + (now - bucket.updatedAt) * REFILL_PER_MS);

  if (refilled < 1) {
    buckets.set(key, { tokens: refilled, updatedAt: now });
    return false;
  }

  // Map iteration order is insertion order, so deleting and re-setting keeps the
  // most recent callers at the end and lets the oldest fall off first.
  buckets.delete(key);
  buckets.set(key, { tokens: refilled - 1, updatedAt: now });
  if (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value!);
  return true;
}
