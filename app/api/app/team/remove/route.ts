import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeTeamSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const body = removeTeamSchema.parse(await request.json());
    if (body.memberUserId === auth.userId) {
      return NextResponse.json(
        { error: "Owner cannot remove themselves." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: member } = await admin
      .from("organization_members")
      .select("role")
      .eq("org_id", auth.orgId)
      .eq("user_id", body.memberUserId)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    if (member.role === "OWNER") {
      return NextResponse.json({ error: "Cannot remove owner." }, { status: 400 });
    }

    const { error } = await admin
      .from("organization_members")
      .delete()
      .eq("org_id", auth.orgId)
      .eq("user_id", body.memberUserId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove member." },
      { status: 400 }
    );
  }
}
