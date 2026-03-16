import "server-only";
import { startOfDay, subDays } from "date-fns";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OrgContext = {
  userId: string;
  orgId: string;
  role: "OWNER" | "MEMBER";
};

export async function getOrgContext(): Promise<OrgContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership) return null;
  return {
    userId: user.id,
    orgId: membership.org_id as string,
    role: membership.role as "OWNER" | "MEMBER"
  };
}

function makeDateMap(days = 30): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = startOfDay(subDays(new Date(), i)).toISOString().slice(0, 10);
    map[date] = 0;
  }
  return map;
}

export async function getAnalytics(orgId: string) {
  const supabase = await createServerSupabaseClient();
  const since = subDays(new Date(), 30).toISOString();

  const [{ data: leads }, { data: quotes }] = await Promise.all([
    supabase
      .from("leads")
      .select("id,submitted_at,services,status")
      .eq("org_id", orgId)
      .eq("ai_status", "ready")
      .gte("submitted_at", since),
    supabase
      .from("quotes")
      .select("id,price,sent_at,accepted_at,lead_id,status")
      .eq("org_id", orgId)
      .gte("sent_at", since)
  ]);

  const leadRows = leads ?? [];
  const quoteRows = quotes ?? [];
  const acceptedRows = quoteRows.filter((q) => q.status === "ACCEPTED");
  const quotesSent = quoteRows.length;
  const avgQuoteValue =
    quoteRows.length === 0
      ? 0
      : quoteRows.reduce((acc, row) => acc + Number(row.price || 0), 0) / quoteRows.length;
  const acceptanceRate = quotesSent === 0 ? 0 : acceptedRows.length / quotesSent;

  const leadByDay = makeDateMap(30);
  leadRows.forEach((row) => {
    const day = new Date(row.submitted_at).toISOString().slice(0, 10);
    if (leadByDay[day] !== undefined) leadByDay[day] += 1;
  });

  const quoteByDay = makeDateMap(30);
  quoteRows.forEach((row) => {
    const day = new Date(row.sent_at).toISOString().slice(0, 10);
    if (quoteByDay[day] !== undefined) quoteByDay[day] += 1;
  });

  const acceptByDay = makeDateMap(30);
  acceptedRows.forEach((row) => {
    if (!row.accepted_at) return;
    const day = new Date(row.accepted_at).toISOString().slice(0, 10);
    if (acceptByDay[day] !== undefined) acceptByDay[day] += 1;
  });

  const acceptanceSeries = Object.keys(quoteByDay).map((day) => {
    const sent = quoteByDay[day];
    const accepted = acceptByDay[day];
    return {
      date: day,
      rate: sent === 0 ? 0 : Number(((accepted / sent) * 100).toFixed(1))
    };
  });

  const servicesCount: Record<string, number> = {};
  leadRows.forEach((row) => {
    (row.services as string[]).forEach((service) => {
      servicesCount[service] = (servicesCount[service] ?? 0) + 1;
    });
  });

  const avgResponseMinutes = await getAverageResponseMinutes(orgId);

  return {
    totals: {
      totalLeads: leadRows.length,
      quotesSent,
      quotesAccepted: acceptedRows.length,
      acceptanceRate: Number((acceptanceRate * 100).toFixed(1)),
      avgQuoteValue: Number(avgQuoteValue.toFixed(2)),
      avgResponseMinutes
    },
    leadsOverTime: Object.entries(leadByDay).map(([date, count]) => ({ date, count })),
    quotesOverTime: Object.entries(quoteByDay).map(([date, count]) => ({ date, count })),
    acceptanceRateOverTime: acceptanceSeries,
    servicesBreakdown: Object.entries(servicesCount).map(([name, value]) => ({ name, value }))
  };
}

export async function getAverageResponseMinutes(orgId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("quotes")
    .select("sent_at,lead:leads(submitted_at)")
    .eq("org_id", orgId);

  if (!data || data.length === 0) return 0;

  const diffs = data
    .map((row) => {
      const submitted = (Array.isArray(row.lead) ? row.lead[0] : row.lead)?.submitted_at;
      if (!submitted) return null;
      const ms = new Date(row.sent_at).getTime() - new Date(submitted).getTime();
      return ms > 0 ? ms / 60000 : null;
    })
    .filter((value): value is number => value !== null);

  if (diffs.length === 0) return 0;
  return Number((diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1));
}
