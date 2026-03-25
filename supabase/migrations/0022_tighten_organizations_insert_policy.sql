-- Revoke the open INSERT policy on organizations.
-- Org creation is always done server-side via the admin client (service_role),
-- which bypasses RLS. No authenticated user should be able to directly INSERT
-- into organizations via the Supabase client.
drop policy if exists "organizations_insert_authenticated" on organizations;
