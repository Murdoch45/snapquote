import Link from "next/link";
import { AlertCircle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CreditsAddedToast } from "@/components/plan/CreditsAddedToast";
import { ManageBillingButton } from "@/components/plan/ManageBillingButton";
import { PlanOptionsSection } from "@/components/plan/PlanOptionsSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth/requireAuth";
import { getOrgCredits } from "@/lib/credits";
import { getPlanSeatLimit } from "@/lib/plans";
import { getOrganizationSubscriptionStatus } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanMonthlyCredits } from "@/lib/usage";

export const dynamic = "force-dynamic";

function formatPlanName(plan: "SOLO" | "TEAM" | "BUSINESS"): string {
  if (plan === "SOLO") return "Solo";
  if (plan === "TEAM") return "Team";
  return "Business";
}

function getPlanPrice(
  plan: "SOLO" | "TEAM" | "BUSINESS",
  billingInterval: string | null
): string {
  if (plan === "SOLO") return "Free";
  if (billingInterval === "year") {
    return plan === "TEAM" ? "$191.99/year" : "$383.99/year";
  }
  return plan === "TEAM" ? "$19.99/month" : "$39.99/month";
}

function getUsagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, (used / limit) * 100);
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-primary transition-all"
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

  const [subscription, membersResult, organization, orgTrialRow] = await Promise.all([
    getOrganizationSubscriptionStatus(orgId),
    admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId),
    admin.rpc("get_org_credit_row", { p_org_id: orgId }).single(),
    admin.from("organizations").select("has_used_trial").eq("id", orgId).single()
  ]);

  if (organization.error || !organization.data) {
    throw new Error("Organization not found.");
  }

  const orgCreditRow = organization.data as { plan: string; monthly_credits: number; bonus_credits: number; credits_reset_at: string | null };
  const plan = orgCreditRow.plan as "SOLO" | "TEAM" | "BUSINESS";
  const price = getPlanPrice(plan, subscription.billingInterval);
  const monthlyCreditsRemaining = Number(orgCreditRow.monthly_credits ?? 0);
  const bonusCredits = Number(orgCreditRow.bonus_credits ?? 0);
  const totalCredits = monthlyCreditsRemaining + bonusCredits;
  const monthlyCreditsLimit = getPlanMonthlyCredits(plan);
  const usersUsed = membersResult.count ?? 0;
  const usersLimit = getPlanSeatLimit(plan);
  const resetAt = orgCreditRow.credits_reset_at
    ? new Date(orgCreditRow.credits_reset_at as string)
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
    { label: `${monthlyCreditsLimit} monthly credits`, positive: true },
    { label: `${usersLimit} ${usersLimit === 1 ? "team member" : "team members"}`, positive: true },
    { label: subscription.active ? "Billing is active" : subscriptionStatusLabel, positive: subscription.active }
  ];

  const isOverSeatLimit = usersUsed > usersLimit;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <CreditsAddedToast enabled={params.credits === "added"} />

      {isOverSeatLimit ? (
        <Card className="border-destructive/40 bg-destructive/5 shadow-none">
          <CardContent className="flex items-start gap-3 py-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">
                Over seat limit ({usersUsed}/{usersLimit})
              </p>
              <p className="text-muted-foreground">
                Your organization has more members than the {formatPlanName(plan)} plan allows.
                All members keep access for now, but you can&apos;t invite anyone new until you
                remove {usersUsed - usersLimit}{" "}
                {usersUsed - usersLimit === 1 ? "member" : "members"} or upgrade.
              </p>
              <div className="pt-1">
                <Link href="/app/team" className="font-medium text-primary hover:text-primary/90">
                  Manage team →
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-foreground">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-3xl font-bold text-foreground">{formatPlanName(plan)}</p>
                <Badge
                  className={
                    subscription.active
                      ? "border-transparent bg-accent text-primary"
                      : "border-transparent bg-muted text-muted-foreground"
                  }
                >
                  {subscriptionStatusLabel}
                </Badge>
              </div>
              <p className="text-xl font-semibold text-foreground">{price}</p>
              <p className="text-sm text-muted-foreground">
                {usersUsed} / {usersLimit} users
              </p>
              {trialEndLabel ? (
                <p className="text-sm text-muted-foreground">Trial ends {trialEndLabel}</p>
              ) : null}

              <div className="space-y-3">
                {planHighlights.map((item) => (
                  <div key={item.label} className="flex items-start gap-3 text-sm text-foreground">
                    {item.positive ? (
                      <Check className="mt-0.5 h-4 w-4 text-primary" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

            </div>

            <div className="rounded-[14px] border border-border bg-muted p-6">
              <p className="text-4xl font-bold leading-none text-primary">{totalCredits}</p>
              <p className="mt-2 text-sm text-muted-foreground">Total credits available</p>
            </div>
          </div>

        </CardContent>
      </Card>

      {subscription.active ? (
        <p className="-mt-3 text-sm text-muted-foreground">
          To manage your billing,{" "}
          <ManageBillingButton label="click here" mode="text" />
          .
        </p>
      ) : null}

      <div id="plan-options" className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Plan Options</h2>
          <p className="text-sm text-muted-foreground">
            Upgrade instantly or schedule a downgrade for the end of your billing cycle.
          </p>
        </div>
        <PlanOptionsSection currentPlan={plan} hasUsedTrial={orgTrialRow.data?.has_used_trial ?? false} />
        <p className="text-sm text-muted-foreground">
          Need more credits?{" "}
          <Link href="/app/credits" className="font-medium text-primary hover:text-primary/90">
            Buy here →
          </Link>
        </p>
      </div>

      <Card className="shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)]">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-base font-semibold text-foreground">Credits & Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-base font-semibold text-foreground">Monthly credits</p>
              <p className="text-sm text-muted-foreground">
                {monthlyCreditsRemaining} / {monthlyCreditsLimit} remaining
              </p>
            </div>
            <UsageBar used={monthlyCreditsRemaining} limit={monthlyCreditsLimit} />
            <p className="text-sm text-muted-foreground">
              {monthlyCreditsRemaining} / {monthlyCreditsLimit} monthly credits
              {creditsResetLabel ? ` - resets ${creditsResetLabel}` : ""}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-foreground">Bonus credits</p>
              <p className="text-sm text-muted-foreground">{bonusCredits} available</p>
            </div>
            <p className="text-sm text-foreground">{bonusCredits} bonus credits (never expire)</p>
          </div>

          <div className="rounded-[14px] border border-border bg-muted px-4 py-4">
            <p className="text-3xl font-bold text-primary">{totalCredits}</p>
            <p className="mt-1 text-sm text-muted-foreground">Total credits available</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
