import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTeamMemberJoinedEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifySupabaseJWT } from "@/lib/auth/verifyJWT";

const acceptInviteSchema = z.object({
  token: z.string().min(12)
});

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(request: Request) {
  try {
    // Accept either a cookie-based session (web) or a Supabase Bearer token
    // (mobile) so both clients can use the same endpoint. Bearer path uses
    // local JWT verification (verifySupabaseJWT) — no GoTrue round-trip,
    // no replication race. See requireRole.ts and the
    // `auth-jwt-direct-refactor-plan-2026-05-06.md` audit for context.
    const bearerToken = getBearerToken(request);
    let userId: string | null = null;
    let userEmail: string | null = null;

    if (bearerToken) {
      const verified = await verifySupabaseJWT(bearerToken);
      if (verified) {
        userId = verified.userId;
        userEmail = verified.email;
      }
    } else {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        userEmail = user.email ?? null;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = acceptInviteSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: acceptedInvite, error: acceptError } = await admin.rpc(
      "accept_invite_token",
      {
        p_token: body.token,
        p_user_id: userId,
        p_user_email: userEmail
      }
    );

    if (acceptError) {
      const message = acceptError.message || "Failed to accept invite.";
      const status =
        message === "This invite link is no longer valid." ||
        message === "This invite link has expired." ||
        message ===
          "This email already has a SnapQuote account. Use a different email address to join this organization." ||
        message.includes("already full")
          ? 400
          : 500;

      return NextResponse.json({ error: message }, { status });
    }

    const invite = Array.isArray(acceptedInvite) ? acceptedInvite[0] : acceptedInvite;

    if (!invite?.org_id) {
      return NextResponse.json({ error: "Failed to accept invite." }, { status: 500 });
    }

    void sendPushToOrg(invite.org_id as string, {
      title: "Team Member Joined",
      body: "A team member accepted your invite.",
      data: { screen: "team" }
    });
    void admin
      .from("notifications")
      .insert({
        org_id: invite.org_id,
        type: "INVITE_ACCEPTED",
        title: "Team Member Joined",
        body: "A team member accepted your invite.",
        screen: "team",
        screen_params: {}
      })
      .then(null, (err: unknown) => console.warn("notification insert failed:", err));

    // Email the org owner that a teammate joined (best-effort).
    void (async () => {
      try {
        const ownerEmail = await getOwnerEmailForOrg(admin, invite.org_id as string);
        if (!ownerEmail) return;
        const inviteeEmail = userEmail ?? "A new teammate";
        const email = buildTeamMemberJoinedEmail({ inviteeEmail });
        await sendEmail({
          to: ownerEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
          sender: "noreply"
        });
      } catch (emailError) {
        console.warn("invite/accept owner email failed:", emailError);
      }
    })();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to accept invite." },
      { status: 400 }
    );
  }
}
