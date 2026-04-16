"use client";

import { BarChart3 } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsRange } from "@/lib/db";
import { getServiceChartColor } from "@/lib/serviceColors";

type Props = {
  leadsOverTime: { date: string; count: number }[];
  quotesOverTime: { date: string; count: number }[];
  acceptanceRateOverTime: { date: string; rate: number }[];
  servicesBreakdown: { name: string; value: number }[];
  range: AnalyticsRange;
};

// Chart labels only — the underlying data stays daily in every range.
// We let Recharts' minTickGap auto-thin ticks to whatever fits horizontally,
// and we swap to "MMM yyyy" formatting when the range is long enough that
// month-year labels are more useful than a month-day tick.
function getTickFormatter(range: AnalyticsRange) {
  const useMonthYear = range === "ytd" || range === "all";
  return (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      ...(useMonthYear
        ? { month: "short", year: "2-digit" }
        : { month: "short", day: "numeric" })
    }).format(parsed);
  };
}

function getTooltipLabelFormatter() {
  return (value: string) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric"
    }).format(parsed);
  };
}

const CHART_TITLE_BY_RANGE: Record<AnalyticsRange, string> = {
  "30d": "30 days",
  "90d": "90 days",
  ytd: "Year to date",
  all: "All time"
};

function useChartColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return {
    grid: isDark ? "hsl(215, 28%, 17%)" : "#E5E7EB",
    axis: isDark ? "hsl(218, 11%, 65%)" : "#6B7280",
    primary: "hsl(217, 91%, 60%)",
    success: isDark ? "#4ade80" : "#16A34A",
    tooltipBg: isDark ? "hsl(224, 47%, 8%)" : "#fff",
    tooltipBorder: isDark ? "hsl(215, 28%, 17%)" : "#E5E7EB",
    tooltipText: isDark ? "hsl(210, 20%, 98%)" : "#111827"
  };
}

function EmptyChartState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <BarChart3 className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">No data available yet.</p>
    </div>
  );
}

export function Charts({
  leadsOverTime,
  quotesOverTime,
  acceptanceRateOverTime,
  servicesBreakdown,
  range
}: Props) {
  const colors = useChartColors();
  const leadsVsQuotesData = leadsOverTime.map((item, index) => ({
    ...item,
    quotes: quotesOverTime[index]?.count ?? 0
  }));
  const hasLeadsVsQuotesData = leadsVsQuotesData.length > 0;
  const hasAcceptanceRateData = acceptanceRateOverTime.length > 0;
  const hasServicesData = servicesBreakdown.length > 0;

  const tickFormatter = getTickFormatter(range);
  const tooltipLabelFormatter = getTooltipLabelFormatter();
  const rangeLabel = CHART_TITLE_BY_RANGE[range];

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    borderColor: colors.tooltipBorder,
    color: colors.tooltipText
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card className="min-w-0 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-foreground">
            Leads vs Estimates ({rangeLabel})
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 overflow-hidden h-56 sm:h-72 md:h-80">
          {hasLeadsVsQuotesData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={leadsVsQuotesData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  stroke={colors.axis}
                  tick={{ fontSize: 11 }}
                  tickMargin={8}
                  tickFormatter={tickFormatter}
                  minTickGap={32}
                  interval="preserveStartEnd"
                />
                <YAxis allowDecimals={false} stroke={colors.axis} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={tooltipLabelFormatter} />
                <Legend />
                <Line type="monotone" dataKey="count" name="Leads" stroke={colors.primary} strokeWidth={2} />
                <Line type="monotone" dataKey="quotes" name="Estimates" stroke={colors.success} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-foreground">
            Acceptance Rate (%)
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 overflow-hidden h-56 sm:h-72 md:h-80">
          {hasAcceptanceRateData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acceptanceRateOverTime} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  stroke={colors.axis}
                  tick={{ fontSize: 11 }}
                  tickMargin={8}
                  tickFormatter={tickFormatter}
                  minTickGap={32}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  stroke={colors.axis}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={tooltipLabelFormatter}
                  formatter={(v: number) => [`${v}%`, "Acceptance"]}
                />
                <Bar dataKey="rate" fill={colors.primary} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] lg:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-foreground">
            Services Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 overflow-hidden h-56 sm:h-72 md:h-80">
          {hasServicesData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip contentStyle={tooltipStyle} />
                <Pie data={servicesBreakdown} dataKey="value" nameKey="name" label>
                  {servicesBreakdown.map((entry, index) => (
                    <Cell
                      key={`${entry.name}-${index}`}
                      fill={getServiceChartColor(entry.name)}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
