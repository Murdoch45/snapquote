-- 1. Require at least one of email or token on pending_invites.
ALTER TABLE pending_invites
  ADD CONSTRAINT pending_invites_email_or_token_check
  CHECK (email IS NOT NULL OR token IS NOT NULL);

-- 2. Enforce NOT NULL on contractor_profile.public_slug.
-- Any existing NULL slugs must be fixed manually before this migration.
ALTER TABLE contractor_profile
  ALTER COLUMN public_slug SET NOT NULL;

-- 3. Change iap_subscription_events.org_id from SET NULL to CASCADE.
ALTER TABLE iap_subscription_events
  DROP CONSTRAINT IF EXISTS iap_subscription_events_org_id_fkey;

ALTER TABLE iap_subscription_events
  ADD CONSTRAINT iap_subscription_events_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- 4. Add default 7-day expiry to email-based invites that have no expiry.
-- This backfills existing rows and sets a default for future inserts.
UPDATE pending_invites
  SET expires_at = created_at + interval '7 days'
  WHERE expires_at IS NULL AND token IS NULL AND status = 'PENDING';

ALTER TABLE pending_invites
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');
