import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * GET /api/app/team/members
 *
 * Returns all organization members with their email addresses. Emails live
 * in auth.users and are only readable via the service_role, so this endpoint
 * exists to give clients (notably the mobile app) a safe way to render team
 * members by email instead of user_id.
 */
export async function GET(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const { data: members, error } = await admin
    .from("organization_members")
    .select("id, org_id, user_id, role, created_at")
    .eq("org_id", auth.orgId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load members." },
      { status: 500 }
    );
  }

  const membersWithEmail = await Promise.all(
    (members ?? []).map(async (member) => {
      const userResult = await admin.auth.admin.getUserById(
        member.user_id as string
      );
      return {
        id: member.id,
        org_id: member.org_id,
        user_id: member.user_id,
        role: member.role,
        created_at: member.created_at,
        user_email: userResult.data.user?.email ?? null
      };
    })
  );

  return NextResponse.json({ members: membersWithEmail });
}
