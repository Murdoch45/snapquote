-- Hotfix: restore service_role admin-client path on get_org_credit_row.
--
-- Migration 0067 (2026-05-08, audit-2 C-12 fix) added an in-body
-- `if not is_org_member(p_org_id)` membership gate inside this SECURITY
-- DEFINER RPC to prevent an authenticated user from reading another org's
-- plan + credits via /rest/v1/rpc. The check is correct for authenticated
-- callers but is wrong for service_role: the admin client carries no user
-- JWT, so `auth.uid()` is NULL inside the function, `is_org_member()`
-- returns false, and every admin-client call raises
-- 42501 'permission denied for organization <uuid>'.
--
-- Live reproduction (this hotfix's pre-state):
--   set_config('request.jwt.claims','{"role":"service_role"}',true);
--   auth.uid()       -> NULL
--   auth.role()      -> 'service_role'
--   is_org_member()  -> false
--
-- Sentry SNAPQUOTE-WEB-A logged this exact 42501 on Page Server Component
-- /app/leads with culprit `lib/credits.ts -> admin.rpc('get_org_credit_row')`.
-- /app/leads, /app, /app/plan, and /app/leads/[id] all call this RPC via
-- the admin client (lib/credits.ts and app/app/plan/page.tsx).
--
-- L5 (migration 20260508234346) is unrelated: it revoked PUBLIC + anon
-- EXECUTE on is_org_member, but service_role + authenticated retain
-- explicit grants and is_org_member is invoked under postgres inside this
-- SECURITY DEFINER, not under the original caller. ACL on the helpers is
-- not changed by this hotfix.
--
-- Fix: gate the membership check on v_role <> 'service_role', mirroring
-- the established pattern in public.get_org_analytics. service_role
-- (admin client / pg_cron / webhooks) bypasses the gate; authenticated
-- callers still get the C-12 cross-tenant disclosure protection.

CREATE OR REPLACE FUNCTION public.get_org_credit_row(p_org_id uuid)
RETURNS TABLE (
  plan org_plan,
  monthly_credits integer,
  bonus_credits integer,
  credits_reset_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := coalesce(auth.role(), '');
BEGIN
  -- service_role (web admin client / pg_cron / webhooks) bypasses the
  -- membership check; for authenticated callers, gate on org membership
  -- to preserve Audit 2 C-12 cross-tenant disclosure protection.
  IF v_role <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT is_org_member(p_org_id) THEN
      RAISE EXCEPTION 'permission denied for organization %', p_org_id
        USING errcode = '42501';
    END IF;
  END IF;

  RETURN QUERY
    SELECT o.plan, o.monthly_credits, o.bonus_credits, o.credits_reset_at
    FROM organizations o
    WHERE o.id = p_org_id;
END;
$$;

-- Re-assert grants. CREATE OR REPLACE preserves existing ACL but make the
-- intent explicit: anon never; authenticated + service_role always.
REVOKE ALL ON FUNCTION public.get_org_credit_row(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_credit_row(uuid) TO authenticated, service_role;
