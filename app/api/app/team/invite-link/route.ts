import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { getPlanSeatLimit } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";

function makeInviteToken() {
  return randomBytes(24).toString("base64url");
}

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    const [{ data: org }, { count: memberCount }, { count: pendingCount }] = await Promise.all([
      admin.from("organizations").select("plan").eq("id", auth.orgId).single(),
      admin
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("org_id", auth.orgId),
      admin
        .from("pending_invites")
        .select("*", { count: "exact", head: true })
        .eq("org_id", auth.orgId)
        .eq("status", "PENDING")
        .gt("expires_at", nowIso)
    ]);

    const maxMembers = getPlanSeatLimit((org?.plan as "SOLO" | "TEAM" | "BUSINESS" | null) ?? "SOLO");
    const occupied = (memberCount ?? 0) + (pendingCount ?? 0);
    if (occupied >= maxMembers) {
      return NextResponse.json(
        {
          error:
            "You've reached your plan's team member limit. Upgrade your plan to add more members."
        },
        { status: 403 }
      );
    }

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
