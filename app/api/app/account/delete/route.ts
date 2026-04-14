import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/auditLog";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/notify";
import { buildAccountDeletedEmail } from "@/lib/emailTemplates";

export async function POST(request: Request) {
  const auth = await requireMemberForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();

    // 1. Look up the user's email for audit + confirmation email
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(auth.userId);
    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Unable to retrieve user." },
        { status: 500 }
      );
    }
    const userEmail = userData.user.email;

    if (auth.role === "OWNER") {
      // Owner deletion: tear down the whole organization.
      const { data: subscription } = await admin
        .from("subscriptions")
        .select("id, stripe_subscription_id")
        .eq("user_id", auth.userId)
        .eq("status", "active")
        .maybeSingle();

      if (subscription?.stripe_subscription_id) {
        const stripe = getStripe();
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
      }

      await admin.from("push_tokens").delete().eq("org_id", auth.orgId);

      // Audit log BEFORE the org cascade-delete (after which audit_log rows
      // for that org would also be cascade-deleted). We log to a separate
      // record-keeping note in metadata; the org row itself is gone after
      // step 4 so the FK cascade will clean up the audit row too — but the
      // log line in our server logs survives forever.
      await recordAudit(admin, {
        orgId: auth.orgId,
        action: "account.deleted",
        actorUserId: auth.userId,
        actorEmail: userEmail ?? null,
        metadata: {
          had_active_subscription: Boolean(subscription?.stripe_subscription_id)
        }
      });

      const { error: orgDeleteError } = await admin
        .from("organizations")
        .delete()
        .eq("id", auth.orgId);

      if (orgDeleteError) {
        return NextResponse.json(
          { error: "Failed to delete organization." },
          { status: 500 }
        );
      }
    } else {
      // Member self-removal: keep the org intact, remove this user only.
      await admin
        .from("push_tokens")
        .delete()
        .eq("user_id", auth.userId);

      await recordAudit(admin, {
        orgId: auth.orgId,
        action: "member.self_removed",
        actorUserId: auth.userId,
        actorEmail: userEmail ?? null
      });

      const { error: membershipDeleteError } = await admin
        .from("organization_members")
        .delete()
        .eq("org_id", auth.orgId)
        .eq("user_id", auth.userId);

      if (membershipDeleteError) {
        return NextResponse.json(
          { error: "Failed to remove membership." },
          { status: 500 }
        );
      }
    }

    // Send deletion confirmation email (best-effort)
    if (userEmail) {
      try {
        const email = buildAccountDeletedEmail();
        await sendEmail({
          to: userEmail,
          subject: email.subject,
          html: email.html,
          text: email.text,
          sender: "noreply",
        });
      } catch {
        // Best-effort: don't block deletion if email fails
      }
    }

    // Finally, delete the auth user. This revokes all active sessions for
    // both owner and member flows.
    const { error: deleteUserError } =
      await admin.auth.admin.deleteUser(auth.userId);

    if (deleteUserError) {
      return NextResponse.json(
        { error: "Account data deleted but failed to remove auth user." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete account.",
      },
      { status: 500 }
    );
  }
}
