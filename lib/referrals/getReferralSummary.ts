import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";

export type ReferralSummary = {
  referralCode: string | null;
  referralLink: string | null;
  pendingCount: number;
  qualifiedCount: number;
  rewardedCount: number;
  totalEarnedDollars: number;
  hasReferrer: boolean;
};

export async function getReferralSummary(orgId: string): Promise<ReferralSummary> {
  const admin = createAdminClient();

  const [
    { data: org, error: orgError },
    { data: referrals, error: referralsError },
    { data: rewards, error: rewardsError },
    { count: referrerCount, error: referrerError }
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("referral_code")
      .eq("id", orgId)
      .single(),
    admin
      .from("referrals")
      .select("status")
      .eq("referrer_org_id", orgId),
    admin
      .from("referral_rewards")
      .select("value_cents, status")
      .eq("referrer_org_id", orgId),
    admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referred_org_id", orgId)
  ]);

  if (orgError) throw new Error(orgError.message || "Failed to load organization.");
  if (referralsError) throw new Error(referralsError.message || "Failed to load referrals.");
  if (rewardsError) throw new Error(rewardsError.message || "Failed to load referral rewards.");
  if (referrerError) throw new Error(referrerError.message || "Failed to load referrer state.");

  const referralCode = (org?.referral_code as string | null) ?? null;
  const referralLink = referralCode ? `${getAppUrl()}/r/${referralCode}` : null;

  let pendingCount = 0;
  let qualifiedCount = 0;
  let rewardedCount = 0;
  for (const row of referrals ?? []) {
    const status = row.status as string;
    if (status === "pending") pendingCount += 1;
    else if (status === "qualified") qualifiedCount += 1;
    else if (status === "rewarded") rewardedCount += 1;
  }

  let totalEarnedCents = 0;
  for (const row of rewards ?? []) {
    if ((row.status as string) === "applied") {
      const value = row.value_cents as number | null;
      if (typeof value === "number" && Number.isFinite(value)) {
        totalEarnedCents += value;
      }
    }
  }

  return {
    referralCode,
    referralLink,
    pendingCount,
    qualifiedCount,
    rewardedCount,
    totalEarnedDollars: totalEarnedCents / 100,
    hasReferrer: (referrerCount ?? 0) > 0
  };
}
