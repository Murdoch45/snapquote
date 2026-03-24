"use client";

import { type ReactNode, useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileText,
  Home,
  MapPin,
  Receipt,
  Search,
  Settings,
  Sparkles,
  TrendingUp
} from "lucide-react";
import {
  type DemoView,
  type LeadStatus,
  type MetricTone,
  activityFeed,
  demoLeads,
  demoQuotes,
  overviewMetrics,
  quoteTrend,
  serviceMix,
  settingsPanels,
  todaySchedule
} from "@/components/landing/demo-data";
import { cn, toCurrency } from "@/lib/utils";

type NavigationItem = {
  id: DemoView;
  label: string;
  description: string;
  icon: LucideIcon;
};

const navigationItems: NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", description: "Overview", icon: Home },
  { id: "leads", label: "Leads", description: "Incoming requests", icon: FileText },
  { id: "quotes", label: "Estimates", description: "Sent estimates", icon: Receipt },
  { id: "analytics", label: "Analytics", description: "Performance", icon: BarChart3 },
  { id: "settings", label: "Settings", description: "Preferences", icon: Settings }
];

const viewMeta: Record<
  DemoView,
  { eyebrow: string; title: string; description: string }
> = {
  dashboard: {
    eyebrow: "Today at a glance",
    title: "Keep every lead moving toward a booked job.",
    description:
      "A polished SnapQuote workspace preview with the same white-and-blue tone as the app, powered entirely by static mock data."
  },
  leads: {
    eyebrow: "Lead intake",
    title: "See new requests clearly before your team touches a thing.",
    description:
      "Review services, photos, locations, statuses, and suggested pricing in one controlled landing-page demo view."
  },
  quotes: {
    eyebrow: "Estimate workflow",
    title: "Track estimates without opening the full back office.",
    description:
      "Show how SnapQuote organizes sent estimates, approvals, follow-ups, and booked work without triggering real actions."
  },
  analytics: {
    eyebrow: "Performance",
    title: "Understand what is winning, where, and why.",
    description:
      "Simple, believable summary metrics help the landing page feel like a real product while staying lightweight."
  },
  settings: {
    eyebrow: "Preferences",
    title: "Set the rules once and keep operations moving.",
    description:
      "A compact view of service coverage, automations, and pricing preferences rounds out the demo without exposing live settings."
  }
};

const metricToneClasses: Record<MetricTone, string> = {
  cool: "bg-sky-50 text-sky-700",
  positive: "bg-emerald-50 text-emerald-700",
  neutral: "bg-slate-100 text-slate-600"
};

const badgeClasses: Record<string, string> = {
  New: "bg-sky-50 text-sky-700 ring-sky-200",
  Estimated: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Scheduled: "bg-amber-50 text-amber-700 ring-amber-200",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Draft: "bg-slate-100 text-slate-600 ring-slate-200",
  Sent: "bg-sky-50 text-sky-700 ring-sky-200",
  Viewed: "bg-violet-50 text-violet-700 ring-violet-200",
  Accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Arriving: "bg-sky-50 text-sky-700 ring-sky-200",
  "On site": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "18 min travel": "bg-amber-50 text-amber-700 ring-amber-200",
  "Proposal review": "bg-violet-50 text-violet-700 ring-violet-200"
};

const pipelineStages: LeadStatus[] = ["New", "Estimated", "Scheduled", "Completed"];

export function ProductDemo() {
  const [activeView, setActiveView] = useState<DemoView>("dashboard");
  const [isPending, startTransition] = useTransition();
  const activeMeta = viewMeta[activeView];

  const handleChangeView = (view: DemoView) => {
    if (view === activeView) return;
    startTransition(() => {
      setActiveView(view);
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_52px_120px_-60px_rgba(15,23,42,0.65)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.22),transparent_50%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_42%)]" />

      <div className="border-b border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur md:px-6 md:py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white">
                Interactive demo
              </span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                Static contractor data
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.045em] text-slate-950 md:text-3xl">
              SnapQuote from first lead to booked work.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              Click between the core views and scroll inside the workspace. It looks like a
              premium product preview without carrying any of the real dashboard behavior.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 xl:flex">
              <Search className="h-4 w-4" />
              Search leads, estimates, customers
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Workspace
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                Blue Ridge Outdoor Services
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row">
        <aside className="border-b border-slate-200/80 bg-[#f8fbff] md:w-[264px] md:border-b-0 md:border-r">
          <div className="flex gap-2 overflow-x-auto p-3 md:flex-col md:overflow-visible md:p-4">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeView;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleChangeView(item.id)}
                  className={cn(
                    "group flex min-w-[172px] items-center gap-3 rounded-[22px] border px-4 py-3 text-left transition-all md:min-w-0",
                    active
                      ? "border-sky-200 bg-white text-slate-950 shadow-[0_18px_36px_-30px_rgba(15,23,42,0.45)]"
                      : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white/80"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors",
                      active
                        ? "bg-gradient-to-br from-sky-100 via-blue-50 to-white text-sky-700"
                        : "bg-white text-slate-500 group-hover:text-slate-700"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      "hidden h-4 w-4 transition md:block",
                      active
                        ? "translate-x-0 opacity-100 text-sky-600"
                        : "-translate-x-1 opacity-0 text-slate-300 group-hover:translate-x-0 group-hover:opacity-100"
                    )}
                  />
                </button>
              );
            })}
          </div>
          <div className="hidden border-t border-slate-200/80 p-4 md:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Today
            </p>
            <div className="mt-4 space-y-3">
              <SidebarStat label="New leads today" value="12" />
              <SidebarStat label="Estimates awaiting reply" value="7" />
              <SidebarStat label="Crews booked today" value="3" />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,247,255,0.92))]">
          <div className="flex h-full min-h-[620px] flex-col md:min-h-[760px]">
            <div className="border-b border-slate-200/80 bg-white/70 px-5 py-4 backdrop-blur md:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-600">
                    {activeMeta.eyebrow}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-slate-950">
                    {activeMeta.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {activeMeta.description}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <TopPill icon={Sparkles} label="Preview mode" />
                  <TopPill icon={Clock3} label="Scrollable workspace" />
                </div>
              </div>
            </div>

            <div
              className={cn(
                "landing-scrollbar flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6",
                isPending && "opacity-80 transition-opacity"
              )}
            >
              <div key={activeView} className="landing-fade-up space-y-6">
                {activeView === "dashboard" ? <DashboardView /> : null}
                {activeView === "leads" ? <LeadsView /> : null}
                {activeView === "quotes" ? <QuotesView /> : null}
                {activeView === "analytics" ? <AnalyticsView /> : null}
                {activeView === "settings" ? <SettingsView /> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardView() {
  const stageCounts = pipelineStages.map((stage) => ({
    stage,
    count: demoLeads.filter((lead) => lead.status === stage).length
  }));
  const maxStageCount = Math.max(...stageCounts.map((stage) => stage.count), 1);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-4">
        {overviewMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            tone={metric.tone}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
        <SurfaceCard>
          <SectionHeader
            title="Recent leads"
            description="New request flow across common outdoor service jobs."
          />
          <div className="mt-5 space-y-3">
            {demoLeads.slice(0, 5).map((lead) => (
              <div
                key={`${lead.customer}-${lead.service}`}
                className="flex flex-col gap-3 rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{lead.customer}</p>
                    <StatusBadge label={lead.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {lead.service} in {lead.location}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span>{lead.photos} photos</span>
                  <span>{lead.requestedAt}</span>
                  <span className="font-semibold text-slate-900">
                    {toCurrency(lead.suggestedQuote)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Pipeline"
            description="A clean snapshot of where work is sitting right now."
          />
          <div className="mt-5 space-y-4">
            {stageCounts.map((item) => (
              <div key={item.stage} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{item.stage}</span>
                  <span className="text-slate-500">{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
                    style={{ width: `${(item.count / maxStageCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-[22px] bg-sky-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Response speed</p>
            <p className="mt-1 text-sm text-slate-600">
              Median time from intake to first estimate stays under 11 minutes.
            </p>
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
        <SurfaceCard>
          <SectionHeader
            title="Today's schedule"
            description="Booked work and sales visits sitting beside estimate activity."
          />
          <div className="mt-5 space-y-3">
            {todaySchedule.map((item) => (
              <div
                key={`${item.time}-${item.customer}`}
                className="flex flex-col gap-3 rounded-[22px] border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.customer}</p>
                    <p className="text-sm text-slate-600">
                      {item.service} / {item.crew}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span>{item.time}</span>
                  <StatusBadge label={item.status} />
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Activity feed"
            description="Quick, low-noise updates that keep the team oriented."
          />
          <div className="mt-5 space-y-4">
            {activityFeed.map((item) => (
              <div key={item.title} className="flex gap-3">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    {item.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </>
  );
}

function LeadsView() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.45fr_0.8fr]">
      <SurfaceCard className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Incoming requests</p>
            <p className="mt-1 text-sm text-slate-600">
              Landing-page preview rows only. No lead drill-downs or editing.
            </p>
          </div>
          <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
            {demoLeads.length} active leads
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200/80 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Location</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Suggested</th>
                <th className="px-5 py-3 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody>
              {demoLeads.map((lead) => (
                <tr
                  key={`${lead.customer}-${lead.service}`}
                  className="border-b border-slate-200/80 bg-white last:border-0"
                >
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-semibold text-slate-950">{lead.customer}</p>
                      <p className="mt-1 text-slate-500">{lead.photos} photos attached</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{lead.service}</td>
                  <td className="px-5 py-4 text-slate-700">{lead.location}</td>
                  <td className="px-5 py-4">
                    <StatusBadge label={lead.status} />
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {toCurrency(lead.suggestedQuote)}
                  </td>
                  <td className="px-5 py-4 text-slate-500">{lead.requestedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <div className="space-y-6">
        <SurfaceCard>
          <SectionHeader title="Lead mix" description="Believable volume across everyday services." />
          <div className="mt-5 space-y-4">
            {serviceMix.slice(0, 5).map((item) => (
              <div key={item.service} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{item.service}</span>
                  <span className="text-slate-500">{item.share}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
                    style={{ width: `${item.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Coverage"
            description="Common service areas reflected in the mock data."
          />
          <div className="mt-5 space-y-3">
            <LocationRow label="Austin metro" detail="Pressure washing, lawn care" />
            <LocationRow label="Temecula corridor" detail="Gutter cleaning, window cleaning" />
            <LocationRow label="Scottsdale and Mesa" detail="Landscaping, pool service" />
            <LocationRow label="Fort Worth" detail="Exterior painting and larger tickets" />
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
}

function QuotesView() {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <SurfaceCard>
          <p className="text-sm font-medium text-slate-500">Awaiting approval</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">7</p>
          <p className="mt-2 text-sm text-slate-600">
            Viewed estimates still inside the follow-up window.
          </p>
        </SurfaceCard>
        <SurfaceCard>
          <p className="text-sm font-medium text-slate-500">Scheduled from estimates</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">18</p>
          <p className="mt-2 text-sm text-slate-600">
            Booked jobs move cleanly from acceptance to route planning.
          </p>
        </SurfaceCard>
        <SurfaceCard>
          <p className="text-sm font-medium text-slate-500">Approval cycle</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
            1.8 days
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Fast enough to feel responsive, realistic enough to feel credible.
          </p>
        </SurfaceCard>
      </div>

      <SurfaceCard className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Estimate queue</p>
            <p className="mt-1 text-sm text-slate-600">
              A focused, read-only preview of sent estimates and their next step.
            </p>
          </div>
          <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
            {demoQuotes.length} recent estimates
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200/80 text-left text-xs uppercase tracking-[0.22em] text-slate-400">
                <th className="px-5 py-3 font-medium">Estimate</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Sent</th>
                <th className="px-5 py-3 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {demoQuotes.map((quote) => (
                <tr
                  key={quote.quoteId}
                  className="border-b border-slate-200/80 bg-white last:border-0"
                >
                  <td className="px-5 py-4 font-semibold text-slate-950">{quote.quoteId}</td>
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-semibold text-slate-950">{quote.customer}</p>
                      <p className="mt-1 text-slate-500">{quote.location}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{quote.service}</td>
                  <td className="px-5 py-4 font-semibold text-slate-900">
                    {toCurrency(quote.amount)}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge label={quote.status} />
                  </td>
                  <td className="px-5 py-4 text-slate-500">{quote.sentAt}</td>
                  <td className="px-5 py-4 text-slate-700">{quote.nextStep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </>
  );
}

function AnalyticsView() {
  const maxSent = Math.max(...quoteTrend.map((point) => point.sent), 1);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-4">
        {overviewMetrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
            tone={metric.tone}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.85fr]">
        <SurfaceCard>
          <SectionHeader
            title="Estimate performance"
            description="Sent versus won across the last six weeks."
          />
          <div className="mt-6">
            <div className="mb-5 flex items-center gap-4 text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                Sent
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Won
              </span>
            </div>
            <div className="flex h-64 items-end gap-4">
              {quoteTrend.map((point) => (
                <div key={point.label} className="flex flex-1 flex-col items-center gap-3">
                  <div className="flex h-full items-end gap-2">
                    <div
                      className="w-5 rounded-t-2xl bg-gradient-to-t from-blue-700 to-sky-400"
                      style={{ height: `${(point.sent / maxSent) * 100}%` }}
                    />
                    <div
                      className="w-5 rounded-t-2xl bg-gradient-to-t from-emerald-600 to-emerald-300"
                      style={{ height: `${(point.won / maxSent) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
                    {point.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Service mix"
            description="The contractor work types driving most volume."
          />
          <div className="mt-5 space-y-4">
            {serviceMix.map((item) => (
              <div key={item.service} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{item.service}</span>
                  <span className="text-slate-500">{item.share}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
                    style={{ width: `${item.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <InsightCard
          icon={TrendingUp}
          title="Best closing lane"
          description="Pressure washing estimates close fastest at a believable 52% win rate."
        />
        <InsightCard
          icon={Clock3}
          title="Fastest response window"
          description="Requests submitted before lunch get estimated in roughly 8 to 10 minutes."
        />
        <InsightCard
          icon={MapPin}
          title="Top market"
          description="Austin metro generates the cleanest blend of volume, speed, and average ticket."
        />
      </div>
    </>
  );
}

function SettingsView() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {settingsPanels.map((panel) => (
        <SurfaceCard key={panel.title}>
          <SectionHeader title={panel.title} description={panel.description} />
          <div className="mt-5 space-y-3">
            {panel.items.map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-4"
              >
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-sky-500" />
                <p className="text-sm leading-6 text-slate-600">{item}</p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  tone: MetricTone;
}) {
  return (
    <SurfaceCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            metricToneClasses[tone]
          )}
        >
          {detail}
        </span>
      </div>
    </SurfaceCard>
  );
}

function SurfaceCard({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_44px_-36px_rgba(15,23,42,0.5)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        badgeClasses[label] ?? "bg-slate-100 text-slate-600 ring-slate-200"
      )}
    >
      {label}
    </span>
  );
}

function TopPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
    </div>
  );
}

function LocationRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4">
      <p className="text-sm font-semibold text-slate-950">{label}</p>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
    </div>
  );
}

function InsightCard({
  icon: Icon,
  title,
  description
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <SurfaceCard>
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-5 text-lg font-semibold tracking-[-0.03em] text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </SurfaceCard>
  );
}
