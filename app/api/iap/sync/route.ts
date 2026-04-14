import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { buildCreditPurchaseConfirmationEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
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

    const status = data === "already_processed" ? "already_processed" : "added";

    // Only email on first-time recording — re-syncs of the same transaction
    // (e.g. retry from the queue) shouldn't re-send the confirmation.
    if (status === "added") {
      void (async () => {
        try {
          const ownerEmail = await getOwnerEmailForOrg(admin, auth.orgId);
          if (!ownerEmail) return;

          const { data: orgRow } = await admin
            .from("organizations")
            .select("bonus_credits")
            .eq("id", auth.orgId)
            .maybeSingle();

          const newBalance =
            orgRow && typeof orgRow.bonus_credits === "number"
              ? (orgRow.bonus_credits as number)
              : null;

          const email = buildCreditPurchaseConfirmationEmail({
            creditAmount: body.creditAmount,
            amountPaid: null,
            newBalance
          });

          await sendEmail({
            to: ownerEmail,
            subject: email.subject,
            text: email.text,
            html: email.html,
            sender: "noreply"
          });
        } catch (emailError) {
          console.warn("iap/sync credit purchase email failed:", emailError);
        }
      })();
    }

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync purchase." },
      { status: 400 }
    );
  }
}
