-- Revert the owner-only update lock on contractor_profile that landed in
-- migration 0015. Team members need to save their own delivery
-- preferences (email/SMS toggles in QuoteComposer), so membership — not
-- ownership — is the correct authorization boundary for updates here.

drop policy if exists "contractor_profile_update_owner" on contractor_profile;
drop policy if exists "contractor_profile_update_member" on contractor_profile;

create policy "contractor_profile_update_member"
on contractor_profile for update
to authenticated
using (is_org_member(org_id))
with check (is_org_member(org_id));
