import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getPlanFromPriceId,
  getStripe,
  getStripeAppUrl,
  getStripePlanConfig,
  type StripePlanKey
} from "@/lib/stripe";
import type { OrgPlan } from "@/lib/types";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  plan: z.enum(["solo", "team", "business"])
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
  const auth = await requireMemberForApi();
  if (!auth.ok) return auth.response;

  try {
    const body = checkoutSchema.parse(await request.json());
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

    if (activeSubscription?.stripe_subscription_id) {
      const currentSubscription = await stripe.subscriptions.retrieve(
        activeSubscription.stripe_subscription_id as string
      );
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
        const planConfig = getStripePlanConfig(requestedPlan as StripePlanKey);
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

        const { error: orgUpdateError } = await admin
          .from("organizations")
          .update({ plan: planConfig.orgPlan })
          .eq("id", auth.orgId);

        if (orgUpdateError) {
          throw orgUpdateError;
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

    const planConfig = getStripePlanConfig(body.plan as StripePlanKey);
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: planConfig.priceId,
          quantity: 1
        }
      ],
      success_url: returnUrl,
      cancel_url: `${appUrl}/pricing`,
      client_reference_id: auth.userId,
      customer: latestSubscription?.stripe_customer_id || undefined,
      customer_email: latestSubscription?.stripe_customer_id ? undefined : user.email,
      metadata: {
        userId: auth.userId,
        orgId: auth.orgId,
        plan: toOrgPlan(body.plan)
      },
      subscription_data: subscriptionData
    });

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
