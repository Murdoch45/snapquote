/**
 * Distributed sliding-window rate limiter.
 *
 * Backed by Upstash Redis when `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set (production / preview on Vercel),
 * falls back to an in-memory `Map` when those env vars are absent (local
 * dev, tests).
 *
 * Why this matters: Vercel runs each route on N hot lambda instances.
 * Pre-Audit-8 the limiter was a per-instance `Map` — effective rate
 * limit was `limit × instance_count`, defeating the purpose. (Audit 8 H9.)
 *
 * Provisioning: Murdoch must create the Upstash instance and add
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to Vercel for
 * Production / Preview / Development environments before the distributed
 * path takes effect. Until then the in-memory fallback runs — same
 * effectiveness as the pre-audit limiter (so this change is safe to ship
 * without the env vars in place).
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();
const MAX_BUCKETS = 10_000;
let lastPurge = Date.now();

function purgeStale() {
  const now = Date.now();
  if (now - lastPurge < 60_000) return;
  lastPurge = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
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

function inMemoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  purgeStale();
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

// Cache one Ratelimit instance per (limit, windowMs) tuple so we don't
// rebuild the limiter on every request.
const limiterCache = new Map<string, Ratelimit>();
function getLimiter(limit: number, windowMs: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `${limit}:${windowMs}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
    prefix: "snapquote:rl",
    analytics: false
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

/**
 * Check whether a request identified by `key` is within the allowed limit.
 *
 * Resolves to `true` if allowed, `false` if rate-limited. Uses Upstash
 * Redis when configured; falls back to in-memory if env vars are missing
 * or the Redis call errors (we'd rather degrade rate-limit guarantees
 * than 5xx the user).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const limiter = getLimiter(limit, windowMs);
  if (limiter) {
    try {
      const res = await limiter.limit(key);
      return res.success;
    } catch (err) {
      console.warn("[rateLimit] Upstash error, falling back to in-memory:", err);
    }
  }
  return inMemoryRateLimit(key, limit, windowMs);
}
