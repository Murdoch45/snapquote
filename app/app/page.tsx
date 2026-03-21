import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAnalytics } from "@/lib/db";
import { requireAuth } from "@/lib/auth/requireAuth";
import { toCurrency } from "@/lib/utils";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getServiceBadgeClass(service: string | null | undefined): string {
  const normalized = service?.trim().toLowerCase() ?? "";

  if (normalized.includes("pressure washing")) {
    return "bg-[#EFF6FF] text-[#2563EB]";
  }

  if (normalized.includes("lawn care")) {
    return "bg-[#F0FDF4] text-[#16A34A]";
  }

  if (normalized.includes("roof")) {
    return "bg-[#FFF7ED] text-[#EA580C]";
  }

  if (normalized.includes("concrete")) {
    return "bg-[#F9FAFB] text-[#6B7280]";
  }

  if (normalized.includes("fenc")) {
    return "bg-[#F5F3FF] text-[#7C3AED]";
  }

  return "bg-[#F9FAFB] text-[#6B7280]";
}

export default async function DashboardPage() {
  const auth = await requireAuth();
  const analytics = await getAnalytics(auth.orgId);

  const supabase = await createServerSupabaseClient();
  const [{ data: latestLeads }] = await Promise.all([
    supabase
      .from("leads")
      .select("id,address_full,submitted_at,services,status")
      .eq("org_id", auth.orgId)
      .eq("ai_status", "ready")
      .order("submitted_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <MetricCard title="Total leads (30d)" value={String(analytics.totals.totalLeads)} />
        <MetricCard title="Quotes sent (30d)" value={String(analytics.totals.quotesSent)} />
        <MetricCard title="Quotes accepted" value={String(analytics.totals.quotesAccepted)} />
        <MetricCard title="Acceptance rate" value={`${analytics.totals.acceptanceRate}%`} />
        <MetricCard title="Avg quote value" value={toCurrency(analytics.totals.avgQuoteValue)} />
        <MetricCard
          title="Avg response time"
          value={`${analytics.totals.avgResponseMinutes} min`}
        />
      </section>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg font-semibold text-[#111827]">Recent Leads</CardTitle>
          <Button asChild variant="outline">
            <Link href="/app/leads">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {latestLeads?.length ? (
            <div className="overflow-hidden rounded-[12px] border border-[#E5E7EB]">
              <div className="hidden grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_auto_24px] gap-4 border-b border-[#E5E7EB] bg-[#F8F9FC] px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280] md:grid">
                <span>Property Address</span>
                <span>Service Category</span>
                <span>Status</span>
                <span className="sr-only">Open</span>
              </div>
              <div className="divide-y divide-[#E5E7EB]">
                {latestLeads.map((lead) => {
                  const primaryService = (lead.services as string[] | null)?.[0] ?? "Service";

                  return (
                    <Link
                      key={lead.id}
                      href={`/app/leads/${lead.id}`}
                      className="grid gap-3 px-5 py-4 transition-colors hover:bg-[#F9FAFB] md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_auto_24px] md:items-center md:gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280] md:hidden">
                          Property Address
                        </p>
                        <p className="truncate text-sm text-[#111827]">{lead.address_full}</p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280] md:hidden">
                          Service Category
                        </p>
                        <span
                          className={`inline-flex rounded-full border border-transparent px-3 py-1 text-xs font-semibold ${getServiceBadgeClass(primaryService)}`}
                        >
                          {primaryService}
                        </span>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280] md:hidden">
                          Status
                        </p>
                        <span className="text-sm font-medium capitalize text-[#111827]">
                          {lead.status?.toLowerCase() ?? "New"}
                        </span>
                      </div>

                      <div className="hidden justify-self-end text-[#6B7280] md:block">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#6B7280]">No leads yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
