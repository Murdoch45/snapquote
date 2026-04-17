import { randomBytes } from "crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { format } from "date-fns";
import { LeadPropertyPreview } from "@/components/LeadPropertyPreview";
import { ConfidenceMeter } from "@/components/ConfidenceMeter";
import { LeadUnlockButton } from "@/components/LeadUnlockButton";
import { QuoteComposer } from "@/components/QuoteComposer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getOrgCredits } from "@/lib/credits";
import { getAddressParts, getVisibleAddress } from "@/lib/leadPresentation";
import {
  DEFAULT_ESTIMATE_SMS_TEMPLATE,
  buildEstimateLink,
  getDisplayCustomerName,
  renderEstimateTemplate
} from "@/lib/quote-template";
import { getServiceBadgeClassName } from "@/lib/serviceColors";
import { formatServiceQuestionAnswers, parseServiceQuestionBundles } from "@/lib/serviceQuestions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCurrencyRange, toCurrency, toRelativeMinutes } from "@/lib/utils";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

// Matches the channel labels recorded by /api/app/quote/send — "email" and
// "text". We display them in the contractor-facing "Sent via" line as
// "Email" and "SMS" so it reads naturally; unknown values pass through
// unchanged.
function formatSentVia(channels: string[]): string {
  const seen = new Set<string>();
  const labels = channels
    .map((channel) => {
      const normalized = channel.trim().toLowerCase();
      if (normalized === "email") return "Email";
      if (normalized === "text" || normalized === "sms") return "SMS";
      return channel;
    })
    .filter((label) => {
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
  if (labels.length === 0) return "—";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export default async function LeadDetailPage({ params }: Props) {
  const { id } = await params;
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const [
    {
      data: { user }
    },
    { data: lead },
    { data: photos },
    { data: existingQuote },
    { data: profile },
    { data: unlockRow },
    credits
  ] = await Promise.all([
    supabase.auth.getUser(),
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
      .single(),
    supabase.from("lead_unlocks").select("id").eq("org_id", auth.orgId).eq("lead_id", id).maybeSingle(),
    getOrgCredits(auth.orgId)
  ]);

  if (!lead) notFound();

  // Generate fresh signed URLs at render time (1-hour TTL) instead of
  // relying on the long-lived URLs stored in the public_url column.
  // This way a leaked URL only works for an hour, and revoking access
  // (via storage RLS) takes effect immediately.
  const photosWithFreshUrls = await (async () => {
    if (!photos || photos.length === 0) return photos ?? [];
    const admin = createAdminClient();
    const ONE_HOUR = 60 * 60;
    return Promise.all(
      photos.map(async (photo) => {
        const path = photo.storage_path as string | null;
        if (!path) {
          return { ...photo, signed_url: (photo.public_url as string | null) ?? null };
        }
        const { data: signed } = await admin.storage
          .from("lead-photos")
          .createSignedUrl(path, ONE_HOUR);
        return { ...photo, signed_url: signed?.signedUrl ?? null };
      })
    );
  })();

  const isUnlocked = Boolean(unlockRow?.id);
  const isLocked = !isUnlocked;
  const addressParts = getAddressParts((lead.address_full as string | null) ?? null);

  const requestedService = ((lead.services as string[] | null) ?? [])[0] ?? "unknown";
  const aiServiceEstimates = Array.isArray(lead.ai_service_estimates)
    ? (
        lead.ai_service_estimates as Array<{
          service?: unknown;
          lowEstimate?: unknown;
          highEstimate?: unknown;
          scopeSummary?: unknown;
        }>
      )
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
  const displayAddress = isLocked
    ? getVisibleAddress(lead.address_full as string)
    : (lead.address_full as string);
  const draftPublicId = (existingQuote?.public_id as string | null) ?? null;
  const existingQuoteStatus = (existingQuote?.status as string | null) ?? null;
  const isDraftQuote = existingQuoteStatus === "DRAFT";
  // EXPIRED is a "resendable" starting point — the 7-day window elapsed,
  // the contractor can edit the message and send again via DRAFT-or-EXPIRED
  // CAS in /api/app/quote/send. The composer opens in phase 2 with the
  // existing estimate pre-filled instead of the generate-then-send flow.
  const isExpiredQuote = existingQuoteStatus === "EXPIRED";
  const canComposeQuote = !existingQuote || isDraftQuote || isExpiredQuote;
  const isSentQuote = existingQuote && !isDraftQuote && !isExpiredQuote;
  const companyName = (profile?.business_name as string | null)?.trim() || "SnapQuote";
  const contractorPhone = (profile?.phone as string | null)?.trim() || "Not provided";
  const contractorEmail =
    ((profile?.email as string | null)?.trim() || user?.email?.trim() || "Not provided");
  const estimateTemplate = (profile?.quote_sms_template as string | null)?.trim() ||
    DEFAULT_ESTIMATE_SMS_TEMPLATE;
  // For the message preview, use the real permanent publicId if a draft exists,
  // otherwise fall back to a placeholder that will be replaced at send time.
  const activePublicId = draftPublicId ?? randomBytes(6).toString("base64url");
  const previewMessage = renderEstimateTemplate(estimateTemplate, {
    customerName: getDisplayCustomerName(lead.customer_name as string | null),
    estimateLink: buildEstimateLink(activePublicId),
    companyName,
    contractorPhone,
    contractorEmail
  });
  const aiEstimateDisplay = formatCurrencyRange(
    lead.ai_estimate_low as number | null,
    lead.ai_estimate_high as number | null,
    lead.ai_suggested_price as number | null
  );
  const quoteEstimateDisplay = formatCurrencyRange(
    existingQuote?.estimated_price_low as number | string | null | undefined,
    existingQuote?.estimated_price_high as number | string | null | undefined
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{displayAddress}</h1>
          <p className="text-sm text-muted-foreground">
            Submitted {toRelativeMinutes(lead.submitted_at)} ({format(new Date(lead.submitted_at), "PPpp")})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isUnlocked ? <Badge variant="secondary">Unlocked</Badge> : null}
          <Badge variant="secondary">{lead.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Lead Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <section>
              <h3 className="text-sm font-semibold text-foreground">Services</h3>
              <div className="mt-1 flex flex-wrap gap-1">
                {(lead.services as string[]).map((service) => (
                  <Badge key={service} className={getServiceBadgeClassName(service)}>{service}</Badge>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-foreground">Customer Description</h3>
              <p className="text-sm text-foreground/80">{lead.description || "No description provided."}</p>
            </section>

            <section>
              <h3 className="text-sm font-semibold text-foreground">Customer Answers</h3>
              {customerAnswerGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No questionnaire answers available.</p>
              ) : (
                <div className="mt-2 space-y-3">
                  {customerAnswerGroups.map((group) => (
                    <div key={group.service} className="rounded-lg border border-border bg-muted p-3">
                      <p className="text-sm font-medium text-foreground">{group.service}</p>
                      <dl className="mt-3 space-y-3">
                        {group.answers.map((answer) => (
                          <div key={answer.key}>
                            <dt className="text-sm font-medium text-muted-foreground">
                              {answer.label}:
                            </dt>
                            <dd className="mt-1 text-sm text-foreground/80">{answer.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-foreground">Property</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {lead.travel_distance_miles != null
                  ? `Approx. travel distance from business: ${Number(lead.travel_distance_miles).toFixed(1)} miles`
                  : "Travel distance not included for this lead."}
              </p>
              {isLocked ? (
                <div className="mt-3 rounded-lg border border-dashed border-border bg-muted p-6 text-center">
                  <div className="rounded-lg bg-border/80 px-4 py-10 text-sm text-muted-foreground blur-sm select-none">
                    Property details hidden
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Unlock this lead to reveal the full street address and property view.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <LeadUnlockButton leadId={lead.id as string}>Unlock — 1 Credit</LeadUnlockButton>
                    <span className="text-sm text-muted-foreground">{credits.total} credits remaining</span>
                  </div>
                </div>
              ) : (
                <div className="[&>div>p:first-child]:hidden">
                  <LeadPropertyPreview
                    address={lead.address_full as string}
                    lat={lead.lat as number | null}
                    lng={lead.lng as number | null}
                  />
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-foreground">Photos</h3>
              {photosWithFreshUrls.length === 0 ? (
                <p className="text-sm text-muted-foreground">No photos uploaded.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photosWithFreshUrls.map((photo) => {
                    const url =
                      ((photo as { signed_url?: string | null }).signed_url ??
                        (photo.public_url as string | null)) ||
                      "";
                    if (!url) return null;
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo.id}
                        src={url}
                        alt="Lead"
                        className="h-28 w-full rounded-md object-cover"
                      />
                    );
                  })}
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isUnlocked ? (
                <div className="space-y-2 text-sm text-foreground/80">
                  <p className="font-medium text-foreground">
                    {(lead.customer_name as string | null) ?? "No name provided"}
                  </p>
                  <p>{(lead.customer_phone as string | null) ?? "No phone provided"}</p>
                  <p>{(lead.customer_email as string | null) ?? "No email provided"}</p>
                  <p>{lead.address_full as string}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted p-4">
                    <div className="mb-3 flex items-center gap-2 text-muted-foreground">
                      <Lock className="h-4 w-4" />
                      <p className="text-sm font-medium">Contact info locked</p>
                    </div>
                    <div className="select-none space-y-1 text-sm text-muted-foreground blur-sm">
                      <p>Customer name hidden</p>
                      <p>Phone hidden</p>
                      <p>Email hidden</p>
                      <p>Street address hidden</p>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{addressParts.locality}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <LeadUnlockButton leadId={lead.id as string}>Unlock — 1 Credit</LeadUnlockButton>
                    <span className="text-sm text-muted-foreground">{credits.total} credits remaining</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Unlock this lead to reveal full address and contact details.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>AI Estimate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {lead.ai_status === "failed" ? (
                <>
                  <p className="font-medium text-amber-700">AI estimate unavailable</p>
                  <p className="text-foreground/80">
                    We couldn&apos;t generate an AI estimate for this lead. You can still review the lead and send your own estimate manually.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-foreground/80">Estimated price: {aiEstimateDisplay ?? "Pending estimate..."}</p>
                  <p className="text-foreground/80">{surfaceAreaSummary}</p>
                </>
              )}
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
              <CardTitle>Send Estimate</CardTitle>
            </CardHeader>
            <CardContent>
              {isSentQuote ? (
                <div className="space-y-2 text-sm">
                  <p className="text-foreground/80">Estimate already sent for this lead.</p>
                  <p className="text-foreground/80">
                    Price: {quoteEstimateDisplay ?? toCurrency(Number(existingQuote.price))} ({existingQuote.status})
                  </p>
                  {Array.isArray(existingQuote.sent_via) && (existingQuote.sent_via as string[]).length > 0 ? (
                    <p className="text-muted-foreground">
                      Sent via {formatSentVia(existingQuote.sent_via as string[])}.
                    </p>
                  ) : null}
                  <Link href={`/q/${existingQuote.public_id}`} target="_blank">
                    Preview customer estimate page
                  </Link>
                </div>
              ) : isLocked ? (
                <div className="space-y-3 text-sm">
                  <p className="text-foreground/80">
                    Unlock this lead before sending an estimate to the customer.
                  </p>
                  <LeadUnlockButton leadId={lead.id as string}>Unlock — 1 Credit</LeadUnlockButton>
                  <p className="text-muted-foreground">{credits.total} credits remaining</p>
                </div>
              ) : canComposeQuote ? (
                <div className="space-y-3">
                  {isExpiredQuote ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      This estimate expired. Edit the details below and hit
                      <span className="whitespace-nowrap"> “Resend Estimate”</span> to send it again —
                      the customer&apos;s existing link will reflect the new estimate and reset the 7-day window.
                    </div>
                  ) : null}
                  <QuoteComposer
                    leadId={lead.id as string}
                    publicId={activePublicId}
                    snapQuote={Number(lead.ai_suggested_price ?? 900)}
                    estimateLow={
                      isDraftQuote || isExpiredQuote
                        ? Number(existingQuote.estimated_price_low ?? lead.ai_estimate_low ?? null)
                        : ((lead.ai_estimate_low as number | null) ?? null)
                    }
                    estimateHigh={
                      isDraftQuote || isExpiredQuote
                        ? Number(existingQuote.estimated_price_high ?? lead.ai_estimate_high ?? null)
                        : ((lead.ai_estimate_high as number | null) ?? null)
                    }
                    serviceEstimates={aiServiceEstimates}
                    initialMessage={
                      isExpiredQuote
                        ? ((existingQuote.message as string | null) ?? previewMessage)
                        : previewMessage
                    }
                    customerName={(lead.customer_name as string | null) ?? null}
                    customerPhone={(lead.customer_phone as string | null) ?? null}
                    customerEmail={(lead.customer_email as string | null) ?? null}
                    canSend
                    isResend={isExpiredQuote}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
