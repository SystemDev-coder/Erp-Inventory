-- Minimal migration for Assets module + AR/AP due dates

BEGIN;

ALTER TABLE ims.sales
  ADD COLUMN IF NOT EXISTS due_date DATE;

ALTER TABLE ims.purchases
  ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE TABLE IF NOT EXISTS ims.fixed_assets (
  asset_id BIGSERIAL PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  asset_name VARCHAR(150) NOT NULL,
  category VARCHAR(100) NOT NULL,
  purchase_date DATE NOT NULL,
  cost NUMERIC(14,2) NOT NULL CHECK (cost >= 0),
  useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0),
  depreciation_method VARCHAR(50) NOT NULL DEFAULT 'straight_line',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch_created
  ON ims.fixed_assets(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch_category
  ON ims.fixed_assets(branch_id, category);

CREATE OR REPLACE FUNCTION ims.fn_fixed_assets_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fixed_assets_touch_updated_at ON ims.fixed_assets;
CREATE TRIGGER trg_fixed_assets_touch_updated_at
BEFORE UPDATE ON ims.fixed_assets
FOR EACH ROW
EXECUTE FUNCTION ims.fn_fixed_assets_touch_updated_at();

COMMIT;

