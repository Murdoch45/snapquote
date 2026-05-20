import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanMonthlyCredits } from "@/lib/usage";
import {
  type StripeBillingInterval,
  clearStaleStripeCustomerId,
  getPlanFromPriceId,
  getStripe,
  getStripeAppUrl,
  getStripePlanConfig,
  isStripeResourceMissingError,
  type StripePlanKey
} from "@/lib/stripe";
import { applyBankedRewardForOrg } from "@/lib/referralRewards";
import type { OrgPlan } from "@/lib/types";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  plan: z.enum(["solo", "team", "business"]),
  billingInterval: z.enum(["monthly", "annual"]).optional()
});

type CheckoutPlan = z.infer<typeof checkoutSchema>["plan"];

const PLAN_ORDER: Record<CheckoutPlan, number> = {
  solo: 0,
  team: 1,
  business: 2
};

function toOrgPlan(plan: CheckoutPlan): OrgPlan {
  if (plan === "team") return "TEAM";
  if (plan === "business") return "BUSINESS";
  return "SOLO";
}

function toCheckoutPlan(plan: OrgPlan | null | undefined): CheckoutPlan {
  if (plan === "TEAM") return "team";
  if (plan === "BUSINESS") return "business";
  return "solo";
}

function resolveCurrentPlan(plan: OrgPlan | null | undefined, priceId: string | null | undefined): CheckoutPlan {
  const pricePlan = getPlanFromPriceId(priceId);
  if (pricePlan) return toCheckoutPlan(pricePlan);
  return toCheckoutPlan(plan);
}

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const body = checkoutSchema.parse(await request.json());
    const billingInterval = (body.billingInterval ?? "monthly") as StripeBillingInterval;
    const stripe = getStripe();
    const appUrl = getStripeAppUrl();
    const admin = createAdminClient();
    const returnUrl = `${appUrl}/app/plan?updated=1`;

    // requireOwnerForApi already returned auth.userEmail from the verified
    // JWT/cookie session — no second auth.getUser() round-trip needed.
    const [
      { data: latestSubscription },
      { data: activeSubscriptions },
      { data: organization },
      { data: inboundReferral }
    ] = await Promise.all([
      admin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", auth.userId)
        .is("stripe_customer_invalid_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("subscriptions")
        .select("stripe_customer_id,stripe_subscription_id,status,plan,created_at")
        .eq("user_id", auth.userId)
        .is("stripe_customer_invalid_at", null)
        .not("stripe_subscription_id", "is", null)
        .in("status", ["active", "trialing"])
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("organizations")
        .select("has_used_trial")
        .eq("id", auth.orgId)
        .single(),
      // Lane A U7 — inbound referral lookup. Carrying the code on the
      // Stripe metadata is traceability-only; the qualifier downstream
      // reads it from the referrals row, not from Stripe. We send it so
      // a Stripe-side audit can match a paid subscription back to the
      // referral that drove it without a Supabase join.
      admin
        .from("referrals")
        .select("code")
        .eq("referred_org_id", auth.orgId)
        .maybeSingle()
    ]);

    const activeSubscription = (activeSubscriptions ?? [])[0] ?? null;
    const referralCode = (inboundReferral?.code as string | null | undefined) ?? null;

    // Build the metadata blob we attach to every Stripe object this
    // route creates/updates (upgrade subscription, new subscription_data,
    // new Checkout Session). Stripe metadata is string→string; we only
    // emit the referralCode key when we actually have one so it never
    // shows up as the string "null".
    const buildStripeMetadata = (
      extra: Record<string, string>
    ): Record<string, string> => {
      const base: Record<string, string> = {
        userId: auth.userId,
        orgId: auth.orgId,
        ...extra
      };
      if (referralCode) base.referralCode = referralCode;
      return base;
    };

    // If the DB row references a Stripe subscription that no longer exists
    // (e.g. test → live mode swap, manual deletion in Stripe dashboard,
    // account migration), `subscriptions.retrieve` throws `resource_missing`.
    // Treat that as "no active subscription" and fall through to fresh
    // checkout instead of bubbling the raw Stripe error to the user.
    let currentSubscription: Stripe.Subscription | null = null;
    if (activeSubscription?.stripe_subscription_id) {
      try {
        currentSubscription = await stripe.subscriptions.retrieve(
          activeSubscription.stripe_subscription_id as string
        );
      } catch (stripeError) {
        if (isStripeResourceMissingError(stripeError, "subscription")) {
          console.warn(
            `[stripe/checkout] Stale stripe_subscription_id ${activeSubscription.stripe_subscription_id} for user ${auth.userId}; clearing and falling through to fresh checkout.`
          );
          await clearStaleStripeCustomerId(admin, auth.userId);
          currentSubscription = null;
        } else {
          throw stripeError;
        }
      }
    }

    if (currentSubscription) {
      const currentItem = currentSubscription.items.data[0];

      if (!currentItem) {
        throw new Error("Active Stripe subscription is missing a subscription item.");
      }

      const currentPlan = resolveCurrentPlan(
        (activeSubscription.plan as OrgPlan | null | undefined) ?? null,
        currentItem.price.id
      );
      const requestedPlan = body.plan;
      const isUpgrade = PLAN_ORDER[requestedPlan] > PLAN_ORDER[currentPlan];
      const isDowngrade = PLAN_ORDER[requestedPlan] < PLAN_ORDER[currentPlan];

      if (isDowngrade || requestedPlan === "solo") {
        const stripeCustomerId =
          (activeSubscription.stripe_customer_id as string | null | undefined) ?? null;

        if (!stripeCustomerId) {
          return NextResponse.json(
            { error: "No Stripe billing profile found yet." },
            { status: 404 }
          );
        }

        const portalSession = await stripe.billingPortal.sessions.create({
          customer: stripeCustomerId,
          return_url: `${appUrl}/app`
        });

        return NextResponse.json({ url: portalSession.url });
      }

      if (isUpgrade) {
        const planConfig = getStripePlanConfig(
          requestedPlan as StripePlanKey,
          billingInterval
        );
        const updatedSubscription = await stripe.subscriptions.update(currentSubscription.id, {
          items: [
            {
              id: currentItem.id,
              price: planConfig.priceId
            }
          ],
          proration_behavior: "create_prorations",
          metadata: buildStripeMetadata({ plan: planConfig.orgPlan })
        });

        const { error: subscriptionUpdateError } = await admin
          .from("subscriptions")
          .update({
            plan: planConfig.orgPlan,
            status: updatedSubscription.status
          })
          .eq("stripe_subscription_id", updatedSubscription.id);

        if (subscriptionUpdateError) {
          throw subscriptionUpdateError;
        }

        if (
          updatedSubscription.status === "active" ||
          updatedSubscription.status === "trialing"
        ) {
          const { error: orgUpdateError } = await admin
            .from("organizations")
            .update({ plan: planConfig.orgPlan })
            .eq("id", auth.orgId);

          if (orgUpdateError) {
            throw orgUpdateError;
          }

          // Grant the new tier's credit allowance immediately. Without this,
          // upgraders keep their previous tier's monthly_credits until the
          // next renewal cycle webhook fires (could be ~30 days). Mirrors
          // the credit-reset call in the Stripe webhook's invoice.paid path.
          const nextResetAt = new Date();
          nextResetAt.setMonth(nextResetAt.getMonth() + 1);
          const { error: creditResetError } = await admin.rpc("update_org_plan_credits", {
            p_org_id: auth.orgId,
            p_monthly_credits: getPlanMonthlyCredits(planConfig.orgPlan),
            p_credits_reset_at: nextResetAt.toISOString()
          });
          if (creditResetError) {
            throw creditResetError;
          }

          // Lane C U14 — apply any banked referral reward for this org
          // now that we have an active Stripe customer. The applier is a
          // no-op if there's no banked reward; idempotent if it was
          // already applied. Failure does NOT block the upgrade — the
          // customer would lose the credit silently which we surface to
          // Sentry instead.
          const upgradeCustomerId =
            (activeSubscription.stripe_customer_id as string | null | undefined) ?? null;
          if (upgradeCustomerId) {
            try {
              await applyBankedRewardForOrg(auth.orgId, upgradeCustomerId);
            } catch (bankedApplyError) {
              Sentry.captureException(bankedApplyError, {
                tags: {
                  area: "referral-reward-banked-apply",
                  stage: "checkout-upgrade",
                  org_id: auth.orgId
                },
                extra: { stripeCustomerId: upgradeCustomerId }
              });
            }
          }
        }
      }

      return NextResponse.json({ url: returnUrl });
    }

    if (body.plan === "solo") {
      return NextResponse.json({ url: returnUrl });
    }

    if (!auth.userEmail) {
      return NextResponse.json({ error: "Authenticated user email is required." }, { status: 400 });
    }

    const planConfig = getStripePlanConfig(body.plan as StripePlanKey, billingInterval);
    const hasUsedTrial = organization?.has_used_trial ?? false;
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: buildStripeMetadata({ plan: toOrgPlan(body.plan) })
    };

    if (!hasUsedTrial) {
      subscriptionData.trial_period_days = 14;
    }

    // Same retry-on-resource-missing pattern as the credits route. If the
    // stored stripe_customer_id is stale (test → live mode swap, manual
    // delete, etc.), clear it and retry with `customer_email` so Stripe
    // creates a fresh customer. (May 1 audit fix.)
    const buildSubscriptionSessionParams = (
      customerId: string | null
    ): Stripe.Checkout.SessionCreateParams => ({
      mode: "subscription",
      line_items: [
        {
          price: planConfig.priceId,
          quantity: 1
        }
      ],
      success_url: returnUrl,
      cancel_url: `${appUrl}/app/plan`,
      client_reference_id: auth.userId,
      customer: customerId ?? undefined,
      customer_email: customerId ? undefined : auth.userEmail ?? undefined,
      metadata: buildStripeMetadata({ plan: toOrgPlan(body.plan) }),
      subscription_data: subscriptionData
    });

    // currentSubscription was null (or never existed) by the time we got
    // here, but we may have cleared the stale customer ID above already.
    // Re-read latestSubscription's value via a fresh local var so a clear
    // earlier in the function propagates correctly.
    let initialCustomerId = latestSubscription?.stripe_customer_id ?? null;
    // If we cleared the row inside the active-sub block, currentSubscription
    // is null AND the DB column is now null — but `latestSubscription` was
    // captured before the clear, so we manually invalidate it here.
    if (
      activeSubscription?.stripe_subscription_id &&
      currentSubscription === null
    ) {
      initialCustomerId = null;
    }

    // 2026-05-20 follow-up — apply any BANKED referral reward to the org's
    // Stripe customer BEFORE creating the Checkout Session, so the hosted
    // checkout page shows the reduced "amount due" instead of the full
    // plan price.
    //
    // Pre-fix, applyBankedRewardForOrg only ran inside the upgrade branch
    // (an existing paid plan) and inside handleCheckoutCompleted (after
    // checkout finished). SOLO→paid upgrades hit neither path until after
    // the user had paid the full amount, leaving the $120 credit to draw
    // down on the next invoice — bad UX on annual plans especially.
    //
    // applyBankedRewardForOrg needs a Stripe customer to write the credit
    // against. When initialCustomerId is null (typical SOLO upgrade with
    // no prior billing), we create one explicitly here, then apply the
    // banked reward to it.
    //
    // Idempotency / no-double-apply guarantee:
    //   - applyBankedRewardForOrg atomically claims the reward row via
    //     UPDATE-WHERE-NULL on applied_at (lib/referralRewards.ts:354-369).
    //     Once the claim wins, status flips to 'applied' and kind flips
    //     to 'stripe_balance'.
    //   - The webhook's later call to applyBankedRewardForOrg from
    //     handleCheckoutCompleted re-runs the same SELECT. Its filter
    //     (kind='banked_trial' AND status='pending' AND applied_at IS
    //     NULL) no longer matches → returns {outcome: 'noop', reason:
    //     'no_banked_reward'} → clean no-op.
    //   - The Stripe createBalanceTransaction call also passes
    //     idempotencyKey=`referral-reward-banked:${rewardId}` — defense
    //     in depth against duplicate Stripe writes.
    //   - If Stripe rejects the balance write (e.g. stale customer),
    //     applyBankedRewardForOrg ROLLS BACK the DB claim and re-throws
    //     (lib/referralRewards.ts:397-405). We swallow the throw,
    //     Sentry-log it, and let the webhook re-attempt on the new
    //     session.customer.
    //
    // Fail-safe: ANY error in this block (DB read, customer create, or
    // Stripe write) MUST NOT block the upgrade. The contractor falls
    // back to the original Lane C behavior — pay full price, credit
    // lands via the webhook afterward. Sentry-only signal so support
    // can investigate.
    let resolvedCustomerId = initialCustomerId;
    try {
      const { data: bankedReward, error: bankedLoadError } = await admin
        .from("referral_rewards")
        .select("id")
        .eq("referrer_org_id", auth.orgId)
        .eq("kind", "banked_trial")
        .eq("status", "pending")
        .is("applied_at", null)
        .is("clawed_back_at", null)
        .limit(1)
        .maybeSingle();
      if (bankedLoadError) throw bankedLoadError;

      if (bankedReward) {
        if (!resolvedCustomerId) {
          // Create a fresh Stripe customer so we have something to attach
          // the credit to. The webhook's saveSubscriptionRecord will
          // persist this customer id to subscriptions on
          // checkout.session.completed. metadata.orgId is the canonical
          // link so support can locate this customer if the user ever
          // abandons checkout.
          const created = await stripe.customers.create({
            email: auth.userEmail,
            metadata: {
              userId: auth.userId,
              orgId: auth.orgId
            }
          });
          resolvedCustomerId = created.id;
        }
        await applyBankedRewardForOrg(auth.orgId, resolvedCustomerId);
      }
    } catch (bankedApplyError) {
      Sentry.captureException(bankedApplyError, {
        tags: {
          area: "referral-reward-banked-apply",
          stage: "checkout-pre-session",
          org_id: auth.orgId,
          user_id: auth.userId
        },
        extra: { resolvedCustomerId: resolvedCustomerId ?? null }
      });
      // Intentionally KEEP resolvedCustomerId as-is — if we created a
      // fresh customer before applyBankedRewardForOrg failed, we still
      // want to use that one for the session so we don't pile up
      // additional orphan customers via the customer_email fallback path.
      // The webhook will retry the banked apply against the same customer.
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        buildSubscriptionSessionParams(resolvedCustomerId)
      );
    } catch (stripeError) {
      if (resolvedCustomerId && isStripeResourceMissingError(stripeError, "customer")) {
        console.warn(
          `[stripe/checkout] Stale stripe_customer_id ${resolvedCustomerId} for user ${auth.userId}; clearing and retrying with fresh customer.`
        );
        await clearStaleStripeCustomerId(admin, auth.userId);
        session = await stripe.checkout.sessions.create(
          buildSubscriptionSessionParams(null)
        );
      } else {
        throw stripeError;
      }
    }

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    // Audit 13 H4 — explicit captureException with org/user-id tags so
    // checkout failures can be tied to a specific tenant. Pre-fix the
    // catch returned 400 to the client with no Sentry signal at all.
    Sentry.captureException(error, {
      tags: { area: "stripe-checkout", org_id: auth.orgId, user_id: auth.userId }
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start checkout." },
      { status: 400 }
    );
  }
}
