import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { sendEmail } from "@/lib/notify";
import { buildQuoteLink, renderQuoteTemplate } from "@/lib/quote-template";
import { SubscriptionRequiredError, requireActiveSubscription } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendQuoteSms } from "@/lib/twilio";
import { incrementUsageOnQuoteSend } from "@/lib/usage";
import { sendQuoteSchema } from "@/lib/validations";

export const runtime = "nodejs";

function makePublicId(): string {
  return randomBytes(6).toString("base64url");
}

export async function POST(request: Request) {
  const auth = await requireMemberForApi();
  if (!auth.ok) return auth.response;

  let createdQuoteId: string | null = null;
  let bodyLeadId: string | null = null;

  try {
    const body = sendQuoteSchema.parse(await request.json());
    bodyLeadId = body.leadId;
    const admin = createAdminClient();

    await requireActiveSubscription(auth.orgId);

    const { data: lead } = await admin
      .from("leads")
      .select("id,org_id,status,customer_name,customer_phone,customer_email,address_full,services")
      .eq("id", body.leadId)
      .eq("org_id", auth.orgId)
      .single();

    if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    if (lead.status === "ACCEPTED") {
      return NextResponse.json({ error: "Lead already accepted." }, { status: 400 });
    }
    if (body.sendEmail && !lead.customer_email) {
      return NextResponse.json({ error: "Customer email is missing for email delivery." }, { status: 400 });
    }
    if (body.sendText && !lead.customer_phone) {
      return NextResponse.json({ error: "Customer phone is missing for text delivery." }, { status: 400 });
    }

    const { data: existingQuote } = await admin
      .from("quotes")
      .select("id")
      .eq("lead_id", body.leadId)
      .maybeSingle();
    if (existingQuote) {
      return NextResponse.json({ error: "Quote already exists for this lead." }, { status: 400 });
    }

    const { data: profile } = await admin
      .from("contractor_profile")
      .select("business_name,phone,email")
      .eq("org_id", auth.orgId)
      .single();
    const publicId = makePublicId();
    const quoteLink = buildQuoteLink(publicId);
    const resolvedMessage = renderQuoteTemplate(body.message, {
      customerName: (lead.customer_name as string) || "Customer",
      companyName: (profile?.business_name as string) || "SnapQuote",
      quoteLink,
      contractorPhone: (profile?.phone as string) || "Not provided",
      contractorEmail: (profile?.email as string) || "Not provided"
    });
    const { data: quote, error: quoteError } = await admin
      .from("quotes")
      .insert({
        org_id: auth.orgId,
        lead_id: body.leadId,
        public_id: publicId,
        price: body.price,
        message: resolvedMessage,
        status: "SENT"
      })
      .select("id")
      .single();

    if (quoteError || !quote) throw quoteError || new Error("Quote send failed.");
    createdQuoteId = quote.id as string;

    const sentChannels: ("email" | "text")[] = [];
    const deliveryErrors: string[] = [];

    if (body.sendText) {
      try {
        await sendQuoteSms({
          to: lead.customer_phone as string,
          body: resolvedMessage
        });
        sentChannels.push("text");
      } catch (error) {
        deliveryErrors.push(
          error instanceof Error ? error.message : "Failed to send quote by text."
        );
      }
    }

    if (body.sendEmail) {
      const emailSent = await sendEmail({
        to: lead.customer_email as string,
        subject: `${profile?.business_name} sent your estimate`,
        text: resolvedMessage
      });
      if (!emailSent) {
        deliveryErrors.push("Failed to send quote by email.");
      } else {
        sentChannels.push("email");
      }
    }

    if (sentChannels.length === 0) {
      throw new Error(deliveryErrors[0] || "Failed to send quote.");
    }

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

    const usage = await incrementUsageOnQuoteSend(auth.orgId);

    return NextResponse.json({
      ok: true,
      quoteId: quote.id,
      publicId,
      publicUrl: quoteLink,
      resolvedMessage,
      usage,
      sentChannels,
      warning: deliveryErrors.length > 0 ? deliveryErrors.join(" ") : null
    });
  } catch (error) {
    if (createdQuoteId && bodyLeadId) {
      const admin = createAdminClient();
      await admin.from("quote_events").delete().eq("quote_id", createdQuoteId);
      await admin.from("quotes").delete().eq("id", createdQuoteId).eq("org_id", auth.orgId);
      await admin
        .from("leads")
        .update({ status: "NEW" })
        .eq("id", bodyLeadId)
        .eq("org_id", auth.orgId)
        .eq("status", "QUOTED");
    }

    if (error instanceof SubscriptionRequiredError) {
      return NextResponse.json(
        {
          code: error.code,
          error: "Your subscription is inactive. Please update billing to continue."
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send quote." },
      { status: 400 }
    );
  }
}
