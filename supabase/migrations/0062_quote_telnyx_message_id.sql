-- Persist the Telnyx message ID that `sendQuoteSms` returns. Without
-- this we have no way to correlate a quote on our side with what
-- happened to the SMS on Telnyx's side after the API call returns 200.
--
-- Background: Telnyx's `POST /v2/messages` returns success the moment
-- the message is queued for sending — long before any carrier-side
-- delivery decision. The sequence is:
--
--   1. Telnyx accepts the API call         (HTTP 200, returns message id)
--   2. Telnyx hands off to the carrier     (T-Mobile / Verizon / AT&T)
--   3. Carrier accepts or rejects          (10DLC campaign check, content
--                                            filtering, dead-number check, etc.)
--   4. If accepted, carrier delivers       (or doesn't — phone off, blocked)
--
-- All of (3) and (4) happen AFTER our sendQuoteSms returns. Without
-- (a) persisting the message id and (b) wiring a DLR webhook back to
-- our app, we have no visibility into anything past step (1). On
-- 2026-05-01 a contractor sent two test estimates — both recorded
-- `sent_via=["text","email"]` because Telnyx accepted the API call,
-- but the customer never received the SMS, almost certainly because
-- the production from-number `+17169938159` shows
-- `messaging_campaign_id: null` in Telnyx (the approved 10DLC
-- campaign hasn't been bound to the number yet). Carriers reject
-- un-registered A2P traffic silently from our perspective.
--
-- Storing the message id is the foundational change. A DLR webhook
-- handler that writes back to a future `sms_delivery_status` column
-- is the natural follow-up and is documented as a TODO in
-- docs/current-state.md.

alter table quotes
  add column if not exists telnyx_message_id text;

comment on column quotes.telnyx_message_id is
  'Telnyx message id returned by POST /v2/messages when the SMS leg of a contractor estimate-send succeeds. NULL means SMS was not sent for this quote (either contractor unchecked the SMS box or the send threw before reaching Telnyx). A non-NULL value here means Telnyx accepted the message — it does NOT mean the customer received it. Carrier-level delivery status would require a DLR webhook handler (not yet wired).';
