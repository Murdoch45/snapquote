-- Additional RPC helpers for organization credit updates. These bypass
-- PostgREST's schema cache so service-role callers can safely write
-- credits_reset_at without referencing the column through REST table routes.
create or replace function public.reset_org_credits(
  p_org_id uuid,
  p_monthly_credits integer,
  p_credits_reset_at timestamptz,
  p_now timestamptz
)
returns table (
  monthly_credits integer,
  bonus_credits integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update organizations
  set monthly_credits = p_monthly_credits,
      credits_reset_at = p_credits_reset_at
  where id = p_org_id
    and (credits_reset_at is null or credits_reset_at <= p_now)
  returning organizations.monthly_credits, organizations.bonus_credits;
end;
$$;

revoke all on function public.reset_org_credits(uuid, integer, timestamptz, timestamptz) from public;
revoke all on function public.reset_org_credits(uuid, integer, timestamptz, timestamptz) from anon;
revoke all on function public.reset_org_credits(uuid, integer, timestamptz, timestamptz) from authenticated;
grant execute on function public.reset_org_credits(uuid, integer, timestamptz, timestamptz) to service_role;

create or replace function public.update_org_plan_credits(
  p_org_id uuid,
  p_monthly_credits integer,
  p_credits_reset_at timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  update organizations
  set monthly_credits = p_monthly_credits,
      credits_reset_at = p_credits_reset_at
  where id = p_org_id;
$$;

revoke all on function public.update_org_plan_credits(uuid, integer, timestamptz) from public;
revoke all on function public.update_org_plan_credits(uuid, integer, timestamptz) from anon;
revoke all on function public.update_org_plan_credits(uuid, integer, timestamptz) from authenticated;
grant execute on function public.update_org_plan_credits(uuid, integer, timestamptz) to service_role;
