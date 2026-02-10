-- Align customers table with frontend needs (type/status/search)
-- Date: 2026-02-10
SET search_path TO ims, public;

-- Add customer_type and updated_at for tracking
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type VARCHAR(30) NOT NULL DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill any null customer_type to regular
UPDATE customers
   SET customer_type = COALESCE(customer_type, 'regular');

-- Helpful indexes for search/filter
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(full_name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);
