import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CreditsAddedToast } from "@/components/plan/CreditsAddedToast";
import { ManageBillingButton } from "@/components/plan/ManageBillingButton";
import { PlanOptionsSection } from "@/components/plan/PlanOptionsSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getOrgCredits } from "@/lib/credits";
import { getOrganizationSubscriptionStatus } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanMonthlyCredits } from "@/lib/usage";

export const dynamic = "force-dynamic";

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
  if (plan === "TEAM") return 2;
  return 5;
}

function getUsagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, (used / limit) * 100);
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
      <div
        className="h-full rounded-full bg-[#2563EB] transition-all"
        style={{ width: `${getUsagePercent(used, limit)}%` }}
      />
    </div>
  );
}

function formatSubscriptionStatus(status: string | null, active: boolean): string {
  if (status === "trialing") return "Trialing";
  if (status === "active" && active) return "Active";
  if (!status) return "No active subscription";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

type Props = {
  searchParams: Promise<{ credits?: string }>;
};

export default async function PlanPage({ searchParams }: Props) {
  const { orgId } = await requireAuth();
  const admin = createAdminClient();
  const params = await searchParams;

  await getOrgCredits(orgId);

  const [subscription, membersResult, organization] = await Promise.all([
    getOrganizationSubscriptionStatus(orgId),
    admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId),
    admin
      .from("organizations")
      .select("plan,monthly_credits,bonus_credits,credits_reset_at")
      .eq("id", orgId)
      .single()
  ]);

  if (!organization.data) {
    throw new Error("Organization not found.");
  }

  const plan = organization.data.plan as "SOLO" | "TEAM" | "BUSINESS";
  const price = getPlanPrice(plan);
  const monthlyCreditsRemaining = Number(organization.data.monthly_credits ?? 0);
  const bonusCredits = Number(organization.data.bonus_credits ?? 0);
  const totalCredits = monthlyCreditsRemaining + bonusCredits;
  const monthlyCreditsLimit = getPlanMonthlyCredits(plan);
  const usersUsed = membersResult.count ?? 0;
  const usersLimit = getSeatLimit(plan);
  const resetAt = organization.data.credits_reset_at
    ? new Date(organization.data.credits_reset_at as string)
    : null;
  const trialEndLabel =
    subscription.status === "trialing" && subscription.trialEndDate
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        }).format(new Date(subscription.trialEndDate))
      : null;
  const creditsResetLabel = resetAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric"
      }).format(resetAt)
    : null;
  const subscriptionStatusLabel = formatSubscriptionStatus(subscription.status, subscription.active);
  const planHighlights = [
    `${monthlyCreditsLimit} monthly credits`,
    `${usersLimit} ${usersLimit === 1 ? "team member" : "team members"}`,
    subscription.active ? "Billing is active" : subscriptionStatusLabel
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CreditsAddedToast enabled={params.credits === "added"} />

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-[#111827]">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-3xl font-bold text-[#111827]">{formatPlanName(plan)}</p>
                <Badge
                  className={
                    subscription.active
                      ? "border-transparent bg-[#EFF6FF] text-[#2563EB]"
                      : "border-transparent bg-[#F9FAFB] text-[#6B7280]"
                  }
                >
                  {subscriptionStatusLabel}
                </Badge>
              </div>
              <p className="text-xl font-semibold text-[#111827]">{price}</p>
              <p className="text-sm text-[#6B7280]">
                {usersUsed} / {usersLimit} users
              </p>
              {trialEndLabel ? (
                <p className="text-sm text-[#6B7280]">Trial ends {trialEndLabel}</p>
              ) : null}

              <div className="space-y-3">
                {planHighlights.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-[#111827]">
                    <Check className="mt-0.5 h-4 w-4 text-[#2563EB]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[14px] border border-[#E5E7EB] bg-[#F8F9FC] p-6">
              <p className="text-4xl font-bold leading-none text-[#2563EB]">{totalCredits}</p>
              <p className="mt-2 text-sm text-[#6B7280]">Total credits available</p>
            </div>
          </div>

          <div className="flex justify-end">
            <ManageBillingButton
              mode="text"
              label="Manage billing & invoices ->"
              className="font-medium"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-[#111827]">Plan Options</h2>
          <p className="text-sm text-[#6B7280]">
            Upgrade instantly or schedule a downgrade for the end of your billing cycle.
          </p>
        </div>
        <PlanOptionsSection currentPlan={plan} />
        <p className="text-sm text-[#6B7280]">
          Need more credits?{" "}
          <Link href="/app/credits" className="font-medium text-[#2563EB] hover:text-[#1D4ED8]">
            Buy here →
          </Link>
        </p>
      </div>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-base font-semibold text-[#111827]">Credits & Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-base font-semibold text-[#111827]">Monthly credits</p>
              <p className="text-sm text-[#6B7280]">
                {monthlyCreditsRemaining} / {monthlyCreditsLimit} remaining
              </p>
            </div>
            <UsageBar used={monthlyCreditsRemaining} limit={monthlyCreditsLimit} />
            <p className="text-sm text-[#6B7280]">
              {monthlyCreditsRemaining} / {monthlyCreditsLimit} monthly credits
              {creditsResetLabel ? ` - resets ${creditsResetLabel}` : ""}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-[#111827]">Bonus credits</p>
              <p className="text-sm text-[#6B7280]">{bonusCredits} available</p>
            </div>
            <p className="text-sm text-[#111827]">{bonusCredits} bonus credits (never expire)</p>
          </div>

          <div className="rounded-[14px] border border-[#E5E7EB] bg-[#F8F9FC] px-4 py-4">
            <p className="text-3xl font-bold text-[#2563EB]">{totalCredits}</p>
            <p className="mt-1 text-sm text-[#6B7280]">Total credits available</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
