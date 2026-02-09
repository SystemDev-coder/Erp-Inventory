-- Products & Categories schema (idempotent)
-- Ensures tables exist for CRUD APIs and dashboard.

CREATE SCHEMA IF NOT EXISTS ims;
SET search_path TO ims, public;

-- Category hierarchy
CREATE TABLE IF NOT EXISTS ims.categories (
  category_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  parent_id BIGINT REFERENCES ims.categories(category_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill columns if table pre-exists
ALTER TABLE ims.categories
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES ims.categories(category_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Products
CREATE TABLE IF NOT EXISTS ims.products (
  product_id BIGSERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(120) UNIQUE,
  category_id BIGINT REFERENCES ims.categories(category_id) ON DELETE SET NULL,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ims.products
  ADD COLUMN IF NOT EXISTS sku VARCHAR(120),
  ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES ims.categories(category_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS price NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON ims.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON ims.products(status);
CREATE INDEX IF NOT EXISTS idx_products_name ON ims.products USING gin (to_tsvector('simple', name));

-- Sample base data (idempotent)
INSERT INTO ims.categories (name, description)
VALUES ('Uncategorized', 'Default category')
ON CONFLICT (name) DO NOTHING;

-- Touch timestamp on update
CREATE OR REPLACE FUNCTION ims.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_touch ON ims.products;
CREATE TRIGGER trg_products_touch
BEFORE UPDATE ON ims.products
FOR EACH ROW EXECUTE FUNCTION ims.touch_updated_at();

DROP TRIGGER IF EXISTS trg_categories_touch ON ims.categories;
CREATE TRIGGER trg_categories_touch
BEFORE UPDATE ON ims.categories
FOR EACH ROW EXECUTE FUNCTION ims.touch_updated_at();

