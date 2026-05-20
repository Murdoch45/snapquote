-- Lane 0 U2: Backfill referral_code for all existing organizations, then add NOT NULL.
--
-- Backfills any organization rows still missing a code by calling
-- public.generate_referral_code() with retry on UNIQUE violation, then
-- promotes the column to NOT NULL. Both halves are idempotent: re-running
-- the migration is safe.
--
-- Also tightens grants on generate_referral_code — U1 left anon and
-- authenticated with implicit EXECUTE (Supabase auto-grants those on new
-- public.* functions); only service_role should be able to call this.
-- This matches the lockdown pattern in migration 0029 / 20260508234346
-- for update_org_plan_credits + reset_org_credits.

-- ---------------------------------------------------------------------------
-- Tighten grants on the helper (Supabase auto-grants to anon/authenticated
-- need to be revoked explicitly; U1's REVOKE FROM public is not enough)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.generate_referral_code(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code(integer) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Backfill referral_code for every org still missing one. Idempotent —
-- if no rows match, the loop body never runs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org_id uuid;
  v_attempt integer;
  v_max_attempts integer := 16;
  v_candidate text;
  v_filled boolean;
BEGIN
  FOR v_org_id IN
    SELECT id FROM public.organizations
    WHERE referral_code IS NULL
    ORDER BY created_at
  LOOP
    v_attempt := 0;
    v_filled := false;
    WHILE v_attempt < v_max_attempts AND NOT v_filled LOOP
      v_candidate := public.generate_referral_code(8);
      BEGIN
        UPDATE public.organizations
        SET referral_code = v_candidate
        WHERE id = v_org_id;
        v_filled := true;
      EXCEPTION WHEN unique_violation THEN
        v_attempt := v_attempt + 1;
      END;
    END LOOP;
    IF NOT v_filled THEN
      RAISE EXCEPTION
        'referral_lane0_backfill_codes: failed to generate unique referral_code for org % after % attempts',
        v_org_id, v_max_attempts;
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- All rows now have a code; promote the column to NOT NULL. Idempotent —
-- SET NOT NULL is a no-op when the column is already NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ALTER COLUMN referral_code SET NOT NULL;
