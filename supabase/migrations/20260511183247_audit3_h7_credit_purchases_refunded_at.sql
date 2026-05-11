-- Audit 3 H7 — credit_purchases.refunded_at for charge.refunded dedup.
--
-- `handleChargeRefunded` in app/api/stripe/webhook/route.ts unconditionally
-- calls `refund_bonus_credits(orgId, creditAmount)` for every `charge.refunded`
-- event. Stripe fires a separate event per refund — if a $50 credit-pack
-- charge is refunded in two partials ($30 then $20), Stripe sends TWO
-- `charge.refunded` events with distinct `event.id` values. The
-- `claimWebhookEvent` dedup (keyed on `event.id`) lets both pass, and
-- both invocations deduct the full pack amount. `refund_bonus_credits`
-- floors at 0 (preventing negative balance) but can still claw back
-- bonus credits from OTHER credit-pack purchases the org has accumulated.
--
-- This migration adds `refunded_at timestamptz NULL` to `credit_purchases`
-- so the webhook handler can claim the slot atomically (UPDATE … WHERE
-- refunded_at IS NULL) before calling the RPC. The claim returns the
-- affected row count; 0 means another event already refunded this pack,
-- and the second invocation is a no-op.
--
-- Verified live pre-add (Supabase MCP):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='credit_purchases'
--     AND column_name='refunded_at';
--   → 0 rows.
--
-- The column defaults to NULL; existing rows (0 live as of 2026-05-11)
-- start unrefunded. The UPDATE-WHERE-NULL pattern is atomic — concurrent
-- webhook invocations serialize at the row lock and only one sees the
-- WHERE clause match. Index on `purchase_reference` already exists
-- (`credit_purchases_purchase_reference_key` UNIQUE constraint) and is
-- used for lookup.

ALTER TABLE public.credit_purchases
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz NULL;

COMMENT ON COLUMN public.credit_purchases.refunded_at IS
  'Set by Stripe charge.refunded / RC REFUND webhook when bonus credits clawed back. NULL = not refunded. Used as idempotency claim to prevent partial-refund double-deduct (Audit 3 H7).';
