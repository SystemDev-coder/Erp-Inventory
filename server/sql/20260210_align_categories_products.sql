-- Align categories/products schema with app expectations (category_id, name columns)
-- Safe to run multiple times
SET search_path TO ims, public;

-- Ensure categories has app-friendly columns
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS category_id BIGINT,
  ADD COLUMN IF NOT EXISTS name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS parent_id BIGINT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill from legacy columns
UPDATE categories
   SET category_id = COALESCE(category_id, cat_id),
       name = COALESCE(name, cat_name),
       cat_name = COALESCE(cat_name, name),
       is_active = COALESCE(is_active, TRUE),
       created_at = COALESCE(created_at, NOW()),
       updated_at = COALESCE(updated_at, NOW());

-- Ensure uniqueness and indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='ims' AND table_name='categories' AND constraint_name='categories_category_id_key'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS categories_category_id_key ON categories(category_id);
  END IF;
  CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);
END$$;

-- Keep cat_name and name in sync
CREATE OR REPLACE FUNCTION ims.sync_category_names() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS NULL AND NEW.cat_name IS NOT NULL THEN
    NEW.name := NEW.cat_name;
  ELSIF NEW.cat_name IS NULL AND NEW.name IS NOT NULL THEN
    NEW.cat_name := NEW.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_categories_sync_names ON categories;
CREATE TRIGGER trg_categories_sync_names
BEFORE INSERT OR UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION ims.sync_category_names();

-- Touch trigger for updated_at
CREATE OR REPLACE FUNCTION ims.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_categories_touch ON categories;
CREATE TRIGGER trg_categories_touch
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION ims.touch_updated_at();

-- Ensure products has category_id column used by app
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id BIGINT,
  ADD COLUMN IF NOT EXISTS sku VARCHAR(120),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE products
   SET category_id = COALESCE(category_id, cat_id);

-- Add FK to categories (use cat_id as authoritative key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='ims' AND table_name='products' AND constraint_name='products_category_id_fkey'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES categories(cat_id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

-- Touch trigger for products
DROP TRIGGER IF EXISTS trg_products_touch ON products;
CREATE TRIGGER trg_products_touch
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION ims.touch_updated_at();
