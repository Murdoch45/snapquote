-- Catch-up migration for the existing index `idx_lead_photos_lead_id`, which IS live
-- in production but has no entry in supabase_migrations.schema_migrations
-- (Audit 9 finding H1, 2026-05-08).
--
-- The original local file 0058_lead_photos_lead_id_index.sql (CREATE INDEX
-- CONCURRENTLY IF NOT EXISTS …) was applied out-of-band — almost certainly via the
-- Supabase SQL editor — so the index exists but the migration log doesn't reflect it.
-- That leaves `supabase db push` in an inconsistent state vs the production log.
--
-- This migration is intentionally idempotent and a no-op against the current schema:
-- CREATE INDEX IF NOT EXISTS short-circuits because the index already exists. The
-- only effect is that the supabase_migrations.schema_migrations log gains an entry
-- so future `supabase db reset`/`db push` against the local file set produces the
-- same migration history as production.
--
-- Note: not using CONCURRENTLY here because (a) the index already exists so this is
-- a no-op, and (b) Supabase CLI wraps migrations in a transaction, which forbids
-- CONCURRENTLY. The original 0058 file was applied outside the CLI's transaction
-- boundary, hence its use of CONCURRENTLY.

create index if not exists idx_lead_photos_lead_id
  on public.lead_photos using btree (lead_id);
