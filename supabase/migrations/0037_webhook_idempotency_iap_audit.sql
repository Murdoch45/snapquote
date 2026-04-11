-- Webhook idempotency: dedupe events from Stripe and RevenueCat by provider + event id.
-- Inserted at the start of webhook processing; ON CONFLICT short-circuits retries.
create table if not exists webhook_events (
  provider text not null check (provider in ('stripe', 'revenuecat')),
  event_id text not null,
  event_type text,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create index if not exists idx_webhook_events_received_at
  on webhook_events(received_at desc);

alter table webhook_events enable row level security;
-- service_role bypasses RLS; no policies are needed for app users.

-- IAP subscription audit log: gives Apple subscribers an event-by-event history
-- comparable to what the `subscriptions` table provides for Stripe subscribers.
create table if not exists iap_subscription_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete set null,
  event_id text not null,
  event_type text not null,
  plan text,
  product_id text,
  store text,
  is_trial_period boolean,
  store_transaction_id text,
  app_user_id text,
  raw_event jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_iap_subscription_events_org_id
  on iap_subscription_events(org_id);
create index if not exists idx_iap_subscription_events_event_id
  on iap_subscription_events(event_id);
create index if not exists idx_iap_subscription_events_created_at
  on iap_subscription_events(created_at desc);

alter table iap_subscription_events enable row level security;
-- service_role bypasses RLS; no policies are needed for app users.
