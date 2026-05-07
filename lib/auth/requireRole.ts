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
 * Emit a Sentry message event so that breadcrumbs accumulated during the
 * verify chain (added in `verifyJWT.ts`) are flushed to Sentry. Without
 * this, breadcrumbs are dropped when the route handler returns 401 via
 * `NextResponse.json` (Sentry only delivers breadcrumbs attached to a
 * captured event). The `await Sentry.flush(2000)` is required in Vercel
 * serverless because the lambda freezes after the response — without
 * flush, the event may not transmit before freeze.
 *
 * Diagnostic-only: this captureMessage is meant to be removed (or sampled
 * down aggressively) once we've collected enough data to root-cause the
 * Build 13/14/15 mobile 401s. See
 * `docs/breadcrumb-vs-charles-opinion-2026-05-07.md`.
 */
async function captureAuth401(
  source: "requireMember" | "requireOwner",
  request: Request | undefined,
  bearer: string | null
) {
  const authHeader = request?.headers.get("authorization") ?? null;
  Sentry.captureMessage(`auth.${source} 401`, {
    level: "warning",
    tags: {
      auth_source: source,
      has_bearer: bearer ? "yes" : "no",
      bearer_len_class: bucketBearerLength(bearer?.length)
    },
    extra: {
      bearer_fingerprint: redactBearer(bearer),
      decoded_header: bearer ? safeDecodeHeader(bearer) : null,
      authorization_header_length: authHeader?.length ?? null,
      method: request?.method ?? null,
      url: request?.url ?? null
    }
  });
  // Vercel serverless: flush before responding so the event transmits
  // before lambda freeze.
  try {
    await Sentry.flush(2000);
  } catch {
    // Don't let flush errors block the 401 response.
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
 * (tries ES256 via JWKS first, falls back to HS256 with shared secret).
 * This eliminates the GoTrue replication race that 401-ed mobile builds
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
