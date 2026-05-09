import "server-only";
import { timingSafeEqual } from "crypto";

/**
 * Constant-time bearer/secret comparison. Use for shared-secret checks
 * (CRON_SECRET, INTERNAL_API_SECRET, webhook signing secrets) instead of
 * `===` / `!==` so an attacker cannot recover the secret one byte at a
 * time by measuring response latency.
 *
 * Fails fast on mismatched lengths because `timingSafeEqual` itself
 * throws when the buffers differ in length — leaking the length is a
 * smaller exposure than the byte-by-byte timing oracle a naive `===`
 * would create.
 *
 * Returns false for null/undefined/non-string `received` so callers
 * can pass header values straight through.
 *
 * Added in Audit 8 H3.
 */
export function safeEqualSecret(
  received: string | null | undefined,
  expected: string | undefined
): boolean {
  if (typeof received !== "string" || received.length === 0) return false;
  if (typeof expected !== "string" || expected.length === 0) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Constant-time check that an `Authorization: Bearer <token>` header
 * matches the expected secret. Returns false if the header is missing,
 * malformed, or the token doesn't match.
 *
 * Used by every cron handler in `app/api/cron/*` to gate Vercel's cron
 * invocations.
 */
export function isAuthorizedBearer(
  authHeader: string | null | undefined,
  expected: string | undefined
): boolean {
  if (typeof authHeader !== "string") return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return false;
  return safeEqualSecret(token, expected);
}
