drop policy if exists "usage_member_crud" on org_usage_monthly;
drop policy if exists "usage_member_select" on org_usage_monthly;
create policy "usage_member_select"
on org_usage_monthly for select
to authenticated
using (is_org_member(org_id));
drop policy if exists "quote_events_member_crud" on quote_events;
drop policy if exists "quote_events_member_select" on quote_events;
create policy "quote_events_member_select"
on quote_events for select
to authenticated
using (is_org_member(org_id));
drop policy if exists "contractor_profile_update_member" on contractor_profile;
drop policy if exists "contractor_profile_update_owner" on contractor_profile;
create policy "contractor_profile_update_owner"
on contractor_profile for update
to authenticated
using (is_org_owner(org_id))
with check (is_org_owner(org_id));
