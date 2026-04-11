import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getServiceBadgeClassName } from "@/lib/serviceColors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCurrencyRange, publicQuoteExpiry } from "@/lib/utils";

// Force dynamic rendering so freshly sent estimates appear immediately.
export const dynamic = "force-dynamic";

function getStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "SENT":
      return "border-transparent bg-[#EFF6FF] text-[#2563EB]";
    case "VIEWED":
      return "border-transparent bg-[#F5F3FF] text-[#7C3AED]";
    case "ACCEPTED":
      return "border-transparent bg-[#F0FDF4] text-[#16A34A]";
    case "EXPIRED":
      return "border-transparent bg-[#FFF7ED] text-[#EA580C]";
    default:
      return "border-transparent bg-[#F9FAFB] text-[#6B7280]";
  }
}

export default async function QuotesPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Only show sent estimates — DRAFT quotes are internal and should not appear.
  const { data: quotes } = await supabase
    .from("quotes")
    .select(
      "id,public_id,price,estimated_price_low,estimated_price_high,status,sent_at,accepted_at,lead:leads(address_full,services,customer_name)"
    )
    .eq("org_id", auth.orgId)
    .neq("status", "DRAFT")
    .order("sent_at", { ascending: false });

  const quoteRows = (quotes ?? []).map((quote) => {
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

    // Inline expiry detection — if the cron hasn't run yet but 7 days have
    // passed since sent_at, show EXPIRED status in the UI.
    const rawStatus = quote.status as string | null | undefined;
    const sentAt = quote.sent_at as string | null;
    const isExpired =
      sentAt &&
      (rawStatus === "SENT" || rawStatus === "VIEWED") &&
      new Date() > publicQuoteExpiry(sentAt);
    const effectiveStatus = isExpired ? "EXPIRED" : rawStatus;

    return {
      id: quote.id as string,
      publicId: quote.public_id as string,
      status: effectiveStatus,
      customerName,
      primaryService: services[0] ?? "Service",
      services,
      address,
      mapsUrl,
      displayPrice
    };
  });

  return (
    <div className="space-y-6">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#111827]">Sent estimates</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {quoteRows.length > 0 ? (
            <>
              {/* Mobile card layout */}
              <div className="space-y-3 md:hidden">
                {quoteRows.map((quote) => (
                  <div
                    key={quote.id}
                    className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[#111827]">
                          {quote.customerName}
                        </p>
                        <p className="mt-1 text-sm text-[#6B7280]">{quote.primaryService}</p>
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
                      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                        Price
                      </p>
                      <p className="mt-1 text-xl font-bold text-[#111827]">
                        {quote.displayPrice}
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                        Address
                      </p>
                      {quote.address && quote.mapsUrl ? (
                        <a
                          href={quote.mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block text-sm text-[#111827] underline-offset-4 transition-colors hover:text-[#2563EB] hover:underline"
                        >
                          {quote.address}
                        </a>
                      ) : (
                        <p className="mt-1 text-sm text-[#6B7280]">-</p>
                      )}
                    </div>

                    <Button
                      asChild
                      variant="outline"
                      className="mt-4 h-11 w-full border-2 border-[#2563EB] bg-transparent px-4 font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
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
                <div className="overflow-hidden rounded-[12px] border border-[#E5E7EB]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-[#E5E7EB] bg-[#F8F9FC] hover:bg-[#F8F9FC]">
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                          Services
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                          Price
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                          Address
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
                          Status
                        </TableHead>
                        <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">
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
                          className="border-b border-[#E5E7EB] transition-colors hover:bg-[#F9FAFB]"
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
                          <TableCell className="px-5 py-4 text-2xl font-bold text-[#111827]">
                            {quote.displayPrice}
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            {quote.address && quote.mapsUrl ? (
                              <a
                                href={quote.mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-[#111827] underline-offset-4 transition-colors hover:text-[#2563EB] hover:underline"
                              >
                                {quote.address}
                              </a>
                            ) : (
                              <span className="text-sm text-[#6B7280]">-</span>
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
                              className="h-auto border-2 border-[#2563EB] bg-transparent px-4 py-2 font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
                            >
                              <Link href={`/q/${quote.publicId}`} target="_blank">
                                Open public estimate
                              </Link>
                            </Button>
                          </TableCell>
                          <TableCell className="px-5 py-4 text-[#6B7280]">
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
            <p className="text-sm text-[#6B7280]">No estimates sent yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
