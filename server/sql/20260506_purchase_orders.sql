-- NEW: Purchase Orders support (from now)
-- - Adds purchase status `ordered` (no stock/ledger impact until received)
-- - Adds `doc_type` to distinguish purchase vs order
-- - Adds `expected_date` for delivery planning
-- This migration is idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'ims'
       AND t.typname = 'purchase_status_enum'
       AND e.enumlabel = 'ordered'
  ) THEN
    ALTER TYPE ims.purchase_status_enum ADD VALUE 'ordered';
  END IF;
END $$;

ALTER TABLE ims.purchases
  ADD COLUMN IF NOT EXISTS doc_type VARCHAR(20) NOT NULL DEFAULT 'purchase';

ALTER TABLE ims.purchases
  ADD COLUMN IF NOT EXISTS expected_date DATE;

DO $$
BEGIN
  -- Add check constraint (safe if it already exists)
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'ims'
       AND t.relname = 'purchases'
       AND c.conname = 'chk_purchases_doc_type'
  ) THEN
    ALTER TABLE ims.purchases
      ADD CONSTRAINT chk_purchases_doc_type CHECK (doc_type IN ('purchase','order'));
  END IF;
END $$;

