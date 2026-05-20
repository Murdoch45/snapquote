import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/auditLog";
import { enforceServerOnly } from "@/lib/serverOnlyGuard";
import { getStripe } from "@/lib/stripe";

enforceServerOnly();

// Locked reward value: "3 months Business plan / $120 account credit" — flat
// regardless of the referrer's current plan. Single source of truth; both
// the Stripe customer.balance write and the record_referral_reward call use
// this constant so they can never drift.
export const REFERRAL_REWARD_VALUE_CENTS = 12_000;

type ReferralStatus = "pending" | "qualified" | "rewarded" | "clawed_back";

type ReferralRow = {
  id: string;
  referrer_org_id: string;
  referred_org_id: string;
  status: ReferralStatus;
};

export type ApplyRewardOutcome =
  | { outcome: "stripe_credit_applied"; stripeBalanceTxnId: string; referrerOrgId: string }
  | {
      outcome: "banked";
      referrerOrgId: string;
      reason: "no_stripe_customer" | "no_active_subscription" | "no_owner";
    }
  | {
      outcome: "noop";
      reason:
        | "referral_not_found"
        | "referral_not_qualified"
        | "reward_already_recorded";
    };

async function findActiveStripeCustomerForOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<{ stripeCustomerId: string | null; ownerUserId: string | null }> {
  // Owner is the canonical billing principal for an org — TEAM/BUSINESS
  // checkout always runs as the owner. Multiple memberships in the same
  // role are possible; we take the earliest by created_at so the answer
  // is deterministic across calls.
  const { data: ownerMembership } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "OWNER")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ownerUserId = (ownerMembership?.user_id as string | undefined) ?? null;
  if (!ownerUserId) {
    return { stripeCustomerId: null, ownerUserId: null };
  }

  // "Active Stripe subscription" = status in (active|trialing) and the
  // customer hasn't been marked invalid (stale customer id from test↔live
  // mode swaps — see lib/stripe.ts clearStaleStripeCustomerId). Trialing
  // counts because the customer object exists in Stripe; a $120 credit
  // on a trialing customer will simply be consumed at first invoice.
  const { data: activeSub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", ownerUserId)
    .is("stripe_customer_invalid_at", null)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    stripeCustomerId: (activeSub?.stripe_customer_id as string | undefined) ?? null,
    ownerUserId
  };
}

/**
 * Grant the locked $120 reward to the referrer for a referral that has just
 * transitioned to status='qualified'. Two paths:
 *
 *   1. Referrer has an active Stripe customer → apply a negative
 *      `customer.balance` transaction ($120 credit) via Stripe, then call
 *      record_referral_reward with the txn id. RPC flips referrals.status
 *      to 'rewarded' atomically and inserts a kind='stripe_balance' /
 *      status='applied' referral_rewards row.
 *
 *   2. Referrer is on free SOLO with no Stripe customer, or IAP-only with
 *      no Stripe-side billing → call record_referral_reward with txn id
 *      null. RPC inserts a kind='banked_trial' / status='pending' row.
 *      The reward is deferred until the referrer upgrades (handled by
 *      app/api/stripe/checkout/route.ts).
 *
 * Stripe write uses idempotency key `referral-reward:<referralId>`. Stripe
 * caches the response for 24h, so a retry of this function within that
 * window returns the original transaction instead of creating a duplicate.
 * Beyond the 24h window the record_referral_reward RPC is the second line
 * of defense — it's also idempotent against duplicate calls.
 */
export async function applyRewardToReferrer(referralId: string): Promise<ApplyRewardOutcome> {
  const admin = createAdminClient();

  const { data: referralRaw, error: loadError } = await admin
    .from("referrals")
    .select("id, referrer_org_id, referred_org_id, status")
    .eq("id", referralId)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!referralRaw) {
    return { outcome: "noop", reason: "referral_not_found" };
  }

  const referral = referralRaw as ReferralRow;

  if (referral.status !== "qualified") {
    // Not in the right state to be rewarded. record_referral_reward would
    // safely return 0 here, but we early-exit so we never hit Stripe for
    // an already-rewarded (or never-qualified) referral.
    return { outcome: "noop", reason: "referral_not_qualified" };
  }

  const { stripeCustomerId, ownerUserId } = await findActiveStripeCustomerForOrg(
    admin,
    referral.referrer_org_id
  );

  if (!stripeCustomerId) {
    const reason = !ownerUserId ? "no_owner" : "no_active_subscription";
    const { data: bankedRows, error: rpcError } = await admin.rpc("record_referral_reward", {
      p_referral_id: referralId,
      p_value_cents: REFERRAL_REWARD_VALUE_CENTS,
      p_stripe_balance_txn_id: null
    });
    if (rpcError) throw rpcError;
    const affected = typeof bankedRows === "number" ? bankedRows : 0;
    if (affected === 0) {
      await recordAudit(admin, {
        orgId: referral.referrer_org_id,
        action: "referral.reward.noop",
        targetType: "referral",
        targetId: referralId,
        metadata: { reason: "rpc_returned_zero", stage: "bank" }
      });
      return { outcome: "noop", reason: "reward_already_recorded" };
    }
    await recordAudit(admin, {
      orgId: referral.referrer_org_id,
      action: "referral.reward.banked",
      targetType: "referral",
      targetId: referralId,
      metadata: {
        value_cents: REFERRAL_REWARD_VALUE_CENTS,
        reason,
        referred_org_id: referral.referred_org_id
      }
    });
    return { outcome: "banked", referrerOrgId: referral.referrer_org_id, reason };
  }

  const stripe = getStripe();
  let balanceTxn: Stripe.CustomerBalanceTransaction;
  try {
    balanceTxn = await stripe.customers.createBalanceTransaction(
      stripeCustomerId,
      {
        // Stripe convention: positive balance = customer owes us; negative
        // = we owe the customer (credit applied to future invoices).
        amount: -REFERRAL_REWARD_VALUE_CENTS,
        currency: "usd",
        description: "SnapQuote referral reward — $120 account credit",
        metadata: {
          referral_id: referralId,
          referrer_org_id: referral.referrer_org_id,
          referred_org_id: referral.referred_org_id
        }
      },
      {
        idempotencyKey: `referral-reward:${referralId}`
      }
    );
  } catch (stripeError) {
    // Stripe write failed — leave the referral in 'qualified' state so a
    // retry (next webhook delivery, or a manual replay) can complete. We
    // intentionally do NOT call record_referral_reward in this branch.
    throw stripeError;
  }

  const { data: rewardedRows, error: recordError } = await admin.rpc("record_referral_reward", {
    p_referral_id: referralId,
    p_value_cents: REFERRAL_REWARD_VALUE_CENTS,
    p_stripe_balance_txn_id: balanceTxn.id
  });
  if (recordError) throw recordError;
  const affected = typeof rewardedRows === "number" ? rewardedRows : 0;
  if (affected === 0) {
    // RPC saw 'rewarded' (concurrent delivery beat us). Stripe didn't
    // double-charge thanks to the idempotency key — the same txn id was
    // returned both times.
    await recordAudit(admin, {
      orgId: referral.referrer_org_id,
      action: "referral.reward.noop",
      targetType: "referral",
      targetId: referralId,
      metadata: {
        reason: "rpc_returned_zero",
        stage: "stripe_post_credit",
        stripe_balance_txn_id: balanceTxn.id
      }
    });
    return { outcome: "noop", reason: "reward_already_recorded" };
  }

  await recordAudit(admin, {
    orgId: referral.referrer_org_id,
    action: "referral.reward.applied",
    targetType: "referral",
    targetId: referralId,
    metadata: {
      value_cents: REFERRAL_REWARD_VALUE_CENTS,
      stripe_balance_txn_id: balanceTxn.id,
      stripe_customer_id: stripeCustomerId,
      referred_org_id: referral.referred_org_id
    }
  });
  return {
    outcome: "stripe_credit_applied",
    stripeBalanceTxnId: balanceTxn.id,
    referrerOrgId: referral.referrer_org_id
  };
}

/**
 * Convenience wrapper used by webhook handlers: call qualify_referral, and
 * if it transitions a referral from pending → qualified, immediately fire
 * the reward applier. Swallows its own errors and reports to Sentry — the
 * caller never throws, so a referral failure cannot break the host webhook
 * delivery (which would release the claim and force a Stripe / RC retry of
 * the entire event).
 *
 * `source` selects the Sentry `area` tag — "stripe" → "referral-qualify-stripe",
 * "revenuecat" → "referral-qualify-revenuecat".
 */
export async function qualifyAndRewardReferral(
  referredOrgId: string,
  reason: string,
  source: "stripe" | "revenuecat"
): Promise<void> {
  const sentryArea =
    source === "stripe" ? "referral-qualify-stripe" : "referral-qualify-revenuecat";
  try {
    const admin = createAdminClient();
    const { data: qualifyResult, error: qualifyError } = await admin.rpc("qualify_referral", {
      p_referred_org_id: referredOrgId,
      p_reason: reason
    });
    if (qualifyError) throw qualifyError;

    const newlyQualified = typeof qualifyResult === "number" ? qualifyResult : 0;
    if (newlyQualified === 0) {
      // No pending referral for this org, or it was already past pending.
      // Clean no-op — most orgs never had a referral in the first place.
      return;
    }

    // qualify_referral keyed on referred_org_id (UNIQUE) — look up the row
    // to get the referral id so we can fire the applier.
    const { data: referralRow, error: lookupError } = await admin
      .from("referrals")
      .select("id, referrer_org_id")
      .eq("referred_org_id", referredOrgId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!referralRow?.id) {
      Sentry.captureMessage(
        "qualify_referral returned 1 but no referral row found for referred_org_id",
        {
          level: "warning",
          tags: { area: sentryArea, stage: "lookup" },
          extra: { referredOrgId, reason }
        }
      );
      return;
    }

    await recordAudit(admin, {
      orgId: referralRow.referrer_org_id as string,
      action: "referral.qualified",
      targetType: "referral",
      targetId: referralRow.id as string,
      metadata: { reason, source, referred_org_id: referredOrgId }
    });

    await applyRewardToReferrer(referralRow.id as string);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { area: sentryArea, stage: "qualify-and-reward" },
      extra: { referredOrgId, reason }
    });
  }
}

export type BankedApplyOutcome =
  | { outcome: "applied"; stripeBalanceTxnId: string; rewardId: string }
  | { outcome: "noop"; reason: "no_banked_reward" | "no_stripe_customer" | "already_applied" };

/**
 * Convert a banked_trial reward into an applied Stripe customer.balance
 * credit. Called from app/api/stripe/checkout/route.ts when a referrer who
 * previously banked a reward (because they were SOLO at qualification time)
 * later upgrades to a paid plan and now has a Stripe customer to credit.
 *
 * The atomic claim is on referral_rewards.applied_at via UPDATE-WHERE-NULL —
 * same pattern as credit_purchases.refunded_at — so concurrent invocations
 * can't double-credit even if checkout runs twice.
 */
export async function applyBankedRewardForOrg(
  referrerOrgId: string,
  stripeCustomerId: string
): Promise<BankedApplyOutcome> {
  const admin = createAdminClient();

  const { data: bankedRows, error: loadError } = await admin
    .from("referral_rewards")
    .select("id, value_cents, referral_id")
    .eq("referrer_org_id", referrerOrgId)
    .eq("kind", "banked_trial")
    .eq("status", "pending")
    .is("applied_at", null)
    .is("clawed_back_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (loadError) throw loadError;
  const banked = bankedRows && bankedRows.length > 0 ? bankedRows[0] : null;
  if (!banked) {
    return { outcome: "noop", reason: "no_banked_reward" };
  }

  const rewardId = banked.id as string;
  const valueCents = typeof banked.value_cents === "number" ? banked.value_cents : null;
  if (valueCents === null || valueCents <= 0) {
    return { outcome: "noop", reason: "no_banked_reward" };
  }

  // Atomic claim — only proceed if applied_at is still NULL and status is
  // still 'pending'. A concurrent runner that won the claim flipped these
  // already and our UPDATE returns no rows.
  const { data: claimed, error: claimError } = await admin
    .from("referral_rewards")
    .update({
      applied_at: new Date().toISOString(),
      status: "applied",
      kind: "stripe_balance"
    })
    .eq("id", rewardId)
    .eq("status", "pending")
    .is("applied_at", null)
    .is("clawed_back_at", null)
    .select("id");

  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) {
    return { outcome: "noop", reason: "already_applied" };
  }

  // Slot claimed — write the Stripe credit. Idempotency key derived from
  // the reward id (not the referral id, which is used by the initial
  // applyRewardToReferrer path — different keys keep the two Stripe
  // operations distinct even though they apply to the same referrer).
  const stripe = getStripe();
  let balanceTxn: Stripe.CustomerBalanceTransaction;
  try {
    balanceTxn = await stripe.customers.createBalanceTransaction(
      stripeCustomerId,
      {
        amount: -valueCents,
        currency: "usd",
        description: "SnapQuote referral reward — banked $120 account credit applied on upgrade",
        metadata: {
          referral_reward_id: rewardId,
          referral_id: banked.referral_id as string,
          referrer_org_id: referrerOrgId,
          banked: "true"
        }
      },
      {
        idempotencyKey: `referral-reward-banked:${rewardId}`
      }
    );
  } catch (stripeError) {
    // Stripe write failed AFTER the DB claim flipped to applied. Roll the
    // DB claim back so a retry can re-apply. Re-throw so the caller sees
    // the failure.
    await admin
      .from("referral_rewards")
      .update({ applied_at: null, status: "pending", kind: "banked_trial" })
      .eq("id", rewardId);
    throw stripeError;
  }

  // Record the txn id on the reward row so clawback / support tooling can
  // trace the Stripe transaction back to this reward.
  const { error: txnWriteError } = await admin
    .from("referral_rewards")
    .update({ stripe_balance_txn_id: balanceTxn.id })
    .eq("id", rewardId);
  if (txnWriteError) {
    Sentry.captureException(txnWriteError, {
      tags: { area: "referral-reward-banked-apply", stage: "write-txn-id" },
      extra: { rewardId, stripeBalanceTxnId: balanceTxn.id }
    });
  }

  await recordAudit(admin, {
    orgId: referrerOrgId,
    action: "referral.reward.banked_applied",
    targetType: "referral_reward",
    targetId: rewardId,
    metadata: {
      value_cents: valueCents,
      stripe_balance_txn_id: balanceTxn.id,
      stripe_customer_id: stripeCustomerId,
      referral_id: banked.referral_id as string
    }
  });

  return {
    outcome: "applied",
    stripeBalanceTxnId: balanceTxn.id,
    rewardId
  };
}

export type ClawbackOutcome =
  | {
      outcome: "clawed_back";
      stripeBalanceTxnId: string | null;
      referrerOrgId: string;
      reversalTxnId: string | null;
    }
  | {
      outcome: "noop";
      reason:
        | "no_referral"
        | "not_rewarded"
        | "already_clawed_back"
        | "no_reward_row"
        | "no_stripe_customer";
    };

/**
 * Reverse a referrer's reward when the referred contractor's payment is
 * refunded. Called from the Stripe `charge.refunded` handler and the
 * RevenueCat `REFUND` handler — both fire on subscription refunds for the
 * referred contractor's first paid invoice.
 *
 * Two atomic steps:
 *   1. UPDATE referrals SET clawed_back_at, status='clawed_back' WHERE
 *      referred_org_id = ? AND status = 'rewarded' AND clawed_back_at IS NULL.
 *      If 0 rows affected → referral doesn't exist, was never rewarded, or
 *      already clawed back. Clean no-op.
 *   2. Find the referral_rewards row by referral_id, atomically flip
 *      clawed_back_at and status='clawed_back'.
 *   3. If the original reward was stripe_balance, write a POSITIVE
 *      customer.balance transaction to undo the credit. Idempotency key
 *      derived from the reward id so duplicate refund events don't double-
 *      reverse.
 *
 * If the original reward was banked (kind='banked_trial' with no
 * stripe_balance_txn_id), there's nothing to reverse on Stripe — just flip
 * the DB rows.
 */
export async function clawbackReferrerRewardForReferredOrg(
  referredOrgId: string
): Promise<ClawbackOutcome> {
  const admin = createAdminClient();

  // Step 1 — find and claim the referral row.
  const { data: claimedReferralRows, error: claimReferralError } = await admin
    .from("referrals")
    .update({
      clawed_back_at: new Date().toISOString(),
      status: "clawed_back"
    })
    .eq("referred_org_id", referredOrgId)
    .eq("status", "rewarded")
    .is("clawed_back_at", null)
    .select("id, referrer_org_id");

  if (claimReferralError) throw claimReferralError;
  if (!claimedReferralRows || claimedReferralRows.length === 0) {
    // No matching referral, or already clawed back. Check whether a
    // referral exists at all so we can distinguish for the caller.
    const { data: existing } = await admin
      .from("referrals")
      .select("status, clawed_back_at")
      .eq("referred_org_id", referredOrgId)
      .maybeSingle();
    if (!existing) {
      return { outcome: "noop", reason: "no_referral" };
    }
    if (existing.clawed_back_at) {
      return { outcome: "noop", reason: "already_clawed_back" };
    }
    return { outcome: "noop", reason: "not_rewarded" };
  }

  const referralId = claimedReferralRows[0].id as string;
  const referrerOrgId = claimedReferralRows[0].referrer_org_id as string;

  // Step 2 — locate the reward row. There may legitimately be zero rows
  // (if a previous run partially failed); claim by reward id atomically.
  const { data: rewardRows, error: rewardLoadError } = await admin
    .from("referral_rewards")
    .select("id, kind, value_cents, stripe_balance_txn_id, applied_at")
    .eq("referral_id", referralId)
    .is("clawed_back_at", null)
    .limit(1);

  if (rewardLoadError) throw rewardLoadError;
  if (!rewardRows || rewardRows.length === 0) {
    // Referral was marked clawed_back above but no reward row to reverse.
    // Audit-log so support has a paper trail. Treat as a soft no-op for
    // Stripe purposes.
    await recordAudit(admin, {
      orgId: referrerOrgId,
      action: "referral.reward.clawed_back",
      targetType: "referral",
      targetId: referralId,
      metadata: {
        referred_org_id: referredOrgId,
        note: "referral_rewarded_with_no_reward_row"
      }
    });
    return {
      outcome: "clawed_back",
      stripeBalanceTxnId: null,
      reversalTxnId: null,
      referrerOrgId
    };
  }

  const reward = rewardRows[0];
  const rewardId = reward.id as string;
  const originalTxnId = (reward.stripe_balance_txn_id as string | null) ?? null;
  const valueCents = typeof reward.value_cents === "number" ? reward.value_cents : 0;

  const { data: claimedReward, error: rewardClaimError } = await admin
    .from("referral_rewards")
    .update({
      clawed_back_at: new Date().toISOString(),
      status: "clawed_back"
    })
    .eq("id", rewardId)
    .is("clawed_back_at", null)
    .select("id");

  if (rewardClaimError) throw rewardClaimError;
  if (!claimedReward || claimedReward.length === 0) {
    // Concurrent clawback beat us on the reward row. Referral row was
    // already updated above; rely on that as the source of truth.
    return {
      outcome: "clawed_back",
      stripeBalanceTxnId: originalTxnId,
      reversalTxnId: null,
      referrerOrgId
    };
  }

  // If the original reward was banked (never wrote to Stripe) there is no
  // credit to reverse — DB flip is the entirety of the clawback.
  if (!originalTxnId) {
    await recordAudit(admin, {
      orgId: referrerOrgId,
      action: "referral.reward.clawed_back",
      targetType: "referral_reward",
      targetId: rewardId,
      metadata: {
        kind: "banked_trial_no_stripe_reversal",
        value_cents: valueCents,
        referral_id: referralId,
        referred_org_id: referredOrgId
      }
    });
    return {
      outcome: "clawed_back",
      stripeBalanceTxnId: null,
      reversalTxnId: null,
      referrerOrgId
    };
  }

  // Reverse the Stripe credit. Same customer derivation as the apply path
  // — owner of the referrer org → their active Stripe customer id. We
  // look up the customer freshly rather than trusting a cached id off the
  // reward row to handle the edge case where the referrer's billing
  // identity changed between credit and clawback.
  const { stripeCustomerId } = await findActiveStripeCustomerForOrg(admin, referrerOrgId);

  if (!stripeCustomerId) {
    // Can't reverse — owner has no active Stripe customer anymore. DB
    // already shows clawed_back; flag for review.
    await recordAudit(admin, {
      orgId: referrerOrgId,
      action: "referral.reward.clawed_back",
      targetType: "referral_reward",
      targetId: rewardId,
      metadata: {
        warning: "no_stripe_customer_to_reverse",
        original_stripe_balance_txn_id: originalTxnId,
        value_cents: valueCents,
        referral_id: referralId,
        referred_org_id: referredOrgId
      }
    });
    return {
      outcome: "clawed_back",
      stripeBalanceTxnId: originalTxnId,
      reversalTxnId: null,
      referrerOrgId
    };
  }

  const stripe = getStripe();
  let reversalTxn: Stripe.CustomerBalanceTransaction;
  try {
    reversalTxn = await stripe.customers.createBalanceTransaction(
      stripeCustomerId,
      {
        // POSITIVE amount = customer owes more — reverses the negative
        // credit applied earlier. Net Stripe-side effect: zero.
        amount: valueCents,
        currency: "usd",
        description:
          "SnapQuote referral reward clawback — refund of referred contractor payment",
        metadata: {
          referral_id: referralId,
          referral_reward_id: rewardId,
          original_stripe_balance_txn_id: originalTxnId,
          referrer_org_id: referrerOrgId,
          referred_org_id: referredOrgId,
          reversal: "true"
        }
      },
      {
        idempotencyKey: `referral-reward-clawback:${rewardId}`
      }
    );
  } catch (stripeError) {
    // Reversal write failed. DB rows are already flipped (we can't
    // unflip without risking a partial clawback). Re-throw so the
    // webhook handler captures and Sentry alerts; support can manually
    // post the reversal.
    Sentry.captureException(stripeError, {
      tags: {
        area: "referral-reward-clawback",
        stage: "stripe-reversal",
        referral_id: referralId
      },
      extra: { rewardId, stripeCustomerId, originalTxnId }
    });
    throw stripeError;
  }

  await recordAudit(admin, {
    orgId: referrerOrgId,
    action: "referral.reward.clawed_back",
    targetType: "referral_reward",
    targetId: rewardId,
    metadata: {
      value_cents: valueCents,
      original_stripe_balance_txn_id: originalTxnId,
      reversal_stripe_balance_txn_id: reversalTxn.id,
      stripe_customer_id: stripeCustomerId,
      referral_id: referralId,
      referred_org_id: referredOrgId
    }
  });

  return {
    outcome: "clawed_back",
    stripeBalanceTxnId: originalTxnId,
    reversalTxnId: reversalTxn.id,
    referrerOrgId
  };
}
