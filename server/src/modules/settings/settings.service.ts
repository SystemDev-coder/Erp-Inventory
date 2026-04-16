import { PoolClient } from 'pg';
import { queryMany, queryOne } from '../../db/query';
import { adminQueryMany } from '../../db/adminQuery';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { BranchScope, assertBranchAccess, pickBranchForWrite } from '../../utils/branchScope';
import { getUploadedImageUrl } from '../../config/cloudinary';
import { systemService } from '../system/system.service';
import { postGl } from '../../utils/glPosting';
import { ensureCoaAccounts } from '../../utils/coaDefaults';
import { assetsService } from '../assets/assets.service';

export interface Branch {
  branch_id: number;
  branch_name: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
  audit_id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity: string | null;
  entity_id: number | null;
  old_value?: unknown;
  new_value?: unknown;
  meta?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface CompanyInfo {
  company_id: number;
  company_name: string;
  logo_img: string | null;
  banner_img: string | null;
  phone: string | null;
  manager_name: string | null;
  capital_amount: number;
  created_at: string;
  updated_at: string;
}

export interface CapitalContribution {
  capital_id: number;
  branch_id: number;
  owner_name: string;
  amount: number;
  share_pct: number;
  date: string;
  account_id: number;
  account_name: string;
  note: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapitalReportSummary {
  total_capital: number;
  by_owner: Array<{ owner_name: string; total_amount: number }>;
  by_account: Array<{ account_id: number; account_name: string; total_amount: number }>;
}

export interface CapitalOwnerEquity {
  owner_name: string;
  share_pct: number;
  contributed_amount: number;
  profit_allocated: number;
  drawing_amount: number;
  equity_balance: number;
}

export interface CapitalOwnerEquitySummary {
  owners: CapitalOwnerEquity[];
  totals: {
    contributed_amount: number;
    profit_allocated: number;
    drawing_amount: number;
    equity_balance: number;
  };
}

export interface OwnerDrawing {
  draw_id: number;
  branch_id: number;
  owner_name: string;
  amount: number;
  date: string;
  account_id: number;
  account_name: string;
  note: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetOverviewCurrentAccount {
  asset_id: number;
  asset_name: string;
  purchased_date: string;
  amount: number;
  state: string;
}

export interface AssetOverviewFixedAsset {
  asset_id: number;
  asset_name: string;
  purchased_date: string;
  amount: number;
  state: string;
}

export interface AssetOverviewSummary {
  current_assets: AssetOverviewCurrentAccount[];
  fixed_assets: AssetOverviewFixedAsset[];
  current_assets_total: number;
  fixed_assets_total: number;
}

const REQUIRED_CURRENT_ASSET_ACCOUNTS = [
  'Cash @ Salaam Bank',
  'Cash @ Merchant',
  'Cash @ EVC-Plus',
  'Cash @ Premier Bank',
  'Cash @ Dahabshiil Bank',
];

const normalizeOwnerKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

type AuditLogColumns = {
  idColumn: 'log_id' | 'audit_id';
  actionColumn: 'action_type' | 'action';
  entityColumn: 'table_name' | 'entity';
  entityIdColumn: 'record_id' | 'entity_id';
  oldColumn: 'old_values' | 'old_value';
  newColumn: 'new_values' | 'new_value';
  hasMeta: boolean;
};

let auditLogColumnsCache: AuditLogColumns | null = null;
let companySchemaReady = false;
let capitalSchemaReady = false;
let assetAccountsSchemaReady = false;

const ensureCompanySchema = async (): Promise<void> => {
  if (companySchemaReady) return;
  await adminQueryMany(`
    ALTER TABLE ims.company
      ADD COLUMN IF NOT EXISTS capital_amount NUMERIC(14,2) NOT NULL DEFAULT 0
  `);
  companySchemaReady = true;
};

const ensureAssetAccountsSchema = async (): Promise<void> => {
  if (assetAccountsSchemaReady) return;
  await adminQueryMany(`
    ALTER TABLE ims.accounts
      ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'asset'
  `);
  // Remove legacy/narrow account_type checks (for example, only asset/equity),
  // then enforce the full accounting type set.
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

      IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'ims'
           AND t.relname = 'accounts'
           AND c.conname = 'chk_accounts_account_type'
      ) THEN
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
      END IF;
    END
    $$;
  `);
  await adminQueryMany(`
    UPDATE ims.accounts
       SET account_type = 'asset'
     WHERE account_type IS NULL
       OR BTRIM(account_type) = ''
       OR account_type NOT IN ('asset', 'liability', 'equity', 'revenue', 'income', 'expense', 'cost')
  `);
  assetAccountsSchemaReady = true;
};

const ensureCapitalSchema = async (): Promise<void> => {
  if (capitalSchemaReady) return;

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

  // Allow standard COA types used across reports.
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
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_journal_line_amt CHECK ((debit + credit) > 0)
    )
  `);

  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.capital_contributions (
      capital_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      owner_name VARCHAR(150) NOT NULL,
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      share_pct NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (share_pct >= 0 AND share_pct <= 100),
      contribution_date DATE NOT NULL,
      acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      equity_acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      journal_id BIGINT REFERENCES ims.journal_entries(journal_id) ON UPDATE CASCADE ON DELETE SET NULL,
      note TEXT,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Legacy DBs may already have capital_contributions but without acc_id/equity_acc_id.
  // Add them as nullable columns first; runtime logic will backfill where possible.
  await adminQueryMany(`
    ALTER TABLE ims.capital_contributions
      ADD COLUMN IF NOT EXISTS acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT
  `);
  await adminQueryMany(`
    ALTER TABLE ims.capital_contributions
      ADD COLUMN IF NOT EXISTS equity_acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT
  `);
  await adminQueryMany(`
    ALTER TABLE ims.capital_contributions
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await adminQueryMany(`
    ALTER TABLE ims.capital_contributions
      ADD COLUMN IF NOT EXISTS share_pct NUMERIC(7,4) NOT NULL DEFAULT 0
  `);

  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.owner_drawings (
      draw_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      owner_name VARCHAR(150) NOT NULL,
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      draw_date DATE NOT NULL,
      acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      equity_acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      journal_id BIGINT REFERENCES ims.journal_entries(journal_id) ON UPDATE CASCADE ON DELETE SET NULL,
      note TEXT,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await adminQueryMany(`
    ALTER TABLE ims.owner_drawings
      ADD COLUMN IF NOT EXISTS acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT
  `);
  await adminQueryMany(`
    ALTER TABLE ims.owner_drawings
      ADD COLUMN IF NOT EXISTS equity_acc_id BIGINT REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT
  `);
  await adminQueryMany(`
    ALTER TABLE ims.owner_drawings
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  // Best-effort backfill for older rows so listing pages don't error / hide all records.
  const legacyCapitalBranches = await queryMany<{ branch_id: number }>(`
    SELECT DISTINCT branch_id
      FROM ims.capital_contributions
     WHERE acc_id IS NULL
        OR equity_acc_id IS NULL
  `);
  for (const row of legacyCapitalBranches) {
    const branchId = Number(row.branch_id);
    if (!branchId) continue;
    await withTransaction(async (client) => {
      const coa = await ensureCoaAccounts(client, branchId, ['openingBalanceEquity', 'ownerCapital']);
      await client.query(
        `UPDATE ims.capital_contributions
            SET acc_id = COALESCE(acc_id, $2),
                equity_acc_id = COALESCE(equity_acc_id, $3),
                updated_at = COALESCE(updated_at, NOW())
          WHERE branch_id = $1
            AND (acc_id IS NULL OR equity_acc_id IS NULL)`,
        [branchId, coa.openingBalanceEquity, coa.ownerCapital]
      );
    });
  }

  const legacyDrawingBranches = await queryMany<{ branch_id: number }>(`
    SELECT DISTINCT branch_id
      FROM ims.owner_drawings
     WHERE acc_id IS NULL
        OR equity_acc_id IS NULL
  `);
  for (const row of legacyDrawingBranches) {
    const branchId = Number(row.branch_id);
    if (!branchId) continue;
    await withTransaction(async (client) => {
      const payout = await client.query<{ acc_id: number }>(
        `SELECT acc_id
           FROM ims.accounts
          WHERE branch_id = $1
            AND is_active = TRUE
            AND account_type = 'asset'
          ORDER BY
            CASE
              WHEN name ILIKE '%cash%' THEN 0
              WHEN name ILIKE '%bank%' THEN 1
              ELSE 2
            END,
            acc_id ASC
          LIMIT 1`,
        [branchId]
      );
      const payoutAccId = Number(payout.rows[0]?.acc_id || 0);
      const coa = await ensureCoaAccounts(client, branchId, ['ownerCapital']);

      await client.query(
        `UPDATE ims.owner_drawings
            SET acc_id = COALESCE(acc_id, NULLIF($2, 0)),
                equity_acc_id = COALESCE(equity_acc_id, $3),
                updated_at = COALESCE(updated_at, NOW())
          WHERE branch_id = $1
            AND (acc_id IS NULL OR equity_acc_id IS NULL)`,
        [branchId, payoutAccId, coa.ownerCapital]
      );
    });
  }

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
    CREATE INDEX IF NOT EXISTS idx_owner_drawings_branch_date
      ON ims.owner_drawings(branch_id, draw_date DESC, draw_id DESC)
  `);

  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_owner_drawings_branch_owner
      ON ims.owner_drawings(branch_id, owner_name)
  `);

  capitalSchemaReady = true;
};

let reclassSchemaReady = false;
const ensureReclassSchema = async (): Promise<void> => {
  if (reclassSchemaReady) return;
  await ensureCapitalSchema();
  await adminQueryMany(`
    CREATE TABLE IF NOT EXISTS ims.account_reclassifications (
      reclass_id BIGSERIAL PRIMARY KEY,
      branch_id BIGINT NOT NULL REFERENCES ims.branches(branch_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      from_acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      to_acc_id BIGINT NOT NULL REFERENCES ims.accounts(acc_id) ON UPDATE CASCADE ON DELETE RESTRICT,
      amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
      note TEXT,
      created_by BIGINT REFERENCES ims.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await adminQueryMany(`
    CREATE INDEX IF NOT EXISTS idx_account_reclassifications_branch_date
      ON ims.account_reclassifications(branch_id, entry_date DESC, reclass_id DESC)
  `);
  reclassSchemaReady = true;
};

const roundMoney = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const lockAccountBalance = async (client: PoolClient, branchId: number, accId: number) => {
  const row = (
    await client.query<{ acc_id: number; name: string; balance: string }>(
      `SELECT acc_id, name, balance::text AS balance
         FROM ims.accounts
        WHERE branch_id = $1
          AND acc_id = $2
        FOR UPDATE`,
      [branchId, accId]
    )
  ).rows[0];
  if (!row) throw ApiError.badRequest('Account not found in selected branch');
  return { accId: Number(row.acc_id), name: row.name, balance: Number(row.balance || 0) };
};

const ensureOwnerCapitalAccount = async (branchId: number): Promise<number> => {
  const existing = await queryOne<{ acc_id: number }>(
    `SELECT acc_id
       FROM ims.accounts
      WHERE branch_id = $1
        AND LOWER(name) = LOWER('Owner Capital')
      ORDER BY acc_id
      LIMIT 1`,
    [branchId]
  );
  if (existing) {
    await queryOne(
      `UPDATE ims.accounts
          SET account_type = 'equity',
              is_active = TRUE
        WHERE acc_id = $1`,
      [existing.acc_id]
    );
    return Number(existing.acc_id);
  }

  const created = await queryOne<{ acc_id: number }>(
    `INSERT INTO ims.accounts (branch_id, name, institution, balance, is_active, account_type)
     VALUES ($1, 'Owner Capital', 'System Equity', 0, TRUE, 'equity')
     RETURNING acc_id`,
    [branchId]
  );

  if (!created) throw ApiError.internal('Failed to create Owner Capital account');
  return Number(created.acc_id);
};

const isCapitalDateLocked = async (branchId: number, date: string): Promise<boolean> => {
  const tableExists = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'ims'
          AND table_name = 'accounting_periods'
     ) AS exists`
  );
  if (!tableExists?.exists) return false;

  const cols = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'accounting_periods'`
  );
  const names = new Set(cols.map((row) => row.column_name));
  const hasBranch = names.has('branch_id');
  const hasStart = names.has('start_date');
  const hasEnd = names.has('end_date');
  const hasClosed = names.has('is_closed');
  if (!hasStart || !hasEnd || !hasClosed) return false;

  const whereBranch = hasBranch ? 'AND branch_id = $2' : '';
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM ims.accounting_periods
        WHERE is_closed = TRUE
          AND $1::date BETWEEN start_date::date AND end_date::date
          ${whereBranch}
     ) AS exists`,
    hasBranch ? [date, branchId] : [date]
  );
  return Boolean(row?.exists);
};

const getOwnerAvailableEquity = async (
  branchId: number,
  ownerName: string,
  input?: { excludeDrawingId?: number }
): Promise<number> => {
  const contributionTotalRow = await queryOne<{ total: string | number }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM ims.capital_contributions
      WHERE branch_id = $1
        AND LOWER(BTRIM(owner_name)) = LOWER(BTRIM($2))`,
    [branchId, ownerName]
  );

  const profitTotalRow = await queryOne<{ total: string | number }>(
    `SELECT COALESCE(SUM(fpa.amount), 0)::text AS total
       FROM ims.finance_profit_allocations fpa
       JOIN ims.finance_closing_periods cp ON cp.closing_id = fpa.closing_id
      WHERE fpa.branch_id = $1
        AND fpa.allocation_type = 'partner'
        AND cp.status = 'closed'
        AND LOWER(BTRIM(fpa.partner_name)) = LOWER(BTRIM($2))`,
    [branchId, ownerName]
  );

  const drawingParams: Array<number | string> = [branchId, ownerName];
  let excludeSql = '';
  if (input?.excludeDrawingId && Number(input.excludeDrawingId) > 0) {
    drawingParams.push(Number(input.excludeDrawingId));
    excludeSql = ` AND draw_id <> $${drawingParams.length}`;
  }
  const drawingTotalRow = await queryOne<{ total: string | number }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM ims.owner_drawings
      WHERE branch_id = $1
        AND LOWER(BTRIM(owner_name)) = LOWER(BTRIM($2))
        ${excludeSql}`,
    drawingParams
  );

  const contributed = Number(contributionTotalRow?.total || 0);
  const profitAllocated = Number(profitTotalRow?.total || 0);
  const alreadyDrawn = Number(drawingTotalRow?.total || 0);
  return contributed + profitAllocated - alreadyDrawn;
};

const detectAuditLogColumns = async (): Promise<AuditLogColumns> => {
  if (auditLogColumnsCache) return auditLogColumnsCache;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'audit_logs'`
  );

  const names = new Set(columns.map((row) => row.column_name));

  auditLogColumnsCache = {
    idColumn: names.has('log_id') ? 'log_id' : 'audit_id',
    actionColumn: names.has('action_type') ? 'action_type' : 'action',
    entityColumn: names.has('table_name') ? 'table_name' : 'entity',
    entityIdColumn: names.has('record_id') ? 'record_id' : 'entity_id',
    oldColumn: names.has('old_values') ? 'old_values' : 'old_value',
    newColumn: names.has('new_values') ? 'new_values' : 'new_value',
    hasMeta: names.has('meta'),
  };

  return auditLogColumnsCache;
};

const mapCompany = (row: {
  company_id: number;
  company_name: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  banner_url: string | null;
  capital_amount: string | number;
  created_at: string;
  updated_at: string;
}): CompanyInfo => ({
  company_id: Number(row.company_id),
  company_name: row.company_name,
  phone: row.phone,
  manager_name: row.address,
  logo_img: row.logo_url ? getUploadedImageUrl(row.logo_url) : null,
  banner_img: row.banner_url ? getUploadedImageUrl(row.banner_url) : null,
  capital_amount: Number(row.capital_amount || 0),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const compactOwnerName = (value: string) => value.trim().replace(/\s+/g, ' ');

export const settingsService = {
  async getCompanyInfo(): Promise<CompanyInfo | null> {
    await ensureCompanySchema();
    const row = await queryOne<{
      company_id: number;
      company_name: string;
      phone: string | null;
      address: string | null;
      logo_url: string | null;
      banner_url: string | null;
      capital_amount: string | number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT company_id, company_name, phone, address, logo_url, banner_url, capital_amount::text AS capital_amount, created_at, updated_at
         FROM ims.company
        WHERE company_id = 1`
    );

    return row ? mapCompany(row) : null;
  },

  async upsertCompanyInfo(input: {
    companyName: string;
    phone?: string | null;
    managerName?: string | null;
    logoImg?: string | null;
    bannerImg?: string | null;
    capitalAmount?: number | null;
  }): Promise<CompanyInfo> {
    await ensureCompanySchema();
    const row = await queryOne<{
      company_id: number;
      company_name: string;
      phone: string | null;
      address: string | null;
      logo_url: string | null;
      banner_url: string | null;
      capital_amount: string | number;
      created_at: string;
      updated_at: string;
    }>(
      `INSERT INTO ims.company
         (company_id, company_name, phone, address, logo_url, banner_url, capital_amount, is_active)
       VALUES
         (1, $1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (company_id)
       DO UPDATE SET
         company_name = EXCLUDED.company_name,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address,
         logo_url = EXCLUDED.logo_url,
         banner_url = EXCLUDED.banner_url,
         capital_amount = EXCLUDED.capital_amount,
         updated_at = NOW()
       RETURNING company_id, company_name, phone, address, logo_url, banner_url, capital_amount::text AS capital_amount, created_at, updated_at`,
      [
        input.companyName,
        input.phone ?? null,
        input.managerName ?? null,
        input.logoImg ?? null,
        input.bannerImg ?? null,
        input.capitalAmount ?? 0,
      ]
    );

    if (!row) {
      throw ApiError.internal('Failed to save company information');
    }

    return mapCompany(row);
  },

  async deleteCompanyInfo(): Promise<void> {
    await queryOne(`DELETE FROM ims.company WHERE company_id = 1`);
  },

  async prepareAssetAccounts(scope: BranchScope, branchId?: number): Promise<{ created: number }> {
    await ensureAssetAccountsSchema();
    const targetBranchId = pickBranchForWrite(scope, branchId);
    let created = 0;

    // One-click "Prepare Accounts" should also migrate legacy opening balances into the new remaining balance + GL model.
    await systemService.migrateOpeningBalances(targetBranchId);

    for (const name of REQUIRED_CURRENT_ASSET_ACCOUNTS) {
      const row = await queryOne<{ acc_id: number }>(
        `INSERT INTO ims.accounts (branch_id, name, institution, balance, account_type, is_active)
         VALUES ($1, $2, '', 0, 'asset', TRUE)
         ON CONFLICT (branch_id, name) DO NOTHING
         RETURNING acc_id`,
        [targetBranchId, name]
      );
      if (row?.acc_id) created += 1;
    }

    await queryMany(
      `UPDATE ims.accounts
          SET is_active = FALSE
        WHERE branch_id = $1
          AND (
            account_type = 'equity'
            OR LOWER(name) LIKE 'accounts payable%'
            OR LOWER(name) LIKE 'accounts receivable%'
            OR LOWER(name) LIKE 'fixed asset%'
            OR LOWER(name) LIKE '%capital%'
            OR LOWER(BTRIM(name)) = 'supplies'
            OR LOWER(name) LIKE 'office furniture%'
            OR LOWER(name) LIKE 'computer%'
            OR LOWER(name) LIKE 'equipment%'
            OR LOWER(name) LIKE 'vehicle%'
            OR LOWER(name) LIKE 'mukeef%'
          )`,
      [targetBranchId]
    );

    // Keep ledger-based reports consistent with balances, especially when opening balances were entered directly.
    await systemService.reconcileBalances(targetBranchId);

    return { created };
  },

  async getAssetOverview(scope: BranchScope): Promise<AssetOverviewSummary> {
    await assetsService.ensureSchema();

    const params: Array<number | number[]> = [];
    const where: string[] = [];
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`a.branch_id = ANY($${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await queryMany<{
      asset_id: number;
      asset_name: string;
      asset_type: string;
      purchased_date: string;
      amount: string;
      state: string;
    }>(
      `SELECT
         a.asset_id,
         a.asset_name,
         a.asset_type::text AS asset_type,
         a.purchased_date::text AS purchased_date,
         a.amount::text AS amount,
         a.state::text AS state
       FROM ims.assets a
       ${whereSql}
       ORDER BY a.purchased_date DESC, a.asset_id DESC
       LIMIT 5000`,
      params
    );

    const current_assets = rows
      .filter((r) => (r.asset_type || '').toLowerCase() === 'current')
      .map((r) => ({
        asset_id: Number(r.asset_id),
        asset_name: r.asset_name,
        purchased_date: r.purchased_date,
        amount: Number(r.amount || 0),
        state: r.state,
      }));

    const fixed_assets = rows
      .filter((r) => (r.asset_type || '').toLowerCase() === 'fixed')
      .map((r) => ({
        asset_id: Number(r.asset_id),
        asset_name: r.asset_name,
        purchased_date: r.purchased_date,
        amount: Number(r.amount || 0),
        state: r.state,
      }));

    return {
      current_assets,
      fixed_assets,
      current_assets_total: current_assets.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      fixed_assets_total: fixed_assets.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    };
  },

  async listBranches(): Promise<Branch[]> {
    return queryMany<Branch>(
      `SELECT
          branch_id,
          branch_name,
          address AS location,
          is_active,
          created_at
       FROM ims.branches
       ORDER BY branch_name`
    );
  },

  async createBranch(input: {
    branchName: string;
    location?: string | null;
    isActive?: boolean;
  }): Promise<Branch> {
    const existing = await queryOne<{ branch_id: number }>(
      `SELECT branch_id
         FROM ims.branches
        WHERE LOWER(branch_name) = LOWER($1)
        LIMIT 1`,
      [input.branchName]
    );
    if (existing) {
      throw ApiError.conflict('Branch name already exists');
    }

    const row = await queryOne<Branch>(
      `INSERT INTO ims.branches (branch_name, address, is_active)
       VALUES ($1, $2, COALESCE($3, TRUE))
       RETURNING branch_id, branch_name, address AS location, is_active, created_at`,
      [input.branchName, input.location ?? null, input.isActive]
    );

    if (!row) {
      throw ApiError.internal('Failed to create branch');
    }
    return row;
  },

  async updateBranch(
    id: number,
    input: { branchName?: string; location?: string | null; isActive?: boolean }
  ): Promise<Branch | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.branchName !== undefined) {
      const existing = await queryOne<{ branch_id: number }>(
        `SELECT branch_id
           FROM ims.branches
          WHERE LOWER(branch_name) = LOWER($1)
            AND branch_id <> $2
          LIMIT 1`,
        [input.branchName, id]
      );
      if (existing) {
        throw ApiError.conflict('Branch name already exists');
      }
      updates.push(`branch_name = $${parameter++}`);
      values.push(input.branchName);
    }

    if (input.location !== undefined) {
      updates.push(`address = $${parameter++}`);
      values.push(input.location ?? null);
    }

    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }

    if (!updates.length) {
      return queryOne<Branch>(
        `SELECT
            branch_id,
            branch_name,
            address AS location,
            is_active,
            created_at
         FROM ims.branches
         WHERE branch_id = $1`,
        [id]
      );
    }

    values.push(id);

    return queryOne<Branch>(
      `UPDATE ims.branches
          SET ${updates.join(', ')}
        WHERE branch_id = $${parameter}
        RETURNING branch_id, branch_name, address AS location, is_active, created_at`,
      values
    );
  },

  async deleteBranch(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.branches WHERE branch_id = $1`, [id]);
  },

  async listAuditLogs(
    page = 1,
    limit = 50,
    startDate?: string,
    endDate?: string
  ): Promise<{ rows: AuditLog[]; total: number }> {
    const offset = (page - 1) * limit;
    const columns = await detectAuditLogColumns();
    const where: string[] = [];
    const filterValues: unknown[] = [];
    let param = 1;

    if (startDate && endDate) {
      where.push(`al.created_at::date BETWEEN $${param++}::date AND $${param++}::date`);
      filterValues.push(startDate, endDate);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitParam = param++;
    const offsetParam = param;
    const rows = await queryMany<AuditLog>(
      `SELECT
          al.${columns.idColumn} AS audit_id,
          al.user_id,
          u.username,
          al.${columns.actionColumn} AS action,
          al.${columns.entityColumn} AS entity,
          al.${columns.entityIdColumn} AS entity_id,
          al.${columns.oldColumn} AS old_value,
          al.${columns.newColumn} AS new_value,
          ${columns.hasMeta ? 'al.meta' : 'NULL::jsonb'} AS meta,
          al.ip_address,
          al.user_agent,
          al.created_at::text AS created_at
       FROM ims.audit_logs al
       LEFT JOIN ims.users u ON u.user_id = al.user_id
       ${whereSql}
       ORDER BY al.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      [...filterValues, limit, offset]
    );

    const totalRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM ims.audit_logs al
         ${whereSql}`,
      filterValues
    );

    return {
      rows,
      total: Number(totalRow?.count || 0),
    };
  },

  async listCapitalContributions(
    scope: BranchScope,
    input: { page: number; limit: number; search?: string; owner?: string; fromDate?: string; toDate?: string }
  ): Promise<{ rows: CapitalContribution[]; total: number; page: number; limit: number }> {
    await ensureCapitalSchema();
    const where: string[] = [];
    const params: Array<string | number | number[]> = [];

    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`cc.branch_id = ANY($${params.length})`);
    }
    if (input.search) {
      params.push(`%${input.search}%`);
      where.push(`(cc.owner_name ILIKE $${params.length} OR COALESCE(cc.note, '') ILIKE $${params.length} OR COALESCE(a.name, '') ILIKE $${params.length})`);
    }
    if (input.owner) {
      params.push(`%${input.owner}%`);
      where.push(`cc.owner_name ILIKE $${params.length}`);
    }
    if (input.fromDate && input.toDate) {
      params.push(input.fromDate, input.toDate);
      where.push(`cc.contribution_date BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (input.page - 1) * input.limit;
    params.push(input.limit, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const rows = await queryMany<{
      capital_id: number;
      branch_id: number;
      owner_name: string;
      amount: string | number;
      share_pct: string | number;
      date: string;
      account_id: number;
      account_name: string;
      note: string | null;
      created_by: number | null;
      created_by_name: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
         cc.capital_id,
         cc.branch_id,
         cc.owner_name,
         cc.amount::text AS amount,
         cc.share_pct::text AS share_pct,
         cc.contribution_date::text AS date,
         cc.acc_id AS account_id,
         a.name AS account_name,
         cc.note,
         cc.created_by,
         COALESCE(u.full_name, u.name, u.username) AS created_by_name,
         cc.created_at::text AS created_at,
         cc.updated_at::text AS updated_at
       FROM ims.capital_contributions cc
       JOIN ims.accounts a ON a.acc_id = cc.acc_id
       LEFT JOIN ims.users u ON u.user_id = cc.created_by
       ${whereSql}
       ORDER BY cc.contribution_date DESC, cc.capital_id DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const totalRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM ims.capital_contributions cc
         JOIN ims.accounts a ON a.acc_id = cc.acc_id
         ${whereSql}`,
      countParams
    );

    return {
      rows: rows.map((row) => ({
        capital_id: Number(row.capital_id),
        branch_id: Number(row.branch_id),
        owner_name: row.owner_name,
        amount: Number(row.amount || 0),
        share_pct: Number(row.share_pct || 0),
        date: row.date,
        account_id: Number(row.account_id),
        account_name: row.account_name,
        note: row.note,
        created_by: row.created_by ? Number(row.created_by) : null,
        created_by_name: row.created_by_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      total: Number(totalRow?.count || 0),
      page: input.page,
      limit: input.limit,
    };
  },

  async listCapitalOwnerEquity(
    scope: BranchScope,
    input: { owner?: string; search?: string } = {}
  ): Promise<CapitalOwnerEquitySummary> {
    await ensureCapitalSchema();

    const scopeCondition = scope.isAdmin ? '' : 'AND branch_id = ANY($1::bigint[])';
    const scopeParams = scope.isAdmin ? [] : [scope.branchIds];

    const contributionRows = await queryMany<{
      owner_key: string;
      owner_name: string;
      total_amount: string | number;
    }>(
      `SELECT
         LOWER(BTRIM(owner_name)) AS owner_key,
         MAX(BTRIM(owner_name)) AS owner_name,
         COALESCE(SUM(amount), 0)::text AS total_amount
       FROM ims.capital_contributions
       WHERE COALESCE(BTRIM(owner_name), '') <> ''
         ${scopeCondition}
       GROUP BY LOWER(BTRIM(owner_name))`,
      scopeParams
    );

    const shareRows = await queryMany<{
      owner_key: string;
      owner_name: string;
      share_pct: string | number;
    }>(
      `SELECT DISTINCT ON (LOWER(BTRIM(owner_name)))
         LOWER(BTRIM(owner_name)) AS owner_key,
         BTRIM(owner_name) AS owner_name,
         COALESCE(share_pct, 0)::text AS share_pct
       FROM ims.capital_contributions
       WHERE COALESCE(BTRIM(owner_name), '') <> ''
         ${scopeCondition}
       ORDER BY LOWER(BTRIM(owner_name)), contribution_date DESC, capital_id DESC`,
      scopeParams
    );

    const drawingRows = await queryMany<{
      owner_key: string;
      owner_name: string;
      total_amount: string | number;
    }>(
      `SELECT
         LOWER(BTRIM(owner_name)) AS owner_key,
         MAX(BTRIM(owner_name)) AS owner_name,
         COALESCE(SUM(amount), 0)::text AS total_amount
       FROM ims.owner_drawings
       WHERE COALESCE(BTRIM(owner_name), '') <> ''
         ${scopeCondition}
       GROUP BY LOWER(BTRIM(owner_name))`,
      scopeParams
    );

    const profitRows = await queryMany<{
      owner_key: string;
      owner_name: string;
      total_amount: string | number;
    }>(
      `SELECT
         LOWER(BTRIM(fpa.partner_name)) AS owner_key,
         MAX(BTRIM(fpa.partner_name)) AS owner_name,
         COALESCE(SUM(fpa.amount), 0)::text AS total_amount
       FROM ims.finance_profit_allocations fpa
       JOIN ims.finance_closing_periods cp ON cp.closing_id = fpa.closing_id
       WHERE fpa.allocation_type = 'partner'
         AND cp.status = 'closed'
         AND COALESCE(BTRIM(fpa.partner_name), '') <> ''
         ${scope.isAdmin ? '' : 'AND fpa.branch_id = ANY($1::bigint[])'}
       GROUP BY LOWER(BTRIM(fpa.partner_name))`,
      scopeParams
    );

    const ownerMap = new Map<string, CapitalOwnerEquity>();
    const ensureRow = (ownerKey: string, ownerName: string) => {
      const safeKey = ownerKey || normalizeOwnerKey(ownerName || '');
      if (!safeKey) return null;
      const existing = ownerMap.get(safeKey);
      if (existing) {
        if (ownerName && ownerName.length > existing.owner_name.length) {
          existing.owner_name = ownerName;
        }
        return existing;
      }
      const created: CapitalOwnerEquity = {
        owner_name: ownerName || safeKey,
        share_pct: 0,
        contributed_amount: 0,
        profit_allocated: 0,
        drawing_amount: 0,
        equity_balance: 0,
      };
      ownerMap.set(safeKey, created);
      return created;
    };

    for (const row of shareRows) {
      const owner = ensureRow(row.owner_key, row.owner_name);
      if (!owner) continue;
      owner.share_pct = Number(row.share_pct || 0);
    }
    for (const row of contributionRows) {
      const owner = ensureRow(row.owner_key, row.owner_name);
      if (!owner) continue;
      owner.contributed_amount = Number(row.total_amount || 0);
    }
    for (const row of drawingRows) {
      const owner = ensureRow(row.owner_key, row.owner_name);
      if (!owner) continue;
      owner.drawing_amount = Number(row.total_amount || 0);
    }
    for (const row of profitRows) {
      const owner = ensureRow(row.owner_key, row.owner_name);
      if (!owner) continue;
      owner.profit_allocated = Number(row.total_amount || 0);
    }

    let owners = Array.from(ownerMap.values()).map((row) => ({
      ...row,
      equity_balance: Number(row.contributed_amount || 0) + Number(row.profit_allocated || 0) - Number(row.drawing_amount || 0),
    }));

    const ownerTerm = (input.owner || '').trim().toLowerCase();
    const searchTerm = (input.search || '').trim().toLowerCase();
    if (ownerTerm) {
      owners = owners.filter((row) => row.owner_name.toLowerCase().includes(ownerTerm));
    }
    if (searchTerm) {
      owners = owners.filter((row) => row.owner_name.toLowerCase().includes(searchTerm));
    }

    owners.sort((a, b) => a.owner_name.localeCompare(b.owner_name));
    return {
      owners,
      totals: {
        contributed_amount: owners.reduce((sum, row) => sum + Number(row.contributed_amount || 0), 0),
        profit_allocated: owners.reduce((sum, row) => sum + Number(row.profit_allocated || 0), 0),
        drawing_amount: owners.reduce((sum, row) => sum + Number(row.drawing_amount || 0), 0),
        equity_balance: owners.reduce((sum, row) => sum + Number(row.equity_balance || 0), 0),
      },
    };
  },

  async listOwnerDrawings(
    scope: BranchScope,
    input: { page: number; limit: number; search?: string; owner?: string; fromDate?: string; toDate?: string }
  ): Promise<{ rows: OwnerDrawing[]; total: number; page: number; limit: number }> {
    await ensureCapitalSchema();
    const where: string[] = [];
    const params: Array<string | number | number[]> = [];

    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`od.branch_id = ANY($${params.length})`);
    }
    if (input.search) {
      params.push(`%${input.search}%`);
      where.push(`(od.owner_name ILIKE $${params.length} OR COALESCE(od.note, '') ILIKE $${params.length} OR COALESCE(a.name, '') ILIKE $${params.length})`);
    }
    if (input.owner) {
      params.push(`%${input.owner}%`);
      where.push(`od.owner_name ILIKE $${params.length}`);
    }
    if (input.fromDate && input.toDate) {
      params.push(input.fromDate, input.toDate);
      where.push(`od.draw_date BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (input.page - 1) * input.limit;
    params.push(input.limit, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const rows = await queryMany<{
      draw_id: number;
      branch_id: number;
      owner_name: string;
      amount: string | number;
      date: string;
      account_id: number;
      account_name: string;
      note: string | null;
      created_by: number | null;
      created_by_name: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
         od.draw_id,
         od.branch_id,
         od.owner_name,
         od.amount::text AS amount,
         od.draw_date::text AS date,
         od.acc_id AS account_id,
         a.name AS account_name,
         od.note,
         od.created_by,
         COALESCE(u.full_name, u.name, u.username) AS created_by_name,
         od.created_at::text AS created_at,
         od.updated_at::text AS updated_at
       FROM ims.owner_drawings od
       JOIN ims.accounts a ON a.acc_id = od.acc_id
       LEFT JOIN ims.users u ON u.user_id = od.created_by
       ${whereSql}
       ORDER BY od.draw_date DESC, od.draw_id DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const totalRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM ims.owner_drawings od
         JOIN ims.accounts a ON a.acc_id = od.acc_id
         ${whereSql}`,
      countParams
    );

    return {
      rows: rows.map((row) => ({
        draw_id: Number(row.draw_id),
        branch_id: Number(row.branch_id),
        owner_name: row.owner_name,
        amount: Number(row.amount || 0),
        date: row.date,
        account_id: Number(row.account_id),
        account_name: row.account_name,
        note: row.note,
        created_by: row.created_by ? Number(row.created_by) : null,
        created_by_name: row.created_by_name,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      total: Number(totalRow?.count || 0),
      page: input.page,
      limit: input.limit,
    };
  },

  async createCapitalContribution(
    input: {
      ownerName: string;
      amount: number;
      sharePct?: number;
      date: string;
      note?: string | null;
      branchId?: number;
    },
    scope: BranchScope,
    userId: number
  ): Promise<CapitalContribution> {
    await ensureCapitalSchema();
    const branchId = pickBranchForWrite(scope, input.branchId);
    const ownerName = compactOwnerName(input.ownerName);
    if (!ownerName) throw ApiError.badRequest('Owner name is required');

    if (await isCapitalDateLocked(branchId, input.date)) {
      throw ApiError.badRequest('Cannot create capital entry in a closed accounting period');
    }

    const ownerCapitalAccId = await ensureOwnerCapitalAccount(branchId);

    const capitalId = await withTransaction(async (client) => {
      // IMPORTANT:
      // Capital entries in this system are used to record OWNER EQUITY allocation,
      // not to move cash/bank (cash opening balances are recorded in Accounts).
      // So we reclassify within equity: Dr Opening Balance Equity, Cr Owner Capital.
      const coa = await ensureCoaAccounts(client, branchId, ['openingBalanceEquity']);
      const sourceEquityAccId = coa.openingBalanceEquity;

      const rowRes = await client.query<{ capital_id: number }>(
        `INSERT INTO ims.capital_contributions
           (branch_id, owner_name, amount, share_pct, contribution_date, acc_id, equity_acc_id, note, created_by)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9)
         RETURNING capital_id`,
        [
          branchId,
          ownerName,
          input.amount,
          Number(input.sharePct || 0),
          input.date,
          sourceEquityAccId,
          ownerCapitalAccId,
          input.note || null,
          userId,
        ]
      );
      const capital_id = Number(rowRes.rows[0]?.capital_id || 0);
      if (!capital_id) throw ApiError.internal('Failed to create capital entry');

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'capital_contributions'
            AND ref_id = $2`,
        [branchId, capital_id]
      );

      const memo = `[CAPITAL] ${ownerName}${input.note ? ` - ${input.note}` : ''}`;
      await postGl(client, {
        branchId,
        txnDate: input.date || null,
        txnType: 'capital_contribution',
        refTable: 'capital_contributions',
        refId: capital_id,
        note: memo,
        lines: [
          { accId: sourceEquityAccId, debit: Number(input.amount || 0), credit: 0, note: 'Reclass from opening balance equity' },
          { accId: ownerCapitalAccId, debit: 0, credit: Number(input.amount || 0), note: 'Owner capital' },
        ],
      });

      return capital_id;
    });

    const created = await this.getCapitalContributionById(capitalId, scope);
    if (!created) throw ApiError.internal('Failed to load created capital entry');
    return created;
  },

  async getCapitalContributionById(id: number, scope: BranchScope): Promise<CapitalContribution | null> {
    await ensureCapitalSchema();
    const params: Array<number | number[]> = [id];
    let scopeSql = '';
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      scopeSql = ` AND cc.branch_id = ANY($${params.length})`;
    }
    const row = await queryOne<{
      capital_id: number;
      branch_id: number;
      owner_name: string;
      amount: string | number;
      share_pct: string | number;
      date: string;
      account_id: number;
      account_name: string;
      note: string | null;
      created_by: number | null;
      created_by_name: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
         cc.capital_id,
         cc.branch_id,
         cc.owner_name,
         cc.amount::text AS amount,
         cc.share_pct::text AS share_pct,
         cc.contribution_date::text AS date,
         cc.acc_id AS account_id,
         a.name AS account_name,
         cc.note,
         cc.created_by,
         COALESCE(u.full_name, u.name, u.username) AS created_by_name,
         cc.created_at::text AS created_at,
         cc.updated_at::text AS updated_at
       FROM ims.capital_contributions cc
       JOIN ims.accounts a ON a.acc_id = cc.acc_id
       LEFT JOIN ims.users u ON u.user_id = cc.created_by
      WHERE cc.capital_id = $1${scopeSql}
      LIMIT 1`,
      params
    );
    if (!row) return null;
    return {
      capital_id: Number(row.capital_id),
      branch_id: Number(row.branch_id),
      owner_name: row.owner_name,
      amount: Number(row.amount || 0),
      share_pct: Number(row.share_pct || 0),
      date: row.date,
      account_id: Number(row.account_id),
      account_name: row.account_name,
      note: row.note,
      created_by: row.created_by ? Number(row.created_by) : null,
      created_by_name: row.created_by_name,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async getOwnerDrawingById(id: number, scope: BranchScope): Promise<OwnerDrawing | null> {
    await ensureCapitalSchema();
    const params: Array<number | number[]> = [id];
    let scopeSql = '';
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      scopeSql = ` AND od.branch_id = ANY($${params.length})`;
    }

    const row = await queryOne<{
      draw_id: number;
      branch_id: number;
      owner_name: string;
      amount: string | number;
      date: string;
      account_id: number;
      account_name: string;
      note: string | null;
      created_by: number | null;
      created_by_name: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT
         od.draw_id,
         od.branch_id,
         od.owner_name,
         od.amount::text AS amount,
         od.draw_date::text AS date,
         od.acc_id AS account_id,
         a.name AS account_name,
         od.note,
         od.created_by,
         COALESCE(u.full_name, u.name, u.username) AS created_by_name,
         od.created_at::text AS created_at,
         od.updated_at::text AS updated_at
       FROM ims.owner_drawings od
       JOIN ims.accounts a ON a.acc_id = od.acc_id
       LEFT JOIN ims.users u ON u.user_id = od.created_by
      WHERE od.draw_id = $1${scopeSql}
      LIMIT 1`,
      params
    );

    if (!row) return null;
    return {
      draw_id: Number(row.draw_id),
      branch_id: Number(row.branch_id),
      owner_name: row.owner_name,
      amount: Number(row.amount || 0),
      date: row.date,
      account_id: Number(row.account_id),
      account_name: row.account_name,
      note: row.note,
      created_by: row.created_by ? Number(row.created_by) : null,
      created_by_name: row.created_by_name,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  },

  async createOwnerDrawing(
    input: {
      ownerName: string;
      amount: number;
      date: string;
      accountId?: number;
      note?: string | null;
      branchId?: number;
    },
    scope: BranchScope,
    userId: number
  ): Promise<OwnerDrawing> {
    await ensureCapitalSchema();
    const branchId = pickBranchForWrite(scope, input.branchId);
    const ownerName = compactOwnerName(input.ownerName);
    if (!ownerName) throw ApiError.badRequest('Owner name is required');

    if (await isCapitalDateLocked(branchId, input.date)) {
      throw ApiError.badRequest('Cannot create drawing entry in a closed accounting period');
    }

    const availableEquity = await getOwnerAvailableEquity(branchId, ownerName);

    if (availableEquity <= 0) {
      throw ApiError.badRequest('No available owner equity to draw');
    }
    if (input.amount > availableEquity) {
      throw ApiError.badRequest(`Draw amount exceeds available equity (${availableEquity.toFixed(2)})`);
    }

    const payoutAccount = input.accountId
      ? await queryOne<{ acc_id: number; account_type: string }>(
          `SELECT acc_id, account_type
             FROM ims.accounts
            WHERE acc_id = $1
              AND branch_id = $2
              AND is_active = TRUE`,
          [input.accountId, branchId]
        )
      : await queryOne<{ acc_id: number; account_type: string }>(
          `SELECT acc_id, account_type
             FROM ims.accounts
            WHERE branch_id = $1
              AND is_active = TRUE
              AND account_type = 'asset'
            ORDER BY
              CASE
                WHEN name ILIKE '%cash%' THEN 0
                WHEN name ILIKE '%bank%' THEN 1
                ELSE 2
              END,
              acc_id ASC
            LIMIT 1`,
          [branchId]
        );

    if (!payoutAccount) {
      throw ApiError.badRequest('No active payout account found for this branch');
    }
    if ((payoutAccount.account_type || 'asset') !== 'asset') {
      throw ApiError.badRequest('Payout account must be an asset (cash/bank) account');
    }

    const payoutAccountId = Number(payoutAccount.acc_id);
    const ownerCapitalAccId = await ensureOwnerCapitalAccount(branchId);

    const drawId = await withTransaction(async (client) => {
      const rowRes = await client.query<{ draw_id: number }>(
        `INSERT INTO ims.owner_drawings
           (branch_id, owner_name, amount, draw_date, acc_id, equity_acc_id, note, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)
         RETURNING draw_id`,
        [branchId, ownerName, input.amount, input.date, payoutAccountId, ownerCapitalAccId, input.note || null, userId]
      );
      const draw_id = Number(rowRes.rows[0]?.draw_id || 0);
      if (!draw_id) throw ApiError.internal('Failed to create owner drawing');

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'owner_drawings'
            AND ref_id = $2`,
        [branchId, draw_id]
      );

      const memo = `[DRAWING] ${ownerName}${input.note ? ` - ${input.note}` : ''}`;
      const coa = await ensureCoaAccounts(client, branchId, ['ownerDrawings']);
      await postGl(client, {
        branchId,
        txnDate: input.date || null,
        txnType: 'owner_drawing',
        refTable: 'owner_drawings',
        refId: draw_id,
        note: memo,
        lines: [
          { accId: coa.ownerDrawings, debit: Number(input.amount || 0), credit: 0, note: 'Owner drawings' },
          { accId: payoutAccountId, debit: 0, credit: Number(input.amount || 0), note: 'Cash/bank paid out' },
        ],
      });

      await client.query(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) - $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [input.amount, branchId, payoutAccountId]
      );

      return draw_id;
    });

    const created = await this.getOwnerDrawingById(drawId, scope);
    if (!created) throw ApiError.internal('Failed to load created drawing entry');
    return created;
  },

  async updateOwnerDrawing(
    id: number,
    input: { ownerName?: string; amount?: number; date?: string; accountId?: number; note?: string | null },
    scope: BranchScope,
    userId: number
  ): Promise<OwnerDrawing> {
    void userId;
    await ensureCapitalSchema();
    const existing = await queryOne<{
      draw_id: number;
      branch_id: number;
      owner_name: string;
      amount: string | number;
      draw_date: string;
      acc_id: number;
      equity_acc_id: number;
      note: string | null;
      journal_id: number | null;
    }>(
      `SELECT draw_id, branch_id, owner_name, amount::text AS amount, draw_date::text, acc_id, equity_acc_id, note, journal_id
         FROM ims.owner_drawings
        WHERE draw_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Drawing record not found');
    assertBranchAccess(scope, Number(existing.branch_id));

    const prevAmount = Number(existing.amount || 0);
    const prevAccountId = Number(existing.acc_id);

    const next = {
      ownerName: compactOwnerName(input.ownerName ?? existing.owner_name),
      amount: input.amount ?? Number(existing.amount),
      date: input.date ?? existing.draw_date,
      accountId: input.accountId ?? Number(existing.acc_id),
      note: input.note !== undefined ? input.note : existing.note,
    };

    if (!next.ownerName) throw ApiError.badRequest('Owner name is required');
    if (!Number.isFinite(next.amount) || next.amount <= 0) throw ApiError.badRequest('Amount must be greater than 0');
    if (
      (await isCapitalDateLocked(Number(existing.branch_id), existing.draw_date)) ||
      (await isCapitalDateLocked(Number(existing.branch_id), next.date))
    ) {
      throw ApiError.badRequest('Cannot update drawing entry in a closed accounting period');
    }

    const payoutAccount = await queryOne<{ acc_id: number; account_type: string }>(
      `SELECT acc_id, account_type
         FROM ims.accounts
        WHERE acc_id = $1
          AND branch_id = $2
          AND is_active = TRUE`,
      [next.accountId, existing.branch_id]
    );
    if (!payoutAccount) {
      throw ApiError.badRequest('Payout account not found in selected branch');
    }
    if ((payoutAccount.account_type || 'asset') !== 'asset') {
      throw ApiError.badRequest('Payout account must be an asset (cash/bank) account');
    }

    const availableEquity = await getOwnerAvailableEquity(Number(existing.branch_id), next.ownerName, { excludeDrawingId: id });
    if (availableEquity <= 0) {
      throw ApiError.badRequest('No available owner equity to draw');
    }
    if (next.amount > availableEquity) {
      throw ApiError.badRequest(`Draw amount exceeds available equity (${availableEquity.toFixed(2)})`);
    }

    const nextAccountId = Number(next.accountId);

    const updated = await withTransaction(async (client) => {
      if (existing.journal_id) {
        await client.query(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'owner_drawings'
            AND ref_id = $2`,
        [Number(existing.branch_id), id]
      );

      await client.query(
        `UPDATE ims.owner_drawings
            SET owner_name = $2,
                amount = $3,
                draw_date = $4::date,
                acc_id = $5,
                note = $6,
                journal_id = NULL,
                updated_at = NOW()
          WHERE draw_id = $1`,
        [id, next.ownerName, next.amount, next.date, nextAccountId, next.note || null]
      );

      const memo = `[DRAWING] ${next.ownerName}${next.note ? ` - ${next.note}` : ''}`;
      const coa = await ensureCoaAccounts(client, Number(existing.branch_id), ['ownerDrawings']);
      await postGl(client, {
        branchId: Number(existing.branch_id),
        txnDate: next.date || null,
        txnType: 'owner_drawing',
        refTable: 'owner_drawings',
        refId: id,
        note: memo,
        lines: [
          { accId: coa.ownerDrawings, debit: Number(next.amount || 0), credit: 0, note: 'Owner drawings' },
          { accId: nextAccountId, debit: 0, credit: Number(next.amount || 0), note: 'Cash/bank paid out' },
        ],
      });

      // Reverse old cash impact, then apply new.
      await client.query(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) + $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [prevAmount, Number(existing.branch_id), prevAccountId]
      );
      await client.query(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) - $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [Number(next.amount), Number(existing.branch_id), nextAccountId]
      );

      const reloaded = await this.getOwnerDrawingById(id, scope);
      if (!reloaded) throw ApiError.internal('Failed to load updated drawing entry');
      return reloaded;
    });

    return updated;
  },

  async deleteOwnerDrawing(id: number, scope: BranchScope): Promise<void> {
    await ensureCapitalSchema();
    const existing = await queryOne<{
      draw_id: number;
      branch_id: number;
      amount: string | number;
      draw_date: string;
      acc_id: number;
      equity_acc_id: number;
      journal_id: number | null;
    }>(
      `SELECT draw_id, branch_id, amount::text AS amount, draw_date::text, acc_id, equity_acc_id, journal_id
         FROM ims.owner_drawings
        WHERE draw_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Drawing record not found');
    assertBranchAccess(scope, Number(existing.branch_id));
    if (await isCapitalDateLocked(Number(existing.branch_id), existing.draw_date)) {
      throw ApiError.badRequest('Cannot delete: accounting period is closed for this date');
    }

    await withTransaction(async (client) => {
      if (existing.journal_id) {
        await client.query(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

      // Reverse cash movement (drawing reduced cash).
      await client.query(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) + $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [Number(existing.amount || 0), Number(existing.branch_id), Number(existing.acc_id)]
      );

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'owner_drawings'
            AND ref_id = $2`,
        [Number(existing.branch_id), id]
      );

      await client.query(`DELETE FROM ims.owner_drawings WHERE draw_id = $1`, [id]);
    });
  },

  async updateCapitalContribution(
    id: number,
    input: { ownerName?: string; amount?: number; sharePct?: number; date?: string; note?: string | null },
    scope: BranchScope,
    userId: number
  ): Promise<CapitalContribution> {
    void userId;
    await ensureCapitalSchema();
    const existing = await queryOne<{
      capital_id: number;
      branch_id: number;
      owner_name: string;
      amount: number;
      share_pct: number;
      contribution_date: string;
      acc_id: number;
      equity_acc_id: number;
      note: string | null;
      journal_id: number | null;
    }>(
      `SELECT capital_id, branch_id, owner_name, amount, share_pct, contribution_date::text, acc_id, equity_acc_id, note, journal_id
         FROM ims.capital_contributions
        WHERE capital_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Capital record not found');
    assertBranchAccess(scope, Number(existing.branch_id));

    const next = {
      ownerName: compactOwnerName(input.ownerName ?? existing.owner_name),
      amount: input.amount ?? Number(existing.amount),
      sharePct: input.sharePct ?? Number(existing.share_pct || 0),
      date: input.date ?? existing.contribution_date,
      note: input.note !== undefined ? input.note : existing.note,
    };

    if (!next.ownerName) throw ApiError.badRequest('Owner name is required');
    if (next.amount <= 0) throw ApiError.badRequest('Amount must be greater than 0');
    if (
      (await isCapitalDateLocked(Number(existing.branch_id), existing.contribution_date)) ||
      (await isCapitalDateLocked(Number(existing.branch_id), next.date))
    ) {
      throw ApiError.badRequest('Cannot update capital entry in a closed accounting period');
    }

    const updated = await withTransaction(async (client) => {
      if (existing.journal_id) {
        await client.query(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'capital_contributions'
            AND ref_id = $2`,
        [Number(existing.branch_id), id]
      );

      await client.query(
        `UPDATE ims.capital_contributions
            SET owner_name = $2,
                amount = $3,
                share_pct = $4,
                contribution_date = $5::date,
                note = $6,
                journal_id = NULL,
                updated_at = NOW()
          WHERE capital_id = $1`,
        [id, next.ownerName, next.amount, Number(next.sharePct || 0), next.date, next.note || null]
      );

      const memo = `[CAPITAL] ${next.ownerName}${next.note ? ` - ${next.note}` : ''}`;
      const coa = await ensureCoaAccounts(client, Number(existing.branch_id), ['openingBalanceEquity']);
      const sourceEquityAccId = coa.openingBalanceEquity;
      await postGl(client, {
        branchId: Number(existing.branch_id),
        txnDate: next.date || null,
        txnType: 'capital_contribution',
        refTable: 'capital_contributions',
        refId: id,
        note: memo,
        lines: [
          { accId: sourceEquityAccId, debit: Number(next.amount || 0), credit: 0, note: 'Reclass from opening balance equity' },
          { accId: Number(existing.equity_acc_id), debit: 0, credit: Number(next.amount || 0), note: 'Owner capital' },
        ],
      });

      // Keep contribution's acc_id pointing to the equity source (not cash/bank).
      await client.query(`UPDATE ims.capital_contributions SET acc_id = $2 WHERE capital_id = $1`, [id, sourceEquityAccId]);

      const reloaded = await this.getCapitalContributionById(id, scope);
      if (!reloaded) throw ApiError.internal('Failed to load updated capital entry');
      return reloaded;
    });

    return updated;
  },

  async deleteCapitalContribution(id: number, scope: BranchScope): Promise<void> {
    await ensureCapitalSchema();
    const existing = await queryOne<{
      capital_id: number;
      branch_id: number;
      amount: number;
      contribution_date: string;
      acc_id: number;
      equity_acc_id: number;
      journal_id: number | null;
    }>(
      `SELECT capital_id, branch_id, amount, contribution_date::text, acc_id, equity_acc_id, journal_id
         FROM ims.capital_contributions
        WHERE capital_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Capital record not found');
    assertBranchAccess(scope, Number(existing.branch_id));
    if (await isCapitalDateLocked(Number(existing.branch_id), existing.contribution_date)) {
      throw ApiError.badRequest('Cannot delete: accounting period is closed for this date');
    }

    await withTransaction(async (client) => {
      if (existing.journal_id) {
        await client.query(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'capital_contributions'
            AND ref_id = $2`,
        [Number(existing.branch_id), id]
      );

      await client.query(`DELETE FROM ims.capital_contributions WHERE capital_id = $1`, [id]);
    });
  },

  async getOpeningBalanceCleanupInfo(scope: BranchScope, branchId: number) {
    assertBranchAccess(scope, branchId);
    await ensureReclassSchema();

    return withTransaction(async (client) => {
      const coa = await ensureCoaAccounts(client, branchId, ['openingBalanceEquity', 'retainedEarnings', 'ownerCapital']);
      const ids = [coa.openingBalanceEquity, coa.retainedEarnings, coa.ownerCapital];
      const rows = (
        await client.query<{ acc_id: number; name: string; balance: string }>(
          `SELECT acc_id, name, balance::text AS balance
             FROM ims.accounts
            WHERE branch_id = $1
              AND acc_id = ANY($2)
            ORDER BY acc_id ASC`,
          [branchId, ids]
        )
      ).rows;

      const map = new Map(
        rows.map((row) => [
          Number(row.acc_id),
          { acc_id: Number(row.acc_id), name: row.name, balance: Number(row.balance || 0) },
        ])
      );

      return {
        branchId,
        openingBalanceEquity:
          map.get(coa.openingBalanceEquity) || { acc_id: coa.openingBalanceEquity, name: 'Opening Balance Equity', balance: 0 },
        retainedEarnings: map.get(coa.retainedEarnings) || { acc_id: coa.retainedEarnings, name: 'Retained Earnings', balance: 0 },
        ownerCapital: map.get(coa.ownerCapital) || { acc_id: coa.ownerCapital, name: 'Owner Capital', balance: 0 },
      };
    });
  },

  async transferOpeningBalanceEquity(
    input: { branchId?: number; target: 'retained' | 'capital'; date?: string; note?: string | null },
    scope: BranchScope,
    userId: number
  ) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const entryDate = (input.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const note = (input.note || '').trim() || null;

    if (await isCapitalDateLocked(branchId, entryDate)) {
      throw ApiError.badRequest('Cannot post cleanup entry in a closed accounting period');
    }

    await ensureReclassSchema();

    return withTransaction(async (client) => {
      const coa = await ensureCoaAccounts(client, branchId, ['openingBalanceEquity', 'retainedEarnings', 'ownerCapital']);
      const fromAccId = coa.openingBalanceEquity;
      const toAccId = input.target === 'capital' ? coa.ownerCapital : coa.retainedEarnings;
      if (fromAccId === toAccId) throw ApiError.badRequest('Source and destination accounts must differ');

      const from = await lockAccountBalance(client, branchId, fromAccId);
      const to = await lockAccountBalance(client, branchId, toAccId);

      const amount = roundMoney(Math.abs(from.balance));
      if (amount <= 0.005) {
        return {
          branchId,
          posted: false,
          message: 'Opening Balance Equity is already zero',
          amount: 0,
          fromAccount: from,
          toAccount: to,
        };
      }

      const row = (
        await client.query<{ reclass_id: number }>(
          `INSERT INTO ims.account_reclassifications
             (branch_id, from_acc_id, to_acc_id, amount, entry_date, note, created_by)
           VALUES ($1, $2, $3, $4, $5::date, $6, $7)
           RETURNING reclass_id`,
          [branchId, fromAccId, toAccId, amount, entryDate, note, userId || null]
        )
      ).rows[0];
      const reclassId = Number(row?.reclass_id || 0);
      if (!reclassId) throw ApiError.internal('Failed to create account reclassification');

      if (from.balance >= 0) {
        await client.query(`UPDATE ims.accounts SET balance = balance - $3 WHERE branch_id = $1 AND acc_id = $2`, [branchId, fromAccId, amount]);
        await client.query(`UPDATE ims.accounts SET balance = balance + $3 WHERE branch_id = $1 AND acc_id = $2`, [branchId, toAccId, amount]);
        await postGl(client, {
          branchId,
          txnDate: entryDate,
          txnType: 'other',
          refTable: 'account_reclassifications',
          refId: reclassId,
          note: `Opening Balance Equity cleanup -> ${to.name}${note ? ` - ${note}` : ''}`,
          lines: [
            { accId: fromAccId, debit: amount, credit: 0, note: 'Clear Opening Balance Equity' },
            { accId: toAccId, debit: 0, credit: amount, note: 'Transfer to target equity' },
          ],
        });
      } else {
        await client.query(`UPDATE ims.accounts SET balance = balance + $3 WHERE branch_id = $1 AND acc_id = $2`, [branchId, fromAccId, amount]);
        await client.query(`UPDATE ims.accounts SET balance = balance - $3 WHERE branch_id = $1 AND acc_id = $2`, [branchId, toAccId, amount]);
        await postGl(client, {
          branchId,
          txnDate: entryDate,
          txnType: 'other',
          refTable: 'account_reclassifications',
          refId: reclassId,
          note: `Opening Balance Equity cleanup -> ${to.name}${note ? ` - ${note}` : ''}`,
          lines: [
            { accId: toAccId, debit: amount, credit: 0, note: 'Transfer to target equity' },
            { accId: fromAccId, debit: 0, credit: amount, note: 'Clear Opening Balance Equity' },
          ],
        });
      }

      const refreshed = await this.getOpeningBalanceCleanupInfo(scope, branchId);
      return { branchId, posted: true, amount, reclassId, info: refreshed };
    });
  },

  async getCapitalReport(
    scope: BranchScope,
    input: { owner?: string; fromDate?: string; toDate?: string }
  ): Promise<CapitalReportSummary> {
    await ensureCapitalSchema();
    const where: string[] = [];
    const params: Array<string | number | number[]> = [];

    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`cc.branch_id = ANY($${params.length})`);
    }
    if (input.owner) {
      params.push(`%${input.owner}%`);
      where.push(`cc.owner_name ILIKE $${params.length}`);
    }
    if (input.fromDate && input.toDate) {
      params.push(input.fromDate, input.toDate);
      where.push(`cc.contribution_date BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(cc.amount), 0)::text AS total
         FROM ims.capital_contributions cc
         ${whereSql}`,
      params
    );

    const byOwner = await queryMany<{ owner_name: string; total_amount: string }>(
      `SELECT cc.owner_name, COALESCE(SUM(cc.amount), 0)::text AS total_amount
         FROM ims.capital_contributions cc
         ${whereSql}
        GROUP BY cc.owner_name
        ORDER BY total_amount::numeric DESC, cc.owner_name`,
      params
    );

    const byAccount = await queryMany<{ account_id: number; account_name: string; total_amount: string }>(
      `SELECT cc.acc_id AS account_id, a.name AS account_name, COALESCE(SUM(cc.amount), 0)::text AS total_amount
         FROM ims.capital_contributions cc
         JOIN ims.accounts a ON a.acc_id = cc.acc_id
         ${whereSql}
        GROUP BY cc.acc_id, a.name
        ORDER BY total_amount::numeric DESC, a.name`,
      params
    );

    return {
      total_capital: Number(totalRow?.total || 0),
      by_owner: byOwner.map((row) => ({ owner_name: row.owner_name, total_amount: Number(row.total_amount || 0) })),
      by_account: byAccount.map((row) => ({
        account_id: Number(row.account_id),
        account_name: row.account_name,
        total_amount: Number(row.total_amount || 0),
      })),
    };
  },
};
