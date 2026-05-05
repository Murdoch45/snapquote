-- UNIQUE constraint on (lead_id, storage_path) so the new
-- pre-submit photo upload flow can write lead_photos rows from two
-- racing code paths without producing duplicates:
--   1. lead-submit endpoint inserts rows for the photoStoragePaths the
--      client claims are "done" at submit time.
--   2. /api/public/lead-photo-upload, when it finishes uploading a
--      photo AFTER lead-submit has already created the lead row,
--      auto-attaches by inserting the row itself.
--
-- The same storage_path can briefly be eligible from both paths
-- (extremely tight race). The unique constraint + INSERT ... ON
-- CONFLICT DO NOTHING in both insert sites makes the second write a
-- no-op rather than a 23505 error / duplicate row.
--
-- Forward-only and idempotent: wrapped in DO ... EXCEPTION block
-- because Postgres has no ADD CONSTRAINT IF NOT EXISTS.

DO $$
BEGIN
  ALTER TABLE public.lead_photos
    ADD CONSTRAINT lead_photos_lead_storage_path_unique
    UNIQUE (lead_id, storage_path);
EXCEPTION
  WHEN duplicate_object THEN
    -- Constraint already present; nothing to do.
    NULL;
  WHEN unique_violation THEN
    -- Pre-existing duplicate rows would block the constraint creation.
    -- Surface to alert ops to dedupe manually before re-running.
    RAISE NOTICE 'lead_photos has duplicate (lead_id, storage_path) rows; constraint not added.';
END $$;
