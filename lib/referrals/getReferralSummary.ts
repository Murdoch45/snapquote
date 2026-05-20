import "server-only";
import { REFERRAL_REWARD_VALUE_CENTS } from "@/lib/referralRewards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/utils";

/**
 * Shape returned to the MyLink page (Lane D) and to /api/app/referrals/summary.
 *
 * 2026-05-20 follow-up: collapsed the previous four-state surface
 * (pending / qualified / rewarded / earned) down to the two metrics the
 * contractor actually cares about: how many referrals are mid-flight
 * (Pending) and how much credit they have earned so far (Credit Earned —
 * always reflects qualified + rewarded value, regardless of whether
 * Stripe has applied it yet). `hasUnappliedCredit` is a UI hint so the
 * page can show a "applies on your next upgrade" note for SOLO referrers
 * with a banked reward.
 */
export type ReferralSummary = {
  referralCode: string | null;
  referralLink: string | null;
  pendingCount: number;
  creditEarnedDollars: number;
  hasUnappliedCredit: boolean;
  hasReferrer: boolean;
};

export async function getReferralSummary(orgId: string): Promise<ReferralSummary> {
  const admin = createAdminClient();

  const [
    { data: org, error: orgError },
    { data: referrals, error: referralsError },
    { count: bankedCount, error: bankedError },
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
    // "Unapplied credit" = referral_rewards rows still banked (waiting for
    // the referrer's first paid upgrade to land on Stripe). kind=banked_trial
    // + status=pending uniquely identifies that state per Lane 0 U3
    // (record_referral_reward) and Lane C U14 (applyBankedRewardForOrg).
    admin
      .from("referral_rewards")
      .select("id", { count: "exact", head: true })
      .eq("referrer_org_id", orgId)
      .eq("kind", "banked_trial")
      .eq("status", "pending"),
    admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referred_org_id", orgId)
  ]);

  if (orgError) throw new Error(orgError.message || "Failed to load organization.");
  if (referralsError) throw new Error(referralsError.message || "Failed to load referrals.");
  if (bankedError) throw new Error(bankedError.message || "Failed to load referral rewards.");
  if (referrerError) throw new Error(referrerError.message || "Failed to load referrer state.");

  const referralCode = (org?.referral_code as string | null) ?? null;
  const referralLink = referralCode ? `${getAppUrl()}/r/${referralCode}` : null;

  // Credit Earned = count of referrals in qualified OR rewarded state ×
  // the locked $120 reward. clawed_back referrals are excluded (they've
  // been reversed). Using the referrals.status count rather than summing
  // referral_rewards.value_cents covers the brief window between
  // qualify_referral RPC and record_referral_reward RPC where the
  // referrals row is 'qualified' but no reward row exists yet.
  let pendingCount = 0;
  let creditEarnedCount = 0;
  for (const row of referrals ?? []) {
    const status = row.status as string;
    if (status === "pending") {
      pendingCount += 1;
    } else if (status === "qualified" || status === "rewarded") {
      creditEarnedCount += 1;
    }
  }

  const creditEarnedCents = creditEarnedCount * REFERRAL_REWARD_VALUE_CENTS;

  return {
    referralCode,
    referralLink,
    pendingCount,
    creditEarnedDollars: creditEarnedCents / 100,
    hasUnappliedCredit: (bankedCount ?? 0) > 0,
    hasReferrer: (referrerCount ?? 0) > 0
  };
}
