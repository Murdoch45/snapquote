import { NextResponse } from "next/server";
import { computeEffectiveQuoteStatus } from "@/lib/quoteExpiry";
import type { QuoteStatus } from "@/lib/quoteStatus";
import { invalidateAnalytics } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicQuoteExpiry } from "@/lib/quoteExpiry";

type Props = {
  params: Promise<{ publicId: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { publicId } = await params;
  const admin = createAdminClient();

  const { data: quote, error: quoteError } = await admin
    .from("quotes")
    .select("id,org_id,public_id,price,estimated_price_low,estimated_price_high,message,status,sent_at,lead:leads(address_full,services)")
    .eq("public_id", publicId)
    .single();

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  }

  const { data: profile, error: profileError } = await admin
    .from("contractor_profile")
    .select("business_name")
    .eq("org_id", quote.org_id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: "Unable to load contractor profile." }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Contractor profile not found." }, { status: 404 });
  }

  const lead = Array.isArray(quote.lead) ? quote.lead[0] : quote.lead;
  const rawStatus = quote.status as QuoteStatus;
  const sentAt = quote.sent_at as string | null;

  // DRAFT quotes have sent_at=null — fall back to a far-future date so the
  // card doesn't render "expired" while the contractor is still finalising.
  const expiresAt = sentAt
    ? publicQuoteExpiry(sentAt)
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const effectiveStatus = computeEffectiveQuoteStatus(rawStatus, sentAt);

  // Catch the DB up lazily. The daily cron runs this sweep globally; this
  // per-read UPDATE keeps status honest for customers who open the page
  // between sweeps.
  if (effectiveStatus === "EXPIRED" && rawStatus !== "EXPIRED") {
    await admin.from("quotes").update({ status: "EXPIRED" }).eq("id", quote.id);
    invalidateAnalytics(quote.org_id as string);
  }

  return NextResponse.json({
    publicId: quote.public_id,
    businessName: profile?.business_name,
    services: lead?.services ?? [],
    address: lead?.address_full,
    price: Number(quote.price),
    estimatedPrice: null,
    estimatedPriceLow: quote.estimated_price_low,
    estimatedPriceHigh: quote.estimated_price_high,
    message: quote.message,
    status: effectiveStatus,
    sentAt,
    expiresAt: expiresAt.toISOString()
  });
}
