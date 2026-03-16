import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { LeadPropertyPreview } from "@/components/LeadPropertyPreview";
import { ConfidenceMeter } from "@/components/ConfidenceMeter";
import { QuoteComposer } from "@/components/QuoteComposer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { DEFAULT_QUOTE_SMS_TEMPLATE, sanitizeQuoteTemplate } from "@/lib/quote-template";
import { formatServiceQuestionAnswers, parseServiceQuestionBundles } from "@/lib/serviceQuestions";
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

  const [{ data: lead }, { data: photos }, { data: existingQuote }, { data: profile }] = await Promise.all([
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
    supabase.from("quotes").select("*").eq("lead_id", id).maybeSingle(),
    supabase
      .from("contractor_profile")
      .select("business_name,phone,email,quote_sms_template")
      .eq("org_id", auth.orgId)
      .single()
  ]);

  if (!lead) notFound();

  const requestedService = ((lead.services as string[] | null) ?? [])[0] ?? "unknown";
  const aiServiceEstimates = Array.isArray(lead.ai_service_estimates)
    ? (lead.ai_service_estimates as Array<{ scopeSummary?: unknown }>)
    : [];
  const fallbackScopeSummary =
    typeof aiServiceEstimates[0]?.scopeSummary === "string"
      ? `${requestedService}: ${aiServiceEstimates[0].scopeSummary}`
      : null;
  const surfaceAreaSummary = lead.ai_job_summary || fallbackScopeSummary || "Pending estimate...";
  const serviceQuestionBundles = parseServiceQuestionBundles(lead.service_question_answers);
  const customerAnswerGroups = serviceQuestionBundles
    .map((bundle) => ({
      service: bundle.service,
      answers: formatServiceQuestionAnswers(bundle.service, bundle.answers)
    }))
    .filter((bundle) => bundle.answers.length > 0);

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
              <h3 className="text-sm font-semibold text-gray-800">Customer Answers</h3>
              {customerAnswerGroups.length === 0 ? (
                <p className="text-sm text-gray-500">No questionnaire answers available.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {customerAnswerGroups.map((group) => (
                    <div key={group.service} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-sm font-medium text-gray-900">{group.service}</p>
                      <dl className="mt-3 space-y-3">
                        {group.answers.map((answer) => (
                          <div key={answer.key}>
                            <dt className="text-sm font-medium text-gray-600">
                              {answer.label}:
                            </dt>
                            <dd className="mt-1 text-sm text-gray-700">{answer.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800">Property</h3>
              <p className="mt-2 text-sm text-gray-600">
                {lead.travel_distance_miles != null
                  ? `Approx. travel distance from business: ${Number(lead.travel_distance_miles).toFixed(1)} miles`
                  : "Travel distance not included for this lead."}
              </p>
              <LeadPropertyPreview
                address={lead.address_full as string}
                lat={lead.lat as number | null}
                lng={lead.lng as number | null}
              />
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
                SnapQuote price: {toCurrency(Number(lead.ai_suggested_price ?? 0))}
              </p>
              <p className="text-gray-700">
                Range:{" "}
                {lead.ai_estimate_low != null && lead.ai_estimate_high != null
                  ? `${toCurrency(Number(lead.ai_estimate_low))} - ${toCurrency(Number(lead.ai_estimate_high))}`
                  : "Pending estimate..."}
              </p>
              <p className="text-gray-700">Surface area: {surfaceAreaSummary}</p>
            </CardContent>
          </Card>
          <ConfidenceMeter
            confidence={
              lead.ai_confidence_score != null
                ? Number(lead.ai_confidence_score)
                : lead.ai_confidence === "high"
                  ? 0.85
                  : lead.ai_confidence === "medium"
                    ? 0.65
                    : 0.4
            }
          />
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
                  snapQuote={Number(lead.ai_suggested_price ?? 900)}
                  initialMessage={sanitizeQuoteTemplate((profile?.quote_sms_template as string | null) ?? DEFAULT_QUOTE_SMS_TEMPLATE)}
                  customerPhone={(lead.customer_phone as string | null) ?? null}
                  customerEmail={(lead.customer_email as string | null) ?? null}
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
