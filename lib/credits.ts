import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";
import { getPlanMonthlyCredits } from "@/lib/usage";
import type { OrgPlan } from "@/lib/types";

enforceServerOnly();

type OrgCreditRow = {
  plan: OrgPlan;
  monthly_credits: number;
  bonus_credits: number;
  credits_reset_at: string | null;
};

export type OrgCredits = {
  monthly_credits: number;
  bonus_credits: number;
  total: number;
};

export type UnlockLeadResult =
  | { ok: true; alreadyUnlocked: boolean; remainingCredits: number }
  | { ok: false; error: "no_credits" };

function addOneMonth(from = new Date()): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function shouldResetCredits(resetAt: string | null): boolean {
  if (!resetAt) return true;
  return new Date(resetAt).getTime() <= Date.now();
}

async function getOrgCreditRow(orgId: string): Promise<OrgCreditRow> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_org_credit_row", { p_org_id: orgId });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : null;

  if (!row) {
    throw new Error("Organization not found.");
  }

  return {
    plan: row.plan as OrgPlan,
    monthly_credits: Number(row.monthly_credits ?? 0),
    bonus_credits: Number(row.bonus_credits ?? 0),
    credits_reset_at: (row.credits_reset_at as string | null | undefined) ?? null
  };
}

export async function resetMonthlyCredits(orgId: string, plan: OrgPlan): Promise<OrgCredits> {
  const admin = createAdminClient();
  const nextResetAt = addOneMonth().toISOString();
  const monthlyCredits = getPlanMonthlyCredits(plan);
  const nowIso = new Date().toISOString();

  const { data, error } = await admin.rpc("reset_org_credits", {
    p_org_id: orgId,
    p_monthly_credits: monthlyCredits,
    p_credits_reset_at: nextResetAt,
    p_now: nowIso
  });

  if (error) {
    throw error ?? new Error("Unable to reset monthly credits.");
  }

  const updatedRow = Array.isArray(data) ? data[0] : data ?? null;

  if (!updatedRow) {
    const current = await getOrgCreditRow(orgId);

    return {
      monthly_credits: current.monthly_credits,
      bonus_credits: current.bonus_credits,
      total: current.monthly_credits + current.bonus_credits
    };
  }

  const monthly = Number(updatedRow.monthly_credits ?? monthlyCredits);
  const bonus = Number(updatedRow.bonus_credits ?? 0);

  return {
    monthly_credits: monthly,
    bonus_credits: bonus,
    total: monthly + bonus
  };
}

export async function getOrgCredits(orgId: string): Promise<OrgCredits> {
  const org = await getOrgCreditRow(orgId);

  if (shouldResetCredits(org.credits_reset_at)) {
    return resetMonthlyCredits(orgId, org.plan);
  }

  return {
    monthly_credits: org.monthly_credits,
    bonus_credits: org.bonus_credits,
    total: org.monthly_credits + org.bonus_credits
  };
}

export async function hasCredits(orgId: string): Promise<boolean> {
  const credits = await getOrgCredits(orgId);
  return credits.total > 0;
}

export async function isLeadUnlocked(orgId: string, leadId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lead_unlocks")
    .select("id")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

export async function unlockLead(orgId: string, leadId: string): Promise<UnlockLeadResult> {
  const admin = createAdminClient();
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (leadError) {
    throw leadError;
  }

  if (!lead) {
    throw new Error("Lead not found.");
  }

  const { data, error } = await admin.rpc("unlock_lead_with_credits", {
    p_org_id: orgId,
    p_lead_id: leadId
  });

  if (error) {
    throw error;
  }

  if (data === "no_credits") {
    return { ok: false, error: "no_credits" };
  }

  const credits = await getOrgCredits(orgId);

  return {
    ok: true,
    alreadyUnlocked: data === "already_unlocked",
    remainingCredits: credits.total
  };
}
