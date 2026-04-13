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
import { getServiceChartColor } from "@/lib/serviceColors";

type Props = {
  leadsOverTime: { date: string; count: number }[];
  quotesOverTime: { date: string; count: number }[];
  acceptanceRateOverTime: { date: string; rate: number }[];
  servicesBreakdown: { name: string; value: number }[];
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
  servicesBreakdown
}: Props) {
  const colors = useChartColors();
  const leadsVsQuotesData = leadsOverTime.map((item, index) => ({
    ...item,
    quotes: quotesOverTime[index]?.count ?? 0
  }));
  const hasLeadsVsQuotesData = leadsVsQuotesData.length > 0;
  const hasAcceptanceRateData = acceptanceRateOverTime.length > 0;
  const hasServicesData = servicesBreakdown.length > 0;

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
            Leads vs Estimates (30 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 overflow-hidden h-48 sm:h-64 md:h-72">
          {hasLeadsVsQuotesData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={leadsVsQuotesData}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                <XAxis dataKey="date" hide />
                <YAxis allowDecimals={false} stroke={colors.axis} />
                <Tooltip contentStyle={tooltipStyle} />
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
        <CardContent className="min-w-0 overflow-hidden h-48 sm:h-64 md:h-72">
          {hasAcceptanceRateData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acceptanceRateOverTime}>
                <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" />
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} stroke={colors.axis} />
                <Tooltip contentStyle={tooltipStyle} />
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
