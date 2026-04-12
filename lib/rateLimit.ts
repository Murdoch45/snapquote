/**
 * Simple in-memory sliding-window rate limiter. Suitable for single-instance
 * serverless deployments (Vercel). Each function invocation shares the same
 * module-level Map for the duration of the lambda warm period.
 *
 * For multi-instance deployments, swap this for a Redis-backed store.
 */

type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();

// Prevent unbounded memory growth — evict stale entries periodically.
const MAX_BUCKETS = 10_000;
let lastPurge = Date.now();

function purgeStale() {
  const now = Date.now();
  if (now - lastPurge < 60_000) return; // purge at most once per minute
  lastPurge = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
  // Hard cap: if still too many, drop oldest
  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS;
    const iter = buckets.keys();
    for (let i = 0; i < excess; i++) {
      const next = iter.next();
      if (next.done) break;
      buckets.delete(next.value);
    }
  }
}

/**
 * Check whether a request identified by `key` is within the allowed limit.
 *
 * @param key    Unique identifier (e.g. IP address, email)
 * @param limit  Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds
 * @returns `true` if the request is allowed, `false` if rate-limited
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  purgeStale();

  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count += 1;
  return true;
}
