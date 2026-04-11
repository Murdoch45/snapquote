-- Add DRAFT status to quote_status enum so estimate records can be created
-- at lead-unlock time with a permanent public URL, before the contractor
-- finalises and sends the estimate to the customer.
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'SENT';

-- Make sent_at nullable. DRAFT quotes have sent_at = null because they
-- haven't been delivered yet. The send route sets sent_at explicitly when
-- transitioning DRAFT → SENT.
ALTER TABLE quotes ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE quotes ALTER COLUMN sent_at DROP DEFAULT;
