-- Partial unique index preventing duplicate NEW_LEAD notifications for the
-- same (org_id, lead_id) pair. sendNewLeadNotifications in
-- lib/ai/estimate.ts is reachable from three code paths (lead-submit
-- after-block, rescue-stuck-leads cron stage 2, estimator terminal-state
-- transitions); without a constraint any two of those firing for the same
-- lead produces two identical feed entries. DB-level enforcement keeps the
-- guarantee correct under concurrency; the code still wraps the insert and
-- treats SQLSTATE 23505 (unique_violation) as a soft success so the
-- expected collision never shows up as a warning log.

-- Clean up any pre-existing duplicates so the unique index can be built.
-- Keeps the oldest row per (org_id, lead_id) and drops the rest.
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
