-- Re-deploy of original migration 0056_revert_contractor_profile_update_to_member.sql,
-- which never reached production (Audit 9 finding C1, 2026-05-08).
--
-- Live state at deploy time (verified via pg_policies):
--   contractor_profile_insert_owner   INSERT  with_check=is_org_owner(org_id)
--   contractor_profile_select_member  SELECT  qual=is_org_member(org_id)
--   contractor_profile_update_owner   UPDATE  qual=is_org_owner(org_id), with_check=is_org_owner(org_id)
-- The `_update_owner` policy was created by 0015_tighten_rls_policies on 2026-something.
-- 0056 was supposed to revert UPDATE to membership-level, but the file never made it
-- into the production migration log (no row in supabase_migrations.schema_migrations
-- matching `revert_contractor_profile_update_to_member`).
--
-- Why the policy needs to be member-level: contractor_profile holds the SMS/email
-- delivery toggles (notification_lead_*, notification_accept_*, estimate_send_*).
-- Non-owner team members manage their own delivery prefs from QuoteComposer / app
-- settings. Owner-only UPDATE blocks every member from saving their own toggles.
--
-- Idempotent — drops both potential policy names before creating the member-level one.

drop policy if exists "contractor_profile_update_owner" on contractor_profile;
drop policy if exists "contractor_profile_update_member" on contractor_profile;

create policy "contractor_profile_update_member"
on contractor_profile for update
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));
