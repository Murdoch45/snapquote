-- Catch-up file for the existing prod migration `20260421021818_fix_get_org_credit_row_permissions`,
-- which is recorded in supabase_migrations.schema_migrations but had no matching
-- file in the repo at HEAD (Audit 9 finding H1, 2026-05-08).
--
-- Live statements (verified via SELECT statements FROM supabase_migrations.schema_migrations
-- WHERE version='20260421021818'):
--   GRANT EXECUTE ON FUNCTION get_org_credit_row TO authenticated;
--
-- Context: migration 0028 created get_org_credit_row with no explicit grant; migration
-- 0029 added a couple sibling RPCs and revoked default grants from authenticated. This
-- migration restored EXECUTE for authenticated users so the PostgREST `/rest/v1/rpc/get_org_credit_row`
-- endpoint works for the web/mobile clients. Audit 2 (2026-05-08) C-12 + migration 0067
-- subsequently added an in-body is_org_member(p_org_id) check inside get_org_credit_row,
-- making this grant safe to retain — only members of an org can pull that org's credit row.
--
-- This file restores file/log parity. Re-running on prod is a no-op because the version
-- is already in the migration log, so `supabase db push` skips it.

GRANT EXECUTE ON FUNCTION get_org_credit_row TO authenticated;
