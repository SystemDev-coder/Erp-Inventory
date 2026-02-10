-- Allow products to have no category and keep cat_id/category_id in sync
SET search_path TO ims, public;

-- Drop NOT NULL on cat_id if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='products' AND column_name='cat_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE products ALTER COLUMN cat_id DROP NOT NULL;
  END IF;
END$$;

-- Backfill cat_id from category_id when missing
UPDATE products
   SET cat_id = COALESCE(cat_id, category_id)
 WHERE cat_id IS NULL AND category_id IS NOT NULL;
