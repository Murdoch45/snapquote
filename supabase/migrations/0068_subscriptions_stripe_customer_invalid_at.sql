alter table subscriptions
  add column if not exists stripe_customer_invalid_at timestamptz;
