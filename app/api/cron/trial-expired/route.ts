import { NextResponse } from "next/server";
import { buildTrialExpiredEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cron — finds orgs whose trial has ended in the past 24 hours and
 * sends a "trial expired" email + in-app notification. The actual plan
 * downgrade is handled by Stripe / RevenueCat webhooks (or by the org
 * staying on SOLO if they never converted). This cron only handles the
 * notification.
 *
 * Idempotency: the query filters by `trial_ended_notified_at IS NULL` and
 * the marker is set (via a CAS UPDATE) right after the email succeeds, so
 * a Vercel retry within the same 24h window skips orgs that were already
 * notified. The column was added in migration 0046. Combined with the
 * Resend-side idempotency key this gives us dedup at both the app and
 * provider layers.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Orgs whose trial ended in the last 24h AND haven't been notified yet.
  // The 24h window + notified-at filter together make daily runs catch
  // every org exactly once even if a run is missed by a few hours.
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, plan, trial_ends_at")
    .not("trial_ends_at", "is", null)
    .gte("trial_ends_at", yesterday.toISOString())
    .lt("trial_ends_at", now.toISOString())
    .is("trial_ended_notified_at", null);

  if (error) {
    console.error("trial-expired cron query failed:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  let sent = 0;

  for (const org of orgs ?? []) {
    const orgId = org.id as string;

    try {
      const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
      if (!ownerEmail) {
        console.warn("trial-expired: no owner email for org", orgId);
        continue;
      }

      const email = buildTrialExpiredEmail();
      const runDay = new Date().toISOString().slice(0, 10);
      const ok = await sendEmail({
        to: ownerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
        sender: "noreply",
        idempotencyKey: `cron-trial-expired-${orgId}-${runDay}`
      });

      if (!ok) {
        console.warn("trial-expired: send failed for org", orgId);
        continue;
      }

      // Mark notified. CAS on `trial_ended_notified_at IS NULL` so a
      // concurrent run that already set the marker isn't overwritten with
      // a later timestamp.
      const { error: markerError } = await admin
        .from("organizations")
        .update({ trial_ended_notified_at: new Date().toISOString() })
        .eq("id", orgId)
        .is("trial_ended_notified_at", null);
      if (markerError) {
        console.warn(
          "trial-expired: marker update failed for org",
          orgId,
          markerError
        );
      }

      // In-app notification feed entry.
      void admin
        .from("notifications")
        .insert({
          org_id: orgId,
          type: "TRIAL_EXPIRED",
          title: "Your trial has ended",
          body:
            "Your free trial is over and you're back on the Solo plan. Tap to upgrade.",
          screen: "settings",
          screen_params: {}
        })
        .then(null, (err: unknown) =>
          console.warn("notification insert failed:", err)
        );

      // Push notification.
      void sendPushToOrg(orgId, {
        title: "Your trial has ended",
        body:
          "You're back on the Solo plan with 5 credits per month. Tap to upgrade.",
        data: { screen: "settings" }
      });

      sent += 1;
    } catch (orgError) {
      console.error("trial-expired: org loop threw for", orgId, orgError);
    }
  }

  return NextResponse.json({ sent, considered: orgs?.length ?? 0 });
}
