import { createAdminClient } from "@/lib/supabase/admin";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";

enforceServerOnly();

const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

type ActiveSubscriptionStatus = (typeof ACTIVE_SUBSCRIPTION_STATUSES)[number];

export type BillingSource = "stripe" | "iap" | null;

// Slimmed shape: the consumers only need to know (a) which billing surface
// the user belongs to (Stripe vs IAP, for routing the "Manage" link), (b)
// whether there is an active Stripe sub right now (for showing "Manage
// Billing"), and (c) when a scheduled cancellation lands (for the cancellation
// banner). org.plan is read separately and is the canonical source of truth
// for what plan the user is on. There is no "inactive subscription" state in
// the product — see Pending Work 2026-05-07 plan.
//
// `subscriptionEndsAt` is wired to null in PR 1 (this commit). PR 2 wires it
// to the new `organizations.subscription_ends_at` column populated by webhook
// writes on cancel_at_period_end / RC CANCELLATION.
export type OrganizationSubscriptionStatus = {
  billingSource: BillingSource;
  hasActiveStripeSub: boolean;
  subscriptionEndsAt: string | null;
};

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
      billingSource,
      hasActiveStripeSub: false,
      subscriptionEndsAt: null
    };
  }

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("subscriptions")
    .select("status,created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false })
    .limit(20);

  if (subscriptionsError) {
    throw subscriptionsError;
  }

  const rows = subscriptions ?? [];
  const hasActiveStripeSub = rows.some((row) => isActiveStatus(row.status as string | null));
  const billingSource = await resolveBillingSource(admin, orgId, rows.length);

  return {
    billingSource,
    hasActiveStripeSub,
    subscriptionEndsAt: null
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

  if ((iapCount ?? 0) > 0) return "iap";

  // No Stripe rows AND no IAP events. Fall back to organizations.plan: any
  // non-SOLO plan was reached via a past Stripe webhook (SOLO is the only
  // free plan; the webhook's setOrganizationPlan is the only writer for
  // paid plans). When clearStaleStripeCustomerId DELETEs a user's row after
  // a Stripe resource_missing error, organizations.plan stays canonical and
  // is the only signal that the org was previously on Stripe. Without this
  // branch, mobile reads `null` as "new signup, show IAP UI" and surfaces
  // IAP prices to a Stripe-paid user — App Store guideline 3.1.1 violation.
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("plan")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError) {
    console.warn("Unable to resolve org plan for billing source fallback:", orgError);
    return null;
  }

  if (org?.plan && org.plan !== "SOLO") return "stripe";

  return null;
}
