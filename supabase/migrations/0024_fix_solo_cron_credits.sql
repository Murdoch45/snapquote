-- Fix SOLO credit reset cron to use plan_monthly_credits() instead of hardcoded 5
-- so it stays in sync if the SOLO plan allotment ever changes.
SELECT cron.unschedule('reset-solo-credits');

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
