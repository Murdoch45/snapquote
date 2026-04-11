-- Trial tracking columns for the daily trial-ending-soon email cron, plus
-- swap of the auto-expire-stale-quotes job from pg_cron to Vercel cron so
-- the expiry sweep can fan out push notifications to mobile devices.

alter table organizations
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_ending_notified_at timestamptz;

create index if not exists idx_organizations_trial_ends_at
  on organizations(trial_ends_at)
  where trial_ends_at is not null;

-- The pg_cron job from migration 0040 only runs an UPDATE — it can't fan
-- out push notifications because pg_cron has no way to call Expo's HTTP
-- API. Drop it; the Vercel cron at /api/cron/auto-expire-stale-quotes
-- now owns the sweep and the notification fan-out together.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-expire-stale-quotes') then
    perform cron.unschedule('auto-expire-stale-quotes');
  end if;
end;
$$;
