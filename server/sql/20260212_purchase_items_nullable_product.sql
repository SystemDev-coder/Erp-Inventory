-- Allow manual/unnamed items on purchases
ALTER TABLE IF EXISTS ims.purchase_items
  ALTER COLUMN product_id DROP NOT NULL;
