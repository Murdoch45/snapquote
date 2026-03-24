"use client";

import { BarChart3 } from "lucide-react";
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

function EmptyChartState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F8F9FC] text-[#6B7280]">
        <BarChart3 className="h-5 w-5" />
      </div>
      <p className="text-sm text-[#6B7280]">No data available yet.</p>
    </div>
  );
}

export function Charts({
  leadsOverTime,
  quotesOverTime,
  acceptanceRateOverTime,
  servicesBreakdown
}: Props) {
  const leadsVsQuotesData = leadsOverTime.map((item, index) => ({
    ...item,
    quotes: quotesOverTime[index]?.count ?? 0
  }));
  const hasLeadsVsQuotesData = leadsVsQuotesData.length > 0;
  const hasAcceptanceRateData = acceptanceRateOverTime.length > 0;
  const hasServicesData = servicesBreakdown.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-[#111827]">
            Leads vs Estimates (30 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {hasLeadsVsQuotesData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={leadsVsQuotesData}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                <XAxis dataKey="date" hide />
                <YAxis allowDecimals={false} stroke="#6B7280" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" name="Leads" stroke="#2563EB" strokeWidth={2} />
                <Line type="monotone" dataKey="quotes" name="Estimates" stroke="#16A34A" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState />
          )}
        </CardContent>
      </Card>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-[#111827]">
            Acceptance Rate (%)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {hasAcceptanceRateData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acceptanceRateOverTime}>
                <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} stroke="#6B7280" />
                <Tooltip />
                <Bar dataKey="rate" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartState />
          )}
        </CardContent>
      </Card>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] lg:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-[#111827]">
            Services Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {hasServicesData ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip />
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
