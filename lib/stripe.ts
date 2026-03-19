import Stripe from "stripe";
import { z } from "zod";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";
import type { OrgPlan } from "@/lib/types";

enforceServerOnly();

const stripeCoreEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_PRICE_TEAM: z.string().min(1),
  STRIPE_PRICE_BUSINESS: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional()
});

const stripeCheckoutEnvSchema = stripeCoreEnvSchema.extend({
  NEXT_PUBLIC_APP_URL: z.string().url()
});

export type StripePlanKey = "team" | "business";

type StripePlanConfig = {
  key: StripePlanKey;
  orgPlan: OrgPlan;
  label: string;
  monthlyPrice: string;
  priceId: string;
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

export function getStripePlanConfig(plan: StripePlanKey): StripePlanConfig {
  const env = getStripeEnv();
  const plans: Record<StripePlanKey, StripePlanConfig> = {
    team: {
      key: "team",
      orgPlan: "TEAM",
      label: "Team",
      monthlyPrice: "$19",
      priceId: env.STRIPE_PRICE_TEAM
    },
    business: {
      key: "business",
      orgPlan: "BUSINESS",
      label: "Business",
      monthlyPrice: "$39",
      priceId: env.STRIPE_PRICE_BUSINESS
    }
  };

  return plans[plan];
}

export function getPlanFromPriceId(priceId: string | null | undefined): OrgPlan | null {
  if (!priceId) return null;

  const plans: StripePlanKey[] = ["team", "business"];
  for (const key of plans) {
    const config = getStripePlanConfig(key);
    if (config.priceId === priceId) return config.orgPlan;
  }

  return null;
}
