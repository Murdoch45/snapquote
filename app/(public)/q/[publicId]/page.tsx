import { notFound } from "next/navigation";
import { PublicQuoteCard } from "@/components/PublicQuoteCard";
import { publicQuoteExpiry } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ publicId: string }>;
};

export default async function PublicQuotePage({ params }: Props) {
  const { publicId } = await params;

  const admin = createAdminClient();
  type QuoteRow = {
    public_id: string;
    org_id: string;
    lead: { address_full: string | null; services: string[] | null } | null;
    price: number | null;
    estimated_price_low: number | null;
    estimated_price_high: number | null;
    message: string | null;
    status: string | null;
    sent_at: string | null;
  };
  let quote: QuoteRow | null = null;

  try {
    const { data, error } = await admin
      .from("quotes")
      .select("public_id,org_id,lead:leads(address_full,services),price,estimated_price_low,estimated_price_high,message,status,sent_at")
      .eq("public_id", publicId)
      .single();

    if (error) {
      console.error("PublicQuotePage quote query failed:", error);
    }

    quote = (data as QuoteRow | null) ?? null;
  } catch (error) {
    console.error("PublicQuotePage quote query threw:", error);
  }

  if (!quote) {
    console.warn("PublicQuotePage quote not found.");
    notFound();
  }

  let profile:
    | {
        business_name: string | null;
        phone: string | null;
        email: string | null;
      }
    | null = null;

  try {
    const { data, error } = await admin
      .from("contractor_profile")
      .select("business_name,phone,email")
      .eq("org_id", quote.org_id)
      .maybeSingle();

    if (error) {
      console.error("PublicQuotePage contractor profile query failed:", error);
    }

    profile = (data as { business_name: string | null; phone: string | null; email: string | null } | null) ?? null;
  } catch (error) {
    console.error("PublicQuotePage contractor profile query threw:", error);
  }

  if (!profile) {
    console.warn("PublicQuotePage contractor profile missing.");
  }

  const lead = Array.isArray(quote.lead) ? quote.lead[0] : quote.lead;
  const isDraft = quote.status === "DRAFT";
  const businessName = (profile?.business_name as string | null) ?? "SnapQuote";

  // For DRAFT quotes sent_at is null — use a far-future expiry so the page
  // doesn't show "expired" before the estimate has even been delivered.
  const expiresAt = quote.sent_at
    ? publicQuoteExpiry(quote.sent_at).toISOString()
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return (
    <main className="min-h-screen bg-muted px-4 py-8 sm:py-12">
      <PublicQuoteCard
        quote={{
          publicId: quote.public_id as string,
          businessName,
          businessPhone: (profile?.phone as string | null) ?? null,
          businessEmail: (profile?.email as string | null) ?? null,
          services: (lead?.services ?? []) as string[],
          address: (lead?.address_full as string | null) ?? "Address unavailable",
          price: Number(quote.price),
          estimatedPrice: null,
          estimatedPriceLow: quote.estimated_price_low as number | string | null,
          estimatedPriceHigh: quote.estimated_price_high as number | string | null,
          message: isDraft
            ? `Your estimate is being prepared by ${businessName}.`
            : ((quote.message as string | null) ?? ""),
          status: isDraft ? "DRAFT" : (quote.status as "SENT" | "VIEWED" | "ACCEPTED" | "EXPIRED"),
          sentAt: quote.sent_at ?? new Date().toISOString(),
          expiresAt
        }}
      />
    </main>
  );
}
