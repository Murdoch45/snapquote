import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const acceptInviteSchema = z.object({
  token: z.string().min(12)
});

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = acceptInviteSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: invite } = await admin
      .from("pending_invites")
      .select("id,org_id,role,status,expires_at,used_at")
      .eq("token", body.token)
      .maybeSingle();

    if (!invite || invite.status !== "PENDING" || invite.used_at) {
      return NextResponse.json({ error: "This invite link is no longer valid." }, { status: 400 });
    }

    if (invite.expires_at && new Date(invite.expires_at as string) <= new Date()) {
      return NextResponse.json({ error: "This invite link has expired." }, { status: 400 });
    }

    const { data: existingMembership } = await admin
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (existingMembership) {
      return NextResponse.json(
        { error: "This account is already connected to a SnapQuote workspace." },
        { status: 400 }
      );
    }

    const { error: membershipError } = await admin.from("organization_members").insert({
      org_id: invite.org_id,
      user_id: user.id,
      role: invite.role
    });

    if (membershipError) throw membershipError;

    const { error: updateError } = await admin
      .from("pending_invites")
      .update({
        email: user.email?.toLowerCase() ?? null,
        status: "ACCEPTED",
        used_at: new Date().toISOString()
      })
      .eq("id", invite.id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to accept invite." },
      { status: 400 }
    );
  }
}
