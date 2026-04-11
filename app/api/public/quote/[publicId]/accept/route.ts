import { NextResponse } from "next/server";
import { buildEstimateAcceptedEmail } from "@/lib/emailTemplates";
import { notifyContractor } from "@/lib/notify";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { sendPushToOrg } from "@/lib/pushNotifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, publicQuoteExpiry } from "@/lib/utils";

type Props = {
  params: Promise<{ publicId: string }>;
};

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: Props) {
  const { publicId } = await params;
  const admin = createAdminClient();

  const { data: quote, error: quoteError } = await admin
    .from("quotes")
    .select("id,org_id,lead_id,status,sent_at,accepted_at,price")
    .eq("public_id", publicId)
    .single();

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  }
  if (quote.status === "ACCEPTED") {
    return NextResponse.json({ accepted: true, acceptedAt: quote.accepted_at });
  }

  if (!quote.sent_at) {
    return NextResponse.json({ error: "Estimate has not been sent yet." }, { status: 400 });
  }
  const expiresAt = publicQuoteExpiry(quote.sent_at as string);
  if (new Date() > expiresAt) {
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

  await admin.from("leads").update({ status: "ACCEPTED" }).eq("id", acceptedQuote.lead_id);

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
    admin
      .from("leads")
      .select("address_full,services,customer_name")
      .eq("id", acceptedQuote.lead_id)
      .single(),
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
