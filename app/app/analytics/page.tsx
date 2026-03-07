import { Charts } from "@/components/Charts";
import { MetricCard } from "@/components/MetricCard";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getAnalytics } from "@/lib/db";
import { toCurrency } from "@/lib/utils";

export default async function AnalyticsPage() {
  const auth = await requireAuth();
  const analytics = await getAnalytics(auth.orgId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500">Last 30 days performance.</p>
      </div>
      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard title="Total leads" value={String(analytics.totals.totalLeads)} />
        <MetricCard title="Quotes sent" value={String(analytics.totals.quotesSent)} />
        <MetricCard title="Quotes accepted" value={String(analytics.totals.quotesAccepted)} />
        <MetricCard title="Acceptance rate" value={`${analytics.totals.acceptanceRate}%`} />
        <MetricCard title="Avg quote value" value={toCurrency(analytics.totals.avgQuoteValue)} />
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
      />
    </div>
  );
}
