-- Add missing sku column to ims.products (idempotent)
SET search_path TO ims, public;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
