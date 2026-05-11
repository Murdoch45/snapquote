-- Audit 3 H3 — paid-plan credit reset cron.
--
-- Only `reset-solo-credits` (jobid=3) exists in pg_cron for credit resets.
-- TEAM/BUSINESS plans rely on Stripe `invoice.payment_succeeded` and RC
-- `RENEWAL` / `INITIAL_PURCHASE` / `PRODUCT_CHANGE` to call
-- `update_org_plan_credits`. When those webhooks miss (extended trials,
-- Stripe delivery hiccups, RC delivery hiccups), the org silently retains
-- its stale `credits_reset_at` and either over- or under-consumes credits.
--
-- Live evidence (Supabase MCP, 2026-05-11):
--   SELECT id, slug, plan, credits_reset_at FROM organizations
--   WHERE plan IN ('TEAM','BUSINESS')
--     AND (credits_reset_at IS NULL OR credits_reset_at <= now());
--   →
--     eabc1e4a-…  org-fae71edd693…  TEAM      NULL                          (Stripe trialing since 2026-03-19)
--     f77b0ebb-…  org-81fb822eb…    TEAM      NULL                          (Stripe trialing since 2026-03-19)
--     36ba5025-…  demo-riveras…     BUSINESS  2026-04-18 12:37:05.258+00    (no Stripe sub)
--     7e7ce05f-…  poo               BUSINESS  2026-04-20 16:58:22.29+00     (Stripe trialing since 2026-03-20)
--
-- This cron mirrors `reset-solo-credits`: same daily 00:00 UTC schedule,
-- same WHERE shape (`credits_reset_at IS NULL OR credits_reset_at <= now()`).
-- The next run picks up all 4 orgs above and brings them current.
--
-- Idempotent: the WHERE re-checks `credits_reset_at <= now()` so if a
-- webhook beats the cron, the cron is a no-op for that org. SOLO orgs
-- aren't matched (different cron handles them).

SELECT cron.schedule(
  'reset-paid-credits',
  '0 0 * * *',
  $$
  UPDATE organizations
  SET monthly_credits = plan_monthly_credits(plan),
      credits_reset_at = now() + interval '1 month'
  WHERE plan IN ('TEAM','BUSINESS')
  AND (credits_reset_at IS NULL OR credits_reset_at <= now())
  $$
);
