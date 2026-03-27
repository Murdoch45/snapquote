"use client";

import { useEffect, useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Check,
  CreditCard,
  FileText,
  Home,
  Link2,
  Lock,
  LockOpen,
  Receipt,
  Search,
  Settings,
  UserCircle2,
  Users
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Charts } from "@/components/Charts";
import { MetricCard } from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { DemoApiResponse, DemoLeadItem, DemoPageId } from "@/lib/demo/shared";
import { demoPageLabels } from "@/lib/demo/shared";
import { getServiceBadgeClassName } from "@/lib/serviceColors";
import { cn, formatCurrencyRange, toRelativeMinutes } from "@/lib/utils";

type NavigationItem = {
  id: DemoPageId;
  label: string;
  icon: LucideIcon;
};

const navigationItems: NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "leads", label: "Leads", icon: FileText },
  { id: "quotes", label: "Estimates", icon: Receipt },
  { id: "customers", label: "Customers", icon: UserCircle2 },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "my-link", label: "My Link", icon: Link2 },
  { id: "plan", label: "Plan", icon: CreditCard },
  { id: "team", label: "Team", icon: Users },
  { id: "settings", label: "Settings", icon: Settings }
];

function getQuoteStatusBadgeClass(status: string): string {
  switch (status) {
    case "SENT":
      return "border-transparent bg-[#EFF6FF] text-[#2563EB]";
    case "VIEWED":
      return "border-transparent bg-[#F5F3FF] text-[#7C3AED]";
    case "ACCEPTED":
      return "border-transparent bg-[#F0FDF4] text-[#16A34A]";
    default:
      return "border-transparent bg-[#F9FAFB] text-[#6B7280]";
  }
}

function getLeadStatusBadgeClass(status: string): string {
  switch (status) {
    case "ACCEPTED":
      return "border-transparent bg-[#F0FDF4] text-[#16A34A]";
    case "QUOTED":
      return "border-transparent bg-[#EFF6FF] text-[#2563EB]";
    case "ARCHIVED":
      return "border-transparent bg-[#F9FAFB] text-[#6B7280]";
    default:
      return "border-transparent bg-[#FFF7ED] text-[#EA580C]";
  }
}

function DemoLoadingState({ title }: { title: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-[#D1D5DB] bg-white/90 p-10 text-center text-sm text-[#6B7280]">
      Loading {title.toLowerCase()} preview...
    </div>
  );
}

function DemoErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[16px] border border-[#FECACA] bg-[#FEF2F2] p-6 text-sm text-[#B91C1C]">
      {message}
    </div>
  );
}

function LeadEstimate({ lead }: { lead: DemoLeadItem }) {
  const estimate =
    formatCurrencyRange(lead.aiEstimateLow, lead.aiEstimateHigh, lead.aiSuggestedPrice) ??
    "Pending estimate...";

  return <span className="font-semibold text-[#111827]">{estimate}</span>;
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">{label}</p>
      <div className="rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FC] px-4 py-3 text-sm text-[#111827]">
        {value}
      </div>
    </div>
  );
}

function DashboardView({ data }: { data: DemoApiResponse<"dashboard"> }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.payload.metrics.map((metric) => (
          <MetricCard key={metric.title} title={metric.title} value={metric.value} subtext={metric.subtext} />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-[#111827]">Recent leads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {data.payload.recentLeads.map((lead) => (
              <div key={lead.id} className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {lead.services.map((service) => (
                        <Badge key={service} className={`px-3 py-1 text-xs font-semibold ${getServiceBadgeClassName(service)}`}>
                          {service}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-sm font-semibold text-[#111827]">{lead.customerName}</p>
                    <p className="text-sm text-[#6B7280]">{lead.cityState}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={getLeadStatusBadgeClass(lead.status)}>{lead.status}</Badge>
                    <Badge className="border-transparent bg-white text-[#6B7280]">
                      {lead.isUnlocked ? "Unlocked" : "Locked"}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#6B7280]">
                  <span>Submitted {toRelativeMinutes(lead.submittedAt)}</span>
                  <span>{lead.photoCount} photos</span>
                  <LeadEstimate lead={lead} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-[#111827]">At a glance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 pt-0">
            <div className="grid gap-3">
              {data.payload.statusSummary.map((item) => (
                <div key={item.label} className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] px-4 py-4">
                  <p className="text-sm text-[#6B7280]">{item.label}</p>
                  <p className="mt-2 text-3xl font-bold text-[#111827]">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#111827]">Service mix</p>
              {data.payload.serviceBreakdown.map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#111827]">{item.name}</span>
                    <span className="text-[#6B7280]">{item.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#E5E7EB]">
                    <div className="h-2 rounded-full bg-[#2563EB]" style={{ width: `${Math.max(12, item.value * 8)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LeadsView({ data }: { data: DemoApiResponse<"leads"> }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-medium text-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {data.payload.creditsRemaining} credits remaining
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.payload.leads.map((lead) => (
          <Card key={lead.id} className="h-full rounded-[14px] shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {lead.services.map((service) => (
                      <Badge key={service} className={`px-3 py-1 text-xs font-semibold ${getServiceBadgeClassName(service)}`}>
                        {service}
                      </Badge>
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#111827]">{lead.cityState}</p>
                    <p className="text-sm text-[#6B7280]">Submitted {toRelativeMinutes(lead.submittedAt)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge className="border-transparent bg-[#F9FAFB] text-[#6B7280]">{lead.photoCount} photos</Badge>
                  <Badge className={lead.isUnlocked ? "border-transparent bg-[#EFF6FF] text-[#2563EB]" : "border-transparent bg-[#F9FAFB] text-[#6B7280]"}>
                    {lead.isUnlocked ? "Unlocked" : "Locked"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6B7280]">AI Estimate</p>
                <p className="text-[28px] font-bold leading-none text-[#2563EB]">
                  {formatCurrencyRange(lead.aiEstimateLow, lead.aiEstimateHigh, lead.aiSuggestedPrice) ?? "Pending estimate..."}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#6B7280]">Job Details</p>
                <p className="text-sm text-[#111827]">{lead.aiJobSummary ?? "AI summary pending."}</p>
              </div>

              <div className="rounded-[8px] border border-[#E5E7EB] bg-[#F8F9FC] p-3">
                <div className="mb-3 flex items-center gap-2">
                  {lead.isUnlocked ? <LockOpen className="h-4 w-4 text-[#2563EB]" /> : <Lock className="h-4 w-4 text-[#6B7280]" />}
                  <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Contact Info</p>
                </div>

                {lead.isUnlocked ? (
                  <div className="space-y-1 text-sm text-[#111827]">
                    <p>{lead.customerName}</p>
                    <p>{lead.customerPhone ?? "No phone provided"}</p>
                    <p>{lead.customerEmail ?? "No email provided"}</p>
                    <p>{lead.addressFull}</p>
                  </div>
                ) : (
                  <div className="select-none rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#6B7280] blur-sm">
                    <p>Customer name hidden</p>
                    <p>Phone hidden</p>
                    <p>Email hidden</p>
                    <p>Street address hidden</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function QuotesView({ data }: { data: DemoApiResponse<"quotes"> }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Awaiting approval" value={String(data.payload.awaitingApprovalCount)} />
        <MetricCard title="Accepted jobs" value={String(data.payload.acceptedCount)} />
        <MetricCard title="Approval cycle" value={data.payload.avgApprovalCycleDays} />
      </section>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#111827]">Sent estimates</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-hidden rounded-[12px] border border-[#E5E7EB]">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#E5E7EB] bg-[#F8F9FC] hover:bg-[#F8F9FC]">
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Services</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Price</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Address</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Status</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payload.quotes.map((quote) => (
                  <TableRow key={quote.id} className="border-b border-[#E5E7EB] transition-colors hover:bg-[#F9FAFB]">
                    <TableCell className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {quote.services.map((service) => (
                          <Badge key={service} className={`px-3 py-1 text-xs font-semibold ${getServiceBadgeClassName(service)}`}>
                            {service}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-2xl font-bold text-[#111827]">
                      {formatCurrencyRange(quote.estimatedPriceLow, quote.estimatedPriceHigh, quote.price) ?? "-"}
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#111827]">
                      <p>{quote.addressFull}</p>
                      <p className="mt-1 text-[#6B7280]">{quote.customerName}</p>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Badge className={getQuoteStatusBadgeClass(quote.status)}>{quote.status}</Badge>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#6B7280]">
                      {new Date(quote.sentAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CustomersView({ data }: { data: DemoApiResponse<"customers"> }) {
  return (
    <div className="space-y-6">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#111827]">Customer contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="max-w-sm space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
              <Input disabled value="" placeholder="Search by first name" className="h-11 rounded-[8px] border border-[#E5E7EB] bg-white px-[14px] pl-9 text-sm text-[#111827] placeholder:text-[#6B7280]" />
            </div>
            <p className="text-xs text-[#6B7280]">Read-only demo preview.</p>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#E5E7EB] bg-[#F8F9FC] hover:bg-[#F8F9FC]">
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Name</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Phone</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Email</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payload.customers.map((customer) => (
                  <TableRow key={customer.id} className="border-b border-[#E5E7EB] transition-colors hover:bg-[#F9FAFB]">
                    <TableCell className="px-5 py-4 text-sm font-semibold text-[#111827]">{customer.name}</TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#6B7280]">{customer.phone ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#6B7280]">{customer.email ?? "-"}</TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#6B7280]">{new Date(customer.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalyticsView({ data }: { data: DemoApiResponse<"analytics"> }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.payload.metrics.map((metric) => (
          <MetricCard key={metric.title} title={metric.title} value={metric.value} subtext={metric.subtext} />
        ))}
      </section>

      <Charts
        leadsOverTime={data.payload.leadsOverTime}
        quotesOverTime={data.payload.quotesOverTime}
        acceptanceRateOverTime={data.payload.acceptanceRateOverTime}
        servicesBreakdown={data.payload.servicesBreakdown}
      />
    </div>
  );
}

function MyLinkView({ data }: { data: DemoApiResponse<"my-link"> }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#111827]">Public request link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] p-4">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">URL</p>
            <p className="mt-2 text-lg font-semibold text-[#111827]">{data.payload.requestLink}</p>
          </div>

          <div className="rounded-[12px] border border-[#E5E7EB] bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Social caption</p>
            <p className="mt-3 text-sm leading-6 text-[#111827]">{data.payload.socialCaption}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#111827]">Link performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {data.payload.previewMetrics.map((metric) => (
            <div key={metric.label} className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] px-4 py-4">
              <p className="text-sm text-[#6B7280]">{metric.label}</p>
              <p className="mt-2 text-3xl font-bold text-[#111827]">{metric.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanView({ data }: { data: DemoApiResponse<"plan"> }) {
  const usageWidth = Math.min(
    100,
    (data.payload.monthlyCreditsRemaining / Math.max(data.payload.monthlyCreditsLimit, 1)) * 100
  );

  return (
    <div className="space-y-6">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#111827]">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-3xl font-bold text-[#111827]">{data.payload.planLabel}</p>
                <Badge className="border-transparent bg-[#EFF6FF] text-[#2563EB]">Active</Badge>
              </div>
              <p className="text-xl font-semibold text-[#111827]">{data.payload.priceLabel}</p>
              <p className="text-sm text-[#6B7280]">
                {data.payload.seatsUsed} / {data.payload.seatsLimit} seats used
              </p>

              <div className="space-y-3">
                {data.payload.highlights.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-[#111827]">
                    <Check className="mt-0.5 h-4 w-4 text-[#2563EB]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[14px] border border-[#E5E7EB] bg-[#F8F9FC] p-6">
              <p className="text-4xl font-bold leading-none text-[#2563EB]">{data.payload.totalCredits}</p>
              <p className="mt-2 text-sm text-[#6B7280]">Total credits available</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#111827]">Credits & Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-base font-semibold text-[#111827]">Monthly credits</p>
              <p className="text-sm text-[#6B7280]">
                {data.payload.monthlyCreditsRemaining} / {data.payload.monthlyCreditsLimit} remaining
              </p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
              <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${usageWidth}%` }} />
            </div>
            <p className="text-sm text-[#6B7280]">
              {data.payload.creditsResetLabel
                ? `Credits reset ${data.payload.creditsResetLabel}`
                : "Credits reset automatically each month."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] p-4">
              <p className="text-sm font-medium text-[#111827]">Bonus credits</p>
              <p className="mt-2 text-3xl font-bold text-[#2563EB]">{data.payload.bonusCredits}</p>
            </div>
            <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8F9FC] p-4">
              <p className="text-sm font-medium text-[#111827]">Seats in use</p>
              <p className="mt-2 text-3xl font-bold text-[#111827]">
                {data.payload.seatsUsed}/{data.payload.seatsLimit}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamView({ data }: { data: DemoApiResponse<"team"> }) {
  return (
    <div className="space-y-6">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-[#111827]">Team</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#6B7280]">
            {data.payload.seatsUsed} of {data.payload.seatsLimit} seats are currently in use.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#111827]">Members</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-hidden rounded-[12px] border border-[#E5E7EB]">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#E5E7EB] bg-[#F8F9FC] hover:bg-[#F8F9FC]">
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Name</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Email</TableHead>
                  <TableHead className="h-auto px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-[#6B7280]">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payload.members.map((member) => (
                  <TableRow key={member.id} className="border-b border-[#E5E7EB] transition-colors hover:bg-[#F9FAFB]">
                    <TableCell className="px-5 py-4 text-sm font-semibold text-[#111827]">{member.name}</TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#6B7280]">{member.email}</TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#111827]">{member.role}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsView({ data }: { data: DemoApiResponse<"settings"> }) {
  return (
    <div className="space-y-6">
      <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Business Details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ReadonlyField label="Business name" value={data.payload.businessName} />
          <ReadonlyField label="Phone" value={data.payload.phone ?? "-"} />
          <ReadonlyField label="Public URL" value={`snapquote.app/${data.payload.publicSlug}`} />
          <ReadonlyField label="Email" value={data.payload.email ?? "-"} />
        </div>
      </section>

      <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Enabled Services</h2>
        <div className="flex flex-wrap gap-2">
          {data.payload.enabledServices.map((service) => (
            <Badge key={service} className={`px-3 py-1 text-xs font-semibold ${getServiceBadgeClassName(service)}`}>
              {service}
            </Badge>
          ))}
        </div>
      </section>

      <section className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <h2 className="mb-4 text-base font-semibold text-[#111827]">Notifications</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data.payload.notifications.map((item) => (
            <div key={item} className="rounded-[10px] border border-[#E5E7EB] bg-[#F8F9FC] px-4 py-3 text-sm text-[#111827]">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DemoPageView({ data }: { data: DemoApiResponse }) {
  if (data.page === "dashboard") return <DashboardView data={data as DemoApiResponse<"dashboard">} />;
  if (data.page === "leads") return <LeadsView data={data as DemoApiResponse<"leads">} />;
  if (data.page === "quotes") return <QuotesView data={data as DemoApiResponse<"quotes">} />;
  if (data.page === "customers") return <CustomersView data={data as DemoApiResponse<"customers">} />;
  if (data.page === "analytics") return <AnalyticsView data={data as DemoApiResponse<"analytics">} />;
  if (data.page === "my-link") return <MyLinkView data={data as DemoApiResponse<"my-link">} />;
  if (data.page === "plan") return <PlanView data={data as DemoApiResponse<"plan">} />;
  if (data.page === "team") return <TeamView data={data as DemoApiResponse<"team">} />;
  return <SettingsView data={data as DemoApiResponse<"settings">} />;
}

export function ProductDemo() {
  const [activePage, setActivePage] = useState<DemoPageId>("dashboard");
  const [cache, setCache] = useState<Partial<Record<DemoPageId, DemoApiResponse>>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setError(null);

    if (cache[activePage]) {
      return () => {
        cancelled = true;
      };
    }

    const loadPage = async () => {
      try {
        const response = await fetch(`/api/demo/${activePage}`, {
          method: "GET",
          cache: "no-store"
        });
        const json = (await response.json()) as DemoApiResponse | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in json && typeof json.error === "string"
              ? json.error
              : "Unable to load demo data."
          );
        }

        if (!cancelled) {
          setCache((current) => ({ ...current, [activePage]: json as DemoApiResponse }));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load demo data.");
        }
      }
    };

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [activePage, cache]);

  const activeData = cache[activePage];

  return (
    <div className="hidden md:block">
      <div className="overflow-hidden rounded-[30px] border border-[#DDE5F0] bg-white shadow-[0_42px_90px_-52px_rgba(15,23,42,0.55)]">
        <div className="border-b border-[#E5E7EB] bg-[#F8FAFC] px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#F87171]" />
              <span className="h-3 w-3 rounded-full bg-[#FBBF24]" />
              <span className="h-3 w-3 rounded-full bg-[#34D399]" />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-center">
              <div className="flex min-w-[320px] max-w-[540px] flex-1 items-center justify-center rounded-full border border-[#D1D5DB] bg-white px-4 py-2 text-sm text-[#6B7280]">
                snapquote.app/demo
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-[920px] bg-[#F8F9FC]">
          <div className="flex min-h-[920px]">
            <aside className="flex w-[220px] flex-col border-r border-[#E5E7EB] bg-white">
              <div className="px-6 py-7">
                <div className="inline-flex">
                  <BrandLogo size="sm" />
                </div>
              </div>

              <nav className="space-y-1 px-3 pb-4">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.id === activePage;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        startTransition(() => {
                          setActivePage(item.id);
                        })
                      }
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[8px] border-l-[3px] px-3 py-2.5 text-left text-sm font-medium",
                        active
                          ? "border-l-[#2563EB] bg-[#EFF6FF] font-semibold text-[#2563EB]"
                          : "border-l-transparent text-[#6B7280] hover:bg-[#F8F9FC] hover:text-[#111827]"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto border-t border-[#E5E7EB] px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF] text-sm font-semibold text-[#2563EB]">
                    SQ
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#111827]">
                      {activeData?.shell.businessName ?? "SnapQuote Demo"}
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <header className="border-b border-[#E5E7EB] bg-white px-6 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-[#111827]">
                      {activeData?.shell.pageTitle ?? demoPageLabels[activePage]}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E5E7EB] bg-white text-[#6B7280]">
                      <Bell className="h-4 w-4" />
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-medium text-[#111827]">
                        {activeData?.shell.businessName ?? "Rivera's Pressure Washing"}
                      </p>
                      <p className="text-sm text-[#6B7280]">
                        {activeData?.shell.ownerEmail ?? "demo@snapquote.com"}
                      </p>
                    </div>
                  </div>
                </div>
              </header>

              <main className="flex-1 bg-[#F8F9FC] p-6">
                {error ? <DemoErrorState message={error} /> : null}
                {!error && !activeData ? <DemoLoadingState title={demoPageLabels[activePage]} /> : null}
                {!error && activeData ? (
                  <div className={cn("pointer-events-none space-y-6", isPending && "opacity-80 transition-opacity")}>
                    <DemoPageView data={activeData} />
                  </div>
                ) : null}
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
