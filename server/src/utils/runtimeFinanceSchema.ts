import { queryMany } from '../db/query';

let runtimeFinanceSchemaReady = false;

export const ensureRuntimeFinanceSchema = async (): Promise<void> => {
  if (runtimeFinanceSchemaReady) return;

  // Account type support for proper financial statements.
  await queryMany(`
    ALTER TABLE ims.accounts
      ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'asset'
  `);

  await queryMany(`
    UPDATE ims.accounts
       SET account_type = 'asset'
     WHERE account_type IS NULL
        OR BTRIM(account_type) = ''
  `);

  await queryMany(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'ims'
           AND t.relname = 'accounts'
           AND c.conname = 'chk_accounts_account_type'
      ) THEN
        ALTER TABLE ims.accounts DROP CONSTRAINT chk_accounts_account_type;
      END IF;

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
  await queryMany(`
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

  await queryMany(`
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
  await queryMany(`
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

  await queryMany(`
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
  await queryMany(`
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

  await queryMany(`
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

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_capital_contributions_branch_date
      ON ims.capital_contributions(branch_id, contribution_date DESC, capital_id DESC)
  `);

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_capital_contributions_branch_owner
      ON ims.capital_contributions(branch_id, owner_name)
  `);

  await queryMany(`
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

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_owner_drawings_branch_date
      ON ims.owner_drawings(branch_id, draw_date DESC, draw_id DESC)
  `);

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_owner_drawings_branch_owner
      ON ims.owner_drawings(branch_id, owner_name)
  `);

  // Fixed assets (used by Balance Sheet + Cash Flow investing).
  await queryMany(`
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

  await queryMany(`
    ALTER TABLE ims.fixed_assets
      ADD COLUMN IF NOT EXISTS acc_id BIGINT
  `);

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch_created
      ON ims.fixed_assets(branch_id, created_at DESC)
  `);

  runtimeFinanceSchemaReady = true;
};

