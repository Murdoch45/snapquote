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
 * Idempotency: marks `trial_ended_notified_at` so we don't double-send.
 * (Schema note: this column should be added in a follow-up migration. We
 * gracefully no-op the marker if it doesn't exist yet so this cron is
 * safe to deploy first.)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Orgs whose trial ended in the last 24h. Use a 24h window so daily runs
  // catch every org exactly once even if a run is missed by a few hours.
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, plan, trial_ends_at")
    .not("trial_ends_at", "is", null)
    .gte("trial_ends_at", yesterday.toISOString())
    .lt("trial_ends_at", now.toISOString());

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
      const ok = await sendEmail({
        to: ownerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
        sender: "noreply"
      });

      if (!ok) {
        console.warn("trial-expired: send failed for org", orgId);
        continue;
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
