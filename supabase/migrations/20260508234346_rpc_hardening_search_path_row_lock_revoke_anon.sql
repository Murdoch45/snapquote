-- Audit 9 H2/H3/L5 RPC hardening (2026-05-08).
--
-- H2 — update_org_plan_credits and reset_org_credits lacked SET search_path,
--      flagged by Supabase advisor `function_search_path_mutable`. Both are
--      SECURITY DEFINER. Mitigation in place: EXECUTE was already revoked
--      from anon/authenticated by migration 0063 (verified live: proacl
--      shows only `postgres=X/postgres, service_role=X/postgres`). Adding
--      SET search_path = public is defense-in-depth.
--
-- H3 — update_org_plan_credits did a plain UPDATE with no FOR UPDATE row
--      lock. Sibling functions refund_bonus_credits (migration 0055) and
--      unlock_lead_with_credits (verified live) both use SELECT … FOR UPDATE
--      before mutation. update_org_plan_credits is called from four billing
--      webhook paths (Stripe webhook, Stripe checkout upgrade, RC webhook,
--      mobile iap/sync) that can fire concurrently for the same org —
--      e.g. checkout.session.completed racing invoice.paid, or RC RENEWAL
--      racing Stripe invoice.payment_succeeded for a multi-billed user.
--      Adding the explicit row lock matches the established pattern.
--
-- L5 — is_org_member and is_org_owner had EXECUTE granted to PUBLIC + anon
--      (live proacl: `=X/postgres, postgres=X/postgres, anon=X/postgres,
--      authenticated=X/postgres, service_role=X/postgres`). Both are
--      SECURITY DEFINER and depend on auth.uid(); anon's auth.uid() is
--      null so the functions always returned false for anon, but being
--      callable via /rest/v1/rpc still produces attack surface (timing,
--      error introspection). Verified via pg_policies that EVERY RLS
--      policy referencing these functions targets `{authenticated}` —
--      no policy targets anon, so anon never invokes them via policy
--      evaluation. service_role and authenticated retain explicit grants.
--      Migration 0063 deliberately left these untouched, citing "used in
--      RLS USING expressions, must stay callable by anon/auth"; that
--      reasoning was overcautious — RLS evaluates the function in the
--      caller's context, and no policy admits anon on tables that
--      reference these functions.

-- ---------------------------------------------------------------------------
-- H2 + H3: update_org_plan_credits — search_path + row lock
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_org_plan_credits(
  p_org_id uuid,
  p_monthly_credits integer,
  p_credits_reset_at timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Acquire a row-level lock before mutation so concurrent webhook bursts
  -- (e.g. checkout.session.completed racing invoice.paid for the same org)
  -- queue up rather than read-then-overwrite. This matches the lock pattern
  -- in refund_bonus_credits and unlock_lead_with_credits.
  PERFORM 1 FROM organizations WHERE id = p_org_id FOR UPDATE;

  UPDATE organizations
  SET monthly_credits = p_monthly_credits,
      credits_reset_at = p_credits_reset_at
  WHERE id = p_org_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- H2: reset_org_credits — search_path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reset_org_credits(
  p_org_id uuid,
  p_monthly_credits integer,
  p_credits_reset_at timestamp with time zone,
  p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE(monthly_credits integer, bonus_credits integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  UPDATE organizations
  SET monthly_credits = p_monthly_credits,
      credits_reset_at = p_credits_reset_at
  WHERE id = p_org_id
    AND (credits_reset_at <= p_now OR credits_reset_at IS NULL)
  RETURNING organizations.monthly_credits, organizations.bonus_credits;
END;
$function$;

-- ---------------------------------------------------------------------------
-- L5: revoke EXECUTE from PUBLIC + anon on is_org_member, is_org_owner
-- ---------------------------------------------------------------------------
-- Note: REVOKE FROM PUBLIC is required in addition to FROM anon; otherwise
-- anon retains effective EXECUTE via PUBLIC even with an explicit anon
-- revoke. authenticated and service_role retain their explicit grants.

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(uuid) FROM PUBLIC, anon;
