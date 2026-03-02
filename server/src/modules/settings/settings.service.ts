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
        OR account_type NOT IN ('asset', 'equity')
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
           AND t.relname = 'accounts'
           AND c.conname = 'chk_accounts_account_type'
      ) THEN
        ALTER TABLE ims.accounts
          ADD CONSTRAINT chk_accounts_account_type
          CHECK (account_type IN ('asset', 'equity'));
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
           AND e.enumlabel = 'capital_contribution'
      ) THEN
        ALTER TYPE ims.account_txn_type_enum ADD VALUE 'capital_contribution';
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
    CREATE INDEX IF NOT EXISTS idx_capital_contributions_branch_date
      ON ims.capital_contributions(branch_id, contribution_date DESC, capital_id DESC)
  `);

  await queryMany(`
    CREATE INDEX IF NOT EXISTS idx_capital_contributions_branch_owner
      ON ims.capital_contributions(branch_id, owner_name)
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
          SET account_type = 'equity'
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

const ensureReversibleCapitalBalances = async (
  receivingAccId: number,
  equityAccId: number,
  amount: number
): Promise<void> => {
  const rows = await queryMany<{ acc_id: number; balance: string | number }>(
    `SELECT acc_id, balance::text AS balance
       FROM ims.accounts
      WHERE acc_id = ANY($1::bigint[])`,
    [[receivingAccId, equityAccId]]
  );
  const map = new Map(rows.map((row) => [Number(row.acc_id), Number(row.balance || 0)]));
  const receivingBalance = map.get(receivingAccId) ?? 0;
  const equityBalance = map.get(equityAccId) ?? 0;
  if (receivingBalance < amount) {
    throw ApiError.badRequest('Cannot reverse this capital record: receiving account balance is insufficient');
  }
  if (equityBalance < amount) {
    throw ApiError.badRequest('Cannot reverse this capital record: Owner Capital balance is insufficient');
  }
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
           (branch_id, owner_name, amount, contribution_date, acc_id, equity_acc_id, note, created_by)
         VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8)
         RETURNING capital_id`,
        [branchId, input.ownerName, input.amount, input.date, receivingAccountId, ownerCapitalAccId, input.note || null, userId]
      );
      if (!row) throw ApiError.internal('Failed to create capital entry');

      const journal = await queryOne<{ journal_id: number }>(
        `INSERT INTO ims.journal_entries (branch_id, entry_date, memo, source_table, source_id, created_by)
         VALUES ($1, $2::date, $3, 'capital_contributions', $4, $5)
         RETURNING journal_id`,
        [branchId, input.date, input.note || `Capital contribution by ${input.ownerName}`, row.capital_id, userId]
      );
      if (!journal) throw ApiError.internal('Failed to create journal entry');

      await queryOne(
        `INSERT INTO ims.journal_lines (journal_id, acc_id, debit, credit, note)
         VALUES ($1, $2, $3, 0, $4), ($1, $5, 0, $3, $4)`,
        [journal.journal_id, receivingAccountId, input.amount, input.note || null, ownerCapitalAccId]
      );

      await queryOne(
        `UPDATE ims.capital_contributions
            SET journal_id = $2
          WHERE capital_id = $1`,
        [row.capital_id, journal.journal_id]
      );

      // Operational cash movement table (legacy): credit means inflow for this system.
      await queryOne(
        `INSERT INTO ims.account_transactions
           (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, txn_date, note)
         VALUES ($1, $2, 'capital_contribution', 'capital_contributions', $3, 0, $4, $5::date, $6)`,
        [branchId, receivingAccountId, row.capital_id, input.amount, input.date, input.note || null]
      );

      await queryOne(
        `UPDATE ims.accounts SET balance = balance + $2 WHERE acc_id = $1`,
        [receivingAccountId, input.amount]
      );
      await queryOne(
        `UPDATE ims.accounts SET balance = balance + $2 WHERE acc_id = $1`,
        [ownerCapitalAccId, input.amount]
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

  async updateCapitalContribution(
    id: number,
    input: { ownerName?: string; amount?: number; date?: string; note?: string | null },
    scope: BranchScope,
    userId: number
  ): Promise<CapitalContribution> {
    await ensureCapitalSchema();
    const existing = await queryOne<{
      capital_id: number;
      branch_id: number;
      owner_name: string;
      amount: number;
      contribution_date: string;
      acc_id: number;
      equity_acc_id: number;
      note: string | null;
      journal_id: number | null;
    }>(
      `SELECT capital_id, branch_id, owner_name, amount, contribution_date::text, acc_id, equity_acc_id, note, journal_id
         FROM ims.capital_contributions
        WHERE capital_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Capital record not found');
    assertBranchAccess(scope, Number(existing.branch_id));

    const next = {
      ownerName: input.ownerName ?? existing.owner_name,
      amount: input.amount ?? Number(existing.amount),
      date: input.date ?? existing.contribution_date,
      accountId: Number(existing.acc_id),
      note: input.note !== undefined ? input.note : existing.note,
      equityAccId: Number(existing.equity_acc_id),
    };

    if (next.amount <= 0) throw ApiError.badRequest('Amount must be greater than 0');
    if (await isCapitalDateLocked(Number(existing.branch_id), existing.contribution_date) || await isCapitalDateLocked(Number(existing.branch_id), next.date)) {
      throw ApiError.badRequest('Cannot update capital entry in a closed accounting period');
    }

    const accountChanged = false;
    const amountDelta = Number(next.amount) - Number(existing.amount);

    await queryOne('BEGIN');
    try {
      const balanceAccIds = Array.from(new Set([Number(existing.acc_id), Number(next.accountId), Number(existing.equity_acc_id)]));
      const balanceRows = await queryMany<{ acc_id: number; balance: string | number }>(
        `SELECT acc_id, balance::text AS balance
           FROM ims.accounts
          WHERE acc_id = ANY($1::bigint[])
          FOR UPDATE`,
        [balanceAccIds]
      );
      const balances = new Map(balanceRows.map((row) => [Number(row.acc_id), Number(row.balance || 0)]));
      const oldReceivingBalance = balances.get(Number(existing.acc_id)) ?? 0;
      const equityBalance = balances.get(Number(existing.equity_acc_id)) ?? 0;

      if (accountChanged && oldReceivingBalance < Number(existing.amount)) {
        throw ApiError.badRequest('Cannot move capital to another account: previous receiving account balance is insufficient');
      }
      if (!accountChanged && amountDelta < 0 && oldReceivingBalance < Math.abs(amountDelta)) {
        throw ApiError.badRequest('Cannot reduce this capital record: receiving account balance is insufficient');
      }
      if (amountDelta < 0 && equityBalance < Math.abs(amountDelta)) {
        throw ApiError.badRequest('Cannot reduce this capital record: Owner Capital balance is insufficient');
      }

      if (accountChanged) {
        await queryOne(`UPDATE ims.accounts SET balance = balance - $2 WHERE acc_id = $1`, [existing.acc_id, existing.amount]);
        await queryOne(`UPDATE ims.accounts SET balance = balance + $2 WHERE acc_id = $1`, [next.accountId, next.amount]);
      } else {
        if (amountDelta !== 0) {
          if (amountDelta > 0) {
            await queryOne(`UPDATE ims.accounts SET balance = balance + $2 WHERE acc_id = $1`, [existing.acc_id, amountDelta]);
          } else {
            await queryOne(`UPDATE ims.accounts SET balance = balance - $2 WHERE acc_id = $1`, [existing.acc_id, Math.abs(amountDelta)]);
          }
        }
      }
      if (amountDelta !== 0) {
        await queryOne(`UPDATE ims.accounts SET balance = balance + $2 WHERE acc_id = $1`, [existing.equity_acc_id, amountDelta]);
      }

      let journalId = existing.journal_id ?? null;
      if (!journalId) {
        const journal = await queryOne<{ journal_id: number }>(
          `INSERT INTO ims.journal_entries (branch_id, entry_date, memo, source_table, source_id, created_by)
           VALUES ($1, $2::date, $3, 'capital_contributions', $4, $5)
           RETURNING journal_id`,
          [existing.branch_id, next.date, next.note || `Capital contribution by ${next.ownerName}`, id, userId]
        );
        if (!journal) throw ApiError.internal('Failed to create journal entry');
        journalId = journal.journal_id;
      } else {
        await queryOne(
          `UPDATE ims.journal_entries
              SET entry_date = $2::date,
                  memo = $3
            WHERE journal_id = $1`,
          [journalId, next.date, next.note || `Capital contribution by ${next.ownerName}`]
        );
        await queryOne(`DELETE FROM ims.journal_lines WHERE journal_id = $1`, [journalId]);
      }

      await queryOne(
        `INSERT INTO ims.journal_lines (journal_id, acc_id, debit, credit, note)
         VALUES ($1, $2, $3, 0, $4), ($1, $5, 0, $3, $4)`,
        [journalId, next.accountId, next.amount, next.note || null, next.equityAccId]
      );

      const updatedTxnRows = await queryMany<{ txn_id: number }>(
        `UPDATE ims.account_transactions
            SET acc_id = $2,
                debit = 0,
                credit = $3,
                txn_date = $4::date,
                note = $5
          WHERE ref_table = 'capital_contributions'
            AND ref_id = $1
          RETURNING txn_id`,
        [id, next.accountId, next.amount, next.date, next.note || null]
      );
      if (updatedTxnRows.length === 0) {
        await queryOne(
          `INSERT INTO ims.account_transactions
             (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, txn_date, note)
           VALUES ($1, $2, 'capital_contribution', 'capital_contributions', $3, 0, $4, $5::date, $6)`,
          [existing.branch_id, next.accountId, id, next.amount, next.date, next.note || null]
        );
      }

      await queryOne(
        `UPDATE ims.capital_contributions
            SET owner_name = $2,
                amount = $3,
                contribution_date = $4::date,
                acc_id = $5,
                note = $6,
                journal_id = $7,
                updated_at = NOW()
          WHERE capital_id = $1`,
        [id, next.ownerName, next.amount, next.date, next.accountId, next.note || null, journalId]
      );

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
    await ensureReversibleCapitalBalances(existing.acc_id, existing.equity_acc_id, existing.amount);

    await queryOne('BEGIN');
    try {
      await queryOne(`UPDATE ims.accounts SET balance = balance - $2 WHERE acc_id = $1`, [existing.acc_id, existing.amount]);
      await queryOne(`UPDATE ims.accounts SET balance = balance - $2 WHERE acc_id = $1`, [existing.equity_acc_id, existing.amount]);

      await queryOne(
        `DELETE FROM ims.account_transactions
          WHERE ref_table = 'capital_contributions'
            AND ref_id = $1`,
        [id]
      );
      if (existing.journal_id) {
        await queryOne(`DELETE FROM ims.journal_entries WHERE journal_id = $1`, [existing.journal_id]);
      }

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
