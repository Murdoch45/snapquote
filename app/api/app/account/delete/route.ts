import { NextResponse } from "next/server";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { sendEmail } from "@/lib/notify";
import { buildAccountDeletedEmail } from "@/lib/emailTemplates";

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();

    // 1. Look up the user's email
    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(auth.userId);
    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Unable to retrieve user." },
        { status: 500 }
      );
    }
    const userEmail = userData.user.email;

    // 2. Check for active Stripe subscription and cancel if exists
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

    // 3. Delete push tokens for the org
    await admin.from("push_tokens").delete().eq("org_id", auth.orgId);

    // 4. Delete the organization (cascades all org data via FK)
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

    // 5. Send deletion confirmation email (best-effort)
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

    // 6. Delete the auth user
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
