import { NextResponse } from "next/server";
import { buildEstimateExpiredEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cron — finds estimates that have been SENT or VIEWED for more than
 * 7 days and flips them to EXPIRED, then fans out a push notification
 * per affected org. Replaces the pg_cron job from migration 0040 (which
 * was unscheduled in migration 0041) so the expiry sweep and the
 * notification can happen in the same place.
 *
 * The Realtime listener in hooks/useNotifications.ts picks up the same
 * status change and fires a web toast — no extra plumbing needed for
 * the dashboard side.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { data: expiringQuotes, error: queryError } = await admin
    .from("quotes")
    .select("id, org_id, lead_id")
    .in("status", ["SENT", "VIEWED"])
    .lt("sent_at", cutoff.toISOString());

  if (queryError) {
    console.error("auto-expire-stale-quotes query failed:", queryError);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!expiringQuotes || expiringQuotes.length === 0) {
    return NextResponse.json({ expired: 0, orgsNotified: 0 });
  }

  const expiringIds = expiringQuotes.map((row) => row.id as string);

  const { error: updateError } = await admin
    .from("quotes")
    .update({ status: "EXPIRED" })
    .in("id", expiringIds);

  if (updateError) {
    console.error("auto-expire-stale-quotes update failed:", updateError);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  // Group affected orgs and fan out one push per org. Multiple expired
  // estimates for the same org collapse into one notification.
  const orgCounts = new Map<string, number>();
  for (const row of expiringQuotes) {
    const orgId = row.org_id as string;
    orgCounts.set(orgId, (orgCounts.get(orgId) ?? 0) + 1);
  }

  let orgsNotified = 0;
  for (const [orgId, count] of orgCounts.entries()) {
    const body =
      count === 1
        ? "An estimate just expired. Tap to follow up before the customer cools off."
        : `${count} estimates just expired. Tap to follow up before customers cool off.`;

    const result = await sendPushToOrg(orgId, {
      title: count === 1 ? "Estimate expired" : "Estimates expired",
      body,
      data: { screen: "quotes" }
    });

    if (result.sent > 0) orgsNotified += 1;
  }

  // Send an expiry email to each affected org's owner. Use the first expired
  // quote's lead_id as the CTA link — multiple expirations still get one email.
  const appUrl = getAppUrl();
  for (const [orgId] of orgCounts.entries()) {
    try {
      const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
      if (!ownerEmail) continue;

      const firstQuote = expiringQuotes.find((q) => (q.org_id as string) === orgId);
      const leadUrl = firstQuote?.lead_id
        ? `${appUrl}/app/leads/${firstQuote.lead_id}`
        : `${appUrl}/app/leads`;

      const email = buildEstimateExpiredEmail({ leadUrl });
      await sendEmail({
        to: ownerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
        sender: "noreply"
      });
    } catch (emailError) {
      console.warn("auto-expire email failed for org", orgId, emailError);
    }
  }

  return NextResponse.json({ expired: expiringIds.length, orgsNotified });
}
