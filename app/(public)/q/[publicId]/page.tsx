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

  const { data: quote } = await admin
    .from("quotes")
    .select("public_id,org_id,lead:leads(address_full,services),price,estimated_price,estimated_price_low,estimated_price_high,message,status,sent_at")
    .eq("public_id", publicId)
    .single();

  if (!quote) notFound();

  const { data: profile } = await admin
    .from("contractor_profile")
    .select("business_name")
    .eq("org_id", quote.org_id)
    .single();

  const lead = Array.isArray(quote.lead) ? quote.lead[0] : quote.lead;
  const expiresAt = publicQuoteExpiry(quote.sent_at).toISOString();

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <PublicQuoteCard
        quote={{
          publicId: quote.public_id as string,
          businessName: profile?.business_name as string,
          services: (lead?.services ?? []) as string[],
          address: lead?.address_full as string,
          price: Number(quote.price),
          estimatedPrice: quote.estimated_price as number | string | null,
          estimatedPriceLow: quote.estimated_price_low as number | string | null,
          estimatedPriceHigh: quote.estimated_price_high as number | string | null,
          message: quote.message as string,
          status: quote.status as "SENT" | "VIEWED" | "ACCEPTED" | "EXPIRED",
          sentAt: quote.sent_at as string,
          expiresAt
        }}
      />
    </main>
  );
}
