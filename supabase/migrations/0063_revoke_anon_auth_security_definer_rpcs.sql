-- Migration 0063: revoke anon/authenticated EXECUTE on server-side-only SECURITY DEFINER RPCs
--
-- Pre-ship audit (May 1, 2026) flagged that seven SECURITY DEFINER functions were
-- exposed via PostgREST (/rest/v1/rpc/*) to anonymous and signed-in users despite
-- being SECURITY DEFINER and only ever invoked by server-side code through the
-- Supabase admin (service_role) client. The most dangerous case was
-- update_org_plan_credits, which accepts arbitrary org_id + monthly_credits values
-- and rewrites organizations.monthly_credits + credits_reset_at unconditionally.
-- An anonymous attacker with knowledge of any org_id (which can be enumerated via
-- the public lead-submit form's contractor profile lookups) could grant unlimited
-- credits, reset billing cycles, or DoS the platform.
--
-- This migration revokes EXECUTE from PUBLIC, anon, and authenticated for these
-- 7 functions. service_role keeps its existing grant. postgres (the function
-- owner; pg_cron jobs run as postgres) retains EXECUTE through ownership.
--
-- We deliberately do NOT revoke from is_org_member / is_org_owner because they
-- are used inside RLS USING expressions; revoking would make every RLS-protected
-- query fail for authenticated users (Postgres checks EXECUTE at the call site
-- even for SECURITY DEFINER functions). Those two stay anon=true, auth=true.
--
-- get_org_credit_row already has anon=false, auth=true (RLS-aware reads).
-- record_credit_purchase and unlock_lead_with_credits already have
-- anon=false, auth=false (admin-only). All correct, untouched here.
--
-- Verified call sites (server-side only via admin client / service_role):
--   - update_org_plan_credits         -> app/api/iap/sync/route.ts:99,
--                                        app/api/stripe/webhook/route.ts:115,
--                                        app/api/revenuecat/webhook/route.ts:93
--   - reset_org_credits               -> lib/credits.ts:65
--   - refund_bonus_credits            -> app/api/stripe/webhook/route.ts:515,
--                                        app/api/revenuecat/webhook/route.ts:393
--   - accept_invite_token             -> app/api/public/invite/accept/route.ts:44
--                                        (route is public-path but uses admin client;
--                                         the user-supplied token is the only sensitive
--                                         input and is validated inside the function)
--   - trigger_rescue_stuck_leads      -> pg_cron job runs as postgres (unaffected by REVOKE)
--   - reset_due_solo_monthly_credits  -> pg_cron job runs as postgres (unaffected by REVOKE)
--   - handle_auth_user_pending_invites -> AFTER INSERT trigger on auth.users; trigger
--                                        fires regardless of role grants

REVOKE EXECUTE ON FUNCTION public.update_org_plan_credits(uuid, integer, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.reset_org_credits(uuid, integer, timestamp with time zone, timestamp with time zone)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.refund_bonus_credits(uuid, integer)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.reset_due_solo_monthly_credits()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.trigger_rescue_stuck_leads()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_auth_user_pending_invites()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.accept_invite_token(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
