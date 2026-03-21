alter table organizations
add column if not exists monthly_credits integer not null default 5 check (monthly_credits >= 0),
add column if not exists bonus_credits integer not null default 0 check (bonus_credits >= 0),
add column if not exists credits_reset_at timestamptz;

create table if not exists lead_unlocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (org_id, lead_id)
);

create index if not exists idx_lead_unlocks_org_id on lead_unlocks(org_id);
create index if not exists idx_lead_unlocks_lead_id on lead_unlocks(lead_id);

alter table lead_unlocks enable row level security;

drop policy if exists "lead_unlocks_select_member" on lead_unlocks;
create policy "lead_unlocks_select_member"
on lead_unlocks for select
to authenticated
using (is_org_member(org_id));

create or replace function public.plan_monthly_credits(p_plan org_plan)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'SOLO' then 5
    when 'TEAM' then 20
    when 'BUSINESS' then 100
    else 5
  end;
$$;

create or replace function public.unlock_lead_with_credits(p_org_id uuid, p_lead_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan org_plan;
  v_monthly integer;
  v_bonus integer;
  v_reset_at timestamptz;
  v_charge_source text := null;
begin
  if exists (
    select 1
    from lead_unlocks
    where org_id = p_org_id
      and lead_id = p_lead_id
  ) then
    return 'already_unlocked';
  end if;

  select plan, monthly_credits, bonus_credits, credits_reset_at
  into v_plan, v_monthly, v_bonus, v_reset_at
  from organizations
  where id = p_org_id
  for update;

  if not found then
    raise exception 'Organization not found.';
  end if;

  if v_reset_at is null or v_reset_at <= now() then
    update organizations
    set monthly_credits = public.plan_monthly_credits(v_plan),
        credits_reset_at = now() + interval '1 month'
    where id = p_org_id
    returning monthly_credits, bonus_credits
    into v_monthly, v_bonus;
  end if;

  if exists (
    select 1
    from lead_unlocks
    where org_id = p_org_id
      and lead_id = p_lead_id
  ) then
    return 'already_unlocked';
  end if;

  if v_monthly > 0 then
    update organizations
    set monthly_credits = monthly_credits - 1
    where id = p_org_id;
    v_charge_source := 'monthly';
  elsif v_bonus > 0 then
    update organizations
    set bonus_credits = bonus_credits - 1
    where id = p_org_id;
    v_charge_source := 'bonus';
  else
    return 'no_credits';
  end if;

  begin
    insert into lead_unlocks (org_id, lead_id)
    values (p_org_id, p_lead_id);
  exception
    when unique_violation then
      if v_charge_source = 'monthly' then
        update organizations
        set monthly_credits = monthly_credits + 1
        where id = p_org_id;
      elsif v_charge_source = 'bonus' then
        update organizations
        set bonus_credits = bonus_credits + 1
        where id = p_org_id;
      end if;

      return 'already_unlocked';
  end;

  return 'unlocked';
end;
$$;

revoke all on function public.unlock_lead_with_credits(uuid, uuid) from public;
revoke all on function public.unlock_lead_with_credits(uuid, uuid) from anon;
revoke all on function public.unlock_lead_with_credits(uuid, uuid) from authenticated;
grant execute on function public.unlock_lead_with_credits(uuid, uuid) to service_role;
