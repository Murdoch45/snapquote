import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuotesFilterBar } from "@/components/QuotesFilterBar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/requireAuth";
import { computeEffectiveQuoteStatus } from "@/lib/quoteExpiry";
import type { QuoteStatus } from "@/lib/quoteStatus";
import { QUOTE_STATUSES } from "@/lib/quoteStatus";
import { getServiceBadgeClassName } from "@/lib/serviceColors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCurrencyRange } from "@/lib/utils";

// Force dynamic rendering so freshly sent estimates appear immediately.
export const dynamic = "force-dynamic";

// Keep the 25-per-page contract the contractors already know, but the
// page is now cursor-paginated on sent_at so the query cost stays flat
// even for orgs with thousands of estimates. DRAFT rows are still
// excluded at the query level (they're infrastructure, never surfaced).
const PAGE_SIZE = 25;

type Props = {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string }>;
};

function getStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "SENT":
      return "border-transparent bg-accent text-primary";
    case "VIEWED":
      return "border-transparent bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400";
    case "ACCEPTED":
      return "border-transparent bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400";
    case "EXPIRED":
      return "border-transparent bg-[#FFF7ED] text-[#EA580C]";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

// Labels the channel strings recorded by /api/app/quote/send in the
// quotes.sent_via array. The send route writes "email" and "text"; the
// UI renders them as "Email" and "SMS" for readability.
function formatSentVia(channels: readonly string[] | null | undefined): string {
  if (!channels || channels.length === 0) return "—";
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
  return labels.join(" + ");
}

// Pick the starting status for the composer-side filter. Rejects garbage
// values silently so a hand-edited URL can't poison the query with an
// enum value Postgres will 22P02 on.
function parseStatusFilter(value: string | undefined): QuoteStatus | null {
  if (!value) return null;
  const allowed = QUOTE_STATUSES.filter((status) => status !== "DRAFT");
  return (allowed as readonly string[]).includes(value) ? (value as QuoteStatus) : null;
}

export default async function QuotesPage({ searchParams }: Props) {
  const params = await searchParams;
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const searchTerm = (params.q ?? "").trim();
  const statusFilter = parseStatusFilter(params.status);
  const cursor = (params.cursor ?? "").trim() || null;

  // PostgREST embedded-filter syntax: the `!inner` join on leads + the
  // `.or(..., { foreignTable: "leads" })` filter restricts both the
  // returned quote rows and their embedded lead to matching names/emails/
  // phones. Without `!inner` we'd still see all quotes and only the
  // nested lead would filter — we want the quote list to shrink too.
  //
  // Note: leaving DRAFT exclusion on the quotes table, not on leads.
  let dataQuery = supabase
    .from("quotes")
    .select(
      "id,public_id,price,estimated_price_low,estimated_price_high,status,sent_at,accepted_at,sent_via,lead:leads!inner(address_full,services,customer_name,customer_email,customer_phone)"
    )
    .eq("org_id", auth.orgId)
    .neq("status", "DRAFT")
    .order("sent_at", { ascending: false })
    // Fetch one extra row to determine whether a next page exists without
    // a second count query.
    .limit(PAGE_SIZE + 1);

  if (statusFilter) {
    dataQuery = dataQuery.eq("status", statusFilter);
  }

  if (cursor) {
    // sent_at has millisecond precision and only one send per lead is
    // allowed, so collisions are effectively impossible. A strict-less-
    // than on the last row's sent_at gives clean cursor pagination.
    dataQuery = dataQuery.lt("sent_at", cursor);
  }

  if (searchTerm) {
    const escaped = searchTerm.replace(/[%_\\]/g, "\\$&");
    dataQuery = dataQuery.or(
      `customer_name.ilike.%${escaped}%,customer_email.ilike.%${escaped}%,customer_phone.ilike.%${escaped}%`,
      { foreignTable: "leads" }
    );
  }

  const { data: quotesFull } = await dataQuery;

  const rowsFull = quotesFull ?? [];
  const hasNext = rowsFull.length > PAGE_SIZE;
  const pageRows = hasNext ? rowsFull.slice(0, PAGE_SIZE) : rowsFull;
  const nextCursor = hasNext ? (pageRows[pageRows.length - 1]?.sent_at as string | null) : null;

  const quoteRows = pageRows.map((quote) => {
    const lead = Array.isArray(quote.lead) ? quote.lead[0] : quote.lead;
    const services = (((lead?.services as string[] | null) ?? []).length > 0
      ? ((lead?.services as string[] | null) ?? [])
      : ["Service"]) as string[];
    const address = lead?.address_full ?? "";
    const customerName = (lead?.customer_name as string | null)?.trim() || "Customer";
    const mapsUrl = address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;
    const displayPrice =
      formatCurrencyRange(
        quote.estimated_price_low as number | string | null | undefined,
        quote.estimated_price_high as number | string | null | undefined
      ) ??
      formatCurrencyRange(null, null, quote.price as number | string | null | undefined) ??
      "-";

    // Coerce expiry via the shared helper so this list view, the public
    // GET endpoint, the mobile list, and the cron all agree on "effective"
    // status even when the cron hasn't run yet.
    const rawStatus = quote.status as QuoteStatus | null | undefined;
    const sentAt = quote.sent_at as string | null;
    const effectiveStatus = rawStatus
      ? computeEffectiveQuoteStatus(rawStatus, sentAt)
      : rawStatus;

    const sentViaLabel = formatSentVia(quote.sent_via as string[] | null | undefined);

    return {
      id: quote.id as string,
      publicId: quote.public_id as string,
      status: effectiveStatus,
      customerName,
      primaryService: services[0] ?? "Service",
      services,
      address,
      mapsUrl,
      displayPrice,
      sentViaLabel
    };
  });

  // Build a next-page URL that preserves search/status filters.
  const nextUrlParams = new URLSearchParams();
  if (searchTerm) nextUrlParams.set("q", searchTerm);
  if (statusFilter) nextUrlParams.set("status", statusFilter);
  if (nextCursor) nextUrlParams.set("cursor", nextCursor);
  const nextHref = `/app/quotes?${nextUrlParams.toString()}`;

  const firstPageParams = new URLSearchParams();
  if (searchTerm) firstPageParams.set("q", searchTerm);
  if (statusFilter) firstPageParams.set("status", statusFilter);
  const firstPageHref = firstPageParams.toString()
    ? `/app/quotes?${firstPageParams.toString()}`
    : "/app/quotes";

  const onLaterPage = Boolean(cursor);
  const hasActiveFilters = Boolean(searchTerm) || Boolean(statusFilter);
  const emptyCopy = hasActiveFilters
    ? "No estimates match these filters."
    : "No estimates sent yet.";

  return (
    <div className="space-y-6">
      <QuotesFilterBar />

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">Sent estimates</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {quoteRows.length > 0 ? (
            <>
              {/* Mobile card layout */}
              <div className="space-y-3 md:hidden">
                {quoteRows.map((quote) => (
                  <div
                    key={quote.id}
                    className="rounded-[14px] border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">
                          {quote.customerName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{quote.primaryService}</p>
                      </div>
                      <Badge
                        className={`shrink-0 px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                          quote.status
                        )}`}
                      >
                        {quote.status ?? "-"}
                      </Badge>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {quote.services.map((service) => (
                        <Badge
                          key={service}
                          className={`px-3 py-1 text-xs font-semibold ${getServiceBadgeClassName(service)}`}
                        >
                          {service}
                        </Badge>
                      ))}
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                        Price
                      </p>
                      <p className="mt-1 text-xl font-bold text-foreground">
                        {quote.displayPrice}
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                        Sent via
                      </p>
                      <p className="mt-1 text-sm text-foreground/80">{quote.sentViaLabel}</p>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                        Address
                      </p>
                      {quote.address && quote.mapsUrl ? (
                        <a
                          href={quote.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block text-sm text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                        >
                          {quote.address}
                        </a>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">-</p>
                      )}
                    </div>

                    <Button
                      asChild
                      variant="outline"
                      className="mt-4 h-11 w-full border-2 border-primary bg-transparent px-4 font-semibold text-primary hover:bg-accent"
                    >
                      <Link href={`/q/${quote.publicId}`} target="_blank">
                        Open public estimate
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>

              {/* Desktop table layout */}
              <div className="hidden md:block">
                <div className="overflow-hidden rounded-[12px] border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border bg-muted hover:bg-muted">
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                          Services
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                          Price
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                          Sent via
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                          Address
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                          Status
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground">
                          Open public estimate
                        </TableHead>
                        <TableHead className="w-10 px-5 py-3">
                          <span className="sr-only">Open</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quoteRows.map((quote) => (
                        <TableRow
                          key={quote.id}
                          className="border-b border-border transition-colors hover:bg-muted"
                        >
                          <TableCell className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              {quote.services.map((service) => (
                                <Badge
                                  key={service}
                                  className={`px-3 py-1 text-xs font-semibold ${getServiceBadgeClassName(service)}`}
                                >
                                  {service}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-2xl font-bold text-foreground">
                            {quote.displayPrice}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-foreground/80">
                            {quote.sentViaLabel}
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            {quote.address && quote.mapsUrl ? (
                              <a
                                href={quote.mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                              >
                                {quote.address}
                              </a>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            <Badge
                              className={`px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                                quote.status
                              )}`}
                            >
                              {quote.status ?? "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            <Button
                              asChild
                              variant="outline"
                              className="h-auto border-2 border-primary bg-transparent px-4 py-2 font-semibold text-primary hover:bg-accent"
                            >
                              <Link href={`/q/${quote.publicId}`} target="_blank">
                                Open public estimate
                              </Link>
                            </Button>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-muted-foreground">
                            <ChevronRight className="h-4 w-4" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{emptyCopy}</p>
          )}
        </CardContent>
      </Card>

      {/* Cursor-style pagination. "Newest" resets cursor but keeps filters,
          so search + status survive the nav. "Next" forwards on sent_at.
          Intentionally no arbitrary page number: cursor pagination doesn't
          give us one without a second, potentially expensive count query. */}
      {quoteRows.length > 0 || onLaterPage ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p>
            Showing {quoteRows.length} {quoteRows.length === 1 ? "estimate" : "estimates"}
          </p>
          <div className="flex items-center gap-2">
            {onLaterPage ? (
              <Link
                href={firstPageHref}
                className="rounded-[10px] border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
              >
                Newest
              </Link>
            ) : (
              <span className="rounded-[10px] border border-border px-4 py-2 font-medium text-muted-foreground/70">
                Newest
              </span>
            )}
            {hasNext ? (
              <Link
                href={nextHref}
                className="rounded-[10px] border border-primary bg-primary px-4 py-2 font-medium text-white transition-colors hover:bg-primary/90"
              >
                Next
              </Link>
            ) : (
              <span className="rounded-[10px] border border-border px-4 py-2 font-medium text-muted-foreground/70">
                Next
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
