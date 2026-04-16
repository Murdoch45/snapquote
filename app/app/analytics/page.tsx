import { AnalyticsEmptyState } from "@/components/AnalyticsEmptyState";
import { AnalyticsRangeSelector } from "@/components/AnalyticsRangeSelector";
import { Charts } from "@/components/Charts";
import { MetricCard } from "@/components/MetricCard";
import { requireAuth } from "@/lib/auth/requireAuth";
import {
  getAnalytics,
  isAnalyticsRange,
  type AnalyticsRange
} from "@/lib/db";
import { toCurrency } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ range?: string }>;
};

export default async function AnalyticsPage({ searchParams }: Props) {
  const { range: rawRange } = await searchParams;
  const range: AnalyticsRange = isAnalyticsRange(rawRange) ? rawRange : "30d";

  const auth = await requireAuth();
  const analytics = await getAnalytics(auth.orgId, range);

  const isEmpty =
    analytics.totals.totalLeads === 0 && analytics.totals.quotesSent === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-foreground">Analytics</h1>
        <AnalyticsRangeSelector current={range} />
      </div>

      {isEmpty ? (
        <AnalyticsEmptyState />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <MetricCard title="Total leads" value={String(analytics.totals.totalLeads)} />
            <MetricCard title="Estimates sent" value={String(analytics.totals.quotesSent)} />
            <MetricCard title="Estimates accepted" value={String(analytics.totals.quotesAccepted)} />
            <MetricCard title="Acceptance rate" value={`${analytics.totals.acceptanceRate}%`} />
            <MetricCard title="Avg estimate value" value={toCurrency(analytics.totals.avgQuoteValue)} />
            <MetricCard
              title="Avg response time"
              value={`${analytics.totals.avgResponseMinutes} min`}
            />
          </section>
          <Charts
            leadsOverTime={analytics.leadsOverTime}
            quotesOverTime={analytics.quotesOverTime}
            acceptanceRateOverTime={analytics.acceptanceRateOverTime}
            servicesBreakdown={analytics.servicesBreakdown}
            range={range}
          />
        </>
      )}
    </div>
  );
}
