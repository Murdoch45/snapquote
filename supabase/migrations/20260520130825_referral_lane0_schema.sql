-- Lane 0 U1: Referral program — core schema.
--
-- Builds the foundation for the contractor-to-contractor referral program:
--   * organizations.referral_code (text, UNIQUE, nullable for now — U2 backfills + adds NOT NULL)
--   * referrals table (one row per referrer→referred pairing; UNIQUE on referred_org_id)
--   * referral_rewards table (one row per applied/banked reward; supports clawback)
--   * generate_referral_code helper for code generation
--
-- RLS mirrors the audit_log pattern (migration 0046_audit_log.sql, line 30-37):
-- enable RLS, SELECT policy gated on organization_members membership, no
-- INSERT/UPDATE/DELETE policies — only service_role bypasses. Webhook
-- handlers and admin-client API routes do all writes.
--
-- Function-shape model (lines 17-57 of 0055_refund_bonus_credits_rpc.sql,
-- live pg_proc verified 2026-05-20 via Supabase MCP):
--   LANGUAGE plpgsql, SECURITY DEFINER (for helpers that need privileges),
--   SET search_path = public, pg_temp, REVOKE FROM public + GRANT to
--   service_role only.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_status') THEN
    CREATE TYPE public.referral_status AS ENUM ('pending', 'qualified', 'rewarded', 'clawed_back');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_reward_kind') THEN
    CREATE TYPE public.referral_reward_kind AS ENUM ('stripe_balance', 'banked_trial');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_reward_status') THEN
    CREATE TYPE public.referral_reward_status AS ENUM ('pending', 'applied', 'clawed_back');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- generate_referral_code(p_length integer) — helper used by U2 backfill and
-- by application signup code (Lane A). Returns a random uppercase
-- alphanumeric code from an unambiguous alphabet (no 0/O/1/I/L). Caller
-- retries on UNIQUE violation; one collision rate at 32^8 ≈ 1 in 1.1
-- trillion makes this near-zero in practice.
--
-- Permissions: service_role only. Application Lane A calls via admin client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_referral_code(p_length integer DEFAULT 8)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 32-char unambiguous alphabet — excludes visually confusable 0/O, 1/I/L.
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_chars_len integer := length(v_chars);
  v_code text := '';
  v_i integer;
BEGIN
  IF p_length IS NULL OR p_length < 6 OR p_length > 12 THEN
    RAISE EXCEPTION 'generate_referral_code: length must be 6..12 (got %)', p_length;
  END IF;

  FOR v_i IN 1..p_length LOOP
    v_code := v_code || substr(v_chars, 1 + floor(random() * v_chars_len)::integer, 1);
  END LOOP;

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_referral_code(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_referral_code(integer) TO service_role;

COMMENT ON FUNCTION public.generate_referral_code(integer) IS
  'Random uppercase alphanumeric code (default 8 chars, 6..12 allowed) from a 32-char unambiguous alphabet (no 0/O/1/I/L). Used to populate organizations.referral_code. Caller retries on UNIQUE violation. service_role only.';

-- ---------------------------------------------------------------------------
-- organizations.referral_code (nullable; U2 backfills + adds NOT NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS referral_code text;

-- UNIQUE constraint named explicitly so future migrations can reference it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_referral_code_unique'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_referral_code_unique UNIQUE (referral_code);
  END IF;
END
$$;

-- Format check (permissive — accepts any uppercase alphanumeric of length
-- 6..12). The generator emits a stricter subset; this constraint catches
-- bad inputs (e.g. lowercase, special chars) at write time regardless of
-- which path wrote the value.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_referral_code_format'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_referral_code_format
        CHECK (referral_code IS NULL OR referral_code ~ '^[A-Z0-9]{6,12}$');
  END IF;
END
$$;

COMMENT ON COLUMN public.organizations.referral_code IS
  'Unique referral code for this org (uppercase alphanumeric, 6..12 chars). Path segment on snapquote.us/r/{code}. Generated at org creation via generate_referral_code() with retry-on-collision. Nullable until U2 backfill completes, then NOT NULL.';

-- ---------------------------------------------------------------------------
-- referrals table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referrals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  referred_org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  code            text NOT NULL,
  status          public.referral_status NOT NULL DEFAULT 'pending',
  qualified_at    timestamptz,
  rewarded_at     timestamptz,
  clawed_back_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Defense in depth: application also rejects self-referral, but a CHECK
  -- here means a buggy admin-client write can't slip one in.
  CONSTRAINT referrals_not_self CHECK (referrer_org_id <> referred_org_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_org_status_idx
  ON public.referrals (referrer_org_id, status);

CREATE INDEX IF NOT EXISTS referrals_referred_org_idx
  ON public.referrals (referred_org_id);

CREATE INDEX IF NOT EXISTS referrals_code_idx
  ON public.referrals (code);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Members of either the referrer or the referred org can read the row. The
-- referrer needs it for their dashboard ("you have N pending referrals");
-- the referred org member needs it so the redeem flow can show "you were
-- referred by X." Mirrors the audit_log SELECT-only policy shape.
DROP POLICY IF EXISTS "Members can read referrals for own orgs" ON public.referrals;
CREATE POLICY "Members can read referrals for own orgs"
  ON public.referrals FOR SELECT
  USING (
    referrer_org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
    OR referred_org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );
-- No INSERT/UPDATE/DELETE policies — only service_role can write (via bypass).

COMMENT ON TABLE public.referrals IS
  'Contractor-to-contractor referral pairings. UNIQUE on referred_org_id enforces "one referral per referred org, ever." Lifecycle: pending → qualified → rewarded → (optional clawed_back). State transitions go through qualify_referral / record_referral_reward RPCs (Lane 0 U3).';

-- ---------------------------------------------------------------------------
-- referral_rewards table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id           uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  referrer_org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind                  public.referral_reward_kind NOT NULL,
  value_cents           integer NOT NULL CHECK (value_cents >= 0),
  status                public.referral_reward_status NOT NULL DEFAULT 'pending',
  stripe_balance_txn_id text,
  applied_at            timestamptz,
  clawed_back_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_rewards_referral_id_idx
  ON public.referral_rewards (referral_id);

CREATE INDEX IF NOT EXISTS referral_rewards_referrer_org_id_idx
  ON public.referral_rewards (referrer_org_id);

ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read referral_rewards for own org" ON public.referral_rewards;
CREATE POLICY "Members can read referral_rewards for own org"
  ON public.referral_rewards FOR SELECT
  USING (
    referrer_org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );
-- No INSERT/UPDATE/DELETE policies — service_role only via bypass.

COMMENT ON TABLE public.referral_rewards IS
  'One row per applied or banked reward. kind=stripe_balance: a customer.balance credit was created on the referrer''s Stripe customer (txn id captured). kind=banked_trial: referrer was on Solo or had no Stripe customer; reward is deferred until next paid upgrade. clawed_back_at is set when a downstream refund reverses the reward.';
