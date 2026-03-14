-- Migration: force quantity columns to integers (rounded)
-- Safe to run multiple times.

DO $$
DECLARE
  col_type text;
BEGIN
  -- ims.items.quantity
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema='ims' AND table_name='items' AND column_name='quantity';
  IF col_type IS NOT NULL AND col_type <> 'integer' THEN
    EXECUTE 'ALTER TABLE ims.items ALTER COLUMN quantity TYPE integer USING ROUND(COALESCE(quantity,0))::integer';
  END IF;

  -- ims.store_items.quantity
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema='ims' AND table_name='store_items' AND column_name='quantity';
  IF col_type IS NOT NULL AND col_type <> 'integer' THEN
    EXECUTE 'ALTER TABLE ims.store_items ALTER COLUMN quantity TYPE integer USING ROUND(COALESCE(quantity,0))::integer';
  END IF;

  -- ims.sale_items.quantity
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema='ims' AND table_name='sale_items' AND column_name='quantity';
  IF col_type IS NOT NULL AND col_type <> 'integer' THEN
    EXECUTE 'ALTER TABLE ims.sale_items ALTER COLUMN quantity TYPE integer USING ROUND(COALESCE(quantity,0))::integer';
  END IF;

  -- ims.purchase_items.quantity
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema='ims' AND table_name='purchase_items' AND column_name='quantity';
  IF col_type IS NOT NULL AND col_type <> 'integer' THEN
    EXECUTE 'ALTER TABLE ims.purchase_items ALTER COLUMN quantity TYPE integer USING ROUND(COALESCE(quantity,0))::integer';
  END IF;

  -- ims.sales_return_items.quantity
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema='ims' AND table_name='sales_return_items' AND column_name='quantity';
  IF col_type IS NOT NULL AND col_type <> 'integer' THEN
    EXECUTE 'ALTER TABLE ims.sales_return_items ALTER COLUMN quantity TYPE integer USING ROUND(COALESCE(quantity,0))::integer';
  END IF;

  -- ims.purchase_return_items.quantity
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema='ims' AND table_name='purchase_return_items' AND column_name='quantity';
  IF col_type IS NOT NULL AND col_type <> 'integer' THEN
    EXECUTE 'ALTER TABLE ims.purchase_return_items ALTER COLUMN quantity TYPE integer USING ROUND(COALESCE(quantity,0))::integer';
  END IF;

  -- ims.inventory_movements.qty_in / qty_out
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema='ims' AND table_name='inventory_movements' AND column_name='qty_in';
  IF col_type IS NOT NULL AND col_type <> 'integer' THEN
    EXECUTE 'ALTER TABLE ims.inventory_movements ALTER COLUMN qty_in TYPE integer USING ROUND(COALESCE(qty_in,0))::integer';
  END IF;

  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema='ims' AND table_name='inventory_movements' AND column_name='qty_out';
  IF col_type IS NOT NULL AND col_type <> 'integer' THEN
    EXECUTE 'ALTER TABLE ims.inventory_movements ALTER COLUMN qty_out TYPE integer USING ROUND(COALESCE(qty_out,0))::integer';
  END IF;
END $$;

