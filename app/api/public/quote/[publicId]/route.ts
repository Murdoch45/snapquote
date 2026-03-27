import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicQuoteExpiry } from "@/lib/utils";

type Props = {
  params: Promise<{ publicId: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { publicId } = await params;
  const admin = createAdminClient();

  const { data: quote } = await admin
    .from("quotes")
    .select("id,org_id,public_id,price,estimated_price_low,estimated_price_high,message,status,sent_at,lead:leads(address_full,services)")
    .eq("public_id", publicId)
    .single();

  if (!quote) {
    return NextResponse.json({ error: "Estimate not found." }, { status: 404 });
  }

  const { data: profile } = await admin
    .from("contractor_profile")
    .select("business_name")
    .eq("org_id", quote.org_id)
    .single();

  const lead = Array.isArray(quote.lead) ? quote.lead[0] : quote.lead;
  const expiresAt = publicQuoteExpiry(quote.sent_at as string);
  const isExpired = quote.status !== "ACCEPTED" && new Date() > expiresAt;

  if (isExpired && quote.status !== "EXPIRED") {
    await admin.from("quotes").update({ status: "EXPIRED" }).eq("id", quote.id);
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
    status: isExpired ? "EXPIRED" : quote.status,
    sentAt: quote.sent_at,
    expiresAt: expiresAt.toISOString()
  });
}
