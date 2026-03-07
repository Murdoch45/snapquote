import { NextResponse } from "next/server";
import { notifyContractor } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, publicQuoteExpiry } from "@/lib/utils";

type Props = {
  params: Promise<{ publicId: string }>;
};

export async function POST(_request: Request, { params }: Props) {
  const { publicId } = await params;
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select("id,org_id,lead_id,status,sent_at,accepted_at")
    .eq("public_id", publicId)
    .single();

  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (quote.status === "ACCEPTED") {
    return NextResponse.json({ accepted: true, acceptedAt: quote.accepted_at });
  }

  const expiresAt = publicQuoteExpiry(quote.sent_at as string);
  if (new Date() > expiresAt) {
    await admin.from("quotes").update({ status: "EXPIRED" }).eq("id", quote.id);
    return NextResponse.json({ error: "Quote has expired." }, { status: 400 });
  }

  const acceptedAt = new Date().toISOString();
  await admin
    .from("quotes")
    .update({ status: "ACCEPTED", accepted_at: acceptedAt })
    .eq("id", quote.id);

  await admin.from("leads").update({ status: "ACCEPTED" }).eq("id", quote.lead_id);

  await admin.from("quote_events").insert({
    org_id: quote.org_id,
    quote_id: quote.id,
    event_type: "ACCEPTED"
  });

  const [{ data: lead }, { data: profile }] = await Promise.all([
    admin
      .from("leads")
      .select("address_full,services")
      .eq("id", quote.lead_id)
      .single(),
    admin
      .from("contractor_profile")
      .select(
        "phone,email,notification_accept_sms,notification_accept_email,business_name"
      )
      .eq("org_id", quote.org_id)
      .single()
  ]);

  const services = ((lead?.services ?? []) as string[]).join(", ");
  const quoteLink = `${getAppUrl()}/app/quotes`;

  await notifyContractor({
    smsEnabled: profile?.notification_accept_sms as boolean,
    emailEnabled: profile?.notification_accept_email as boolean,
    phone: profile?.phone as string | null,
    email: profile?.email as string | null,
    smsBody: `Quote accepted: ${services} at ${lead?.address_full}. View: ${quoteLink}`,
    emailSubject: "Quote accepted",
    emailBody: `Quote accepted: ${services} at ${lead?.address_full}. View: ${quoteLink}`
  });

  return NextResponse.json({ accepted: true, acceptedAt });
}
