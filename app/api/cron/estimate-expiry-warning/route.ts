import { NextResponse } from "next/server";
import { buildEstimateExpiringSoonEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cron — finds estimates that have been SENT or VIEWED for 6 days
 * (expiring in ~24 hours) and sends a warning email + push notification
 * to the contractor. This gives them a chance to follow up before the
 * 7-day auto-expire cron fires.
 *
 * Window: sent_at between 6 and 7 days ago (so we don't re-warn quotes
 * that will be expired by the next auto-expire run).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const appUrl = getAppUrl();

  // Quotes sent 6-7 days ago are expiring within the next 24 hours.
  const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { data: warningQuotes, error: queryError } = await admin
    .from("quotes")
    .select("id, org_id, public_id")
    .in("status", ["SENT", "VIEWED"])
    .gte("sent_at", sevenDaysAgo.toISOString())
    .lt("sent_at", sixDaysAgo.toISOString());

  if (queryError) {
    console.error("estimate-expiry-warning query failed:", queryError);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!warningQuotes || warningQuotes.length === 0) {
    return NextResponse.json({ warned: 0 });
  }

  // Group by org — one email + push per org.
  const orgQuotes = new Map<string, typeof warningQuotes>();
  for (const row of warningQuotes) {
    const orgId = row.org_id as string;
    const existing = orgQuotes.get(orgId) ?? [];
    existing.push(row);
    orgQuotes.set(orgId, existing);
  }

  // Idempotency key scoped to org + UTC day so a Vercel retry within the
  // same cron run dedupes at Resend and doesn't spam the contractor.
  const runDay = new Date().toISOString().slice(0, 10);

  let warned = 0;
  for (const [orgId, quotes] of orgQuotes.entries()) {
    try {
      const count = quotes.length;

      const title =
        count === 1 ? "Estimate expiring soon" : "Estimates expiring soon";
      const body =
        count === 1
          ? "An estimate expires in 24 hours. Follow up before it's too late."
          : `${count} estimates expire in 24 hours. Follow up before it's too late.`;

      // Push notification
      void sendPushToOrg(orgId, {
        title,
        body,
        data: { screen: "quotes" }
      });

      // In-app notification feed entry (parity with auto-expire and the
      // other notification flows). Best-effort — failing to record this
      // shouldn't block the email/push from going out.
      void admin
        .from("notifications")
        .insert({
          org_id: orgId,
          type: "ESTIMATE_EXPIRING_SOON",
          title,
          body,
          screen: "quotes",
          screen_params: {}
        })
        .then(null, (err: unknown) =>
          console.warn("notification insert failed:", err)
        );

      // Email to org owner
      const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
      if (!ownerEmail) continue;

      const quoteUrl = `${appUrl}/app/quotes`;
      const email = buildEstimateExpiringSoonEmail({ quoteUrl });
      const sent = await sendEmail({
        to: ownerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
        sender: "noreply",
        idempotencyKey: `cron-expiry-warning-${orgId}-${runDay}`
      });

      if (sent) warned += 1;
    } catch (err) {
      console.warn("estimate-expiry-warning failed for org", orgId, err);
    }
  }

  return NextResponse.json({ warned, considered: warningQuotes.length });
}
