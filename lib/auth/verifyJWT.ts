import "server-only";
import * as Sentry from "@sentry/nextjs";
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload
} from "jose";

/**
 * Local JWT verification for Supabase access tokens — replaces
 * `auth.getUser()` (which round-trips to GoTrue and races against its
 * read replicas, returning null for tokens issued <~50 ms ago and
 * 401-ing the caller).
 *
 * Verifies via ES256 against the project's JWKS endpoint and validates
 * audience + issuer. The legacy HS256 fallback was removed (Audit 8 H1)
 * because Supabase has fully rotated to ES256 — keeping it open meant a
 * leaked `SUPABASE_JWT_SECRET` would let anyone forge any user's tokens
 * with no key rotation cost.
 *
 * Issuer pinning (Audit 8 H2) defends against tokens minted by another
 * Supabase project that happened to use the same audience. Defaults to
 * `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1`; override via
 * `SUPABASE_JWT_ISSUER` if a deployment ever needs to differ.
 *
 * Returns null on any verification failure. Never throws.
 *
 * Observability: every verification path emits Sentry breadcrumbs
 * (category `auth.verifyJWT`) with redacted bearer fingerprint, decoded
 * header, and on-failure jose error code/name. Breadcrumbs alone do NOT
 * reach Sentry — they're only flushed when an event is captured. The
 * 401-return point in `requireRole.ts` calls `Sentry.captureMessage` so
 * the breadcrumb chain is delivered. NEVER log the bearer in full,
 * NEVER log full payload (PII in user_metadata).
 *
 * See `docs/auth-jwt-direct-refactor-plan-2026-05-06.md` for context and
 * the original audit. See `docs/breadcrumb-vs-charles-opinion-2026-05-07.md`
 * for the observability rationale.
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

/**
 * Redact a bearer to a fingerprint suitable for diagnostic logging.
 * Format: `${first8}...${last8} (len=N)`. Never logs the middle, never
 * logs the signature in full. Safe to send to Sentry.
 */
export function redactBearer(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const len = token.length;
  if (len < 24) return `(len=${len}, too short to fingerprint)`;
  return `${token.slice(0, 8)}...${token.slice(-8)} (len=${len})`;
}

/**
 * Decode the JWT protected header without verification. Returns just the
 * fields useful for diagnostics (`alg`, `kid`, `typ`). Defensive — never
 * throws.
 */
export function safeDecodeHeader(
  token: string | null | undefined
): { alg?: string; kid?: string; typ?: string } | null {
  if (!token || typeof token !== "string") return null;
  try {
    const header = decodeProtectedHeader(token);
    return {
      alg: typeof header.alg === "string" ? header.alg : undefined,
      kid: typeof header.kid === "string" ? header.kid : undefined,
      typ: typeof header.typ === "string" ? header.typ : undefined
    };
  } catch {
    return null;
  }
}

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
    // and a stale cache during a rotation just briefly 401s. Refetched
    // on cooldown miss.
    cacheMaxAge: 10 * 60 * 1000,
    cooldownDuration: 30 * 1000
  });
  return cachedJwks;
}

let cachedIssuer: string | null = null;
function getExpectedIssuer(): string {
  if (cachedIssuer) return cachedIssuer;
  const explicit = process.env.SUPABASE_JWT_ISSUER?.trim().replace(/\/+$/, "");
  if (explicit) {
    cachedIssuer = explicit;
    return cachedIssuer;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  cachedIssuer = `${supabaseUrl}/auth/v1`;
  return cachedIssuer;
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

  // Diagnostic: log the verify attempt with bearer fingerprint + decoded
  // header. Stays in scope until an event is captured (see requireRole.ts).
  Sentry.addBreadcrumb({
    category: "auth.verifyJWT",
    level: "info",
    message: "verify start",
    data: {
      bearer: redactBearer(token),
      header: safeDecodeHeader(token)
    }
  });

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      audience: SUPABASE_AUDIENCE,
      issuer: getExpectedIssuer()
    });
    const claims = extractClaims(payload as SupabaseJwtClaims);
    if (claims) {
      Sentry.addBreadcrumb({
        category: "auth.verifyJWT",
        level: "info",
        message: "ES256 verified",
        data: {
          // Allowlisted claims only. NEVER log sub (UUID), email,
          // user_metadata, or app_metadata.
          aud: payload.aud,
          iss: typeof payload.iss === "string" ? payload.iss : undefined,
          exp: payload.exp,
          iat: payload.iat
        }
      });
      return claims;
    }
    Sentry.addBreadcrumb({
      category: "auth.verifyJWT",
      level: "warning",
      message: "ES256 verified but extractClaims returned null (missing sub)"
    });
  } catch (e) {
    Sentry.addBreadcrumb({
      category: "auth.verifyJWT",
      level: "warning",
      message: "ES256 path failed",
      data: {
        error_code: (e as { code?: string })?.code,
        error_name: (e as { name?: string })?.name,
        error_message:
          typeof (e as { message?: string })?.message === "string"
            ? (e as { message: string }).message.slice(0, 200)
            : undefined
      }
    });
  }

  Sentry.addBreadcrumb({
    category: "auth.verifyJWT",
    level: "warning",
    message: "verify returned null"
  });
  return null;
}
