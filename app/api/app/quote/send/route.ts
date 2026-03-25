import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildEstimateSentEmail } from "@/lib/emailTemplates";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { sendEmail } from "@/lib/notify";
import { buildQuoteLink, renderQuoteTemplate } from "@/lib/quote-template";
import { SubscriptionRequiredError, requireActiveSubscription } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendQuoteSms } from "@/lib/twilio";
import { incrementUsageOnQuoteSend } from "@/lib/usage";
import { sendQuoteSchema } from "@/lib/validations";

export const runtime = "nodejs";

function makePublicId(): string {
  return randomBytes(6).toString("base64url");
}

function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
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
    const supabase = await createServerSupabaseClient();

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
      return NextResponse.json({ error: "Estimate already exists for this lead." }, { status: 400 });
    }

    const { data: profile } = await admin
      .from("contractor_profile")
      .select("business_name,phone,email")
      .eq("org_id", auth.orgId)
      .single();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    const requestedPublicId = body.publicId ?? makePublicId();
    const { data: quote, error: quoteError } = await admin
      .from("quotes")
      .insert({
        org_id: auth.orgId,
        lead_id: body.leadId,
        public_id: requestedPublicId,
        price: roundToNearestFive((body.estimatedPriceLow + body.estimatedPriceHigh) / 2),
        estimated_price_low: body.estimatedPriceLow,
        estimated_price_high: body.estimatedPriceHigh,
        message: body.message,
        status: "SENT"
      })
      .select("id,public_id")
      .single();

    if (quoteError || !quote) throw quoteError || new Error("Estimate send failed.");
    createdQuoteId = quote.id as string;
    const confirmedPublicId = quote.public_id as string;
    const quoteLink = buildQuoteLink(confirmedPublicId);
    const resolvedMessage = renderQuoteTemplate(body.message, {
      customerName: (lead.customer_name as string) || "Customer",
      companyName: (profile?.business_name as string) || "SnapQuote",
      quoteLink,
      contractorPhone: (profile?.phone as string) || "Not provided",
      contractorEmail: user?.email || (profile?.email as string) || "Not provided"
    });

    const { error: messageUpdateError } = await admin
      .from("quotes")
      .update({ message: resolvedMessage })
      .eq("id", quote.id)
      .eq("org_id", auth.orgId);

    if (messageUpdateError) throw messageUpdateError;

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
          error instanceof Error ? error.message : "Failed to send estimate by text."
        );
      }
    }

    if (body.sendEmail) {
      const customerEmail = buildEstimateSentEmail({
        businessName: (profile?.business_name as string) || "SnapQuote",
        contractorPhone: (profile?.phone as string | null) ?? null,
        contractorEmail: (user?.email as string | null) ?? (profile?.email as string | null) ?? null,
        estimateLow: body.estimatedPriceLow,
        estimateHigh: body.estimatedPriceHigh,
        publicId: confirmedPublicId
      });
      const emailSent = await sendEmail({
        to: lead.customer_email as string,
        subject: customerEmail.subject,
        text: customerEmail.text,
        html: customerEmail.html
      });
      if (!emailSent) {
        deliveryErrors.push("Failed to send estimate by email.");
      } else {
        sentChannels.push("email");
      }
    }

    if (sentChannels.length === 0) {
      throw new Error(deliveryErrors[0] || "Failed to send estimate.");
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
      publicId: confirmedPublicId,
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
      { error: error instanceof Error ? error.message : "Failed to send estimate." },
      { status: 400 }
    );
  }
}
