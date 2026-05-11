import "server-only";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import {
  createServerSupabaseClient
} from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  redactBearer,
  safeDecodeHeader,
  verifySupabaseJWT
} from "@/lib/auth/verifyJWT";

/**
 * Bucket bearer length for low-cardinality Sentry tagging. Real Supabase
 * ES256 access tokens are typically ~700-1100 chars. Anything outside
 * that range is a smell worth flagging.
 */
function bucketBearerLength(len: number | undefined | null): string {
  if (typeof len !== "number") return "none";
  if (len < 200) return "short";
  if (len < 600) return "small";
  if (len < 1200) return "expected";
  if (len < 2000) return "long";
  return "huge";
}

/**
 * Record the 401 path for diagnostic purposes.
 *
 * Audit 13 M3 (2026-05-11): the prior implementation called
 * `Sentry.captureMessage` + `Sentry.flush` for every 401, generating 47
 * Sentry events in 14 days — the top issue on the project. 401 is the
 * auth check working correctly, not a crash. Most events were from
 * unauthenticated traffic (`has_bearer: "no"`).
 *
 * New behavior:
 * - Always emit a `Sentry.addBreadcrumb` at level "info" so subsequent
 *   captures in the request lifecycle still see the verify trail.
 * - When the bearer is present-but-rejected (a real auth-state divergence
 *   worth investigating), keep `Sentry.captureMessage` at "warning"
 *   level so it's still searchable. No-bearer 401s never trigger a
 *   captureMessage — they're just unauthenticated traffic.
 *
 * Genuinely unexpected paths (malformed JWT, DB error, identity-resolve
 * throw) propagate up through `onRequestError` and reach Sentry as
 * captureException — those are not affected by this change.
 */
async function captureAuth401(
  source: "requireMember" | "requireOwner",
  request: Request | undefined,
  bearer: string | null
) {
  const authHeader = request?.headers.get("authorization") ?? null;
  const tags = {
    auth_source: source,
    has_bearer: bearer ? "yes" : "no",
    bearer_len_class: bucketBearerLength(bearer?.length)
  } as const;
  const extra = {
    bearer_fingerprint: redactBearer(bearer),
    decoded_header: bearer ? safeDecodeHeader(bearer) : null,
    authorization_header_length: authHeader?.length ?? null,
    method: request?.method ?? null,
    url: request?.url ?? null
  };

  Sentry.addBreadcrumb({
    category: "auth",
    level: "info",
    message: `auth.${source} 401`,
    data: { ...tags, ...extra }
  });

  // Bearer-present-but-rejected: real auth-state divergence (e.g.,
  // expired-but-not-yet-refreshed token, JWKS key rotation lag, signer
  // mismatch). Worth keeping in Sentry at warning level so the team can
  // see the volume and drill in.
  if (bearer) {
    Sentry.captureMessage(`auth.${source} 401 (bearer rejected)`, {
      level: "warning",
      tags,
      extra
    });
    // Vercel serverless: flush before responding so the event transmits
    // before lambda freeze.
    try {
      await Sentry.flush(2000);
    } catch {
      // Don't let flush errors block the 401 response.
    }
  }
}

type ApiAuthFailure = {
  ok: false;
  response: NextResponse;
};

type OwnerApiAuthSuccess = {
  ok: true;
  userId: string;
  // Email from the auth session. Exposed so audit-log writers can record
  // actor_email without a second auth.getUser() round-trip. May be null
  // if the auth user row has no email on file (e.g., OAuth-only accounts
  // before email sync completes).
  userEmail: string | null;
  orgId: string;
};

type MemberApiAuthSuccess = {
  ok: true;
  userId: string;
  userEmail: string | null;
  orgId: string;
  role: "OWNER" | "MEMBER";
};

function getDemoOrgId(): string {
  const demoOrgId = process.env.DEMO_ORG_ID?.trim();

  if (!demoOrgId) {
    throw new Error("Missing DEMO_ORG_ID. Run npm run seed:demo and add DEMO_ORG_ID to .env.local.");
  }

  return demoOrgId;
}

function getBearerToken(request?: Request): string | null {
  const authorization = request?.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

type ResolvedIdentity = {
  userId: string;
  userEmail: string | null;
};

/**
 * Resolve the request's user identity without round-tripping to GoTrue.
 *
 * Bearer path: verify the JWT signature locally via `verifySupabaseJWT`
 * (ES256 via the project's JWKS, audience + issuer pinned). This
 * eliminates the GoTrue replication race that 401-ed mobile builds
 * 13/14/15 on freshly-issued tokens — see
 * `docs/auth-jwt-direct-refactor-plan-2026-05-06.md`.
 *
 * Cookie path: keep the existing `createServerSupabaseClient` +
 * `auth.getUser()` flow. Cookie sessions are server-managed (Next.js SSR
 * pattern) and don't suffer the same race because the access token is
 * minted by the same Next runtime that's about to validate it.
 */
async function resolveIdentity(request?: Request): Promise<ResolvedIdentity | null> {
  const bearer = getBearerToken(request);
  if (bearer) {
    const verified = await verifySupabaseJWT(bearer);
    if (!verified) return null;
    return { userId: verified.userId, userEmail: verified.email };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    userId: user.id,
    userEmail: user.email ?? null
  };
}

type Membership = {
  org_id: string;
  role: "OWNER" | "MEMBER";
  created_at: string;
};

async function loadPrimaryMembership(userId: string): Promise<Membership | null> {
  // Multi-org users: deterministic ordering so the same user always lands
  // on the same org across requests. ORDER BY role DESC puts OWNER ahead
  // of MEMBER (alphabetical 'M' < 'O', so descending = OWNER-first) —
  // important for owner-only API gates so a user who is OWNER of one org
  // and MEMBER of another always resolves to the OWNER org first.
  // created_at ASC is the stable tiebreaker.
  //
  // Uses the admin client because the bearer path no longer instantiates
  // a user-scoped Supabase client. The `.eq("user_id", userId)` filter
  // restricts results to the verified user's own membership rows; RLS
  // would have applied the same filter.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_members")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("role", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    org_id: data.org_id as string,
    role: data.role as "OWNER" | "MEMBER",
    created_at: data.created_at as string
  };
}

export async function requireOwnerForApi(
  request?: Request
): Promise<ApiAuthFailure | OwnerApiAuthSuccess> {
  const identity = await resolveIdentity(request);
  if (!identity) {
    await captureAuth401("requireOwner", request, getBearerToken(request));
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const membership = await loadPrimaryMembership(identity.userId);
  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Membership missing" }, { status: 403 })
    };
  }

  if (membership.role !== "OWNER") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Owner role required" }, { status: 403 })
    };
  }

  if (membership.org_id === getDemoOrgId()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Demo org is read-only." }, { status: 403 })
    };
  }

  return {
    ok: true as const,
    userId: identity.userId,
    userEmail: identity.userEmail,
    orgId: membership.org_id
  };
}

export async function requireMemberForApi(
  request?: Request
): Promise<ApiAuthFailure | MemberApiAuthSuccess> {
  const identity = await resolveIdentity(request);
  if (!identity) {
    await captureAuth401("requireMember", request, getBearerToken(request));
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const membership = await loadPrimaryMembership(identity.userId);
  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Membership missing" }, { status: 403 })
    };
  }

  if (membership.org_id === getDemoOrgId()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Demo org is read-only." }, { status: 403 })
    };
  }

  return {
    ok: true as const,
    userId: identity.userId,
    userEmail: identity.userEmail,
    orgId: membership.org_id,
    role: membership.role
  };
}
