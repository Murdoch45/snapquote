alter table quotes
add column if not exists estimated_price_low numeric,
add column if not exists estimated_price_high numeric;
