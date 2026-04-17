import { NextResponse } from "next/server";
import { buildEstimateNotViewedNudgeEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildQuoteLink } from "@/lib/quote-template";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily cron — finds estimates that were SENT 2-3 days ago and have NOT
 * been viewed yet (status still "SENT"). Sends a one-time nudge email to
 * the contractor suggesting a follow-up. This sits between the initial
 * send and the day-6 expiry warning.
 *
 * Window: sent_at between 3 and 2 days ago (so we send exactly one nudge
 * per estimate).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const { data: nudgeQuotes, error: queryError } = await admin
    .from("quotes")
    .select("id, org_id, public_id, lead_id, sent_at")
    .eq("status", "SENT")
    .gte("sent_at", threeDaysAgo.toISOString())
    .lt("sent_at", twoDaysAgo.toISOString());

  if (queryError) {
    console.error("estimate-nudge-unviewed query failed:", queryError);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!nudgeQuotes || nudgeQuotes.length === 0) {
    return NextResponse.json({ nudged: 0 });
  }

  let nudged = 0;

  for (const quote of nudgeQuotes) {
    const orgId = quote.org_id as string;
    const quoteId = quote.id as string;
    const leadId = quote.lead_id as string | null;
    const publicId = quote.public_id as string | null;

    try {
      // Look up customer name for the email.
      let customerName = "your customer";
      if (leadId) {
        const { data: lead } = await admin
          .from("leads")
          .select("customer_name")
          .eq("id", leadId)
          .maybeSingle();
        if (lead?.customer_name) {
          customerName = (lead.customer_name as string).split(" ")[0] || customerName;
        }
      }

      const quoteUrl = publicId ? buildQuoteLink(publicId) : "https://snapquote.us/app/quotes";

      // Push notification (no preference flag — this is a soft nudge).
      void sendPushToOrg(orgId, {
        title: "Estimate not opened yet",
        body: `${customerName} hasn't opened your estimate. A quick follow-up usually does the trick.`,
        data: { screen: "quotes" }
      });

      // In-app notification.
      void admin
        .from("notifications")
        .insert({
          org_id: orgId,
          type: "ESTIMATE_NOT_VIEWED",
          title: "Estimate not opened yet",
          body: `${customerName} hasn't opened your estimate. A quick follow-up usually does the trick.`,
          screen: "quotes",
          screen_params: { id: quoteId }
        })
        .then(null, (err: unknown) =>
          console.warn("notification insert failed:", err)
        );

      // Email (best-effort). Idempotency key scoped to the quote id —
      // the cron's 2-3 day window means each quote only matches the
      // query once, so a quote-scoped key is enough to dedupe any
      // Vercel retry of the same run.
      const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
      if (ownerEmail) {
        const email = buildEstimateNotViewedNudgeEmail({
          customerName,
          daysSinceSent: 2,
          quoteUrl
        });
        await sendEmail({
          to: ownerEmail,
          subject: email.subject,
          text: email.text,
          html: email.html,
          sender: "noreply",
          idempotencyKey: `cron-nudge-${quoteId}`
        });
      }

      nudged += 1;
    } catch (err) {
      console.warn("estimate-nudge-unviewed failed for quote", quoteId, err);
    }
  }

  return NextResponse.json({ nudged, considered: nudgeQuotes.length });
}
