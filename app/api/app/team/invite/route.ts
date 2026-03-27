import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { getPlanSeatLimit } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";
import { inviteTeamSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const auth = await requireOwnerForApi();
  if (!auth.ok) return auth.response;
  try {
    const body = inviteTeamSchema.parse(await request.json());
    const admin = createAdminClient();

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
    ]);

    const maxMembers = getPlanSeatLimit((org?.plan as "SOLO" | "TEAM" | "BUSINESS" | null) ?? "SOLO");
    const occupied = (memberCount ?? 0) + (pendingCount ?? 0);
    if (occupied >= maxMembers) {
      return NextResponse.json(
        { error: `Plan limit reached (${maxMembers} users). Upgrade to invite more members.` },
        { status: 400 }
      );
    }

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
