-- Add description and discount columns to purchase_items for line-level detail
ALTER TABLE IF EXISTS ims.purchase_items
  ADD COLUMN IF NOT EXISTS discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description VARCHAR(240);

-- Ensure line_total stays non-negative
ALTER TABLE IF EXISTS ims.purchase_items
  ALTER COLUMN line_total SET DEFAULT 0;
