-- 2026-03-24
-- Legacy schema fix: ensure capital_contributions/owner_drawings have acc_id columns.
-- This prevents errors like: "column cc.acc_id does not exist".

DO $$
BEGIN
  IF to_regclass('ims.capital_contributions') IS NOT NULL THEN
    ALTER TABLE ims.capital_contributions
      ADD COLUMN IF NOT EXISTS acc_id BIGINT,
      ADD COLUMN IF NOT EXISTS equity_acc_id BIGINT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('ims.owner_drawings') IS NOT NULL THEN
    ALTER TABLE ims.owner_drawings
      ADD COLUMN IF NOT EXISTS acc_id BIGINT,
      ADD COLUMN IF NOT EXISTS equity_acc_id BIGINT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END
$$;

-- Ensure standard equity accounts exist per branch (safe upsert).
INSERT INTO ims.accounts (branch_id, name, institution, balance, account_type, is_active)
SELECT b.branch_id, 'Opening Balance Equity', 'System Equity', 0, 'equity', TRUE
  FROM ims.branches b
 WHERE NOT EXISTS (
   SELECT 1
     FROM ims.accounts a
    WHERE a.branch_id = b.branch_id
      AND LOWER(TRIM(a.name)) = LOWER('Opening Balance Equity')
 )
ON CONFLICT (branch_id, name) DO UPDATE
      SET account_type = EXCLUDED.account_type,
          is_active = TRUE;

INSERT INTO ims.accounts (branch_id, name, institution, balance, account_type, is_active)
SELECT b.branch_id, 'Owner Capital', 'System Equity', 0, 'equity', TRUE
  FROM ims.branches b
 WHERE NOT EXISTS (
   SELECT 1
     FROM ims.accounts a
    WHERE a.branch_id = b.branch_id
      AND LOWER(TRIM(a.name)) = LOWER('Owner Capital')
 )
ON CONFLICT (branch_id, name) DO UPDATE
      SET account_type = EXCLUDED.account_type,
          is_active = TRUE;

-- Best-effort backfill for old rows (NULL is acceptable; prevents crashes from missing columns).
DO $$
BEGIN
  IF to_regclass('ims.capital_contributions') IS NOT NULL THEN
    UPDATE ims.capital_contributions cc
       SET acc_id = COALESCE(
             cc.acc_id,
             (
               SELECT a.acc_id
                 FROM ims.accounts a
                WHERE a.branch_id = cc.branch_id
                  AND LOWER(TRIM(a.name)) = LOWER('Opening Balance Equity')
                ORDER BY a.acc_id
                LIMIT 1
             )
           ),
           equity_acc_id = COALESCE(
             cc.equity_acc_id,
             (
               SELECT a.acc_id
                 FROM ims.accounts a
                WHERE a.branch_id = cc.branch_id
                  AND LOWER(TRIM(a.name)) = LOWER('Owner Capital')
                ORDER BY a.acc_id
                LIMIT 1
             )
           ),
           updated_at = NOW()
     WHERE cc.acc_id IS NULL
        OR cc.equity_acc_id IS NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('ims.owner_drawings') IS NOT NULL THEN
    UPDATE ims.owner_drawings od
       SET acc_id = COALESCE(
             od.acc_id,
             (
               SELECT a.acc_id
                 FROM ims.accounts a
                WHERE a.branch_id = od.branch_id
                  AND COALESCE(a.is_active, TRUE) = TRUE
                  AND COALESCE(a.account_type, 'asset') = 'asset'
                ORDER BY
                  CASE
                    WHEN a.name ILIKE '%cash%' THEN 0
                    WHEN a.name ILIKE '%bank%' THEN 1
                    ELSE 2
                  END,
                  a.acc_id
                LIMIT 1
             )
           ),
           equity_acc_id = COALESCE(
             od.equity_acc_id,
             (
               SELECT a.acc_id
                 FROM ims.accounts a
                WHERE a.branch_id = od.branch_id
                  AND LOWER(TRIM(a.name)) = LOWER('Owner Capital')
                ORDER BY a.acc_id
                LIMIT 1
             )
           ),
           updated_at = NOW()
     WHERE od.acc_id IS NULL
        OR od.equity_acc_id IS NULL;
  END IF;
END
$$;

