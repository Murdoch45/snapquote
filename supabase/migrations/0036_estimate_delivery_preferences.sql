-- Add delivery preference columns to contractor_profile so the estimate
-- composer remembers the contractor's preferred delivery method (email/SMS)
-- across all leads and sessions.
ALTER TABLE contractor_profile
ADD COLUMN IF NOT EXISTS estimate_send_email boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS estimate_send_text boolean NOT NULL DEFAULT false;
