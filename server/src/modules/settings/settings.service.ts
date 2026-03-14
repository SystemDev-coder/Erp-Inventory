import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope, assertBranchAccess, pickBranchForWrite } from '../../utils/branchScope';

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
  account_name: string;
  institution: string | null;
  balance: number;
}

export interface AssetOverviewFixedAsset {
  asset_id: number;
  asset_name: string;
  purchase_date: string;
  cost: number;
  status: string;
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

const ensureCompanySchema = async (): Promise<void> => {
  if (companySchemaReady) return;
  await queryMany(`
    ALTER TABLE ims.company
      ADD COLUMN IF NOT EXISTS capital_amount NUMERIC(14,2) NOT NULL DEFAULT 0
  `);
  companySchemaReady = true;
};

const ensureCapitalSchema = async (): Promise<void> => {
  if (capitalSchemaReady) return;

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

  // Allow standard COA types used across reports.
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
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_journal_line_amt CHECK ((debit + credit) > 0)
    )
  `);

  await queryMany(`
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

  await queryMany(`
    ALTER TABLE ims.capital_contributions
      ADD COLUMN IF NOT EXISTS share_pct NUMERIC(7,4) NOT NULL DEFAULT 0
  `);

  await queryMany(`
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
    CREATE INDEX IF NOT EXISTS idx_owner_drawings_branch_date
      ON ims.owner_drawings(branch_id, draw_date DESC, draw_id DESC)
  `);

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_owner_drawings_branch_owner
      ON ims.owner_drawings(branch_id, owner_name)
  `);

  capitalSchemaReady = true;
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
  logo_img: row.logo_url,
  banner_img: row.banner_url,
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
    const targetBranchId = pickBranchForWrite(scope, branchId);
    let created = 0;
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
            OR LOWER(name) LIKE 'office furniture%'
            OR LOWER(name) LIKE 'computer%'
            OR LOWER(name) LIKE 'equipment%'
            OR LOWER(name) LIKE 'vehicle%'
            OR LOWER(name) LIKE 'mukeef%'
          )`,
      [targetBranchId]
    );

    return { created };
  },

  async getAssetOverview(scope: BranchScope): Promise<AssetOverviewSummary> {
    const where: string[] = ['a.is_active = TRUE'];
    const params: Array<string | number | number[] | string[]> = [];

    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where.push(`a.branch_id = ANY($${params.length})`);
    }

    params.push(REQUIRED_CURRENT_ASSET_ACCOUNTS.map((name) => name.toLowerCase()));
    where.push(`LOWER(a.name) = ANY($${params.length}::text[])`);

    const currentRows = await queryMany<{
      account_name: string;
      institution: string | null;
      balance: string | number;
    }>(
      `WITH account_balances AS (
         SELECT
           a.acc_id,
           a.name AS account_name,
           NULLIF(BTRIM(a.institution), '') AS institution,
           CASE
             WHEN COUNT(at.txn_id) > 0 THEN COALESCE(SUM(COALESCE(at.credit, 0) - COALESCE(at.debit, 0)), 0)
             ELSE COALESCE(a.balance, 0)
           END::double precision AS dynamic_balance
         FROM ims.accounts a
         LEFT JOIN ims.account_transactions at
           ON at.branch_id = a.branch_id
          AND at.acc_id = a.acc_id
          AND at.txn_type::text NOT IN ('capital_contribution', 'owner_drawing')
          AND COALESCE(at.ref_table, '') NOT IN ('capital_contributions', 'owner_drawings')
         WHERE ${where.join(' AND ')}
         GROUP BY a.acc_id, a.name, a.institution, a.balance
       )
       SELECT
         account_name,
         institution,
         COALESCE(SUM(dynamic_balance), 0)::text AS balance
       FROM account_balances
       GROUP BY account_name, institution
       ORDER BY account_name`,
      params
    );

    const fixedAssetsExists = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM information_schema.tables
          WHERE table_schema = 'ims'
            AND table_name = 'fixed_assets'
       ) AS exists`
    );

    let fixedRows: Array<{
      asset_id: number;
      asset_name: string;
      purchase_date: string;
      cost: string | number;
      status: string;
    }> = [];
    if (fixedAssetsExists?.exists) {
      const fixedWhere: string[] = [];
      const fixedParams: Array<number | number[]> = [];
      if (!scope.isAdmin) {
        fixedParams.push(scope.branchIds);
        fixedWhere.push(`fa.branch_id = ANY($${fixedParams.length})`);
      }
      const fixedWhereSql = fixedWhere.length ? `WHERE ${fixedWhere.join(' AND ')}` : '';
      fixedRows = await queryMany<{
        asset_id: number;
        asset_name: string;
        purchase_date: string;
        cost: string | number;
        status: string;
      }>(
        `SELECT
           fa.asset_id,
           fa.asset_name,
           fa.purchase_date::text AS purchase_date,
           COALESCE(fa.cost, 0)::text AS cost,
           COALESCE(fa.status, 'active') AS status
         FROM ims.fixed_assets fa
         ${fixedWhereSql}
         ORDER BY fa.purchase_date DESC, fa.asset_id DESC`,
        fixedParams
      );
    }

    const byName = new Map(
      currentRows.map((row) => [
        row.account_name.trim().toLowerCase(),
        {
          account_name: row.account_name,
          institution: row.institution,
          balance: Number(row.balance || 0),
        },
      ])
    );
    const current_assets = REQUIRED_CURRENT_ASSET_ACCOUNTS.map((name) => {
      const found = byName.get(name.toLowerCase());
      return (
        found || {
          account_name: name,
          institution: null,
          balance: 0,
        }
      );
    });

    const fixed_assets = fixedRows.map((row) => ({
      asset_id: Number(row.asset_id),
      asset_name: row.asset_name,
      purchase_date: row.purchase_date,
      cost: Number(row.cost || 0),
      status: row.status,
    }));

    return {
      current_assets,
      fixed_assets,
      current_assets_total: current_assets.reduce((sum, row) => sum + Number(row.balance || 0), 0),
      fixed_assets_total: fixed_assets.reduce((sum, row) => sum + Number(row.cost || 0), 0),
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
      accountId?: number;
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
    const account = input.accountId
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
    if (!account) {
      if (!input.accountId) {
        throw ApiError.badRequest('No active asset account found for this branch. Please create one in Accounts.');
      }
      throw ApiError.badRequest('Receiving account not found in selected branch');
    }
    if ((account.account_type || 'asset') !== 'asset') {
      throw ApiError.badRequest('Receiving account must be an asset (cash/bank) account');
    }
    const receivingAccountId = Number(account.acc_id);

    if (await isCapitalDateLocked(branchId, input.date)) {
      throw ApiError.badRequest('Cannot create capital entry in a closed accounting period');
    }

    const ownerCapitalAccId = await ensureOwnerCapitalAccount(branchId);

    await queryOne('BEGIN');
    try {
      const row = await queryOne<{
        capital_id: number;
      }>(
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
          receivingAccountId,
          ownerCapitalAccId,
          input.note || null,
          userId,
        ]
      );
      if (!row) throw ApiError.internal('Failed to create capital entry');

      // Post to cash/bank ledger so Cash Flow + Account balances are correct.
      await queryOne(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'capital_contributions'
            AND ref_id = $2`,
        [branchId, row.capital_id]
      );

      const memo = `[CAPITAL] ${ownerName}${input.note ? ` - ${input.note}` : ''}`;
      await queryOne(
        `INSERT INTO ims.account_transactions
           (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, txn_date, note)
         VALUES ($1, $2, 'capital_contribution', 'capital_contributions', $3, 0, $4, $5::timestamptz, $6)`,
        [branchId, receivingAccountId, row.capital_id, input.amount, input.date, memo]
      );

      await queryOne(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) + $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [input.amount, branchId, receivingAccountId]
      );

      await queryOne('COMMIT');
      const created = await this.getCapitalContributionById(row.capital_id, scope);
      if (!created) throw ApiError.internal('Failed to load created capital entry');
      return created;
    } catch (error) {
      await queryOne('ROLLBACK');
      throw error;
    }
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

    await queryOne('BEGIN');
    try {
      const row = await queryOne<{ draw_id: number }>(
        `INSERT INTO ims.owner_drawings
           (branch_id, owner_name, amount, draw_date, acc_id, equity_acc_id, note, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)
         RETURNING draw_id`,
        [branchId, ownerName, input.amount, input.date, payoutAccountId, ownerCapitalAccId, input.note || null, userId]
      );
      if (!row) throw ApiError.internal('Failed to create owner drawing');

      // Post to cash/bank ledger so Cash Flow + Account balances are correct.
      await queryOne(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'owner_drawings'
            AND ref_id = $2`,
        [branchId, row.draw_id]
      );

      const memo = `[DRAWING] ${ownerName}${input.note ? ` - ${input.note}` : ''}`;
      await queryOne(
        `INSERT INTO ims.account_transactions
           (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, txn_date, note)
         VALUES ($1, $2, 'owner_drawing', 'owner_drawings', $3, $4, 0, $5::timestamptz, $6)`,
        [branchId, payoutAccountId, row.draw_id, input.amount, input.date, memo]
      );

      await queryOne(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) - $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [input.amount, branchId, payoutAccountId]
      );

      await queryOne('COMMIT');
      const created = await this.getOwnerDrawingById(row.draw_id, scope);
      if (!created) throw ApiError.internal('Failed to load created drawing entry');
      return created;
    } catch (error) {
      await queryOne('ROLLBACK');
      throw error;
    }
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

    await queryOne('BEGIN');
    try {
      if (existing.journal_id) {
        await queryOne(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

      // Remove old ledger row before updating.
      await queryOne(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'owner_drawings'
            AND ref_id = $2`,
        [Number(existing.branch_id), id]
      );

      await queryOne(
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
      await queryOne(
        `INSERT INTO ims.account_transactions
           (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, txn_date, note)
         VALUES ($1, $2, 'owner_drawing', 'owner_drawings', $3, $4, 0, $5::timestamptz, $6)`,
        [Number(existing.branch_id), nextAccountId, id, next.amount, next.date, memo]
      );

      // Sync balances for involved cash/bank accounts.
      // Drawing reduces cash: subtract new amount, add back old amount.
      if (prevAccountId === nextAccountId) {
        const diff = Number(next.amount) - prevAmount;
        if (Math.abs(diff) >= 0.01) {
          await queryOne(
            `UPDATE ims.accounts
                SET balance = COALESCE(balance, 0) - $1
              WHERE branch_id = $2
                AND acc_id = $3`,
            [diff, Number(existing.branch_id), nextAccountId]
          );
        }
      } else {
        await queryOne(
          `UPDATE ims.accounts
              SET balance = COALESCE(balance, 0) + $1
            WHERE branch_id = $2
              AND acc_id = $3`,
          [prevAmount, Number(existing.branch_id), prevAccountId]
        );
        await queryOne(
          `UPDATE ims.accounts
              SET balance = COALESCE(balance, 0) - $1
            WHERE branch_id = $2
              AND acc_id = $3`,
          [Number(next.amount), Number(existing.branch_id), nextAccountId]
        );
      }

      await queryOne('COMMIT');
      const updated = await this.getOwnerDrawingById(id, scope);
      if (!updated) throw ApiError.internal('Failed to load updated drawing entry');
      return updated;
    } catch (error) {
      await queryOne('ROLLBACK');
      throw error;
    }
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

    await queryOne('BEGIN');
    try {
      if (existing.journal_id) {
        await queryOne(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

      // Reverse cash movement (drawing reduced cash).
      await queryOne(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) + $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [Number(existing.amount || 0), Number(existing.branch_id), Number(existing.acc_id)]
      );

      await queryOne(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'owner_drawings'
            AND ref_id = $2`,
        [Number(existing.branch_id), id]
      );

      await queryOne(`DELETE FROM ims.owner_drawings WHERE draw_id = $1`, [id]);
      await queryOne('COMMIT');
    } catch (error) {
      await queryOne('ROLLBACK');
      throw error;
    }
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

    const prevAmount = Number(existing.amount || 0);
    const prevAccountId = Number(existing.acc_id);

    const next = {
      ownerName: compactOwnerName(input.ownerName ?? existing.owner_name),
      amount: input.amount ?? Number(existing.amount),
      sharePct: input.sharePct ?? Number(existing.share_pct || 0),
      date: input.date ?? existing.contribution_date,
      accountId: Number(existing.acc_id),
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

    await queryOne('BEGIN');
    try {
      if (existing.journal_id) {
        await queryOne(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

      // Remove old ledger row before updating.
      await queryOne(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'capital_contributions'
            AND ref_id = $2`,
        [Number(existing.branch_id), id]
      );

      await queryOne(
        `UPDATE ims.capital_contributions
            SET owner_name = $2,
                amount = $3,
                share_pct = $4,
                contribution_date = $5::date,
                acc_id = $6,
                note = $7,
                journal_id = NULL,
                updated_at = NOW()
          WHERE capital_id = $1`,
        [id, next.ownerName, next.amount, Number(next.sharePct || 0), next.date, next.accountId, next.note || null]
      );

      const memo = `[CAPITAL] ${next.ownerName}${next.note ? ` - ${next.note}` : ''}`;
      await queryOne(
        `INSERT INTO ims.account_transactions
           (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, txn_date, note)
         VALUES ($1, $2, 'capital_contribution', 'capital_contributions', $3, 0, $4, $5::timestamptz, $6)`,
        [Number(existing.branch_id), next.accountId, id, next.amount, next.date, memo]
      );

      // Sync balances for involved cash/bank accounts.
      // Capital increases cash: add new amount, remove old amount.
      const nextAccountId = Number(next.accountId);
      if (prevAccountId === nextAccountId) {
        const diff = Number(next.amount) - prevAmount;
        if (Math.abs(diff) >= 0.01) {
          await queryOne(
            `UPDATE ims.accounts
                SET balance = COALESCE(balance, 0) + $1
              WHERE branch_id = $2
                AND acc_id = $3`,
            [diff, Number(existing.branch_id), nextAccountId]
          );
        }
      } else {
        await queryOne(
          `UPDATE ims.accounts
              SET balance = COALESCE(balance, 0) - $1
            WHERE branch_id = $2
              AND acc_id = $3`,
          [prevAmount, Number(existing.branch_id), prevAccountId]
        );
        await queryOne(
          `UPDATE ims.accounts
              SET balance = COALESCE(balance, 0) + $1
            WHERE branch_id = $2
              AND acc_id = $3`,
          [Number(next.amount), Number(existing.branch_id), nextAccountId]
        );
      }

      await queryOne('COMMIT');
      const updated = await this.getCapitalContributionById(id, scope);
      if (!updated) throw ApiError.internal('Failed to load updated capital entry');
      return updated;
    } catch (error) {
      await queryOne('ROLLBACK');
      throw error;
    }
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

    await queryOne('BEGIN');
    try {
      if (existing.journal_id) {
        await queryOne(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

      // Reverse cash movement (capital increased cash).
      await queryOne(
        `UPDATE ims.accounts
            SET balance = COALESCE(balance, 0) - $1
          WHERE branch_id = $2
            AND acc_id = $3`,
        [Number(existing.amount || 0), Number(existing.branch_id), Number(existing.acc_id)]
      );

      await queryOne(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'capital_contributions'
            AND ref_id = $2`,
        [Number(existing.branch_id), id]
      );

      await queryOne(`DELETE FROM ims.capital_contributions WHERE capital_id = $1`, [id]);
      await queryOne('COMMIT');
    } catch (error) {
      await queryOne('ROLLBACK');
      throw error;
    }
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
