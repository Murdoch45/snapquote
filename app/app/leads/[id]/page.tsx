import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { QuoteComposer } from "@/components/QuoteComposer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMonthlyUsage } from "@/lib/usage";
import { toCurrency, toRelativeMinutes } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const usage = await getMonthlyUsage(auth.orgId);

  const [{ data: lead }, { data: photos }, { data: existingQuote }] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .eq("org_id", auth.orgId)
      .single(),
    supabase
      .from("lead_photos")
      .select("id,storage_path,public_url")
      .eq("lead_id", id)
      .eq("org_id", auth.orgId),
    supabase.from("quotes").select("*").eq("lead_id", id).maybeSingle()
  ]);

  if (!lead) notFound();

  const mapKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapUrl =
    lead.lat && lead.lng && mapKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${lead.lat},${lead.lng}&zoom=16&size=1200x300&markers=color:blue%7C${lead.lat},${lead.lng}&key=${mapKey}`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{lead.address_full}</h1>
          <p className="text-sm text-gray-500">
            Submitted {toRelativeMinutes(lead.submitted_at)} ({format(new Date(lead.submitted_at), "PPpp")})
          </p>
        </div>
        <Badge variant="secondary">{lead.status}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lead Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <section>
              <h3 className="text-sm font-semibold text-gray-800">Customer</h3>
              <p className="text-sm text-gray-700">{lead.customer_name}</p>
              <p className="text-sm text-gray-600">{lead.customer_phone || "No phone"}</p>
              <p className="text-sm text-gray-600">{lead.customer_email || "No email"}</p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800">Services</h3>
              <div className="mt-1 flex flex-wrap gap-1">
                {(lead.services as string[]).map((service) => (
                  <Badge key={service}>{service}</Badge>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800">Description</h3>
              <p className="text-sm text-gray-700">{lead.description || "No description provided."}</p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800">Property</h3>
              <p className="text-sm text-gray-700">{lead.address_full}</p>
              {mapUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mapUrl} alt="Map preview" className="mt-2 h-44 w-full rounded-md object-cover" />
              ) : (
                <p className="text-xs text-gray-500">
                  Map preview unavailable. Set Google Maps API key for static maps.
                </p>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800">Photos</h3>
              {(photos ?? []).length === 0 ? (
                <p className="text-sm text-gray-500">No photos uploaded.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(photos ?? []).map((photo) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={(photo.public_url as string) || ""}
                      alt="Lead"
                      className="h-28 w-full rounded-md object-cover"
                    />
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Estimate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-gray-700">
                Range: {toCurrency(Number(lead.ai_estimate_low ?? 0))} -{" "}
                {toCurrency(Number(lead.ai_estimate_high ?? 0))}
              </p>
              <p className="text-gray-700">
                Suggested: {toCurrency(Number(lead.ai_suggested_price ?? 0))}
              </p>
              <p className="text-gray-700">{lead.ai_job_summary || "Pending estimate..."}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Send Quote</CardTitle>
            </CardHeader>
            <CardContent>
              {existingQuote ? (
                <div className="space-y-2 text-sm">
                  <p className="text-gray-700">Quote already sent for this lead.</p>
                  <p className="text-gray-700">
                    Price: {toCurrency(Number(existingQuote.price))} ({existingQuote.status})
                  </p>
                  <Link href={`/q/${existingQuote.public_id}`} target="_blank">
                    Preview customer quote page
                  </Link>
                </div>
              ) : (
                <QuoteComposer
                  leadId={lead.id as string}
                  estimateLow={Number(lead.ai_estimate_low ?? 250)}
                  estimateHigh={Number(lead.ai_estimate_high ?? 2500)}
                  suggestedPrice={Number(lead.ai_suggested_price ?? 900)}
                  draftMessage={
                    (lead.ai_draft_message as string) ||
                    "Thanks for the request. Here is your estimate."
                  }
                  canSend={usage.canSend}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
