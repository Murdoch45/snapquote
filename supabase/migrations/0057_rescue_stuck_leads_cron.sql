-- Migrate the rescue-stuck-leads cron from Vercel to Supabase.
--
-- Background: the Next.js endpoint /api/cron/rescue-stuck-leads must run
-- every ~3 minutes to re-trigger or fail leads stuck at
-- ai_status='processing'. It was originally scheduled in vercel.json as
-- "*/3 * * * *", but Vercel Hobby rejects any cron that fires more than
-- once per day and refused the entire deploy as a result. Scheduling
-- here on Supabase via pg_cron is unrestricted by Vercel's plan.
--
-- Moving parts:
--   1. pg_net — the extension that lets Postgres make outbound HTTP
--      requests. Functions live in the `net` schema regardless of
--      CREATE EXTENSION WITH SCHEMA.
--   2. CRON_SECRET in vault.secrets — the shared secret Vercel's
--      /api/cron/* endpoints expect as `Authorization: Bearer <...>`.
--      Value is inserted out-of-band (it's environment-specific and
--      must not live in a checked-in migration).
--   3. public.trigger_rescue_stuck_leads — SECURITY DEFINER wrapper
--      that reads the vault secret and fires net.http_get. Only the
--      postgres role can read vault.decrypted_secrets, so callers (the
--      cron job) need to go through this function rather than querying
--      vault directly.
--   4. cron.schedule — the actual "*/3 * * * *" job.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_rescue_stuck_leads()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $fn$
DECLARE
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET';

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'CRON_SECRET is not set in Supabase Vault';
  END IF;

  -- net.http_get returns immediately with a request_id; the response
  -- body lands in net._http_response for debugging. Fire-and-forget is
  -- what we want — the Next.js endpoint owns the actual rescue logic.
  --
  -- Hit the canonical www host directly. The apex snapquote.us
  -- 307-redirects to www.snapquote.us, and the HTTP client in pg_net
  -- (like curl's default) drops the Authorization header on cross-
  -- origin redirects, which would land us on a 401 every tick.
  SELECT net.http_get(
    url := 'https://www.snapquote.us/api/cron/rescue-stuck-leads',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret
    )
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.trigger_rescue_stuck_leads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_rescue_stuck_leads() TO postgres;

-- Idempotent re-schedule. cron.unschedule raises if the job doesn't
-- exist yet, so swallow that on first run.
DO $outer$
BEGIN
  PERFORM cron.unschedule('rescue-stuck-leads');
EXCEPTION WHEN OTHERS THEN
  NULL;
END
$outer$;

SELECT cron.schedule(
  'rescue-stuck-leads',
  '*/3 * * * *',
  $cron$SELECT public.trigger_rescue_stuck_leads();$cron$
);
