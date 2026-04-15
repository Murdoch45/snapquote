import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const { data: invites, error } = await admin
    .from("pending_invites")
    .select("id, org_id, email, role, status, invited_by, expires_at, used_at, created_at, updated_at")
    .eq("org_id", auth.orgId)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to load invites." },
      { status: 500 }
    );
  }

  return NextResponse.json({ invites: invites ?? [] });
}
