import { createAdminClient } from "@/lib/supabase/admin";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";
import { getStripe } from "@/lib/stripe";
import type { OrgPlan } from "@/lib/types";

enforceServerOnly();

const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export type OrganizationSubscriptionStatus = {
  status: string | null;
  plan: OrgPlan | null;
  active: boolean;
  stripeSubscriptionId: string | null;
  trialEndDate: string | null;
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
    return {
      status: null,
      plan: null,
      active: false,
      stripeSubscriptionId: null,
      trialEndDate: null
    };
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("subscriptions")
    .select("plan,status,stripe_subscription_id,created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(20);

  if (subscriptionsError) {
    throw subscriptionsError;
  }

  const rows = subscriptions ?? [];
  const current =
    rows.find((row) => isActiveStatus(row.status as string | null | undefined)) ?? rows[0] ?? null;

  if (!current) {
    return {
      status: null,
      plan: null,
      active: false,
      stripeSubscriptionId: null,
      trialEndDate: null
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
    trialEndDate
  };
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
