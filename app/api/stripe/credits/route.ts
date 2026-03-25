import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerForApi } from "@/lib/auth/requireRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getStripe,
  getStripeAppUrl,
  getStripeCreditPackConfig,
  type StripeCreditPackKey
} from "@/lib/stripe";

export const runtime = "nodejs";

const creditCheckoutSchema = z.object({
  pack: z.enum(["10", "50", "100"])
});

const creditPackEnvSchema = z.object({
  STRIPE_CREDIT_PACK_10_PRICE_ID: z.string().min(1),
  STRIPE_CREDIT_PACK_50_PRICE_ID: z.string().min(1),
  STRIPE_CREDIT_PACK_100_PRICE_ID: z.string().min(1)
});

export async function POST(request: Request) {
  const auth = await requireOwnerForApi();
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

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: packPriceIds[body.pack],
          quantity: 1
        }
      ],
      success_url: `${appUrl}/app/plan?credits=added`,
      cancel_url: `${appUrl}/app/plan`,
      client_reference_id: auth.userId,
      customer: latestSubscription?.stripe_customer_id || undefined,
      customer_email: latestSubscription?.stripe_customer_id ? undefined : user?.email,
      metadata: {
        userId: auth.userId,
        orgId: auth.orgId,
        creditAmount: body.pack
      }
    });

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
