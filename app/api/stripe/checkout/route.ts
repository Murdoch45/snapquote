import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
    const supabase = await createServerSupabaseClient();
    const returnUrl = `${appUrl}/app/plan?updated=1`;

    const [
      {
        data: { user }
      },
      { data: latestSubscription },
      { data: activeSubscriptions },
      { data: organization }
    ] = await Promise.all([
      supabase.auth.getUser(),
      admin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("subscriptions")
        .select("stripe_customer_id,stripe_subscription_id,status,plan,created_at")
        .eq("user_id", auth.userId)
        .not("stripe_subscription_id", "is", null)
        .in("status", ["active", "trialing"])
        .order("created_at", { ascending: false })
        .limit(5),
      admin
        .from("organizations")
        .select("has_used_trial")
        .eq("id", auth.orgId)
        .single()
    ]);

    const activeSubscription = (activeSubscriptions ?? [])[0] ?? null;

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
          metadata: {
            userId: auth.userId,
            orgId: auth.orgId,
            plan: planConfig.orgPlan
          }
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
        }
      }

      return NextResponse.json({ url: returnUrl });
    }

    if (body.plan === "solo") {
      return NextResponse.json({ url: returnUrl });
    }

    if (!user?.email) {
      return NextResponse.json({ error: "Authenticated user email is required." }, { status: 400 });
    }

    const planConfig = getStripePlanConfig(body.plan as StripePlanKey, billingInterval);
    const hasUsedTrial = organization?.has_used_trial ?? false;
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        userId: auth.userId,
        orgId: auth.orgId,
        plan: toOrgPlan(body.plan)
      }
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
      customer_email: customerId ? undefined : user.email,
      metadata: {
        userId: auth.userId,
        orgId: auth.orgId,
        plan: toOrgPlan(body.plan)
      },
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

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        buildSubscriptionSessionParams(initialCustomerId)
      );
    } catch (stripeError) {
      if (initialCustomerId && isStripeResourceMissingError(stripeError, "customer")) {
        console.warn(
          `[stripe/checkout] Stale stripe_customer_id ${initialCustomerId} for user ${auth.userId}; clearing and retrying with fresh customer.`
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start checkout." },
      { status: 400 }
    );
  }
}
