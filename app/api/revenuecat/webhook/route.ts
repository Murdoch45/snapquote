import { headers } from "next/headers";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPaymentFailedEmail } from "@/lib/emailTemplates";
import { sendEmail } from "@/lib/notify";
import { getOwnerEmailForOrg } from "@/lib/organizationOwners";
import { getPlanMonthlyCredits } from "@/lib/plans";
import { sendPlanEndedEmail, sendPlanUpgradedEmail } from "@/lib/planChangeEmails";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/webhookEvents";
import type { OrgPlan } from "@/lib/types";

export const runtime = "nodejs";
// Audit 7 H4 — INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE each run
// setOrganizationPlan + resetOrganizationCredits + (conditional trial
// writes) + iap_subscription_events insert + email sends. Default
// timeout (10s Hobby / 60s Pro) can kill the handler mid-write; the
// webhook_events claim then prevents a retry from completing the writes.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRODUCT_TO_PLAN: Record<string, OrgPlan> = {
  snapquote_team_monthly: "TEAM",
  snapquote_team_annual: "TEAM",
  snapquote_business_monthly: "BUSINESS",
  snapquote_business_annual: "BUSINESS"
};

const CREDIT_PACK_AMOUNTS: Record<string, number> = {
  snapquote_credits_10: 10,
  snapquote_credits_50: 50,
  snapquote_credits_100: 100
};

type RevenueCatEvent = {
  id?: string;
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  entitlement_id?: string | null;
  is_trial_period?: boolean;
  store?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  /** Trial expiration timestamp in milliseconds since epoch (RC convention). */
  expiration_at_ms?: number | null;
};

type RevenueCatPayload = {
  api_version?: string;
  event: RevenueCatEvent;
};

function addOneMonth(from = new Date()): Date {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function resolvePlanFromEvent(event: RevenueCatEvent): OrgPlan | null {
  const entitlements =
    event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  if (entitlements.some((id) => id?.toLowerCase() === "business")) return "BUSINESS";
  if (entitlements.some((id) => id?.toLowerCase() === "team")) return "TEAM";

  if (event.product_id && PRODUCT_TO_PLAN[event.product_id]) {
    return PRODUCT_TO_PLAN[event.product_id];
  }

  return null;
}

function resolveOrgId(event: RevenueCatEvent): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id];
  for (const candidate of candidates) {
    if (candidate && UUID_RE.test(candidate)) return candidate;
  }
  return null;
}

async function setOrganizationPlan(orgId: string, plan: OrgPlan) {
  const admin = createAdminClient();
  const { error } = await admin.from("organizations").update({ plan }).eq("id", orgId);
  if (error) throw error;
}

async function resetOrganizationCredits(orgId: string, plan: OrgPlan) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("update_org_plan_credits", {
    p_org_id: orgId,
    p_monthly_credits: getPlanMonthlyCredits(plan),
    p_credits_reset_at: addOneMonth().toISOString()
  });
  if (error) throw error;
}

async function markOrganizationTrialUsed(orgId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ has_used_trial: true })
    .eq("id", orgId);
  if (error) throw error;
}

async function setOrganizationTrialEnd(orgId: string, trialEnd: Date) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      trial_ends_at: trialEnd.toISOString(),
      // Reset notified flag so a re-trial gets a fresh email.
      trial_ending_notified_at: null
    })
    .eq("id", orgId);
  if (error) console.warn("Failed to set trial_ends_at from RC webhook:", error);
}

async function getCurrentOrgPlan(orgId: string): Promise<OrgPlan | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();
  return (data?.plan as OrgPlan | undefined) ?? null;
}

async function recordCreditPackPurchase(
  orgId: string,
  productId: string,
  storeTransactionId: string
) {
  const creditAmount = CREDIT_PACK_AMOUNTS[productId];
  if (!creditAmount) {
    console.warn("RevenueCat credit pack skipped: unknown product id.", { productId });
    return;
  }

  // Idempotency key is Apple's transactionIdentifier (the same value mobile
  // sends to /api/iap/sync as body.transactionId). When both paths land for
  // the same purchase, whichever runs first wins; the second is a no-op via
  // record_credit_purchase's ON CONFLICT (purchase_reference) DO NOTHING.
  const admin = createAdminClient();
  const { error } = await admin.rpc("record_credit_purchase", {
    p_org_id: orgId,
    p_purchase_reference: storeTransactionId,
    p_credit_amount: creditAmount
  });
  if (error) throw error;
}

type LogIapEventOptions = {
  needsReview?: boolean;
  reviewReason?: string;
};

async function logIapEvent(
  orgId: string | null,
  event: RevenueCatEvent,
  plan: OrgPlan | null,
  raw: unknown,
  options: LogIapEventOptions = {}
) {
  const admin = createAdminClient();
  const { error } = await admin.from("iap_subscription_events").insert({
    org_id: orgId,
    event_id: event.id ?? "unknown",
    event_type: event.type,
    plan,
    product_id: event.product_id ?? null,
    store: event.store ?? null,
    is_trial_period: event.is_trial_period ?? null,
    store_transaction_id: event.transaction_id ?? event.original_transaction_id ?? null,
    app_user_id: event.app_user_id ?? null,
    raw_event: raw,
    needs_review: options.needsReview ?? false,
    review_reason: options.reviewReason ?? null
  });
  if (error) {
    console.error("Failed to write iap_subscription_events row.", error);
  }
}

async function setIapCancellationScheduled(orgId: string, scheduledAt: Date | null) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ iap_cancellation_scheduled_at: scheduledAt ? scheduledAt.toISOString() : null })
    .eq("id", orgId);
  if (error) {
    console.warn("Failed to update iap_cancellation_scheduled_at:", error);
  }
}

async function sendBillingIssueEmail(orgId: string) {
  try {
    const admin = createAdminClient();
    const ownerEmail = await getOwnerEmailForOrg(admin, orgId);
    if (!ownerEmail) return;

    const email = buildPaymentFailedEmail();
    await sendEmail({
      to: ownerEmail,
      subject: email.subject,
      text: email.text,
      html: email.html,
      sender: "noreply"
    });
  } catch (error) {
    console.warn("RC BILLING_ISSUE email send failed:", error);
  }
}

export async function POST(request: Request) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    console.error("REVENUECAT_WEBHOOK_AUTH is not configured.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const authorization = (await headers()).get("authorization");
  if (!authorization || !safeEqual(authorization, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: RevenueCatPayload;
  try {
    payload = (await request.json()) as RevenueCatPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const event = payload?.event;
  if (!event?.type || !event?.id) {
    return NextResponse.json({ error: "Missing event id or type." }, { status: 400 });
  }

  Sentry.addBreadcrumb({
    category: "revenuecat.webhook",
    level: "info",
    message: "auth verified",
    data: { event_type: event.type, event_id: event.id }
  });

  let claimed: boolean;
  try {
    claimed = await claimWebhookEvent("revenuecat", event.id, event.type);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { area: "revenuecat-webhook", stage: "claim", event_type: event.type },
      extra: { event_id: event.id }
    });
    console.error("Failed to claim RevenueCat webhook event.", error);
    return NextResponse.json({ error: "Failed to record event." }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const orgId = resolveOrgId(event);
    const planForLog = resolvePlanFromEvent(event);

    if (!orgId) {
      // Flag for manual review rather than silently dropping. Without this
      // any purchase whose app_user_id isn't a valid org UUID (e.g. a race
      // where the purchase happens before configureRevenueCat keyed the
      // user to their org) would be permanently lost with no retry path.
      await logIapEvent(null, event, planForLog, payload, {
        needsReview: true,
        reviewReason: "app_user_id_not_uuid"
      });
      console.warn("RevenueCat event flagged for review: app_user_id is not a valid org UUID.", {
        type: event.type,
        appUserId: event.app_user_id,
        eventId: event.id
      });
      return NextResponse.json({ received: true, needs_review: true, reason: "no_org" });
    }

    // Some event types are worth flagging for review even when the org
    // resolves cleanly (BILLING_ISSUE needs operator awareness if Apple's
    // retry attempts eventually exhaust without recovery).
    const logOptions: LogIapEventOptions =
      event.type === "BILLING_ISSUE"
        ? { needsReview: true, reviewReason: "billing_issue" }
        : {};
    await logIapEvent(orgId, event, planForLog, payload, logOptions);

    switch (event.type) {
      case "INITIAL_PURCHASE": {
        const plan = resolvePlanFromEvent(event);
        if (!plan) {
          console.warn("RevenueCat INITIAL_PURCHASE skipped: unable to resolve plan.", {
            productId: event.product_id,
            entitlements: event.entitlement_ids
          });
          break;
        }
        await setOrganizationPlan(orgId, plan);
        await resetOrganizationCredits(orgId, plan);
        if (event.is_trial_period) {
          await markOrganizationTrialUsed(orgId);
          if (event.expiration_at_ms) {
            await setOrganizationTrialEnd(orgId, new Date(event.expiration_at_ms));
          }
        }
        void sendPlanUpgradedEmail(orgId, plan);
        break;
      }

      case "RENEWAL": {
        const plan = resolvePlanFromEvent(event);
        if (!plan) {
          console.warn("RevenueCat RENEWAL skipped: unable to resolve plan.", {
            productId: event.product_id,
            entitlements: event.entitlement_ids
          });
          break;
        }

        // Audit 12 H2 — read the org's current plan BEFORE writing so we
        // can tell a routine renewal apart from a renewal-with-tier-change.
        // Stripe handler gates the upgrade email on `isRenewalCycle` (see
        // stripe/webhook/route.ts handleInvoicePaid). RC doesn't expose
        // that signal, so we approximate: only send "🎉 You're on the X
        // plan" when the plan field actually changed. A no-op renewal
        // (same plan as before) skips the email — previously this fired
        // every billing cycle and read as spam to the contractor.
        let priorPlan: OrgPlan | null = null;
        try {
          const admin = createAdminClient();
          const { data: orgRow } = await admin
            .from("organizations")
            .select("plan")
            .eq("id", orgId)
            .maybeSingle();
          priorPlan = (orgRow?.plan as OrgPlan | undefined) ?? null;
        } catch (priorPlanError) {
          // Read failed — fall back to the safer pre-fix behavior (skip
          // the email). A failed lookup shouldn't open us back up to
          // renewal-cycle spam.
          Sentry.captureException(priorPlanError, {
            tags: {
              area: "revenuecat-webhook",
              stage: "renewal-prior-plan-lookup",
              org_id: orgId
            }
          });
        }

        await setOrganizationPlan(orgId, plan);
        await resetOrganizationCredits(orgId, plan);
        // Successful renewal clears any prior cancellation-scheduled state.
        await setIapCancellationScheduled(orgId, null);

        if (priorPlan && priorPlan === plan) {
          Sentry.addBreadcrumb({
            category: "revenuecat.webhook",
            level: "info",
            message: "RC renewal — no plan change, email skipped",
            data: { org_id: orgId, plan }
          });
        } else {
          void sendPlanUpgradedEmail(orgId, plan);
        }
        break;
      }

      case "CANCELLATION": {
        // User has cancelled but the subscription remains active until
        // expiration_at_ms. Record the scheduled-cancellation timestamp so
        // the UI can render a banner; do NOT change the plan yet.
        const scheduledAt = event.expiration_at_ms
          ? new Date(event.expiration_at_ms)
          : new Date();
        await setIapCancellationScheduled(orgId, scheduledAt);
        break;
      }

      case "UNCANCELLATION": {
        // User reactivated before period end — clear the scheduled flag.
        await setIapCancellationScheduled(orgId, null);
        break;
      }

      case "BILLING_ISSUE": {
        // RevenueCat's equivalent of Stripe past_due: the renewal charge
        // failed but Apple will keep retrying. Notify the owner but leave
        // the plan in place so we don't kick them off for a transient card
        // issue. Audit row is already flagged needs_review above.
        void sendBillingIssueEmail(orgId);
        break;
      }

      case "PRODUCT_CHANGE": {
        // Plan changed mid-cycle (upgrade or downgrade between TEAM/BUSINESS,
        // monthly/annual). Reset credits to the new plan's monthly allocation
        // so the user gets the tier they're now paying for; the previous
        // policy of waiting until next RENEWAL left users under-credited up
        // to a full cycle on upgrade. Matches the RENEWAL / INITIAL_PURCHASE
        // pattern. Idempotency at the cycle level is preserved by the row
        // claim in claimWebhookEvent above.
        const plan = resolvePlanFromEvent(event);
        if (!plan) {
          console.warn("RevenueCat PRODUCT_CHANGE skipped: unable to resolve plan.", {
            productId: event.product_id,
            entitlements: event.entitlement_ids
          });
          break;
        }
        await setOrganizationPlan(orgId, plan);
        await resetOrganizationCredits(orgId, plan);
        break;
      }

      case "NON_RENEWING_PURCHASE": {
        if (!event.product_id) {
          console.warn("RevenueCat NON_RENEWING_PURCHASE skipped: missing product id.");
          break;
        }
        // Idempotency key MUST be Apple's transactionIdentifier so this path
        // and mobile's /api/iap/sync (which keys on body.transactionId — also
        // Apple's transactionIdentifier) collapse onto the same row via
        // record_credit_purchase's ON CONFLICT clause. Previously keyed on
        // `rc_${event.id}` which let both paths insert independently and
        // double-credit (latent: 0 credit_purchases rows live at fix time).
        const storeTransactionId =
          event.transaction_id ?? event.original_transaction_id ?? null;
        if (!storeTransactionId) {
          console.warn(
            "RevenueCat NON_RENEWING_PURCHASE skipped: missing store transaction_id; cannot key idempotently against iap/sync.",
            { eventId: event.id, productId: event.product_id }
          );
          break;
        }
        await recordCreditPackPurchase(orgId, event.product_id, storeTransactionId);
        break;
      }

      case "EXPIRATION": {
        const previousPlan = await getCurrentOrgPlan(orgId);
        await setOrganizationPlan(orgId, "SOLO");
        await resetOrganizationCredits(orgId, "SOLO");
        await setIapCancellationScheduled(orgId, null);
        if (previousPlan && previousPlan !== "SOLO") {
          void sendPlanEndedEmail(orgId, previousPlan);
        }
        break;
      }

      case "REFUND": {
        const creditAmount = event.product_id
          ? CREDIT_PACK_AMOUNTS[event.product_id] ?? null
          : null;

        if (creditAmount) {
          // Credit pack refund — deduct the bonus credits, leave plan untouched.
          // Uses the refund_bonus_credits RPC (migration 0055) which locks
          // the org row with FOR UPDATE so concurrent refunds serialize
          // instead of both reading the same pre-deduct value and double-
          // deducting by half.
          const admin = createAdminClient();
          const { data: newBonusRaw, error: deductError } = await admin.rpc(
            "refund_bonus_credits",
            {
              p_org_id: orgId,
              p_amount: creditAmount
            }
          );

          if (deductError) {
            console.error("RC credit pack refund deduction failed:", deductError);
          } else {
            const newBonus = typeof newBonusRaw === "number" ? newBonusRaw : "unknown";
            console.log(
              `RC credit pack refund: org ${orgId} bonus_credits → ${newBonus} (deducted ${creditAmount})`
            );
          }
        } else {
          // Subscription refund — downgrade to Solo.
          const previousPlan = await getCurrentOrgPlan(orgId);
          await setOrganizationPlan(orgId, "SOLO");
          await resetOrganizationCredits(orgId, "SOLO");
          if (previousPlan && previousPlan !== "SOLO") {
            void sendPlanEndedEmail(orgId, previousPlan);
          }
        }
        break;
      }

      default:
        return NextResponse.json({ received: true, ignored: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // Audit 13 H4 — explicit captureException with event-type tag. Same
    // pattern as the Stripe webhook handler.
    Sentry.captureException(error, {
      tags: { area: "revenuecat-webhook", stage: "handler", event_type: event.type },
      extra: { event_id: event.id }
    });
    console.error("RevenueCat webhook handler failed.", error);
    await releaseWebhookEvent("revenuecat", event.id).catch((releaseErr) => {
      console.error("Failed to release webhook event after handler error.", releaseErr);
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook handling failed." },
      { status: 500 }
    );
  }
}
