import type { OrgPlan } from "@/lib/types";

export const PLAN_MONTHLY_CREDITS: Record<OrgPlan, number> = {
  SOLO: 5,
  TEAM: 20,
  BUSINESS: 100
};

export const PLAN_SEAT_LIMITS: Record<OrgPlan, number> = {
  SOLO: 1,
  TEAM: 2,
  BUSINESS: 5
};

export function getPlanMonthlyCredits(plan: OrgPlan): number {
  return PLAN_MONTHLY_CREDITS[plan];
}

export function getPlanSeatLimit(plan: OrgPlan): number {
  return PLAN_SEAT_LIMITS[plan];
}
