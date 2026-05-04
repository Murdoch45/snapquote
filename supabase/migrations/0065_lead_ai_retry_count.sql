-- Track how many times the rescue-stuck-leads cron has re-triggered the
-- AI estimator on a given lead. Capped client-side (in
-- /api/cron/rescue-stuck-leads) so a permanently-broken lead doesn't
-- loop forever; the column itself has no DB-side cap.
--
-- Forward-only and idempotent: ADD COLUMN IF NOT EXISTS so re-running
-- the migration on an already-migrated database is a no-op.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_retry_count integer NOT NULL DEFAULT 0;
