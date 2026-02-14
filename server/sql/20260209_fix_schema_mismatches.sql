-- Fix all schema mismatches between database and application code
-- This migration is idempotent and safe to run multiple times
BEGIN;
SET search_path TO ims, public;

-- =========================================================
-- 1) Fix audit_logs table
-- =========================================================
DO $$
BEGIN
  -- Add meta column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='audit_logs' AND column_name='meta'
  ) THEN
    ALTER TABLE ims.audit_logs ADD COLUMN meta JSONB;
  END IF;

  -- If action_type column exists and is NOT NULL, make it nullable or remove it
  -- The application uses 'action' not 'action_type'
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='audit_logs' AND column_name='action_type'
  ) THEN
    -- Make it nullable first
    ALTER TABLE ims.audit_logs ALTER COLUMN action_type DROP NOT NULL;
    -- Set default value for existing rows
    UPDATE ims.audit_logs SET action_type = 'system' WHERE action_type IS NULL;
  END IF;
END$$;

-- =========================================================
-- 2) Ensure sales table has all required columns
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='sales' AND column_name='customer_id'
  ) THEN
    ALTER TABLE ims.sales ADD COLUMN customer_id BIGINT REFERENCES ims.customers(customer_id);
  END IF;
END$$;

-- =========================================================
-- 3) Ensure products table has barcode column
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='products' AND column_name='barcode'
  ) THEN
    ALTER TABLE ims.products ADD COLUMN barcode VARCHAR(80) UNIQUE;
  END IF;
END$$;

-- =========================================================
-- 4) Ensure inventory_movements has product_id
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='inventory_movements' AND column_name='product_id'
  ) THEN
    ALTER TABLE ims.inventory_movements ADD COLUMN product_id BIGINT NOT NULL REFERENCES ims.products(product_id);
  END IF;
END$$;

-- =========================================================
-- 5) Add updated_at columns to products if missing
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='products' AND column_name='updated_at'
  ) THEN
    ALTER TABLE ims.products ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END$$;

-- =========================================================
-- 6) Ensure SKU column exists in products
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='products' AND column_name='sku'
  ) THEN
    ALTER TABLE ims.products ADD COLUMN sku VARCHAR(100);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON ims.products(sku) WHERE sku IS NOT NULL;
  END IF;
END$$;

-- =========================================================
-- 7) Add missing columns to permissions table
-- =========================================================
DO $$
BEGIN
  -- Add module column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='permissions' AND column_name='module'
  ) THEN
    ALTER TABLE ims.permissions ADD COLUMN module VARCHAR(50);
    UPDATE ims.permissions SET module = 'system' WHERE module IS NULL;
    ALTER TABLE ims.permissions ALTER COLUMN module SET NOT NULL;
  END IF;
  
  -- Add description column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='permissions' AND column_name='description'
  ) THEN
    ALTER TABLE ims.permissions ADD COLUMN description TEXT;
  END IF;
  
  -- Add created_at column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='ims' AND table_name='permissions' AND column_name='created_at'
  ) THEN
    ALTER TABLE ims.permissions ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END$$;

COMMIT;
