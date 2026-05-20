-- Lane 0 U3: Atomic RPCs for the referral qualification + reward lifecycle.
--
-- Two functions, both idempotent by construction, called from the Stripe +
-- RC webhook handlers (Lane B + Lane C). Both:
--   * LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public, pg_temp
--   * REVOKE FROM public + anon + authenticated, GRANT TO service_role only
-- Matches the hardening pattern in migrations 0055_refund_bonus_credits_rpc,
-- 0029_additional_credit_rpc, and 20260508234346_rpc_hardening_*.
--
-- Atomicity rationale: webhook deliveries from Stripe and RevenueCat can
-- retry (network blip, lambda timeout, claim/release race). Both functions
-- use UPDATE-WHERE-NULL-AND-STATUS-CHECK so a duplicate webhook delivery
-- that reaches this RPC after the first one committed is a clean no-op
-- (returns 0 rows affected). The pattern mirrors
-- credit_purchases.refunded_at as set up in migration 20260511183247.

-- ---------------------------------------------------------------------------
-- qualify_referral(p_referred_org_id, p_reason) → integer
--
-- Flips status pending → qualified for the referral identified by
-- p_referred_org_id. Returns the number of rows updated:
--   1 = newly qualified (caller should proceed to record_referral_reward).
--   0 = no-op (no pending referral exists for this referred org — either
--       there was never one, or it was already qualified/rewarded/clawed_back).
--
-- p_reason is captured for forward compatibility (caller will record an
-- audit_log entry; we may add metadata writes here in a future migration).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.qualify_referral(
  p_referred_org_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected integer;
BEGIN
  IF p_referred_org_id IS NULL THEN
    RAISE EXCEPTION 'qualify_referral: p_referred_org_id is required';
  END IF;

  -- Atomic transition pending → qualified. PG locks the matching row for
  -- the duration of the UPDATE, so a concurrent invocation with the same
  -- referred_org_id queues behind this one and sees status='qualified' on
  -- re-evaluation, producing 0 affected rows. Idempotent.
  UPDATE public.referrals
  SET status       = 'qualified',
      qualified_at = now()
  WHERE referred_org_id = p_referred_org_id
    AND status = 'pending';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

REVOKE ALL ON FUNCTION public.qualify_referral(uuid, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.qualify_referral(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.qualify_referral(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_referral(uuid, text) TO service_role;

COMMENT ON FUNCTION public.qualify_referral(uuid, text) IS
  'Atomic transition pending → qualified for a referral keyed by referred_org_id. Returns 1 on first qualify, 0 on no-op. Idempotent against duplicate webhook deliveries. p_reason is advisory (caller logs to audit_log).';

-- ---------------------------------------------------------------------------
-- record_referral_reward(p_referral_id, p_value_cents, p_stripe_balance_txn_id) → integer
--
-- Two-stage atomic operation:
--   1. UPDATE referrals SET status='rewarded', rewarded_at=now() WHERE id =
--      p_referral_id AND status='qualified' AND rewarded_at IS NULL.
--      Mirrors credit_purchases.refunded_at UPDATE-WHERE-NULL pattern.
--   2. If step 1 affected 1 row, INSERT a referral_rewards row. The
--      function runs in a single statement-level transaction in pl/pgsql,
--      so a failure in step 2 rolls back step 1.
--
-- Returns:
--   1 = newly rewarded (caller proceeds with Stripe balance write or DB-banked logic).
--   0 = no-op (referral was not in qualified state OR was already rewarded).
--
-- Kind / status / applied_at on referral_rewards derive from whether a
-- Stripe customer.balance txn id was provided:
--   p_stripe_balance_txn_id non-null → kind=stripe_balance, status=applied, applied_at=now()
--   p_stripe_balance_txn_id null     → kind=banked_trial,  status=pending,  applied_at=null
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_referral_reward(
  p_referral_id uuid,
  p_value_cents integer,
  p_stripe_balance_txn_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected        integer;
  v_referrer_org_id uuid;
  v_reward_kind     public.referral_reward_kind;
  v_reward_status   public.referral_reward_status;
  v_applied_at      timestamptz;
BEGIN
  IF p_referral_id IS NULL THEN
    RAISE EXCEPTION 'record_referral_reward: p_referral_id is required';
  END IF;
  IF p_value_cents IS NULL OR p_value_cents < 0 THEN
    RAISE EXCEPTION 'record_referral_reward: p_value_cents must be >= 0 (got %)', p_value_cents;
  END IF;

  -- Atomic claim: flip referral from qualified to rewarded only if not yet
  -- rewarded. Concurrent retry on the same referral_id queues behind the
  -- row lock; the second sees status='rewarded' AND rewarded_at IS NOT NULL
  -- and the WHERE clause fails — 0 affected rows, clean no-op.
  UPDATE public.referrals
  SET status      = 'rewarded',
      rewarded_at = now()
  WHERE id = p_referral_id
    AND status = 'qualified'
    AND rewarded_at IS NULL
  RETURNING referrer_org_id INTO v_referrer_org_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected = 0 THEN
    -- Already rewarded, not in qualified state, or referral not found.
    -- All three are idempotent no-ops.
    RETURN 0;
  END IF;

  -- Successful claim: derive reward kind/status from the Stripe txn id arg
  -- and INSERT the reward row. If the INSERT fails, the function-level
  -- transaction rolls back the referrals UPDATE too, so we never end up
  -- with a 'rewarded' referral and no reward row.
  IF p_stripe_balance_txn_id IS NOT NULL THEN
    v_reward_kind   := 'stripe_balance';
    v_reward_status := 'applied';
    v_applied_at    := now();
  ELSE
    v_reward_kind   := 'banked_trial';
    v_reward_status := 'pending';
    v_applied_at    := NULL;
  END IF;

  INSERT INTO public.referral_rewards (
    referral_id,
    referrer_org_id,
    kind,
    value_cents,
    status,
    stripe_balance_txn_id,
    applied_at
  ) VALUES (
    p_referral_id,
    v_referrer_org_id,
    v_reward_kind,
    p_value_cents,
    v_reward_status,
    p_stripe_balance_txn_id,
    v_applied_at
  );

  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral_reward(uuid, integer, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.record_referral_reward(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_referral_reward(uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_referral_reward(uuid, integer, text) TO service_role;

COMMENT ON FUNCTION public.record_referral_reward(uuid, integer, text) IS
  'Atomic transition qualified → rewarded for a referral, with an inserted referral_rewards row in the same transaction. Returns 1 on first reward, 0 on no-op. When p_stripe_balance_txn_id is non-null: kind=stripe_balance, status=applied. When null: kind=banked_trial, status=pending (deferred until referrer''s next paid upgrade). Idempotent per referral_id against duplicate webhook deliveries.';
