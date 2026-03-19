import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { requireMemberForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStripe, getStripeAppUrl, getStripePlanConfig, type StripePlanKey } from "@/lib/stripe";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  plan: z.enum(["solo", "team", "business"])
});

export async function POST(request: Request) {
  const auth = await requireMemberForApi();
  if (!auth.ok) return auth.response;

  try {
    const body = checkoutSchema.parse(await request.json());
    const stripe = getStripe();
    const appUrl = getStripeAppUrl();
    const planConfig = getStripePlanConfig(body.plan as StripePlanKey);
    const admin = createAdminClient();
    const supabase = await createServerSupabaseClient();

    const [
      {
        data: { user }
      },
      { data: existingSubscription },
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
        .from("organizations")
        .select("has_used_trial")
        .eq("id", auth.orgId)
        .single()
    ]);

    if (!user?.email) {
      return NextResponse.json({ error: "Authenticated user email is required." }, { status: 400 });
    }

    const hasUsedTrial = organization?.has_used_trial ?? false;
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        userId: auth.userId,
        orgId: auth.orgId,
        plan: planConfig.orgPlan
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
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/pricing`,
      client_reference_id: auth.userId,
      customer: existingSubscription?.stripe_customer_id || undefined,
      customer_email: existingSubscription?.stripe_customer_id ? undefined : user.email,
      metadata: {
        userId: auth.userId,
        orgId: auth.orgId,
        plan: planConfig.orgPlan
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
