import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { buildCreditPurchaseConfirmationEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanMonthlyCredits } from "@/lib/plans";
import {
  RevenueCatApiError,
  getRevenueCatActivePlanForCustomer,
  listRevenueCatCustomerPurchases
} from "@/lib/revenuecatServer";
import type { OrgPlan } from "@/lib/types";

export const runtime = "nodejs";

// Apple StoreKit product id -> credit amount. Mirrors the same constant in
// the RC webhook handler. The mobile app's IAP product ids are configured
// in App Store Connect and mirrored to RevenueCat under matching
// store_product_identifier values.
const CREDIT_PACK_AMOUNTS: Record<string, number> = {
  snapquote_credits_10: 10,
  snapquote_credits_50: 50,
  snapquote_credits_100: 100
};

// Mobile may still send the legacy `plan` and `creditAmount` fields; zod's
// default `.strip()` behaviour drops them so the route remains backwards-
// compatible without trusting any client claim about value.
const syncSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscription"),
    transactionId: z.string().min(1)
  }),
  z.object({
    type: z.literal("credits"),
    transactionId: z.string().min(1)
  })
]);

type SyncBody = z.infer<typeof syncSchema>;

async function logMobileSyncEvent(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  body: SyncBody,
  verifiedPlan: OrgPlan | null,
  verifiedProductId: string | null
) {
  const { error } = await admin.from("iap_subscription_events").insert({
    org_id: orgId,
    event_id: `mobile_sync_${body.transactionId}`,
    event_type:
      body.type === "subscription" ? "MOBILE_IAP_SYNC_SUBSCRIPTION" : "MOBILE_IAP_SYNC_CREDITS",
    plan: verifiedPlan,
    product_id: verifiedProductId,
    store: "app_store",
    is_trial_period: null,
    store_transaction_id: body.transactionId,
    app_user_id: orgId,
    raw_event: body
  });

  if (error) {
    console.warn("iap/sync audit log insert failed:", error);
  }
}

function addOneMonth(from = new Date()): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

async function alreadySyncedSubscription(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  transactionId: string
): Promise<boolean> {
  // Without a unique constraint on iap_subscription_events, we dedupe in
  // application code: skip the plan/credit write if a prior sync row
  // exists for this transaction. Prevents the ungated update_org_plan_credits
  // RPC from refilling monthly_credits on retry-queue replays of the same
  // purchase. Race between two concurrent in-flight syncs of the same txn
  // is bounded — both end up writing the same verified values.
  const { data, error } = await admin
    .from("iap_subscription_events")
    .select("id")
    .eq("org_id", orgId)
    .eq("store_transaction_id", transactionId)
    .eq("event_type", "MOBILE_IAP_SYNC_SUBSCRIPTION")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("iap/sync subscription idempotency check failed; proceeding:", error);
    return false;
  }
  return data != null;
}

function isMissingRevenueCatConfig(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Missing REVENUECAT_PROJECT_ID or REVENUECAT_SECRET_KEY")
  );
}

/**
 * POST /api/iap/sync
 *
 * Called by the mobile app after a successful Apple IAP purchase to sync
 * the new plan or credits into Supabase.
 *
 * Server-side verification (Audit 2 C-4): the body is treated as a hint
 * only. The route fetches RevenueCat as the source of truth — for
 * subscriptions, the customer's active_entitlements; for credit packs, the
 * customer's purchases ledger. Plan and credit amount are derived from the
 * RC response, NEVER from the request body. Pre-fix, an authenticated
 * owner could POST `{plan: "BUSINESS", transactionId: "fake"}` and self-
 * promote without paying.
 *
 * Requires REVENUECAT_PROJECT_ID + REVENUECAT_SECRET_KEY in the runtime
 * environment. If absent the route returns 503; mobile's persistent retry
 * queue will replay once the env is configured.
 */
export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  let body: SyncBody;
  try {
    body = syncSchema.parse(await request.json());
  } catch (parseError) {
    return NextResponse.json(
      { error: parseError instanceof Error ? parseError.message : "Invalid request body." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  try {
    if (body.type === "subscription") {
      const verifiedPlan = await getRevenueCatActivePlanForCustomer(auth.orgId);
      if (!verifiedPlan) {
        return NextResponse.json(
          {
            error:
              "RevenueCat reports no active subscription entitlement for this account."
          },
          { status: 403 }
        );
      }

      if (await alreadySyncedSubscription(admin, auth.orgId, body.transactionId)) {
        return NextResponse.json({
          ok: true,
          plan: verifiedPlan,
          status: "already_processed"
        });
      }

      const monthlyCredits = getPlanMonthlyCredits(verifiedPlan);

      const { error: planError } = await admin
        .from("organizations")
        .update({ plan: verifiedPlan })
        .eq("id", auth.orgId);
      if (planError) throw planError;

      const { error: creditError } = await admin.rpc("update_org_plan_credits", {
        p_org_id: auth.orgId,
        p_monthly_credits: monthlyCredits,
        p_credits_reset_at: addOneMonth().toISOString()
      });
      if (creditError) throw creditError;

      await logMobileSyncEvent(admin, auth.orgId, body, verifiedPlan, null);

      return NextResponse.json({ ok: true, plan: verifiedPlan, status: "added" });
    }

    // Credits path: verify the transactionId belongs to a real RC purchase
    // for THIS customer, then derive the credit amount from the purchase's
    // store_product_identifier (NOT the body — pre-fix, mobile could
    // claim creditAmount=999999).
    const purchases = await listRevenueCatCustomerPurchases(auth.orgId);
    const purchase = purchases.find(
      (p) =>
        p.storeTransactionIdentifier === body.transactionId ||
        p.originalStoreTransactionIdentifier === body.transactionId
    );

    if (!purchase) {
      return NextResponse.json(
        {
          error:
            "RevenueCat has no record of this transaction for this account."
        },
        { status: 403 }
      );
    }

    if (purchase.refundedAt !== null) {
      return NextResponse.json(
        { error: "Transaction has been refunded." },
        { status: 410 }
      );
    }

    const productId = purchase.storeProductIdentifier;
    const verifiedCreditAmount = productId ? CREDIT_PACK_AMOUNTS[productId] : null;
    if (!verifiedCreditAmount) {
      return NextResponse.json(
        { error: "Transaction is not for a known credit-pack product." },
        { status: 400 }
      );
    }

    // record_credit_purchase has ON CONFLICT (purchase_reference) DO NOTHING
    // (migration: see public.record_credit_purchase) so retries / RC-webhook
    // collisions are idempotent. Key on Apple's transactionIdentifier so
    // this path and the RC webhook's NON_RENEWING_PURCHASE branch (also
    // Apple-keyed, post Audit 2 C-10 fix) collapse onto the same row.
    const { data, error } = await admin.rpc("record_credit_purchase", {
      p_org_id: auth.orgId,
      p_purchase_reference: body.transactionId,
      p_credit_amount: verifiedCreditAmount
    });
    if (error) throw error;

    const status = data === "already_processed" ? "already_processed" : "added";

    if (status === "added") {
      await logMobileSyncEvent(admin, auth.orgId, body, null, productId);

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
            creditAmount: verifiedCreditAmount,
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

    return NextResponse.json({
      ok: true,
      status,
      creditAmount: verifiedCreditAmount
    });
  } catch (error) {
    if (isMissingRevenueCatConfig(error)) {
      console.error(
        "iap/sync: REVENUECAT_PROJECT_ID / REVENUECAT_SECRET_KEY not configured. Server-side IAP verification disabled until added in Vercel."
      );
      return NextResponse.json(
        {
          error:
            "Server-side IAP verification is not configured. Add REVENUECAT_PROJECT_ID and REVENUECAT_SECRET_KEY in Vercel."
        },
        { status: 503 }
      );
    }
    if (error instanceof RevenueCatApiError) {
      console.error("iap/sync RevenueCat verification failed:", error);
      return NextResponse.json(
        { error: "Failed to verify purchase with RevenueCat. Please retry." },
        { status: 502 }
      );
    }
    console.error("iap/sync handler failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync purchase." },
      { status: 500 }
    );
  }
}
