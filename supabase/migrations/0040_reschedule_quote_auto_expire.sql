-- Re-schedule the auto-expire-stale-quotes cron job. Migration 0032 was
-- recorded as applied on production but its cron.schedule call never created
-- a row in cron.job (verified: zero historical runs in cron.job_run_details
-- and the production query showed only reset-solo-credits exists). The most
-- likely cause was an apply-time parser issue with the multiline dollar-quoted
-- body — this migration sidesteps that two ways:
--   1. Idempotent unschedule-then-schedule pattern (same as 0024) so it's
--      safe to re-run and self-heals if the job ever drifts.
--   2. The cron command body is a single-quoted string with doubled '' for
--      embedded quotes, instead of a $$...$$ literal — no dollar quoting,
--      no parser ambiguity.
-- Job runs daily at 03:00 UTC and marks any SENT or VIEWED quote with
-- sent_at older than 7 days as EXPIRED, matching publicQuoteExpiry()
-- (sent_at + 7 days) in lib/utils.ts.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-expire-stale-quotes') then
    perform cron.unschedule('auto-expire-stale-quotes');
  end if;
end;
$$;

select cron.schedule(
  'auto-expire-stale-quotes',
  '0 3 * * *',
  'update quotes set status = ''EXPIRED'' where status in (''SENT'', ''VIEWED'') and sent_at < now() - interval ''7 days'''
);
