-- Atomic bonus-credit refund for webhook refund handlers.
--
-- Both the Stripe and RevenueCat webhook refund paths used to read the
-- current bonus_credits value, subtract the refund amount in JS, and
-- write the new value back. Two concurrent refund events on the same
-- org could both read the same starting value and both write back the
-- same decremented number — a double-refund would only deduct once.
--
-- This RPC locks the organizations row with FOR UPDATE so concurrent
-- refunds serialize through the same lock the unlock_lead_with_credits
-- function uses for credit charges. Clamp at zero (no negative balances)
-- and return the post-refund bonus_credits value for logging.
--
-- service_role only — refund paths fire from webhook handlers that
-- already authenticate via provider signatures (Stripe + RevenueCat).

CREATE OR REPLACE FUNCTION public.refund_bonus_credits(
  p_org_id uuid,
  p_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current integer;
  v_new integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'refund_bonus_credits: amount must be positive (got %)', p_amount;
  END IF;

  -- FOR UPDATE acquires a row-level lock; concurrent refunds on the same
  -- org queue up behind this and read the post-commit value.
  SELECT bonus_credits
  INTO v_current
  FROM organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_bonus_credits: org not found (%)', p_org_id;
  END IF;

  v_new := GREATEST(0, v_current - p_amount);

  UPDATE organizations
  SET bonus_credits = v_new
  WHERE id = p_org_id;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_bonus_credits(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_bonus_credits(uuid, integer) TO service_role;
