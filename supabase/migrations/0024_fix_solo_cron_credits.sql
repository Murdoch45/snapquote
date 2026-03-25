-- Fix SOLO credit reset cron to use plan_monthly_credits() instead of hardcoded 5
-- so it stays in sync if the SOLO plan allotment ever changes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-solo-credits') THEN
    PERFORM cron.unschedule('reset-solo-credits');
  END IF;
END $$;

SELECT cron.schedule(
  'reset-solo-credits',
  '0 0 * * *',
  $$
    UPDATE organizations
    SET monthly_credits = plan_monthly_credits('SOLO'),
        credits_reset_at = now() + interval '1 month'
    WHERE plan = 'SOLO'
      AND credits_reset_at <= now();
  $$
);
