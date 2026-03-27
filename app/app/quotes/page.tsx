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
import { formatCurrencyRange } from "@/lib/utils";

function getStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "SENT":
      return "border-transparent bg-[#EFF6FF] text-[#2563EB]";
    case "VIEWED":
      return "border-transparent bg-[#F5F3FF] text-[#7C3AED]";
    case "ACCEPTED":
      return "border-transparent bg-[#F0FDF4] text-[#16A34A]";
    case "DECLINED":
      return "border-transparent bg-[#FEF2F2] text-[#DC2626]";
    case "EXPIRED":
      return "border-transparent bg-[#FFF7ED] text-[#EA580C]";
    case "DRAFT":
    default:
      return "border-transparent bg-[#F9FAFB] text-[#6B7280]";
  }
}

export default async function QuotesPage() {
  const auth = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data: quotes } = await supabase
    .from("quotes")
    .select("id,public_id,price,estimated_price_low,estimated_price_high,status,sent_at,accepted_at,lead:leads(address_full,services)")
    .eq("org_id", auth.orgId)
    .order("sent_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#111827]">Sent estimates</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
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
                    Sent
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
                {(quotes ?? []).map((quote) => {
                  const lead = Array.isArray(quote.lead) ? quote.lead[0] : quote.lead;
                  const address = lead?.address_full ?? "";
                  const primaryService = ((lead?.services as string[] | null) ?? [])[0] ?? "Service";
                  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
                  const displayPrice =
                    formatCurrencyRange(
                      quote.estimated_price_low as number | string | null | undefined,
                      quote.estimated_price_high as number | string | null | undefined
                    ) ??
                    formatCurrencyRange(null, null, quote.price as number | string | null | undefined) ??
                    "-";

                  return (
                  <TableRow
                    key={quote.id}
                    className="border-b border-[#E5E7EB] transition-colors hover:bg-[#F9FAFB]"
                  >
                    <TableCell className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {(((lead?.services as string[] | null) ?? []).length > 0
                          ? ((lead?.services as string[] | null) ?? [])
                          : ["Service"]
                        ).map((service) => (
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
                        {displayPrice}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        {address ? (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[#111827] underline-offset-4 transition-colors hover:text-[#2563EB] hover:underline"
                          >
                            {address}
                          </a>
                        ) : (
                          <span className="text-sm text-[#6B7280]">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <Badge className={`px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(quote.status)}`}>
                          {quote.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-sm text-[#6B7280]">
                        {new Date(quote.sent_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <Button
                          asChild
                          variant="outline"
                          className="h-auto border-2 border-[#2563EB] bg-transparent px-4 py-2 font-semibold text-[#2563EB] hover:bg-[#EFF6FF]"
                        >
                          <Link href={`/q/${quote.public_id}`} target="_blank">
                            Open public estimate
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-[#6B7280]">
                        <ChevronRight className="h-4 w-4" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
