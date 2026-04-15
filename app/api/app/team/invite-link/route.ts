import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteExpiredPendingInvites } from "@/lib/teamInvites";
import { getAppUrl } from "@/lib/utils";

function makeInviteToken() {
  return randomBytes(24).toString("base64url");
}

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    await deleteExpiredPendingInvites(admin, auth.orgId);

    const token = makeInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error } = await admin.from("pending_invites").insert({
      org_id: auth.orgId,
      email: null,
      role: "MEMBER",
      status: "PENDING",
      invited_by: auth.userId,
      token,
      expires_at: expiresAt.toISOString()
    });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      inviteUrl: `${getAppUrl()}/invite/${token}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invite link." },
      { status: 400 }
    );
  }
}
