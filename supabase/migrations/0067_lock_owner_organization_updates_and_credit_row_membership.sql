-- Migration 0067: lock owner organization updates to safe columns + add membership
-- check inside get_org_credit_row.
--
-- Audit 2 (2026-05-08) findings C-7 and C-12, both verified live before this migration:
--
-- C-7 (RLS plan-write hole): pg_policies showed
--   organizations_update_owner: cmd=UPDATE, qual=is_org_owner(id), with_check=is_org_owner(id)
-- with no column-level GRANT restricting which columns owners may write. An authenticated
-- owner could PATCH /rest/v1/organizations?id=eq.<their-org-id> with {"plan":"BUSINESS"}
-- (or arbitrary monthly_credits / bonus_credits / has_used_trial / trial_ends_at /
-- credits_reset_at) and self-promote without paying.
--
-- C-12 (cross-tenant credit-row read): pg_proc showed get_org_credit_row as SECURITY
-- DEFINER with EXECUTE granted to `authenticated` and a body of just
--   select plan, monthly_credits, bonus_credits, credits_reset_at
--   from organizations where id = p_org_id;
-- with no is_org_member(p_org_id) gate. Any signed-in user could RPC any org_id and
-- read its plan + credit balances. (Migration 0028 originally revoked authenticated;
-- a later CREATE OR REPLACE re-installed default Supabase grants. Re-revoking alone
-- would re-enable the same regression next time the function is replaced, so the fix
-- here is an in-body membership check that survives subsequent replacements.)
--
-- The two sibling SECURITY DEFINER RPCs reset_org_credits and update_org_plan_credits
-- are also missing a membership check, but migration 0063 already revoked EXECUTE
-- from anon/authenticated for both. They are now service_role-only and called from
-- Stripe/RC webhooks + lib/credits.ts via the admin client. Adding is_org_member
-- there would break those call sites because auth.uid() is null under service_role.
-- Leaving them untouched.
--
-- Verified at HEAD that no client (web app/api/* or mobile/components/*) updates
-- the organizations table through an authenticated supabase-js client. All three
-- update sites (Stripe webhook, RC webhook, app settings update API) use the admin
-- client, which has BYPASSRLS, so this RLS tightening does not affect any current
-- code path.

-- ---------------------------------------------------------------------------
-- C-7 fix: replace permissive UPDATE policy with column-level GRANT pattern
-- ---------------------------------------------------------------------------

drop policy if exists "organizations_update_owner" on organizations;

-- Owners may UPDATE only the safe non-billing columns. Billing columns (plan,
-- monthly_credits, bonus_credits, has_used_trial, trial_ends_at, credits_reset_at,
-- trial_ending_notified_at, trial_ended_notified_at, iap_cancellation_scheduled_at,
-- last_active_at) are written by Stripe/RC webhooks and pg_cron jobs through the
-- service_role (which has BYPASSRLS) and must never be writable by an end-user.
revoke update on table organizations from authenticated;
grant update (name, slug, onboarding_completed) on table organizations to authenticated;

create policy "organizations_update_owner"
on organizations for update
to authenticated
using (is_org_owner(id))
with check (is_org_owner(id));

-- ---------------------------------------------------------------------------
-- C-12 fix: in-body membership gate for get_org_credit_row
-- ---------------------------------------------------------------------------

create or replace function public.get_org_credit_row(p_org_id uuid)
returns table (
  plan org_plan,
  monthly_credits integer,
  bonus_credits integer,
  credits_reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_org_member(p_org_id) then
    raise exception 'permission denied for organization %', p_org_id
      using errcode = '42501';
  end if;

  return query
    select o.plan, o.monthly_credits, o.bonus_credits, o.credits_reset_at
    from organizations o
    where o.id = p_org_id;
end;
$$;

-- Re-assert grants (CREATE OR REPLACE preserves existing ACL but keep this explicit
-- so a future CREATE OR REPLACE that drops privileges to defaults is still safe in
-- the sense that the in-body is_org_member check defends regardless).
revoke all on function public.get_org_credit_row(uuid) from public, anon;
grant execute on function public.get_org_credit_row(uuid) to authenticated, service_role;
