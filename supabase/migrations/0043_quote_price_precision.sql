-- Enforce monetary precision on quote price column.
-- Existing values are preserved; future inserts/updates are constrained to 2 decimal places.
ALTER TABLE quotes ALTER COLUMN price TYPE numeric(12,2);
