"use client";

import {
  Bar,
  BarChart,
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

type Props = {
  leadsOverTime: { date: string; count: number }[];
  quotesOverTime: { date: string; count: number }[];
  acceptanceRateOverTime: { date: string; rate: number }[];
  servicesBreakdown: { name: string; value: number }[];
};

export function Charts({
  leadsOverTime,
  quotesOverTime,
  acceptanceRateOverTime,
  servicesBreakdown
}: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Leads vs Quotes (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={leadsOverTime.map((item, index) => ({ ...item, quotes: quotesOverTime[index]?.count ?? 0 }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" hide />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" name="Leads" stroke="#2563EB" strokeWidth={2} />
              <Line type="monotone" dataKey="quotes" name="Quotes" stroke="#06B6D4" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acceptance Rate (%)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={acceptanceRateOverTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" hide />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="rate" fill="#2563EB" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Services Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip />
              <Pie data={servicesBreakdown} dataKey="value" nameKey="name" fill="#06B6D4" label />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
