import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signed marker cookie that proves the bearer just completed a Supabase
 * password-recovery OTP via `/auth/confirm?type=recovery`. The reset-
 * password page checks this cookie before letting the form post to
 * `auth.updateUser({ password })` — without it, any authenticated user
 * (including a hijacked session) could change the account password
 * without re-authenticating.
 *
 * Format: `${userId}.${expiresAtMs}.${hmac}` — HMAC-SHA256 over
 * `${userId}.${expiresAtMs}` keyed by `SUPABASE_SERVICE_ROLE_KEY`.
 * Reusing the service role key as the HMAC seed avoids requiring a
 * dedicated env var; the value is server-only and never leaves the
 * Vercel runtime.
 *
 * Cookie is set HttpOnly + Secure + SameSite=Lax with a 10-minute TTL —
 * long enough for a user to type a new password but short enough that a
 * stale cookie can't be replayed days later.
 *
 * Added in Audit 8 H5.
 */

export const RECOVERY_COOKIE_NAME = "sq-pwr";
export const RECOVERY_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function getKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (required to sign recovery cookie)");
  }
  // Domain-separator so this HMAC cannot be confused with any other use
  // of the service role key (none exist today, but future-proof).
  return Buffer.from(`sq-recovery-cookie-v1:${secret}`);
}

function hmac(input: string): string {
  return createHmac("sha256", getKey()).update(input).digest("hex");
}

export function signRecoveryToken(userId: string): string {
  if (!userId || typeof userId !== "string") {
    throw new Error("signRecoveryToken: userId is required");
  }
  const expiresAtMs = Date.now() + RECOVERY_COOKIE_MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${expiresAtMs}`;
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

/**
 * Verify a recovery cookie value. Returns `{ userId }` on success or
 * `null` on any failure (malformed, expired, signature mismatch).
 *
 * Constant-time signature comparison via `timingSafeEqual`.
 */
export function verifyRecoveryToken(value: string | null | undefined): { userId: string } | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtRaw, sig] = parts;
  if (!userId || !expiresAtRaw || !sig) return null;

  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs)) return null;
  if (expiresAtMs <= Date.now()) return null;

  const expectedSig = hmac(`${userId}.${expiresAtMs}`);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length === 0 || a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { userId };
}
