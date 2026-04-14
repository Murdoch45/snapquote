import { createAdminClient } from "@/lib/supabase/admin";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";
import { getStripe } from "@/lib/stripe";
import type { OrgPlan } from "@/lib/types";

enforceServerOnly();

const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export type BillingSource = "stripe" | "iap" | null;

export type OrganizationSubscriptionStatus = {
  status: string | null;
  plan: OrgPlan | null;
  active: boolean;
  stripeSubscriptionId: string | null;
  trialEndDate: string | null;
  billingInterval: string | null;
  billingSource: BillingSource;
};

export class SubscriptionRequiredError extends Error {
  statusCode: number;
  code: string;

  constructor(message = "Subscription required. Please upgrade to continue.") {
    super(message);
    this.name = "SubscriptionRequiredError";
    this.statusCode = 402;
    this.code = "SUBSCRIPTION_INACTIVE";
  }
}

function isActiveStatus(status: string | null | undefined): status is ActiveSubscriptionStatus {
  return status === "active" || status === "trialing";
}

export async function getOrganizationSubscriptionStatus(
  orgId: string
): Promise<OrganizationSubscriptionStatus> {
  const admin = createAdminClient();

  const { data: members, error: membersError } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId);

  if (membersError) {
    throw membersError;
  }

  const userIds = (members ?? [])
    .map((member) => member.user_id as string | null)
    .filter((value): value is string => Boolean(value));

  if (userIds.length === 0) {
    const billingSource = await resolveBillingSource(admin, orgId, 0);
    return {
      status: null,
      plan: null,
      active: false,
      stripeSubscriptionId: null,
      trialEndDate: null,
      billingInterval: null,
      billingSource
    };
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("subscriptions")
    .select("plan,status,stripe_subscription_id,billing_interval,created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(20);

  if (subscriptionsError) {
    throw subscriptionsError;
  }

  const rows = subscriptions ?? [];
  const current =
    rows.find((row) => isActiveStatus(row.status as string | null | undefined)) ?? rows[0] ?? null;

  const billingSource = await resolveBillingSource(admin, orgId, rows.length);

  if (!current) {
    return {
      status: null,
      plan: null,
      active: false,
      stripeSubscriptionId: null,
      trialEndDate: null,
      billingInterval: null,
      billingSource
    };
  }

  const status = (current.status as string | null | undefined) ?? null;
  const stripeSubscriptionId =
    (current.stripe_subscription_id as string | null | undefined) ?? null;
  let trialEndDate: string | null = null;

  if (status === "trialing" && stripeSubscriptionId) {
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      trialEndDate = subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null;
    } catch (error) {
      console.warn("Unable to resolve Stripe trial end date:", error);
    }
  }

  return {
    status,
    plan: (current.plan as OrgPlan | null | undefined) ?? null,
    active: isActiveStatus(status),
    stripeSubscriptionId,
    trialEndDate,
    billingInterval: (current.billing_interval as string | null | undefined) ?? null,
    billingSource
  };
}

async function resolveBillingSource(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  stripeRowCount: number
): Promise<BillingSource> {
  if (stripeRowCount > 0) return "stripe";

  const { count: iapCount, error: iapError } = await admin
    .from("iap_subscription_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  if (iapError) {
    console.warn("Unable to resolve IAP billing source:", iapError);
    return null;
  }

  return (iapCount ?? 0) > 0 ? "iap" : null;
}

export async function requireActiveSubscription(
  orgId: string
): Promise<OrganizationSubscriptionStatus> {
  const subscription = await getOrganizationSubscriptionStatus(orgId);

  if (!subscription.active) {
    throw new SubscriptionRequiredError();
  }

  return subscription;
}
