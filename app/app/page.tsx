import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { RequestPageCard } from "@/components/RequestPageCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAnalytics } from "@/lib/db";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getAppUrl, toCurrency } from "@/lib/utils";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const auth = await requireAuth();
  const analytics = await getAnalytics(auth.orgId);

  const supabase = await createServerSupabaseClient();
  const [{ data: latestLeads }, { data: profile }] = await Promise.all([
    supabase
      .from("leads")
      .select("id,address_full,submitted_at,services,status")
      .eq("org_id", auth.orgId)
      .eq("ai_status", "ready")
      .order("submitted_at", { ascending: false })
      .limit(5),
    supabase
      .from("contractor_profile")
      .select("public_slug")
      .eq("org_id", auth.orgId)
      .single()
  ]);

  const requestLink = profile?.public_slug
    ? `${getAppUrl()}/${profile.public_slug as string}`
    : null;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
      {requestLink ? <RequestPageCard requestLink={requestLink} /> : null}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Leads</CardTitle>
          <Button asChild variant="outline">
            <Link href="/app/leads">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {latestLeads?.length ? (
            latestLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/app/leads/${lead.id}`}
                className="block rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm hover:border-blue-300"
              >
                <p className="font-medium text-gray-900">{lead.address_full}</p>
                <p className="text-gray-600">{(lead.services as string[]).join(", ")}</p>
              </Link>
            ))
          ) : (
            <p className="text-sm text-gray-500">No leads yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
