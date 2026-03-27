import { NextResponse } from "next/server";
import { buildEstimateAcceptedEmail } from "@/lib/emailTemplates";
import { notifyContractor } from "@/lib/notify";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
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

  const expiresAt = publicQuoteExpiry(quote.sent_at as string);
  if (new Date() > expiresAt) {
    await admin.from("quotes").update({ status: "EXPIRED" }).eq("id", quote.id);
    return NextResponse.json({ error: "Estimate has expired." }, { status: 400 });
  }

  const acceptedAt = new Date().toISOString();
  const { data: acceptedQuote, error: acceptedQuoteError } = await admin
    .from("quotes")
    .update({ status: "ACCEPTED", accepted_at: acceptedAt })
    .eq("id", quote.id)
    .neq("status", "ACCEPTED")
    .select("id,org_id,lead_id,status,sent_at,accepted_at,price")
    .maybeSingle();

  if (acceptedQuoteError) {
    return NextResponse.json({ error: "Unable to accept estimate." }, { status: 500 });
  }

  if (!acceptedQuote) {
    const { data: currentQuote, error: currentQuoteError } = await admin
      .from("quotes")
      .select("accepted_at,status")
      .eq("id", quote.id)
      .maybeSingle();

    if (currentQuoteError) {
      return NextResponse.json({ error: "Unable to load accepted estimate." }, { status: 500 });
    }

    if (currentQuote?.status === "ACCEPTED") {
      return NextResponse.json({ accepted: true, acceptedAt: currentQuote.accepted_at });
    }

    return NextResponse.json({ error: "Unable to accept estimate." }, { status: 500 });
  }

  await admin.from("leads").update({ status: "ACCEPTED" }).eq("id", acceptedQuote.lead_id);

  const { error: quoteEventError } = await admin.from("quote_events").upsert(
    {
      org_id: acceptedQuote.org_id,
      quote_id: acceptedQuote.id,
      event_type: "ACCEPTED"
    },
    {
      onConflict: "quote_id,event_type",
      ignoreDuplicates: true
    }
  );

  if (quoteEventError) {
    return NextResponse.json({ error: "Unable to record estimate acceptance." }, { status: 500 });
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

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found for estimate." }, { status: 404 });
  }

  if (profileError || !profile) {
    return NextResponse.json({ error: "Contractor profile not found." }, { status: 404 });
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
