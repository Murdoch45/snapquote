-- Re-deploy of original migration 0059_notifications_new_lead_dedup.sql,
-- which never reached production (Audit 9 finding C2, 2026-05-08).
--
-- Live state at deploy time:
--   - pg_indexes for public.notifications: notifications_new_lead_dedup_idx DOES NOT EXIST.
--   - Live duplicates: 3 (org_id, lead_id) pairs in org 8f939f96-7f92-4973-97f8-f08450ccb71f
--     have 2 NEW_LEAD notifications each (lead ids 006c1b2c…, 89a38c8c…, e5c894fc…),
--     created on 2026-05-04 between 20:07 and 21:30 UTC. Each pair has 2 distinct
--     notification rows that the partial unique index would have prevented.
--
-- Why the index is needed: sendNewLeadNotifications in lib/ai/estimate.ts is reachable
-- from three code paths (lead-submit after-block, rescue-stuck-leads cron stage 2,
-- estimator terminal-state transitions). Two firing for the same lead produces two
-- identical feed entries. The code wraps the insert and treats SQLSTATE 23505
-- (unique_violation) as a soft success — but only once the index exists.
--
-- Two-step migration:
--   1. Cleanup CTE: keep the oldest notification per (org_id, lead_id) pair, drop
--      the rest. Required because CREATE UNIQUE INDEX would fail with the dupes
--      currently present in production.
--   2. Create the partial unique index. IF NOT EXISTS makes the migration idempotent
--      across re-runs.

with ranked as (
  select id,
         row_number() over (
           partition by org_id, (screen_params ->> 'id')
           order by created_at asc, id asc
         ) as rn
  from public.notifications
  where type = 'NEW_LEAD'
    and screen_params ->> 'id' is not null
)
delete from public.notifications n
using ranked r
where n.id = r.id
  and r.rn > 1;

create unique index if not exists notifications_new_lead_dedup_idx
  on public.notifications (org_id, (screen_params ->> 'id'))
  where type = 'NEW_LEAD'
    and screen_params ->> 'id' is not null;
