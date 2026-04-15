import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteExpiredPendingInvites } from "@/lib/teamInvites";
import { getAppUrl } from "@/lib/utils";
import { inviteTeamSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;
  try {
    const body = inviteTeamSchema.parse(await request.json());
    const admin = createAdminClient();
    await deleteExpiredPendingInvites(admin, auth.orgId);

    const { data: existingInvite } = await admin
      .from("pending_invites")
      .select("id")
      .eq("org_id", auth.orgId)
      .eq("email", body.email.toLowerCase())
      .eq("status", "PENDING")
      .maybeSingle();

    if (!existingInvite) {
      const { error: inviteError } = await admin.from("pending_invites").insert({
        org_id: auth.orgId,
        email: body.email.toLowerCase(),
        role: "MEMBER",
        status: "PENDING",
        invited_by: auth.userId
      });
      if (inviteError) throw inviteError;
    }

    await admin.auth.admin.inviteUserByEmail(body.email, {
      redirectTo: `${getAppUrl()}/login`
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to invite member." },
      { status: 400 }
    );
  }
}
