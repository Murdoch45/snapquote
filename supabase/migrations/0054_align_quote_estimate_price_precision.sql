-- Align estimated_price_low and estimated_price_high to numeric(12,2) to
-- match the `price` column, which was tightened to numeric(12,2) in
-- migration 0043_quote_price_precision.sql. Before this migration the
-- two estimate-range columns were plain `numeric` (unlimited precision
-- and scale), which is harmless day-to-day but lets unrounded fractional
-- cents and arbitrarily large values slip in.
--
-- Verified ahead of time against the live instance that no existing
-- rows carry values exceeding the (12,2) bound:
--   SELECT id, estimated_price_low, estimated_price_high, price
--   FROM quotes
--   WHERE estimated_price_low > 9999999999.99
--      OR estimated_price_high > 9999999999.99;
-- → zero rows; the cast-in-place below is safe to run online without
-- any data loss.

ALTER TABLE public.quotes
  ALTER COLUMN estimated_price_low TYPE numeric(12,2)
    USING round(estimated_price_low::numeric, 2);

ALTER TABLE public.quotes
  ALTER COLUMN estimated_price_high TYPE numeric(12,2)
    USING round(estimated_price_high::numeric, 2);
