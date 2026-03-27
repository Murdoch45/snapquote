-- Workaround for PostgREST schema cache not reflecting credits_reset_at on
-- the organizations table. RPC calls bypass the PostgREST column cache and
-- execute directly in PostgreSQL, so the column is always visible.
create or replace function public.get_org_credit_row(p_org_id uuid)
returns table (
  plan org_plan,
  monthly_credits integer,
  bonus_credits integer,
  credits_reset_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select plan, monthly_credits, bonus_credits, credits_reset_at
  from organizations
  where id = p_org_id;
$$;

revoke all on function public.get_org_credit_row(uuid) from public;
revoke all on function public.get_org_credit_row(uuid) from anon;
revoke all on function public.get_org_credit_row(uuid) from authenticated;
grant execute on function public.get_org_credit_row(uuid) to service_role;
