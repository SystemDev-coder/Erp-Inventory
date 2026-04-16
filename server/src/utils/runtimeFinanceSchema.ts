import { adminQueryMany } from '../db/adminQuery';
import { queryOne } from '../db/query';
import { assetsService } from '../modules/assets/assets.service';
import { systemService } from '../modules/system/system.service';

let runtimeFinanceSchemaReady = false;

export const ensureRuntimeFinanceSchema = async (): Promise<void> => {
  if (runtimeFinanceSchemaReady) return;

  // Account type support for proper financial statements.
  await adminQueryMany(`
    ALTER TABLE ims.accounts
      ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'asset'
  `);

  await adminQueryMany(`
    UPDATE ims.accounts
       SET account_type = 'asset'
     WHERE account_type IS NULL
        OR BTRIM(account_type) = ''
  `);

  await adminQueryMany(`
    DO $$
    DECLARE
      r record;
    BEGIN
      FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'ims'
           AND t.relname = 'accounts'
           AND c.contype = 'c'
      LOOP
        IF r.conname ILIKE '%account_type%' THEN
          EXECUTE format('ALTER TABLE ims.accounts DROP CONSTRAINT %I', r.conname);
        END IF;
      END LOOP;

      ALTER TABLE ims.accounts
        ADD CONSTRAINT chk_accounts_account_type
        CHECK (
          account_type IN (
            'asset',
            'liability',
            'equity',
            'revenue',
            'income',
            'expense',
            'cost'
          )
        );
    END
    $$;
  `);

  // Ensure enum has expected values (safe on newer DBs).
  await adminQueryMany(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'ims'
           AND t.typname = 'account_txn_type_enum'
           AND e.enumlabel = 'capital_contribution'
      ) THEN
        ALTER TYPE ims.account_txn_type_enum ADD VALUE 'capital_contribution';
      END IF;
    END
    $$;
  `);

  // Some deployments use "refund" as a ledger entry type for returns; keep enum compatible.
  await adminQueryMany(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'ims'
           AND t.typname = 'ledger_entry_enum'
      ) AND NOT EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'ims'
           AND t.typname = 'ledger_entry_enum'
           AND e.enumlabel = 'refund'
      ) THEN
        ALTER TYPE ims.ledger_entry_enum ADD VALUE 'refund';
      END IF;
    END
    $$;
  `);

  await adminQueryMany(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'ims'
           AND t.typname = 'account_txn_type_enum'
           AND e.enumlabel = 'owner_drawing'
      ) THEN
        ALTER TYPE ims.account_txn_type_enum ADD VALUE 'owner_drawing';
      END IF;
    END
    $$;
  `);

  // Journal support (used by some modules; safe to create).
  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.journal_entries (
      journal_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      entry_date DATE NOT NULL,
      memo TEXT,
      source_table VARCHAR(40),
      source_id BIGINT,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.journal_lines (
      journal_line_id BIGSERIAL PRIMARY KEY,
      journal_id BIGINT NOT NULL REFERENCES ims.journal_entries(journal_id) ON UPDATE CASCADE ON DELETE CASCADE,
      acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
      credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
      memo TEXT
    )
  `);

  // Owner capital & drawings.
  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.capital_contributions (
      capital_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      owner_name VARCHAR(150) NOT NULL,
      amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
      share_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      contribution_date DATE NOT NULL,
      acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      equity_acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      note TEXT,
      journal_id BIGINT REFERENCES ims.journal_entries(journal_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await adminQueryMany(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'ims'
           AND t.relname = 'capital_contributions'
           AND c.conname = 'chk_capital_contributions_share_pct'
      ) THEN
        ALTER TABLE ims.capital_contributions
          ADD CONSTRAINT chk_capital_contributions_share_pct
          CHECK (share_pct >= 0 AND share_pct <= 100);
      END IF;
    END
    $$;
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_capital_contributions_branch_date
      ON ims.capital_contributions(branch_id, contribution_date DESC, capital_id DESC)
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_capital_contributions_branch_owner
      ON ims.capital_contributions(branch_id, owner_name)
  `);

  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.owner_drawings (
      draw_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      owner_name VARCHAR(150) NOT NULL,
      amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
      draw_date DATE NOT NULL,
      acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      equity_acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      note TEXT,
      journal_id BIGINT REFERENCES ims.journal_entries(journal_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_owner_drawings_branch_date
      ON ims.owner_drawings(branch_id, draw_date DESC, draw_id DESC)
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_owner_drawings_branch_owner
      ON ims.owner_drawings(branch_id, owner_name)
  `);

  // Assets register (Current + Fixed). This is a register-only table and does NOT post to GL by itself.
  await adminQueryMany(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'ims'
           AND t.typname = 'asset_type_enum'
      ) THEN
        CREATE TYPE ims.asset_type_enum AS ENUM ('current', 'fixed');
      END IF;
    END
    $$;
  `);

  await adminQueryMany(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'ims'
           AND t.typname = 'asset_state_enum'
      ) THEN
        CREATE TYPE ims.asset_state_enum AS ENUM ('active', 'inactive', 'disposed');
      END IF;
    END
    $$;
  `);

  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.assets (
      asset_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      asset_name VARCHAR(150) NOT NULL,
      asset_type ims.asset_type_enum NOT NULL,
      purchased_date DATE NOT NULL DEFAULT CURRENT_DATE,
      amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      state ims.asset_state_enum NOT NULL DEFAULT 'active',
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_assets_branch_type_date
      ON ims.assets(branch_id, asset_type, purchased_date DESC, asset_id DESC)
  `);

  // Legacy fixed assets table (kept for backward compatibility; prefer ims.assets).
  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.fixed_assets (
      asset_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      asset_name VARCHAR(150) NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'Fixed Asset',
      purchase_date DATE NOT NULL,
      cost NUMERIC(14,2) NOT NULL CHECK (cost >= 0),
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await adminQueryMany(`
    ALTER TABLE ims.fixed_assets
      ADD COLUMN IF NOT EXISTS acc_id BIGINT
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch_created
      ON ims.fixed_assets(branch_id, created_at DESC)
  `);

  // Best-effort migration/cleanup (fixed_assets -> assets, remove legacy "Supplies" account).
  await assetsService.ensureSchema();

  // If older deployments posted owner capital into cash/bank accounts, normalize it so it does not inflate cash balances.
  // This runs only when needed and keeps TB/BS stable by rebuilding GL and recomputing balances.
  const needsCapitalRebuild = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM ims.account_transactions at
         JOIN ims.accounts a
           ON a.branch_id = at.branch_id
          AND a.acc_id = at.acc_id
        WHERE at.ref_table = 'capital_contributions'
          AND COALESCE(a.account_type::text, 'asset') = 'asset'
        LIMIT 1
     ) AS exists`
  );
  if (needsCapitalRebuild?.exists) {
    await systemService.reconcileBalances();
  }

  runtimeFinanceSchemaReady = true;
};
