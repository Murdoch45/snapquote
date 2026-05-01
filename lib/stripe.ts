import Stripe from "stripe";
import { z } from "zod";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";
import type { OrgPlan } from "@/lib/types";

enforceServerOnly();

const stripeCoreEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_PRICE_TEAM: z.string().min(1),
  STRIPE_PRICE_BUSINESS: z.string().min(1),
  NEXT_PUBLIC_STRIPE_TEAM_ANNUAL_PRICE_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID: z.string().min(1).optional(),
  STRIPE_CREDIT_PACK_10_PRICE_ID: z.string().min(1).optional(),
  STRIPE_CREDIT_PACK_50_PRICE_ID: z.string().min(1).optional(),
  STRIPE_CREDIT_PACK_100_PRICE_ID: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional()
});

const stripeCheckoutEnvSchema = stripeCoreEnvSchema.extend({
  NEXT_PUBLIC_APP_URL: z.string().url()
});

export type StripePlanKey = "team" | "business";
export type StripeCreditPackKey = "10" | "50" | "100";
export type StripeBillingInterval = "monthly" | "annual";

type StripePlanConfig = {
  key: StripePlanKey;
  orgPlan: OrgPlan;
  label: string;
  monthlyPrice: string;
  billingInterval: StripeBillingInterval;
  priceId: string;
};

type StripeCreditPackConfig = {
  key: StripeCreditPackKey;
  credits: number;
  label: string;
  priceLabel: string;
};

let stripeClient: Stripe | null = null;

function getStripeEnv() {
  return stripeCoreEnvSchema.parse(process.env);
}

function getStripeCheckoutEnv() {
  return stripeCheckoutEnvSchema.parse(process.env);
}

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const env = getStripeEnv();
  stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

export function getStripeAppUrl(): string {
  return getStripeCheckoutEnv().NEXT_PUBLIC_APP_URL;
}

export function getStripeWebhookSecret(): string {
  const secret = getStripeEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  return secret;
}

export function getStripePlanConfig(
  plan: StripePlanKey,
  billingInterval: StripeBillingInterval = "monthly"
): StripePlanConfig {
  const env = getStripeEnv();
  const annualTeamPriceId = env.NEXT_PUBLIC_STRIPE_TEAM_ANNUAL_PRICE_ID;
  const annualBusinessPriceId = env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID;

  if (billingInterval === "annual") {
    if (plan === "team" && !annualTeamPriceId) {
      throw new Error("Missing NEXT_PUBLIC_STRIPE_TEAM_ANNUAL_PRICE_ID");
    }
    if (plan === "business" && !annualBusinessPriceId) {
      throw new Error("Missing NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID");
    }
  }

  const plans: Record<StripePlanKey, StripePlanConfig> = {
    team: {
      key: "team",
      orgPlan: "TEAM",
      label: "Team",
      monthlyPrice: "$19",
      billingInterval,
      priceId: billingInterval === "annual" ? (annualTeamPriceId as string) : env.STRIPE_PRICE_TEAM
    },
    business: {
      key: "business",
      orgPlan: "BUSINESS",
      label: "Business",
      monthlyPrice: "$39",
      billingInterval,
      priceId:
        billingInterval === "annual"
          ? (annualBusinessPriceId as string)
          : env.STRIPE_PRICE_BUSINESS
    }
  };

  return plans[plan];
}

export function getPlanFromPriceId(priceId: string | null | undefined): OrgPlan | null {
  if (!priceId) return null;

  const env = getStripeEnv();
  const pricePlanMap: Array<{ priceId?: string; plan: OrgPlan }> = [
    { priceId: env.STRIPE_PRICE_TEAM, plan: "TEAM" },
    { priceId: env.STRIPE_PRICE_BUSINESS, plan: "BUSINESS" },
    { priceId: env.NEXT_PUBLIC_STRIPE_TEAM_ANNUAL_PRICE_ID, plan: "TEAM" },
    { priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUAL_PRICE_ID, plan: "BUSINESS" }
  ];

  for (const entry of pricePlanMap) {
    if (entry.priceId === priceId) return entry.plan;
  }

  return null;
}

/**
 * True if `err` is a Stripe `resource_missing` error referencing the given
 * parameter (e.g. "customer", "subscription"). This fires when our DB has a
 * Stripe ID that no longer exists in the connected Stripe account — common
 * after test → live mode switches, manual deletions, or account migrations.
 */
export function isStripeResourceMissingError(err: unknown, param: string): boolean {
  if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) return false;
  if (err.code !== "resource_missing") return false;
  // Some Stripe responses set err.param; others embed the param in the message.
  // Check both so we don't miss either shape.
  if (err.param === param) return true;
  return typeof err.message === "string" && err.message.toLowerCase().includes(`no such ${param}`);
}

/**
 * Delete stale `subscriptions` rows for a user. Called when Stripe returns
 * `resource_missing` for a customer or subscription so subsequent attempts
 * re-create a fresh customer via `customer_email` and the next webhook
 * (after a real purchase completes) inserts a clean row.
 *
 * The `stripe_customer_id` column is NOT NULL in the schema, so we can't
 * just null it — DELETE is the cleanest path. The canonical source of
 * effective plan is `organizations.plan` (set by webhook), so removing
 * the subscription row doesn't affect the user's plan display until the
 * webhook fires for the next subscription event.
 *
 * Accepts an admin Supabase client so the caller controls the transaction
 * surface; we don't import the admin client here to avoid pulling
 * server-only modules into Stripe-utility consumers.
 */
export async function clearStaleStripeCustomerId(
  admin: { from: (table: string) => any },
  userId: string
): Promise<void> {
  // Delete every subscriptions row for this user. If any of them references
  // a stale Stripe customer/subscription, the user is in a broken state
  // and a fresh checkout is the only recovery path. We don't narrow by
  // stale-ID here because once one is stale (e.g. test→live swap), all of
  // them are likely stale (they live in the same Stripe account). After
  // deletion, the user's next successful Stripe webhook
  // (handleSubscriptionChanged / handleCheckoutCompleted) will insert a
  // fresh row with the new IDs.
  const { error } = await admin
    .from("subscriptions")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
}

export function getStripeCreditPackConfig(pack: StripeCreditPackKey): StripeCreditPackConfig {
  const packs: Record<StripeCreditPackKey, StripeCreditPackConfig> = {
    "10": {
      key: "10",
      credits: 10,
      label: "10 credits",
      priceLabel: "$10"
    },
    "50": {
      key: "50",
      credits: 50,
      label: "50 credits",
      priceLabel: "$40"
    },
    "100": {
      key: "100",
      credits: 100,
      label: "100 credits",
      priceLabel: "$70"
    }
  };

  return packs[pack];
}
