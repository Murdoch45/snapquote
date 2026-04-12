alter table subscriptions
  add column if not exists billing_interval text;
