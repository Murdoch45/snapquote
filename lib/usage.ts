import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanMonthlyCredits } from "@/lib/plans";
import { ORG_PLANS, type OrgPlan, type PlanUsageLimit } from "@/lib/types";

export type UsageState = {
  plan: OrgPlan;
  month: string;
  quotesSentCount: number;
  warningAt90: boolean;
  canSend: boolean;
  limit: number | null;
  grace: number;
  hardStopAt: number | null;
};

function firstDayOfMonth(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export { getPlanMonthlyCredits } from "@/lib/plans";

export function getPlanUsageLimit(plan: OrgPlan): PlanUsageLimit {
  const monthlyCredits = getPlanMonthlyCredits(plan);
  return { limit: monthlyCredits, grace: 0, hardStopAt: null };
}

function getWarningAt90(limit: number | null, count: number): boolean {
  if (limit === null) return false;
  return count >= Math.ceil(limit * 0.9);
}

function buildUsageState(plan: OrgPlan, month: string, count: number): UsageState {
  const { limit, grace, hardStopAt } = getPlanUsageLimit(plan);
  return {
    plan,
    month,
    quotesSentCount: count,
    warningAt90: false,
    canSend: true,
    limit,
    grace,
    hardStopAt
  };
}

export async function getMonthlyUsage(orgId: string): Promise<UsageState> {
  const admin = createAdminClient();
  const month = firstDayOfMonth();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .single();

  if (orgError || !org) throw new Error("Organization not found");
  const plan = ORG_PLANS.includes(org.plan as OrgPlan) ? (org.plan as OrgPlan) : "SOLO";

  const { data: usage } = await admin
    .from("org_usage_monthly")
    .select("quotes_sent_count")
    .eq("org_id", orgId)
    .eq("month", month)
    .maybeSingle();

  const count = usage?.quotes_sent_count ?? 0;
  return buildUsageState(plan, month, count);
}

export async function incrementUsageOnQuoteSend(orgId: string): Promise<UsageState> {
  const admin = createAdminClient();
  const current = await getMonthlyUsage(orgId);
  const nextCount = current.quotesSentCount + 1;
  const payload = {
    org_id: orgId,
    month: current.month,
    quotes_sent_count: nextCount,
    grace_used: false
  };

  const { error } = await admin.from("org_usage_monthly").upsert(payload, {
    onConflict: "org_id,month"
  });
  if (error) throw error;

  return buildUsageState(current.plan, current.month, nextCount);
}
