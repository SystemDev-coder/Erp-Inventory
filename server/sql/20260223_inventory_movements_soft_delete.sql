BEGIN;
SET search_path TO ims, public;

ALTER TABLE ims.inventory_movements
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_not_deleted
  ON ims.inventory_movements(branch_id, product_id, move_date)
  WHERE is_deleted = FALSE;

COMMIT;
