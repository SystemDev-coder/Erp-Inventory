-- Align products table with backend fields price, cost, stock
-- Safe to run multiple times
SET search_path TO ims, public;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock NUMERIC(14,3) DEFAULT 0;

-- Backfill from legacy columns if present
UPDATE products
   SET price = COALESCE(price, sell_price, 0),
       cost  = COALESCE(cost, cost_price, 0),
       stock = COALESCE(stock, open_balance, 0)
 WHERE (price IS NULL OR cost IS NULL OR stock IS NULL);

-- Ensure not-null with defaults
ALTER TABLE products
  ALTER COLUMN price SET NOT NULL,
  ALTER COLUMN cost SET NOT NULL,
  ALTER COLUMN stock SET NOT NULL;
