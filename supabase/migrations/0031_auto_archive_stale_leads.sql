-- HISTORICAL NO-OP. This migration is recorded as applied in
-- supabase_migrations.schema_migrations on production but the cron.schedule
-- call never actually created a job in cron.job — likely a parser issue with
-- the multiline dollar-quoted body at the time of apply. Verified by querying
-- cron.job_run_details: the auto-archive job has zero historical runs.
--
-- The lead-archiving feature has since been removed from the product
-- entirely. There is no replacement migration; ARCHIVED has been dropped
-- from LEAD_STATUS in lib/types.ts and from all UI/seed references.
-- This file is kept (not deleted) so supabase_migrations stays consistent
-- with what's in the working tree.

SELECT cron.schedule(
  'auto-archive-stale-leads',
  '0 2 * * *',
  $$
    UPDATE leads
    SET status = 'ARCHIVED'
    WHERE status = 'NEW'
    AND created_at < NOW() - INTERVAL '30 days';
  $$
);
