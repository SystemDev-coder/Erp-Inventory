-- Ensure suppliers has created_at/updated_at and timestamp trigger
SET search_path TO ims, public;

DO $$
BEGIN
  -- Add created_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='created_at'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- Add updated_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ims' AND table_name='suppliers' AND column_name='updated_at'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  -- Backfill any NULL updated_at
  UPDATE suppliers SET updated_at = NOW() WHERE updated_at IS NULL;
END $$;

-- Create/update trigger to keep updated_at current
CREATE OR REPLACE FUNCTION ims.fn_suppliers_touch_updated_at()
RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION ims.fn_suppliers_touch_updated_at();
