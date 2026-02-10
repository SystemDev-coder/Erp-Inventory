-- Ensure branches table has updated_at and touch trigger
-- Date: 2026-02-10

SET search_path TO ims, public;

-- Common touch function (idempotent)
CREATE OR REPLACE FUNCTION ims.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add column if missing
ALTER TABLE ims.branches
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill existing rows
UPDATE ims.branches
   SET updated_at = COALESCE(updated_at, created_at, NOW())
 WHERE updated_at IS NULL;

-- Trigger to maintain updated_at
DROP TRIGGER IF EXISTS trg_branches_touch ON ims.branches;
CREATE TRIGGER trg_branches_touch
BEFORE UPDATE ON ims.branches
FOR EACH ROW EXECUTE FUNCTION ims.touch_updated_at();
