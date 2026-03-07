import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { notifyCustomer } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";
import { getMonthlyUsage, incrementUsageOnQuoteSend } from "@/lib/usage";
import { sendQuoteSchema } from "@/lib/validations";

export const runtime = "nodejs";

function makePublicId(): string {
  return randomBytes(6).toString("base64url");
}

export async function POST(request: Request) {
  const auth = await requireMemberForApi();
  if (!auth.ok) return auth.response;

  try {
    const body = sendQuoteSchema.parse(await request.json());
    const admin = createAdminClient();

    const currentUsage = await getMonthlyUsage(auth.orgId);
    if (!currentUsage.canSend) {
      return NextResponse.json(
        { error: "Upgrade required: monthly quote limit reached." },
        { status: 402 }
      );
    }

    const { data: lead } = await admin
      .from("leads")
      .select("id,org_id,status,customer_phone,customer_email,address_full,services")
      .eq("id", body.leadId)
      .eq("org_id", auth.orgId)
      .single();

    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    if (lead.status === "ACCEPTED") {
      return NextResponse.json({ error: "Lead already accepted." }, { status: 400 });
    }

    const { data: existingQuote } = await admin
      .from("quotes")
      .select("id")
      .eq("lead_id", body.leadId)
      .maybeSingle();
    if (existingQuote) {
      return NextResponse.json({ error: "Quote already exists for this lead." }, { status: 400 });
    }

    const publicId = makePublicId();
    const { data: quote, error: quoteError } = await admin
      .from("quotes")
      .insert({
        org_id: auth.orgId,
        lead_id: body.leadId,
        public_id: publicId,
        price: body.price,
        message: body.message,
        status: "SENT"
      })
      .select("id")
      .single();

    if (quoteError || !quote) throw quoteError || new Error("Quote send failed.");

    await admin
      .from("leads")
      .update({
        status: "QUOTED"
      })
      .eq("id", body.leadId)
      .eq("org_id", auth.orgId);

    await admin.from("quote_events").insert({
      org_id: auth.orgId,
      quote_id: quote.id,
      event_type: "SENT"
    });

    const { data: profile } = await admin
      .from("contractor_profile")
      .select("business_name")
      .eq("org_id", auth.orgId)
      .single();
    const quoteLink = `${getAppUrl()}/q/${publicId}`;

    await notifyCustomer({
      phone: lead.customer_phone as string | null,
      email: lead.customer_email as string | null,
      smsBody: `${profile?.business_name} sent your estimate. View: ${quoteLink}`,
      emailSubject: `${profile?.business_name} sent your estimate`,
      emailBody: `${profile?.business_name} sent your estimate. View: ${quoteLink}`
    });

    const usage = await incrementUsageOnQuoteSend(auth.orgId);

    return NextResponse.json({ ok: true, quoteId: quote.id, publicId, usage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send quote." },
      { status: 400 }
    );
  }
}
