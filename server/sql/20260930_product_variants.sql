-- Product Variants: a single product (e.g. "iPhone 15") can be sold as
-- several variants (Black/128GB, Blue/256GB, ...), each with its OWN
-- barcode, price, and stock. Reverses the deliberate prior-session design
-- in 20260916_business_profile.sql ("not a variant matrix"), but only
-- where necessary: a variant is its own ims.items row (self-referencing
-- parent_item_id), NOT a separate item_variants table - so every existing
-- table/service/report that already works with "an item" (sales,
-- purchases, POS, stock adjustments, transfers, returns, inventory
-- movements) keeps working completely unchanged, since a variant already
-- has its own barcode/price/stock/attributes via the columns ims.items
-- already has.
--
-- Deliberately NOT registered in ims.delete_dependency_policy as
-- 'cascade' (see server/src/modules/products/products.service.ts
-- deleteProduct's new precondition instead) - store_items is safely
-- 'cascade' there only because deleteProduct checks THAT item's own
-- stock-on-hand first; a variant is a DIFFERENT item with its OWN stock,
-- so that precondition doesn't transitively cover it. Deleting a parent
-- with active variants is blocked outright instead, forcing each variant
-- to be deleted individually through the same safe, zero-stock-checked
-- deleteProduct path.
--
-- is_deleted/deleted_at/RLS are unaffected here (items already has them);
-- no new table is created, so no new audit trigger is needed either.

ALTER TABLE ims.items
  ADD COLUMN IF NOT EXISTS parent_item_id BIGINT NULL REFERENCES ims.items(item_id) ON UPDATE CASCADE ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_items_parent_not_self'
  ) THEN
    ALTER TABLE ims.items
      ADD CONSTRAINT chk_items_parent_not_self CHECK (parent_item_id IS NULL OR parent_item_id <> item_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_parent ON ims.items(parent_item_id) WHERE parent_item_id IS NOT NULL;
