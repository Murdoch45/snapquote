import { NextResponse } from "next/server";
import { buildEstimateAcceptedEmail } from "@/lib/emailTemplates";
import { getClientIp } from "@/lib/ip";
import { notifyContractor } from "@/lib/notify";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { computeEffectiveQuoteStatus } from "@/lib/quoteExpiry";
import { invalidateAnalytics } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgFilter } from "@/lib/supabase/orgFilter";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/utils";

type Props = {
  params: Promise<{ publicId: string }>;
};

export const runtime = "nodejs";

// Audit 7 H1 — tighter cap on accept than on read. A legitimate customer
// accepts a quote once; the only reason to retry is a click-fast race
// (already CAS-protected at the row level) or a malicious replay.
const ONE_HOUR_MS = 60 * 60 * 1000;
const QUOTE_ACCEPT_RATE_LIMIT = 5;

export async function POST(request: Request, { params }: Props) {
  const { publicId } = await params;

  const ip = getClientIp(request);
  if (!(await rateLimit(`public-quote-accept:${ip}:${publicId}`, QUOTE_ACCEPT_RATE_LIMIT, ONE_HOUR_MS))) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const admin = createAdminClient();

  const { data: quote, error: quoteError } = await admin
    .from("quotes")
    .select("id,org_id,lead_id,status,sent_at,accepted_at,price")
    .eq("public_id", publicId)
    .single();

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  }

  // Reject self-accept by the contractor's own org members. The endpoint is
  // intentionally anonymous-OK so customer email/SMS recipients can accept
  // without signing in. But a contractor following the in-app preview link
  // (or anyone else logged into the quote's org) must not be able to flip
  // their own quote. Anonymous requests fall through unchanged.
  const userClient = await createServerSupabaseClient();
  const {
    data: { user }
  } = await userClient.auth.getUser();
  if (user) {
    const { data: ownMembership } = await userClient
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("org_id", quote.org_id as string)
      .maybeSingle();
    if (ownMembership) {
      return NextResponse.json(
        { error: "Cannot accept your own estimate." },
        { status: 403 }
      );
    }
  }

  if (quote.status === "ACCEPTED") {
    return NextResponse.json({ accepted: true, acceptedAt: quote.accepted_at });
  }
  if (quote.status === "EXPIRED") {
    return NextResponse.json({ error: "Estimate has expired." }, { status: 400 });
  }
  if (quote.status === "DRAFT") {
    return NextResponse.json({ error: "Estimate has not been sent yet." }, { status: 400 });
  }

  if (!quote.sent_at) {
    return NextResponse.json({ error: "Estimate has not been sent yet." }, { status: 400 });
  }
  // Re-check effective status with the shared helper so a stale SENT/VIEWED
  // row that crossed the 7-day boundary since the initial fetch still gets
  // correctly rejected (and lazily flipped in the DB).
  if (
    computeEffectiveQuoteStatus(quote.status, quote.sent_at as string) === "EXPIRED"
  ) {
    await admin.from("quotes").update({ status: "EXPIRED" }).eq("id", quote.id);
    return NextResponse.json({ error: "Estimate has expired." }, { status: 400 });
  }

  const acceptedAt = new Date().toISOString();

  // Use a simple update without extra status conditions. We already confirmed
  // the quote is not ACCEPTED at line 29. The .neq("status","ACCEPTED") guard
  // in the old code caused race-condition failures when the /viewed endpoint
  // was simultaneously updating the same row — the concurrent transaction
  // would cause .maybeSingle() to return null, failing the first click.
  const { data: acceptedQuote, error: acceptedQuoteError } = await admin
    .from("quotes")
    .update({ status: "ACCEPTED", accepted_at: acceptedAt })
    .eq("id", quote.id)
    .select("id,org_id,lead_id,status,sent_at,accepted_at,price")
    .single();

  if (acceptedQuoteError || !acceptedQuote) {
    // Re-fetch to check if it was accepted by a concurrent request
    const { data: currentQuote } = await admin
      .from("quotes")
      .select("accepted_at,status")
      .eq("id", quote.id)
      .maybeSingle();

    if (currentQuote?.status === "ACCEPTED") {
      return NextResponse.json({ accepted: true, acceptedAt: currentQuote.accepted_at });
    }

    return NextResponse.json({ error: "Unable to accept estimate." }, { status: 500 });
  }

  // Defense-in-depth tenant filter (Audit 4 M2). The publicId → quote → lead_id
  // chain is already auth-by-token, but the M5 helper convention says admin-
  // client UPDATEs against tenant-scoped tables MUST include an explicit org_id
  // filter. acceptedQuote.org_id was just loaded via the same publicId.
  await admin
    .from("leads")
    .update({ status: "ACCEPTED" })
    .eq("id", acceptedQuote.lead_id)
    .eq("org_id", acceptedQuote.org_id as string);

  invalidateAnalytics(acceptedQuote.org_id as string);

  // Record the ACCEPTED event for the notification feed. This is best-effort
  // — if it fails (e.g. missing unique constraint from unapplied migration),
  // the acceptance itself is already committed and should not be blocked.
  try {
    await admin.from("quote_events").insert({
      org_id: acceptedQuote.org_id,
      quote_id: acceptedQuote.id,
      event_type: "ACCEPTED"
    });
  } catch (eventError) {
    console.warn("quote_events ACCEPTED insert failed (non-blocking):", eventError);
  }

  const [
    { data: lead, error: leadError },
    { data: profile, error: profileError }
  ] = await Promise.all([
    requireOrgFilter(
      admin
        .from("leads")
        .select("address_full,services,customer_name")
        .eq("id", acceptedQuote.lead_id),
      acceptedQuote.org_id as string
    ).single(),
    admin
      .from("contractor_profile")
      .select(
        "phone,email,notification_accept_sms,notification_accept_email,business_name"
      )
      .eq("org_id", acceptedQuote.org_id)
      .single()
  ]);

  // Notifications are best-effort — the acceptance is already committed.
  // If we can't load the lead or profile, skip notifications but still
  // return success to the customer.
  if (leadError || !lead || profileError || !profile) {
    console.warn("Could not load lead/profile for acceptance notifications.");
    return NextResponse.json({ accepted: true, acceptedAt: acceptedQuote.accepted_at });
  }

  const services = ((lead?.services ?? []) as string[]).join(", ");
  const quoteLink = `${getAppUrl()}/app/quotes`;

  await notifyContractor({
    smsEnabled: profile?.notification_accept_sms as boolean,
    emailEnabled: false,
    phone: profile?.phone as string | null,
    email: null,
    smsBody: `Estimate accepted: ${services} at ${lead?.address_full}. View: ${quoteLink}`,
    emailSubject: "Estimate accepted",
    emailBody: `Estimate accepted: ${services} at ${lead?.address_full}. View: ${quoteLink}`
  });

  const customerName = (lead?.customer_name as string) || "A customer";
  const primaryService = ((lead?.services ?? []) as string[])[0] ?? "estimate";
  const addressParts = ((lead?.address_full as string) ?? "").split(",").map((p: string) => p.trim());
  const city = addressParts.length >= 2 ? addressParts[addressParts.length - 2] : "";
  const locationSuffix = city ? ` for ${primaryService} in ${city}` : ` for ${primaryService}`;
  void sendPushToOrg(acceptedQuote.org_id as string, {
    title: "Estimate Accepted",
    body: `${customerName} accepted your estimate${locationSuffix}.`,
    data: { screen: "lead", id: acceptedQuote.lead_id as string }
  });
  void admin
    .from("notifications")
    .insert({
      org_id: acceptedQuote.org_id,
      type: "ESTIMATE_ACCEPTED",
      title: "Estimate Accepted",
      body: `${customerName} accepted your estimate${locationSuffix}.`,
      screen: "quotes",
      screen_params: { id: acceptedQuote.id as string }
    })
    .then(null, (err: unknown) => console.warn("notification insert failed:", err));

  if (profile?.notification_accept_email) {
    const ownerEmail = await getOwnerEmailForOrg(admin, acceptedQuote.org_id as string);

    if (ownerEmail) {
      const email = buildEstimateAcceptedEmail({
        customerName: (lead?.customer_name as string) || "A customer",
        serviceType: services || "Estimate",
        acceptedPrice: acceptedQuote.price != null ? Number(acceptedQuote.price) : null,
        leadUrl: `${getAppUrl()}/app/leads/${acceptedQuote.lead_id}`
      });

      const sent = await sendEmail({
        to: ownerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html
      });

      if (!sent) {
        console.warn("quote accept email notification failed.");
      }
    }
  }

  return NextResponse.json({ accepted: true, acceptedAt: acceptedQuote.accepted_at });
}
