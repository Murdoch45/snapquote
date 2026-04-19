-- Add an index on lead_photos(lead_id). The leads list query joins
-- lead_photos with "WHERE lead_id IN (<25 ids>)" on every page load,
-- and without this index Postgres was doing a sequential scan over all
-- ~3600 photo rows (confirmed via EXPLAIN ANALYZE). Scans get slower
-- linearly as photo volume grows — adding the index now keeps the join
-- O(log n) no matter how many photos the system has ingested.
--
-- CONCURRENTLY is used so production writes to lead_photos (new lead
-- submissions) aren't blocked while the index builds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lead_photos_lead_id
  ON public.lead_photos USING btree (lead_id);
