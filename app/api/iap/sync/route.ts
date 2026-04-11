import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanMonthlyCredits } from "@/lib/plans";
import type { OrgPlan } from "@/lib/types";

export const runtime = "nodejs";

const syncSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscription"),
    plan: z.enum(["TEAM", "BUSINESS"]),
    transactionId: z.string().min(1)
  }),
  z.object({
    type: z.literal("credits"),
    creditAmount: z.number().int().positive(),
    transactionId: z.string().min(1)
  })
]);

function addOneMonth(from = new Date()): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * POST /api/iap/sync
 *
 * Called by the mobile app after a successful Apple IAP purchase to sync the
 * new plan or credits into Supabase. Uses the same Bearer-token auth as all
 * other mobile API routes.
 *
 * Body:
 *   { type: "subscription", plan: "TEAM"|"BUSINESS", transactionId: string }
 *   { type: "credits", creditAmount: number, transactionId: string }
 */
export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const body = syncSchema.parse(await request.json());
    const admin = createAdminClient();

    if (body.type === "subscription") {
      const plan = body.plan as OrgPlan;
      const monthlyCredits = getPlanMonthlyCredits(plan);

      // Update the org's plan
      const { error: planError } = await admin
        .from("organizations")
        .update({ plan })
        .eq("id", auth.orgId);

      if (planError) throw planError;

      // Reset monthly credits to the new plan's allocation
      const { error: creditError } = await admin.rpc("update_org_plan_credits", {
        p_org_id: auth.orgId,
        p_monthly_credits: monthlyCredits,
        p_credits_reset_at: addOneMonth().toISOString()
      });

      if (creditError) throw creditError;

      return NextResponse.json({ ok: true, plan });
    }

    // Credits purchase
    const { data, error } = await admin.rpc("record_credit_purchase", {
      p_org_id: auth.orgId,
      p_purchase_reference: body.transactionId,
      p_credit_amount: body.creditAmount
    });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      status: data === "already_processed" ? "already_processed" : "added"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync purchase." },
      { status: 400 }
    );
  }
}
