-- Audit 12 H1: Telnyx DLR webhook persists carrier-level delivery state
-- on the quotes row so the contractor can tell delivered SMS apart from
-- carrier-bounced. Previously only telnyx_message_id (migration 0062)
-- was captured; no consumer existed. The new webhook at
-- /api/webhooks/telnyx fills these in.
--
-- Status values intentionally as text (not enum) because the Telnyx
-- event_type set may grow (e.g. "message.received" inbound, future
-- "message.read" RCS) and an enum would require a migration every time.
-- Constrained via CHECK so writes from outside the webhook can't put
-- arbitrary garbage in here.

ALTER TABLE public.quotes
  ADD COLUMN sms_delivery_status text
    CHECK (sms_delivery_status IS NULL OR sms_delivery_status IN
      ('queued','sent','delivered','failed')),
  ADD COLUMN sms_delivered_at timestamptz,
  ADD COLUMN sms_failure_reason text;

COMMENT ON COLUMN public.quotes.sms_delivery_status IS
  'Carrier-level delivery state from Telnyx DLR webhook. NULL until the first DLR lands. queued = Telnyx accepted (200 on send); sent = handed to carrier; delivered = carrier confirmed receipt; failed = carrier rejected. Audit 12 H1.';
COMMENT ON COLUMN public.quotes.sms_delivered_at IS
  'When the carrier confirmed delivery (sms_delivery_status flipped to delivered). NULL otherwise.';
COMMENT ON COLUMN public.quotes.sms_failure_reason IS
  'Telnyx error title (e.g. "Invalid To Address") when sms_delivery_status = failed. NULL otherwise.';

-- Lookup index for the webhook handler. Without it, every DLR event
-- triggers a full scan over quotes to find the matching message id.
-- Partial index because the vast majority of quote rows will never
-- have an SMS leg (email-only sends).
CREATE INDEX IF NOT EXISTS quotes_telnyx_message_id_idx
  ON public.quotes (telnyx_message_id)
  WHERE telnyx_message_id IS NOT NULL;
