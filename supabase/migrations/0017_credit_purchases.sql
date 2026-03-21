create table if not exists credit_purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  credit_amount integer not null check (credit_amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_purchases_org_id on credit_purchases(org_id);

alter table credit_purchases enable row level security;

create or replace function public.record_credit_purchase(
  p_org_id uuid,
  p_stripe_checkout_session_id text,
  p_credit_amount integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_credit_amount <= 0 then
    raise exception 'Credit amount must be positive.';
  end if;

  insert into credit_purchases (org_id, stripe_checkout_session_id, credit_amount)
  values (p_org_id, p_stripe_checkout_session_id, p_credit_amount)
  on conflict (stripe_checkout_session_id) do nothing;

  if not found then
    return 'already_processed';
  end if;

  update organizations
  set bonus_credits = bonus_credits + p_credit_amount
  where id = p_org_id;

  return 'added';
end;
$$;

revoke all on function public.record_credit_purchase(uuid, text, integer) from public;
revoke all on function public.record_credit_purchase(uuid, text, integer) from anon;
revoke all on function public.record_credit_purchase(uuid, text, integer) from authenticated;
grant execute on function public.record_credit_purchase(uuid, text, integer) to service_role;
