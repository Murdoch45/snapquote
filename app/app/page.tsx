import Link from "next/link";
import { cache, Suspense } from "react";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAnalytics } from "@/lib/db";
import { getOrgCredits } from "@/lib/credits";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getAddressParts } from "@/lib/leadPresentation";
import { getServiceBadgeClassName } from "@/lib/serviceColors";
import { toCurrency, formatCurrencyRange } from "@/lib/utils";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DashboardLeadList } from "@/components/DashboardLeadList";

function formatToday() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());
}

function formatResponseTime(minutes: number): string {
  if (minutes === 0) return "—";
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  NEW: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  QUOTED: "bg-accent/80 text-primary",
  ACCEPTED: "bg-[#CCFBF1] text-[#0F766E]"
};

type DashboardLead = {
  id: string;
  customer_name: string | null;
  address_full: string | null;
  job_city: string | null;
  job_state: string | null;
  submitted_at: string;
  services: string[];
  status: string;
  ai_estimate_low: number | string | null;
  ai_estimate_high: number | string | null;
  ai_suggested_price: number | string | null;
  isUnlocked: boolean;
};

function getLocationLabel(lead: DashboardLead): string {
  if (lead.job_city && lead.job_state) {
    return `${lead.job_city}, ${lead.job_state}`;
  }
  return getAddressParts(lead.address_full).locality;
}

function getEstimateLabel(lead: DashboardLead): string {
  const range = formatCurrencyRange(lead.ai_estimate_low, lead.ai_estimate_high, lead.ai_suggested_price);
  return range ?? "AI estimate pending";
}

// The fixed-width 140px stat cards have ~100px of inner content space; at
// 26px bold roughly 6 characters fit. Step the font size down for longer
// values like "$1,234" or "$1,234,567" so they don't get truncated. This
// is the web equivalent of `adjustsFontSizeToFit` on native — same logic
// runs at every screen size since the card width is fixed.
function getStatValueSizeClass(value: string): string {
  const len = value.length;
  if (len >= 11) return "text-[14px]";
  if (len >= 9) return "text-[17px]";
  if (len >= 7) return "text-[20px]";
  if (len >= 6) return "text-[23px]";
  return "text-[26px]";
}

// Deduped via React.cache so DashboardSubtitle and DashboardRecentLeads —
// two separate Suspense children that each await it — share a single
// request-scoped fetch instead of hitting Supabase twice per render.
const getDashboardLeads = cache(async (orgId: string): Promise<DashboardLead[]> => {
  const supabase = await createServerSupabaseClient();
  const [{ data: latestLeads }, { data: unlockedRows }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id,customer_name,address_full,job_city,job_state,submitted_at,services,status,ai_estimate_low,ai_estimate_high,ai_suggested_price"
      )
      .eq("org_id", orgId)
      .eq("ai_status", "ready")
      .order("submitted_at", { ascending: false })
      .limit(20),
    supabase.from("lead_unlocks").select("lead_id").eq("org_id", orgId)
  ]);
  const unlockedLeadIds = new Set(
    (unlockedRows ?? []).map((row) => row.lead_id as string)
  );
  return (latestLeads ?? []).map((lead) => ({
    id: lead.id as string,
    customer_name: lead.customer_name as string | null,
    address_full: lead.address_full as string | null,
    job_city: lead.job_city as string | null,
    job_state: lead.job_state as string | null,
    submitted_at: lead.submitted_at as string,
    services: ((lead.services as string[] | null) ?? []).filter(Boolean),
    status: lead.status as string,
    ai_estimate_low: lead.ai_estimate_low as number | string | null,
    ai_estimate_high: lead.ai_estimate_high as number | string | null,
    ai_suggested_price: lead.ai_suggested_price as number | string | null,
    isUnlocked: unlockedLeadIds.has(lead.id as string)
  }));
});

async function DashboardSubtitle({ orgId }: { orgId: string }) {
  const leads = await getDashboardLeads(orgId);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newLeadsThisWeek = leads.filter(
    (lead) =>
      lead.status === "NEW" &&
      new Date(lead.submitted_at).getTime() >= sevenDaysAgo
  ).length;
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {newLeadsThisWeek > 0
        ? `${newLeadsThisWeek} new lead${newLeadsThisWeek === 1 ? "" : "s"} this week`
        : "No new leads this week"}
    </p>
  );
}

async function DashboardStats({ orgId }: { orgId: string }) {
  const [analytics, credits] = await Promise.all([
    getAnalytics(orgId),
    getOrgCredits(orgId)
  ]);
  const { totals } = analytics;
  const stats = [
    { label: "Credits Remaining", value: String(credits.total) },
    { label: "Leads This Month", value: String(totals.totalLeads) },
    { label: "Estimates Sent", value: String(totals.quotesSent) },
    { label: "Estimates Accepted", value: String(totals.quotesAccepted) },
    { label: "Acceptance Rate", value: `${totals.acceptanceRate}%` },
    { label: "Avg Estimate Value", value: toCurrency(totals.avgQuoteValue) },
    { label: "Avg Response Time", value: formatResponseTime(totals.avgResponseMinutes) }
  ];
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="w-[140px] shrink-0 rounded-[14px] border border-border bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        >
          <p className="text-[13px] font-semibold uppercase leading-[18px] tracking-[0.04em] text-muted-foreground/70">
            {stat.label}
          </p>
          <p
            className={`mt-2 truncate font-bold text-primary ${getStatValueSizeClass(stat.value)}`}
          >
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}

async function DashboardRecentLeads({ orgId }: { orgId: string }) {
  const allLeads = await getDashboardLeads(orgId);
  const leadCards = allLeads.map((lead) => (
    <Link
      key={lead.id}
      href={`/app/leads/${lead.id}`}
      className="block rounded-[14px] border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)]"
    >
      {/* Header: name + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {!lead.isUnlocked ? <Lock className="h-4 w-4 shrink-0 text-muted-foreground/70" /> : null}
            <p className="truncate text-lg font-bold text-foreground">
              {lead.isUnlocked ? (lead.customer_name ?? "Lead") : "Locked Lead"}
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{getLocationLabel(lead)}</p>
        </div>
        <Badge
          className={`shrink-0 border-transparent px-3 py-1 text-xs font-semibold ${STATUS_BADGE_COLORS[lead.status] ?? STATUS_BADGE_COLORS.NEW}`}
        >
          {lead.status}
        </Badge>
      </div>

      {/* Service tags */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(lead.services.length > 0 ? lead.services : ["Service"]).map((service) => (
          <Badge
            key={service}
            className={`border-transparent px-3 py-1 text-xs font-semibold ${getServiceBadgeClassName(service)}`}
          >
            {service}
          </Badge>
        ))}
      </div>

      {/* Footer: estimate + date */}
      <div className="mt-4 flex items-end justify-between border-t border-border pt-3.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground/70">
            AI Estimate
          </p>
          <p className="mt-1 text-lg font-bold text-primary">{getEstimateLabel(lead)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground/70">
            Submitted
          </p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {formatDate(lead.submitted_at)}
          </p>
        </div>
      </div>
    </Link>
  ));

  if (leadCards.length === 0) {
    return (
      <div className="rounded-[14px] border border-border bg-card p-8 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <p className="text-lg font-bold text-foreground">No Leads Yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Share your link to start receiving estimate requests
        </p>
        <Link
          href="/dashboard/my-link"
          className="mt-4 inline-block text-sm font-semibold text-primary hover:text-primary/90"
        >
          Share My Link
        </Link>
      </div>
    );
  }
  return <DashboardLeadList cards={leadCards} total={allLeads.length} />;
}

function SubtitleSkeleton() {
  return <div className="mx-auto mt-1 h-4 w-36 animate-pulse rounded-[8px] bg-border" />;
}

function StatsSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="w-[140px] shrink-0 rounded-[14px] border border-border bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        >
          <div className="h-3 w-20 animate-pulse rounded-[8px] bg-border" />
          <div className="mt-2 h-7 w-16 animate-pulse rounded-[8px] bg-border" />
        </div>
      ))}
    </div>
  );
}

function RecentLeadsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[14px] border border-border bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-5 w-32 animate-pulse rounded-[8px] bg-border" />
              <div className="h-4 w-24 animate-pulse rounded-[8px] bg-border" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-border" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-24 animate-pulse rounded-full bg-border" />
          </div>
          <div className="mt-4 flex items-end justify-between border-t border-border pt-3.5">
            <div className="space-y-1">
              <div className="h-3 w-16 animate-pulse rounded-[8px] bg-border" />
              <div className="h-5 w-24 animate-pulse rounded-[8px] bg-border" />
            </div>
            <div className="space-y-1">
              <div className="h-3 w-14 animate-pulse rounded-[8px] bg-border" />
              <div className="h-4 w-16 animate-pulse rounded-[8px] bg-border" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const auth = await requireAuth();

  return (
    <div className="space-y-4">
      {/* Date header */}
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">{formatToday()}</p>
        <Suspense fallback={<SubtitleSkeleton />}>
          <DashboardSubtitle orgId={auth.orgId} />
        </Suspense>
      </div>

      {/* Stats — horizontal scroll */}
      <div>
        <p className="mb-2 text-lg font-semibold text-foreground">Stats</p>
        <Suspense fallback={<StatsSkeleton />}>
          <DashboardStats orgId={auth.orgId} />
        </Suspense>
      </div>

      {/* Recent Leads header */}
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold text-foreground">Recent Leads</p>
        <Link
          href="/app/leads"
          className="text-sm font-semibold text-primary hover:text-primary/90"
        >
          View All
        </Link>
      </div>

      <Suspense fallback={<RecentLeadsSkeleton />}>
        <DashboardRecentLeads orgId={auth.orgId} />
      </Suspense>
    </div>
  );
}
