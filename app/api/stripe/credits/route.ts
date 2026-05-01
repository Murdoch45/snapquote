import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  clearStaleStripeCustomerId,
  getStripe,
  getStripeAppUrl,
  getStripeCreditPackConfig,
  isStripeResourceMissingError,
  type StripeCreditPackKey
} from "@/lib/stripe";

export const runtime = "nodejs";

const creditCheckoutSchema = z.object({
  pack: z.enum(["10", "50", "100"]),
  successPath: z.string().startsWith("/app/").optional(),
  cancelPath: z.string().startsWith("/app/").optional()
});

const creditPackEnvSchema = z.object({
  STRIPE_CREDIT_PACK_10_PRICE_ID: z.string().min(1),
  STRIPE_CREDIT_PACK_50_PRICE_ID: z.string().min(1),
  STRIPE_CREDIT_PACK_100_PRICE_ID: z.string().min(1)
});

export async function POST(request: Request) {
  const auth = await requireOwnerForApi(request);
  if (!auth.ok) return auth.response;

  try {
    const body = creditCheckoutSchema.parse(await request.json());
    const stripe = getStripe();
    const appUrl = getStripeAppUrl();
    const packConfig = getStripeCreditPackConfig(body.pack as StripeCreditPackKey);
    const creditPackEnv = creditPackEnvSchema.parse(process.env);
    const admin = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const packPriceIds: Record<StripeCreditPackKey, string> = {
      "10": creditPackEnv.STRIPE_CREDIT_PACK_10_PRICE_ID,
      "50": creditPackEnv.STRIPE_CREDIT_PACK_50_PRICE_ID,
      "100": creditPackEnv.STRIPE_CREDIT_PACK_100_PRICE_ID
    };

    const [
      {
        data: { user }
      },
      { data: latestSubscription }
    ] = await Promise.all([
      supabase.auth.getUser(),
      admin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", auth.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (!latestSubscription?.stripe_customer_id && !user?.email) {
      return NextResponse.json({ error: "Authenticated user email is required." }, { status: 400 });
    }

    const successPath = body.successPath ?? "/app/plan?credits=added";
    const cancelPath = body.cancelPath ?? "/app/plan";

    // Build the checkout session params with a customer-resolution strategy
    // that gracefully recovers from a stale `stripe_customer_id` (e.g. test
    // → live mode migration, manual customer deletion). If the stored ID is
    // present we try it first; if Stripe rejects with `resource_missing`,
    // we null it out and retry with `customer_email` so Stripe creates a
    // fresh customer on the user's behalf. (May 1 audit fix.)
    const buildSessionParams = (
      customerId: string | null
    ): Stripe.Checkout.SessionCreateParams => ({
      mode: "payment",
      line_items: [
        {
          price: packPriceIds[body.pack],
          quantity: 1
        }
      ],
      success_url: `${appUrl}${successPath}`,
      cancel_url: `${appUrl}${cancelPath}`,
      client_reference_id: auth.userId,
      customer: customerId ?? undefined,
      customer_email: customerId ? undefined : user?.email,
      metadata: {
        userId: auth.userId,
        orgId: auth.orgId,
        creditAmount: packConfig.credits.toString()
      }
    });

    const initialCustomerId = latestSubscription?.stripe_customer_id ?? null;
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(buildSessionParams(initialCustomerId));
    } catch (stripeError) {
      if (initialCustomerId && isStripeResourceMissingError(stripeError, "customer")) {
        // Stale customer ID. Clear it from the DB and retry with a fresh
        // customer creation via `customer_email`. Without this recovery, the
        // user would see "No such customer: 'cus_xxx'" with no path forward.
        if (!user?.email) {
          return NextResponse.json(
            { error: "Authenticated user email is required to create a new billing profile." },
            { status: 400 }
          );
        }
        console.warn(
          `[stripe/credits] Stale stripe_customer_id ${initialCustomerId} for user ${auth.userId}; clearing and retrying with fresh customer.`
        );
        await clearStaleStripeCustomerId(admin, auth.userId);
        session = await stripe.checkout.sessions.create(buildSessionParams(null));
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
      { error: error instanceof Error ? error.message : "Unable to start credit checkout." },
      { status: 400 }
    );
  }
}
