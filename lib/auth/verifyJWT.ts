import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Local JWT verification for Supabase access tokens — replaces
 * `auth.getUser()` (which round-trips to GoTrue and races against its read
 * replicas, returning null for tokens issued <~50 ms ago and 401-ing the
 * caller). Covers BOTH algorithms because this Supabase project is mid-
 * migration from HS256 (legacy shared secret) to ES256 (asymmetric, JWKS).
 *
 * Behavior:
 *   1. Try ES256 verification first via the project's JWKS endpoint —
 *      handles all newly-issued tokens.
 *   2. Fall back to HS256 verification with `SUPABASE_JWT_SECRET` —
 *      covers tokens issued before the rotation that are still inside
 *      their exp window (≈1h) and any service-role/anon JWT-based API
 *      keys still HS256-signed by Supabase.
 *   3. Return null if both fail (caller responds 401). Never throws.
 *
 * Audience: Supabase issues user-session tokens with `aud=authenticated`.
 * No `iss` validation here because the JWKS path implicitly trusts only
 * keys served by the project's auth endpoint, and the HS256 fallback
 * trusts only tokens signed with our shared secret. Tightening to an
 * explicit `iss` check is a follow-up if needed.
 *
 * See `docs/auth-jwt-direct-refactor-plan-2026-05-06.md` for context and
 * the original audit.
 */

type SupabaseJwtClaims = JWTPayload & {
  sub?: string;
  email?: string;
  role?: string;
  aud?: string | string[];
};

export type VerifiedJwt = {
  userId: string;
  email: string | null;
};

const SUPABASE_AUDIENCE = "authenticated";

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (cachedJwks) return cachedJwks;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  const jwksUrl = new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
  cachedJwks = createRemoteJWKSet(jwksUrl, {
    // Cache for 10 minutes — Supabase rotates signing keys infrequently
    // and a stale cache during a rotation just falls through to the
    // HS256 path or 401s briefly. Refetched on cooldown miss.
    cacheMaxAge: 10 * 60 * 1000,
    cooldownDuration: 30 * 1000
  });
  return cachedJwks;
}

let cachedHs256Key: Uint8Array | null = null;
function getHs256Key(): Uint8Array | null {
  if (cachedHs256Key) return cachedHs256Key;
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) return null;
  cachedHs256Key = new TextEncoder().encode(secret);
  return cachedHs256Key;
}

function extractClaims(payload: SupabaseJwtClaims): VerifiedJwt | null {
  if (!payload.sub || typeof payload.sub !== "string") return null;
  return {
    userId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null
  };
}

export async function verifySupabaseJWT(token: string): Promise<VerifiedJwt | null> {
  if (!token || typeof token !== "string") return null;

  // Attempt 1: ES256 via remote JWKS (current/new tokens).
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      audience: SUPABASE_AUDIENCE
    });
    const claims = extractClaims(payload as SupabaseJwtClaims);
    if (claims) return claims;
  } catch {
    // Fall through to HS256 attempt — algorithm mismatch, expired, etc.
  }

  // Attempt 2: HS256 with shared secret (legacy tokens still inside exp window).
  const hs256Key = getHs256Key();
  if (hs256Key) {
    try {
      const { payload } = await jwtVerify(token, hs256Key, {
        audience: SUPABASE_AUDIENCE
      });
      const claims = extractClaims(payload as SupabaseJwtClaims);
      if (claims) return claims;
    } catch {
      // Both algorithms rejected the token — treat as unauthenticated.
    }
  }

  return null;
}
