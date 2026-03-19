import Link from "next/link";
import { ManageBillingButton } from "@/components/plan/ManageBillingButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getOrganizationSubscriptionStatus } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonthlyUsage } from "@/lib/usage";

function formatPlanName(plan: "SOLO" | "TEAM" | "BUSINESS"): string {
  if (plan === "SOLO") return "Solo";
  if (plan === "TEAM") return "Team";
  return "Business";
}

function getPlanPrice(plan: "SOLO" | "TEAM" | "BUSINESS"): string {
  if (plan === "SOLO") return "Free";
  if (plan === "TEAM") return "$19/month";
  return "$39/month";
}

function getSeatLimit(plan: "SOLO" | "TEAM" | "BUSINESS"): number {
  if (plan === "SOLO") return 1;
  if (plan === "TEAM") return 5;
  return 10;
}

function getUsagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, (used / limit) * 100);
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${getUsagePercent(used, limit)}%` }}
      />
    </div>
  );
}

export default async function PlanPage() {
  const { orgId } = await requireAuth();
  const admin = createAdminClient();

  const [usage, subscription, membersResult] = await Promise.all([
    getMonthlyUsage(orgId),
    getOrganizationSubscriptionStatus(orgId),
    admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
  ]);

  const plan = usage.plan;
  const price = getPlanPrice(plan);
  const quotesUsed = usage.quotesSentCount;
  const quotesLimit = usage.limit;
  const usersUsed = membersResult.count ?? 0;
  const usersLimit = getSeatLimit(plan);
  const trialEndLabel =
    subscription.status === "trialing" && subscription.trialEndDate
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        }).format(new Date(subscription.trialEndDate))
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">My Plan</h1>
        <p className="text-sm text-gray-500">Billing and usage for your workspace.</p>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-gray-900">{formatPlanName(plan)}</p>
            <p className="text-sm text-gray-500">{price}</p>
            {trialEndLabel ? (
              <p className="text-xs text-gray-500">Trial ends {trialEndLabel}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/pricing">Upgrade Plan</Link>
            </Button>
            <ManageBillingButton />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-gray-900">Quotes</p>
              <p className="text-sm text-gray-500">
                {quotesLimit === null
                  ? `${quotesUsed} used`
                  : `${quotesUsed} / ${quotesLimit} used`}
              </p>
            </div>
            {quotesLimit === null ? (
              <p className="text-sm text-gray-500">Unlimited quotes</p>
            ) : (
              <UsageBar used={quotesUsed} limit={quotesLimit} />
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-gray-900">Users</p>
              <p className="text-sm text-gray-500">
                {usersUsed} / {usersLimit} used
              </p>
            </div>
            <UsageBar used={usersUsed} limit={usersLimit} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
