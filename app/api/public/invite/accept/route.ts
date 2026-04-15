import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTeamMemberJoinedEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createServerSupabaseClient,
  createSupabaseClientFromToken
} from "@/lib/supabase/server";

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
    // (mobile) so both clients can use the same endpoint.
    const bearerToken = getBearerToken(request);
    const supabase = bearerToken
      ? createSupabaseClientFromToken(bearerToken)
      : await createServerSupabaseClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = acceptInviteSchema.parse(await request.json());
    const admin = createAdminClient();

    const { data: acceptedInvite, error: acceptError } = await admin.rpc(
      "accept_invite_token",
      {
        p_token: body.token,
        p_user_id: user.id,
        p_user_email: user.email ?? null
      }
    );

    if (acceptError) {
      const message = acceptError.message || "Failed to accept invite.";
      const status =
        message === "This invite link is no longer valid." ||
        message === "This invite link has expired." ||
        message === "This account is already connected to a SnapQuote workspace." ||
        message.includes("team member limit")
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
        const inviteeEmail = user.email ?? "A new teammate";
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
