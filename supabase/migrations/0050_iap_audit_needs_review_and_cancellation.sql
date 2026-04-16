-- Fix 1: Flag unresolvable RevenueCat webhook events for manual review instead
-- of silently dropping them. Today an event whose app_user_id isn't a valid
-- org UUID gets logged with org_id=NULL and returns success — nobody ever
-- looks at those rows. needs_review makes them queryable so operators can
-- reconcile manually.
alter table iap_subscription_events
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_reason text;

create index if not exists idx_iap_subscription_events_needs_review
  on iap_subscription_events(created_at desc)
  where needs_review = true;

-- Fix 2: Track pending cancellations from RevenueCat. A CANCELLATION event
-- means the user has cancelled but the subscription stays active through the
-- current period. We surface this via /api/app/subscription-status so the UI
-- can render a "cancels on <date>" banner without downgrading the plan yet.
-- Cleared on UNCANCELLATION, RENEWAL, or EXPIRATION.
alter table organizations
  add column if not exists iap_cancellation_scheduled_at timestamptz;
