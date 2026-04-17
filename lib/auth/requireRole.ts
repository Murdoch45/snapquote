import "server-only";
import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createSupabaseClientFromToken
} from "@/lib/supabase/server";

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

async function getSupabaseClientForApi(request?: Request) {
  const accessToken = getBearerToken(request);

  if (accessToken) {
    return createSupabaseClientFromToken(accessToken);
  }

  return createServerSupabaseClient();
}

export async function requireOwnerForApi(
  request?: Request
): Promise<ApiAuthFailure | OwnerApiAuthSuccess> {
  const supabase = await getSupabaseClientForApi(request);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

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

  if ((membership.org_id as string) === getDemoOrgId()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Demo org is read-only." }, { status: 403 })
    };
  }

  return {
    ok: true as const,
    userId: user.id,
    userEmail: user.email ?? null,
    orgId: membership.org_id as string
  };
}

export async function requireMemberForApi(
  request?: Request
): Promise<ApiAuthFailure | MemberApiAuthSuccess> {
  const supabase = await getSupabaseClientForApi(request);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Membership missing" }, { status: 403 })
    };
  }

  if ((membership.org_id as string) === getDemoOrgId()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Demo org is read-only." }, { status: 403 })
    };
  }

  return {
    ok: true as const,
    userId: user.id,
    userEmail: user.email ?? null,
    orgId: membership.org_id as string,
    role: membership.role as "OWNER" | "MEMBER"
  };
}
