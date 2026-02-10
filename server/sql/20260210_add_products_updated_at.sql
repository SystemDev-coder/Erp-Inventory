-- Ensure ims.products has updated_at (and status) columns expected by backend queries
-- Safe to run multiple times
SET search_path TO ims, public;

-- Ensure helper exists
CREATE OR REPLACE FUNCTION ims.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add missing columns
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill updated_at if null
UPDATE products SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;

-- Touch trigger
DROP TRIGGER IF EXISTS trg_products_touch ON products;
CREATE TRIGGER trg_products_touch
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION ims.touch_updated_at();
