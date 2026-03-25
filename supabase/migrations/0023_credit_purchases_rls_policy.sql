-- Add a SELECT policy so org members can view their own credit purchase history.
-- All writes go through the record_credit_purchase() RPC (service_role only),
-- so no INSERT/UPDATE/DELETE policy is needed.
drop policy if exists "credit_purchases_select_member" on credit_purchases;
create policy "credit_purchases_select_member"
on credit_purchases for select
to authenticated
using (is_org_member(org_id));
