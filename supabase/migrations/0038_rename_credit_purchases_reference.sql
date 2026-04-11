-- Rename credit_purchases.stripe_checkout_session_id → purchase_reference.
-- The column now stores Stripe checkout session ids, RevenueCat event ids, and
-- IAP sync transaction ids; the old name no longer reflects its use.

alter table credit_purchases
  rename column stripe_checkout_session_id to purchase_reference;

alter table credit_purchases
  rename constraint credit_purchases_stripe_checkout_session_id_key
  to credit_purchases_purchase_reference_key;

-- Recreate record_credit_purchase with the new parameter name. Postgres does
-- not allow changing input parameter names via CREATE OR REPLACE, so we drop
-- and recreate the function.
drop function if exists public.record_credit_purchase(uuid, text, integer);

create function public.record_credit_purchase(
  p_org_id uuid,
  p_purchase_reference text,
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

  insert into credit_purchases (org_id, purchase_reference, credit_amount)
  values (p_org_id, p_purchase_reference, p_credit_amount)
  on conflict (purchase_reference) do nothing;

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
