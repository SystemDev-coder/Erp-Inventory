import { queryMany, queryOne } from '../../db/query';
import { adminQueryMany } from '../../db/adminQuery';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { syncSystemAccountBalancesWithClient } from '../../utils/systemAccounts';
import { postGl } from '../../utils/glPosting';
import { ensureCoaAccounts } from '../../utils/coaDefaults';
import { usersService, UserRow } from '../users/users.service';
import { getUploadedImageUrl } from '../../config/cloudinary';
import {
  CreatePermissionInput,
  CreateRoleInput,
  CreateUserInput,
  UpdatePermissionInput,
  UpdateRoleInput,
  UpdateUserInput,
} from './system.schemas';

export interface SystemInfo {
  system_id: number;
  system_name: string;
  logo_url: string | null;
  banner_image_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemInfoInput {
  systemName?: string;
  logoUrl?: string;
  bannerImageUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface BranchRow {
  branch_id: number;
  branch_name: string;
  location: string | null;
  is_active: boolean;
}

export interface RoleRow {
  role_id: number;
  role_code: string;
  role_name: string;
  description: string | null;
  monthly_salary: number;
  is_system: boolean;
  permission_count: number;
}

type SystemInfoTable = 'system_information' | 'company' | null;
let systemInfoTableCache: SystemInfoTable | null = null;

const detectSystemInfoTable = async (): Promise<SystemInfoTable> => {
  if (systemInfoTableCache !== null) return systemInfoTableCache;
  const rows = await queryMany<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'ims'
        AND table_name IN ('system_information', 'company')`
  );
  const names = new Set(rows.map((row) => row.table_name));
  if (names.has('system_information')) {
    systemInfoTableCache = 'system_information';
    return systemInfoTableCache;
  }
  if (names.has('company')) {
    systemInfoTableCache = 'company';
    return systemInfoTableCache;
  }
  systemInfoTableCache = null;
  return systemInfoTableCache;
};

export interface PermissionRow {
  perm_id: number;
  perm_key: string;
  perm_name: string;
  module: string;
  sub_module: string | null;
  action_type: string | null;
  description: string | null;
}

export interface RolePermissionRow extends PermissionRow {
  has_permission: boolean;
}

export interface AuditLogRow {
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

export type BalanceAuditRow = {
  entity: 'account' | 'customer' | 'supplier' | 'sales_return' | 'purchase_return' | 'stock';
  branch_id: number;
  id: number;
  name?: string | null;
  expected: number;
  actual: number;
  diff: number;
};

export type BalanceAuditResult = {
  issues: BalanceAuditRow[];
  counts: Record<BalanceAuditRow['entity'], number>;
};

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

const normalizeRoleCode = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

let rolesMonthlySalaryReady = false;
const ensureRolesMonthlySalaryColumn = async (): Promise<void> => {
  if (rolesMonthlySalaryReady) return;
  await adminQueryMany(`
    ALTER TABLE ims.roles
      ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(14,2) NOT NULL DEFAULT 0
  `);
  await adminQueryMany(`
    UPDATE ims.roles
       SET monthly_salary = 0
     WHERE monthly_salary IS NULL
  `);
  rolesMonthlySalaryReady = true;
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

const ensureUniqueRoleCode = async (
  baseCode: string,
  excludeRoleId?: number
): Promise<string> => {
  const fallback = baseCode || 'ROLE';
  let candidate = fallback;
  let suffix = 2;

  while (true) {
    const existing = await queryOne<{ role_id: number }>(
      `SELECT role_id
         FROM ims.roles
        WHERE role_code = $1
          AND ($2::bigint IS NULL OR role_id <> $2)
        LIMIT 1`,
      [candidate, excludeRoleId ?? null]
    );

    if (!existing) {
      return candidate;
    }

    candidate = `${fallback}_${suffix++}`.slice(0, 40);
  }
};

export const systemService = {
  async migrateOpeningBalances(branchId?: number): Promise<{
    updated: { customers: number; suppliers: number; customerLedger: number; supplierLedger: number; accounts: number; accountTransactions: number };
  }> {
    const updated = { customers: 0, suppliers: 0, customerLedger: 0, supplierLedger: 0, accounts: 0, accountTransactions: 0 };

    // Ensure columns exist so the app can always use `remaining_balance` as the live outstanding.
    await adminQueryMany(`
      ALTER TABLE ims.customers
        ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0
    `);
    await adminQueryMany(`
      ALTER TABLE ims.suppliers
        ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC(14,2) NOT NULL DEFAULT 0
    `);

    await withTransaction(async (client) => {
      const customerColsRes = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'customers'`
      );
      const customerCols = new Set(customerColsRes.rows.map((r) => r.column_name));
      const supplierColsRes = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'suppliers'`
      );
      const supplierCols = new Set(supplierColsRes.rows.map((r) => r.column_name));

      const customerLedgerExists = Boolean(
        (
          await client.query<{ exists: boolean }>(
            `SELECT EXISTS (
               SELECT 1
                 FROM information_schema.tables
                WHERE table_schema = 'ims'
                  AND table_name = 'customer_ledger'
             ) AS exists`
          )
        ).rows[0]?.exists
      );
      const supplierLedgerExists = Boolean(
        (
          await client.query<{ exists: boolean }>(
            `SELECT EXISTS (
               SELECT 1
                 FROM information_schema.tables
                WHERE table_schema = 'ims'
                  AND table_name = 'supplier_ledger'
             ) AS exists`
          )
        ).rows[0]?.exists
      );

      const branches = await client.query<{ branch_id: number }>(
        branchId
          ? `SELECT branch_id FROM ims.branches WHERE branch_id = $1`
          : `SELECT branch_id FROM ims.branches WHERE is_active = TRUE`,
        branchId ? [branchId] : []
      );

      for (const b of branches.rows) {
        const bid = Number(b.branch_id);

        if (customerCols.has('open_balance') && customerCols.has('remaining_balance')) {
          if (customerLedgerExists) {
            // If we already have an opening-balance ledger row (imported or previously migrated),
            // do NOT insert another one (prevents doubling when user clicks "Prepare Accounts").
            // Also remove any duplicate migrated rows when an opening ledger exists.
            const dedup = await client.query(
              `DELETE FROM ims.customer_ledger cl
                WHERE cl.branch_id = $1
                  AND cl.entry_type = 'adjustment'
                  AND cl.ref_table = 'customers'
                  AND COALESCE(cl.note, '') ILIKE '[OPENING BALANCE] Migrated from open_balance%'
                  AND EXISTS (
                    SELECT 1
                      FROM ims.customer_ledger cl2
                     WHERE cl2.branch_id = cl.branch_id
                       AND cl2.customer_id = cl.customer_id
                       AND (
                         (cl2.entry_type = 'opening' AND cl2.ref_table = 'opening_balance')
                         OR COALESCE(cl2.note, '') ILIKE '[OPENING BALANCE]%'
                       )
                  )`,
              [bid]
            );
            updated.customerLedger += dedup.rowCount ?? 0;

            const ins = await client.query(
              `INSERT INTO ims.customer_ledger
                 (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
               SELECT
                 c.branch_id,
                 c.customer_id,
                 'adjustment',
                 'customers',
                 c.customer_id,
                 NULL,
                 ABS(COALESCE(c.open_balance, 0))::numeric(14,2),
                 0,
                 '[OPENING BALANCE] Migrated from open_balance'
               FROM ims.customers c
               WHERE c.branch_id = $1
                 AND COALESCE(c.open_balance, 0) <> 0
                 AND COALESCE(c.remaining_balance, 0) = 0
                 AND NOT EXISTS (
                   SELECT 1
                     FROM ims.customer_ledger cl
                    WHERE cl.branch_id = c.branch_id
                      AND cl.customer_id = c.customer_id
                      AND (
                        (cl.entry_type = 'opening' AND cl.ref_table = 'opening_balance')
                        OR COALESCE(cl.note, '') ILIKE '[OPENING BALANCE]%'
                      )
                 )`,
              [bid]
            );
            updated.customerLedger += ins.rowCount ?? 0;
          }

          // Only migrate open_balance into remaining_balance when remaining_balance is empty.
          // If remaining_balance already has a value (e.g., imported), we keep it and just clear open_balance.
          const up = await client.query(
            `UPDATE ims.customers
                SET remaining_balance = CASE
                                          WHEN COALESCE(remaining_balance, 0) = 0
                                            THEN ABS(COALESCE(open_balance, 0))::numeric(14,2)
                                          ELSE COALESCE(remaining_balance, 0)
                                        END,
                    open_balance = 0
              WHERE branch_id = $1
                AND COALESCE(open_balance, 0) <> 0`,
            [bid]
          );
          updated.customers += up.rowCount ?? 0;
        }

        if (supplierCols.has('open_balance') && supplierCols.has('remaining_balance')) {
          if (supplierLedgerExists) {
            const dedup = await client.query(
              `DELETE FROM ims.supplier_ledger sl
                WHERE sl.branch_id = $1
                  AND sl.entry_type = 'adjustment'
                  AND sl.ref_table = 'suppliers'
                  AND COALESCE(sl.note, '') ILIKE '[OPENING BALANCE] Migrated from open_balance%'
                  AND EXISTS (
                    SELECT 1
                      FROM ims.supplier_ledger sl2
                     WHERE sl2.branch_id = sl.branch_id
                       AND sl2.supplier_id = sl.supplier_id
                       AND (
                         (sl2.entry_type = 'opening' AND sl2.ref_table = 'opening_balance')
                         OR COALESCE(sl2.note, '') ILIKE '[OPENING BALANCE]%'
                       )
                  )`,
              [bid]
            );
            updated.supplierLedger += dedup.rowCount ?? 0;

            const ins = await client.query(
              `INSERT INTO ims.supplier_ledger
                 (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
               SELECT
                 s.branch_id,
                 s.supplier_id,
                 'adjustment',
                 'suppliers',
                 s.supplier_id,
                 NULL,
                 0,
                 ABS(COALESCE(s.open_balance, 0))::numeric(14,2),
                 '[OPENING BALANCE] Migrated from open_balance'
               FROM ims.suppliers s
               WHERE s.branch_id = $1
                 AND COALESCE(s.open_balance, 0) <> 0
                 AND COALESCE(s.remaining_balance, 0) = 0
                 AND NOT EXISTS (
                   SELECT 1
                     FROM ims.supplier_ledger sl
                    WHERE sl.branch_id = s.branch_id
                      AND sl.supplier_id = s.supplier_id
                      AND (
                        (sl.entry_type = 'opening' AND sl.ref_table = 'opening_balance')
                        OR COALESCE(sl.note, '') ILIKE '[OPENING BALANCE]%'
                      )
                 )`,
              [bid]
            );
            updated.supplierLedger += ins.rowCount ?? 0;
          }

          const up = await client.query(
            `UPDATE ims.suppliers
                SET remaining_balance = CASE
                                          WHEN COALESCE(remaining_balance, 0) = 0
                                            THEN ABS(COALESCE(open_balance, 0))::numeric(14,2)
                                          ELSE COALESCE(remaining_balance, 0)
                                        END,
                    open_balance = 0
              WHERE branch_id = $1
                AND COALESCE(open_balance, 0) <> 0`,
            [bid]
          );
          updated.suppliers += up.rowCount ?? 0;
        }

        // Post a proper opening-balance GL entry for migrated AR/AP so Trial Balance & Balance Sheet reconcile to ledgers.
        // This avoids any need for a Suspense/Auto-balance account.
        const alreadyOpeningArAp = (
          await client.query<{ exists: boolean }>(
            `SELECT EXISTS (
               SELECT 1
                 FROM ims.account_transactions at
                WHERE at.branch_id = $1
                  AND at.ref_table = 'opening_balances'
                  AND at.ref_id = $2
                  AND at.txn_type::text = 'opening'
             ) AS exists`,
            [bid, bid]
          )
        ).rows[0]?.exists;

        if (!alreadyOpeningArAp) {
          const [customerOpening, supplierOpening] = await Promise.all([
            customerLedgerExists
              ? client
                  .query<{ amount: string }>(
                    `SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0)::text AS amount
                       FROM ims.customer_ledger
                      WHERE branch_id = $1
                        AND (
                          (entry_type = 'opening' AND ref_table = 'opening_balance')
                          OR COALESCE(note, '') ILIKE '[OPENING BALANCE]%'
                        )`,
                    [bid]
                  )
                  .then((r) => Number(r.rows[0]?.amount || 0))
              : 0,
            supplierLedgerExists
              ? client
                  .query<{ amount: string }>(
                    `SELECT COALESCE(SUM(COALESCE(credit, 0) - COALESCE(debit, 0)), 0)::text AS amount
                       FROM ims.supplier_ledger
                      WHERE branch_id = $1
                        AND (
                          (entry_type = 'opening' AND ref_table = 'opening_balance')
                          OR COALESCE(note, '') ILIKE '[OPENING BALANCE]%'
                        )`,
                    [bid]
                  )
                  .then((r) => Number(r.rows[0]?.amount || 0))
              : 0,
          ]);

          const openAr = Math.round(Math.max(customerOpening, 0) * 100) / 100;
          const openAp = Math.round(Math.max(supplierOpening, 0) * 100) / 100;
          if (openAr > 0 || openAp > 0) {
            const coa = await ensureCoaAccounts(client, bid, ['accountsReceivable', 'accountsPayable', 'openingBalanceEquity']);
            const lines = [
              ...(openAr > 0
                ? [
                    { accId: coa.accountsReceivable, debit: openAr, credit: 0, note: 'Opening AR (customers)' },
                    { accId: coa.openingBalanceEquity, debit: 0, credit: openAr, note: 'Offset (Opening Balance Equity)' },
                  ]
                : []),
              ...(openAp > 0
                ? [
                    { accId: coa.openingBalanceEquity, debit: openAp, credit: 0, note: 'Offset (Opening Balance Equity)' },
                    { accId: coa.accountsPayable, debit: 0, credit: openAp, note: 'Opening AP (suppliers)' },
                  ]
                : []),
            ];

            await postGl(client, {
              branchId: bid,
              txnType: 'opening',
              refTable: 'opening_balances',
              refId: bid,
              note: 'Opening AR/AP migrated from customer/supplier opening balances',
              lines,
            });

            updated.accountTransactions += lines.length;
          }
        }

        // Migrate legacy `accounts.balance` values into proper opening-balance GL lines when there is no GL history.
        const coa = await ensureCoaAccounts(client, bid, ['openingBalanceEquity']);
        const accountsToPost = await client.query<{
          acc_id: number;
          name: string;
          balance: string;
          account_type: string;
          created_at: string | null;
        }>(
          `SELECT
              a.acc_id,
              a.name,
              a.balance::text AS balance,
              COALESCE(a.account_type::text, 'asset') AS account_type,
              a.created_at::text AS created_at
           FROM ims.accounts a
           WHERE a.branch_id = $1
             AND a.is_active = TRUE
             AND ABS(COALESCE(a.balance, 0)) > 0.000001
             AND NOT EXISTS (
               SELECT 1
                 FROM ims.account_transactions at
                WHERE at.branch_id = a.branch_id
                  AND at.acc_id = a.acc_id
             )
             AND NOT EXISTS (
               SELECT 1
                 FROM ims.account_transactions at2
                WHERE at2.branch_id = a.branch_id
                  AND at2.ref_table = 'accounts'
                  AND at2.ref_id = a.acc_id
                  AND at2.txn_type::text = 'opening'
             )
           ORDER BY a.acc_id ASC`,
          [bid]
        );

        for (const acc of accountsToPost.rows) {
          const balance = Math.round(Number(acc.balance || 0) * 100) / 100;
          if (Math.abs(balance) <= 0.000001) continue;

          const accountType = String(acc.account_type || 'asset').toLowerCase();
          const debitNormal = ['asset', 'expense', 'cost'].includes(accountType);
          const debit = debitNormal ? Math.max(balance, 0) : Math.max(-balance, 0);
          const credit = debitNormal ? Math.max(-balance, 0) : Math.max(balance, 0);
          const equityDebit = credit;
          const equityCredit = debit;

          await postGl(client, {
            branchId: bid,
            txnDate: acc.created_at || null,
            txnType: 'opening',
            refTable: 'accounts',
            refId: Number(acc.acc_id),
            note: `Opening balance migrated: ${acc.name}`,
            lines: [
              { accId: Number(acc.acc_id), debit, credit, note: 'Opening balance' },
              { accId: coa.openingBalanceEquity, debit: equityDebit, credit: equityCredit, note: 'Offset (Opening Balance Equity)' },
            ],
          });

          updated.accounts += 1;
          updated.accountTransactions += 2;
        }

        // Keep AR/AP system accounts consistent (computed from ledgers).
        await syncSystemAccountBalancesWithClient(client, bid);
      }
    });

    return { updated };
  },

  async getSystemInfo(): Promise<SystemInfo | null> {
    const table = await detectSystemInfoTable();
    if (!table) return null;
    if (table === 'system_information') {
      const row = await queryOne<SystemInfo>(
        `SELECT
            system_id,
            system_name,
            logo_url,
            banner_image_url,
            address,
            phone,
            email,
            website,
            created_at::text AS created_at,
            updated_at::text AS updated_at
         FROM ims.system_information
        WHERE system_id = 1`
      );
      if (!row) return null;
      return {
        ...row,
        logo_url: row.logo_url ? getUploadedImageUrl(row.logo_url) : row.logo_url,
        banner_image_url: row.banner_image_url ? getUploadedImageUrl(row.banner_image_url) : row.banner_image_url,
      };
    }

    const row = await queryOne<SystemInfo>(
      `SELECT
          company_id::bigint AS system_id,
          company_name AS system_name,
          logo_url,
          banner_url AS banner_image_url,
          address,
          phone,
          NULL::text AS email,
          NULL::text AS website,
          created_at::text AS created_at,
          updated_at::text AS updated_at
       FROM ims.company
      WHERE company_id = 1`
    );
    if (!row) return null;
    return {
      ...row,
      logo_url: row.logo_url ? getUploadedImageUrl(row.logo_url) : row.logo_url,
      banner_image_url: row.banner_image_url ? getUploadedImageUrl(row.banner_image_url) : row.banner_image_url,
    };
  },

  async updateSystemInfo(input: SystemInfoInput): Promise<SystemInfo> {
    const table = await detectSystemInfoTable();
    if (!table) {
      throw ApiError.internal('System information table is not available');
    }

    if (table === 'company') {
      const existing = await queryOne<{ company_id: number }>(
        `SELECT company_id FROM ims.company WHERE company_id = 1`
      );
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      if (input.systemName !== undefined) {
        updates.push(`company_name = $${paramCount++}`);
        values.push(input.systemName);
      }
      if (input.logoUrl !== undefined) {
        updates.push(`logo_url = $${paramCount++}`);
        values.push(input.logoUrl || null);
      }
      if (input.bannerImageUrl !== undefined) {
        updates.push(`banner_url = $${paramCount++}`);
        values.push(input.bannerImageUrl || null);
      }
      if (input.address !== undefined) {
        updates.push(`address = $${paramCount++}`);
        values.push(input.address || null);
      }
      if (input.phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(input.phone || null);
      }

      if (existing && updates.length) {
        const updated = await queryOne<SystemInfo>(
          `UPDATE ims.company
              SET ${updates.join(', ')}, updated_at = NOW()
            WHERE company_id = 1
            RETURNING
              company_id::bigint AS system_id,
              company_name AS system_name,
              logo_url,
              banner_url AS banner_image_url,
              address,
              phone,
              NULL::text AS email,
              NULL::text AS website,
              created_at::text AS created_at,
              updated_at::text AS updated_at`,
          values
        );
        if (!updated) {
          throw ApiError.internal('Failed to update system information');
        }
        return updated;
      }

      if (existing) {
        const row = await this.getSystemInfo();
        if (!row) {
          throw ApiError.internal('Failed to load system information');
        }
        return row;
      }

      const created = await queryOne<SystemInfo>(
        `INSERT INTO ims.company
           (company_id, company_name, phone, address, logo_url, banner_url, capital_amount, is_active)
         VALUES (1, $1, $2, $3, $4, $5, 0, TRUE)
         RETURNING
           company_id::bigint AS system_id,
           company_name AS system_name,
           logo_url,
           banner_url AS banner_image_url,
           address,
           phone,
           NULL::text AS email,
           NULL::text AS website,
           created_at::text AS created_at,
           updated_at::text AS updated_at`,
        [
          input.systemName || 'My ERP System',
          input.phone || null,
          input.address || null,
          input.logoUrl || null,
          input.bannerImageUrl || null,
        ]
      );

      if (!created) {
        throw ApiError.internal('Failed to create system information');
      }
      return created;
    }

    const existing = await this.getSystemInfo();

    if (existing) {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      if (input.systemName !== undefined) {
        updates.push(`system_name = $${paramCount++}`);
        values.push(input.systemName);
      }
      if (input.logoUrl !== undefined) {
        updates.push(`logo_url = $${paramCount++}`);
        values.push(input.logoUrl);
      }
      if (input.bannerImageUrl !== undefined) {
        updates.push(`banner_image_url = $${paramCount++}`);
        values.push(input.bannerImageUrl);
      }
      if (input.address !== undefined) {
        updates.push(`address = $${paramCount++}`);
        values.push(input.address);
      }
      if (input.phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(input.phone);
      }
      if (input.email !== undefined) {
        updates.push(`email = $${paramCount++}`);
        values.push(input.email);
      }
      if (input.website !== undefined) {
        updates.push(`website = $${paramCount++}`);
        values.push(input.website);
      }

      if (!updates.length) {
        return existing;
      }

      const updated = await queryOne<SystemInfo>(
        `UPDATE ims.system_information
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE system_id = 1
          RETURNING *`,
        values
      );

      if (!updated) {
        throw ApiError.internal('Failed to update system information');
      }
      return updated;
    }

    const created = await queryOne<SystemInfo>(
      `INSERT INTO ims.system_information (
        system_name, logo_url, banner_image_url, address, phone, email, website
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.systemName || 'My ERP System',
        input.logoUrl || null,
        input.bannerImageUrl || null,
        input.address || null,
        input.phone || null,
        input.email || null,
        input.website || null,
      ]
    );

    if (!created) {
      throw ApiError.internal('Failed to create system information');
    }
    return created;
  },

  async listBranches(): Promise<BranchRow[]> {
    return queryMany<BranchRow>(
      `SELECT
          branch_id,
          branch_name,
          address AS location,
          is_active
       FROM ims.branches
       ORDER BY branch_name`
    );
  },

  async listRoles(): Promise<RoleRow[]> {
    await ensureRolesMonthlySalaryColumn();
    return queryMany<RoleRow>(
      `SELECT
          r.role_id,
          r.role_code,
          r.role_name,
          r.description,
          COALESCE(r.monthly_salary, 0)::float8 AS monthly_salary,
          r.is_system,
          COUNT(rp.perm_id)::int AS permission_count
       FROM ims.roles r
       LEFT JOIN ims.role_permissions rp ON rp.role_id = r.role_id
       GROUP BY r.role_id, r.role_code, r.role_name, r.description, r.monthly_salary, r.is_system
       ORDER BY r.role_name`
    );
  },

  async createRole(input: CreateRoleInput): Promise<RoleRow> {
    await ensureRolesMonthlySalaryColumn();
    const preparedCode = normalizeRoleCode(input.roleCode || input.roleName);
    const roleCode = await ensureUniqueRoleCode(preparedCode);

    const created = await queryOne<RoleRow>(
      `INSERT INTO ims.roles (role_code, role_name, description, monthly_salary, is_system)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING role_id, role_code, role_name, description, COALESCE(monthly_salary, 0)::float8 AS monthly_salary, is_system, 0::int AS permission_count`,
      [roleCode, input.roleName, input.description ?? null, input.monthlySalary ?? 0]
    );

    if (!created) {
      throw ApiError.internal('Failed to create role');
    }
    return created;
  },

  async updateRole(id: number, input: UpdateRoleInput): Promise<RoleRow | null> {
    await ensureRolesMonthlySalaryColumn();
    const current = await queryOne<{ role_id: number; role_code: string }>(
      `SELECT role_id, role_code
         FROM ims.roles
        WHERE role_id = $1`,
      [id]
    );
    if (!current) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.roleName !== undefined) {
      updates.push(`role_name = $${parameter++}`);
      values.push(input.roleName);
    }

    if (input.roleCode !== undefined) {
      const preparedCode = normalizeRoleCode(input.roleCode);
      const nextCode = await ensureUniqueRoleCode(preparedCode, id);
      updates.push(`role_code = $${parameter++}`);
      values.push(nextCode);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${parameter++}`);
      values.push(input.description || null);
    }

    if (input.monthlySalary !== undefined) {
      updates.push(`monthly_salary = $${parameter++}`);
      values.push(input.monthlySalary);
    }

    if (!updates.length) {
      return queryOne<RoleRow>(
          `SELECT
             r.role_id,
             r.role_code,
             r.role_name,
             r.description,
             COALESCE(r.monthly_salary, 0)::float8 AS monthly_salary,
             r.is_system,
             COUNT(rp.perm_id)::int AS permission_count
          FROM ims.roles r
          LEFT JOIN ims.role_permissions rp ON rp.role_id = r.role_id
          WHERE r.role_id = $1
          GROUP BY r.role_id, r.role_code, r.role_name, r.description, r.monthly_salary, r.is_system`,
        [id]
      );
    }

    values.push(id);

    const updatedRole = await queryOne<RoleRow>(
      `WITH updated AS (
          UPDATE ims.roles
             SET ${updates.join(', ')}
           WHERE role_id = $${parameter}
           RETURNING role_id, role_code, role_name, description, is_system
       )
       SELECT
          u.role_id,
          u.role_code,
          u.role_name,
          u.description,
          COALESCE(u.monthly_salary, 0)::float8 AS monthly_salary,
          u.is_system,
          COUNT(rp.perm_id)::int AS permission_count
       FROM updated u
       LEFT JOIN ims.role_permissions rp ON rp.role_id = u.role_id
       GROUP BY u.role_id, u.role_code, u.role_name, u.description, u.monthly_salary, u.is_system`,
      values
    );

    if (updatedRole && input.monthlySalary !== undefined) {
      await queryMany(
        `UPDATE ims.employees
            SET salary_amount = $1,
                salary_type = 'Monthly'
          WHERE role_id = $2`,
        [input.monthlySalary, id]
      );
    }

    return updatedRole;
  },

  async deleteRole(id: number): Promise<void> {
    const role = await queryOne<{ role_id: number; is_system: boolean }>(
      `SELECT role_id, is_system
         FROM ims.roles
        WHERE role_id = $1`,
      [id]
    );
    if (!role) {
      throw ApiError.notFound('Role not found');
    }
    if (role.is_system) {
      throw ApiError.badRequest('System roles cannot be deleted');
    }

    try {
      await queryOne(`DELETE FROM ims.roles WHERE role_id = $1`, [id]);
    } catch (error: any) {
      if (error?.code === '23503') {
        throw ApiError.conflict('Role is assigned to users and cannot be deleted');
      }
      throw error;
    }
  },

  async listRolePermissions(roleId: number): Promise<RolePermissionRow[]> {
    const role = await queryOne<{ role_id: number }>(
      `SELECT role_id FROM ims.roles WHERE role_id = $1`,
      [roleId]
    );
    if (!role) {
      throw ApiError.notFound('Role not found');
    }

    return queryMany<RolePermissionRow>(
      `SELECT
          p.perm_id,
          p.perm_key,
          p.perm_name,
          p.module,
          p.sub_module,
          p.action_type,
          p.description,
          (rp.role_id IS NOT NULL) AS has_permission
       FROM ims.permissions p
       LEFT JOIN ims.role_permissions rp
         ON rp.perm_id = p.perm_id
        AND rp.role_id = $1
       ORDER BY p.module, p.sub_module NULLS FIRST, p.action_type NULLS FIRST, p.perm_key`,
      [roleId]
    );
  },

  async replaceRolePermissions(roleId: number, permIds: number[]): Promise<void> {
    const role = await queryOne<{ role_id: number }>(
      `SELECT role_id FROM ims.roles WHERE role_id = $1`,
      [roleId]
    );
    if (!role) {
      throw ApiError.notFound('Role not found');
    }

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM ims.role_permissions WHERE role_id = $1`, [roleId]);
      if (!permIds.length) {
        return;
      }
      await client.query(
        `INSERT INTO ims.role_permissions (role_id, perm_id)
         SELECT $1, x.perm_id
           FROM UNNEST($2::int[]) AS x(perm_id)
         ON CONFLICT (role_id, perm_id) DO NOTHING`,
        [roleId, permIds]
      );
    });
  },

  async listPermissions(): Promise<PermissionRow[]> {
    return queryMany<PermissionRow>(
      `SELECT
          perm_id,
          perm_key,
          perm_name,
          module,
          sub_module,
          action_type,
          description
       FROM ims.permissions
       ORDER BY module, sub_module NULLS FIRST, action_type NULLS FIRST, perm_key`
    );
  },

  async createPermission(input: CreatePermissionInput): Promise<PermissionRow> {
    const created = await queryOne<PermissionRow>(
      `INSERT INTO ims.permissions (
          perm_key, perm_name, module, sub_module, action_type, description
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING perm_id, perm_key, perm_name, module, sub_module, action_type, description`,
      [
        input.permKey.trim(),
        input.permName.trim(),
        input.module.trim(),
        input.subModule?.trim() || null,
        input.actionType?.trim() || null,
        input.description?.trim() || null,
      ]
    );

    if (!created) {
      throw ApiError.internal('Failed to create permission');
    }
    return created;
  },

  async updatePermission(
    id: number,
    input: UpdatePermissionInput
  ): Promise<PermissionRow | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.permKey !== undefined) {
      updates.push(`perm_key = $${parameter++}`);
      values.push(input.permKey.trim());
    }
    if (input.permName !== undefined) {
      updates.push(`perm_name = $${parameter++}`);
      values.push(input.permName.trim());
    }
    if (input.module !== undefined) {
      updates.push(`module = $${parameter++}`);
      values.push(input.module.trim());
    }
    if (input.subModule !== undefined) {
      updates.push(`sub_module = $${parameter++}`);
      values.push(input.subModule.trim() || null);
    }
    if (input.actionType !== undefined) {
      updates.push(`action_type = $${parameter++}`);
      values.push(input.actionType.trim() || null);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${parameter++}`);
      values.push(input.description.trim() || null);
    }

    values.push(id);

    return queryOne<PermissionRow>(
      `UPDATE ims.permissions
          SET ${updates.join(', ')}
        WHERE perm_id = $${parameter}
        RETURNING perm_id, perm_key, perm_name, module, sub_module, action_type, description`,
      values
    );
  },

  async deletePermission(id: number): Promise<void> {
    const deleted = await queryOne<{ perm_id: number }>(
      `DELETE FROM ims.permissions
        WHERE perm_id = $1
        RETURNING perm_id`,
      [id]
    );
    if (!deleted) {
      throw ApiError.notFound('Permission not found');
    }
  },

  async listUsers(): Promise<UserRow[]> {
    return usersService.list();
  },

  async getUser(id: number): Promise<UserRow | null> {
    return usersService.get(id);
  },

  async createUser(input: CreateUserInput): Promise<UserRow> {
    return usersService.create(input);
  },

  async updateUser(id: number, input: UpdateUserInput): Promise<UserRow | null> {
    return usersService.update(id, input);
  },

  async deleteUser(id: number): Promise<void> {
    await usersService.remove(id);
  },

  async listLogs(
    page = 1,
    limit = 50,
    startDate?: string,
    endDate?: string
  ): Promise<{ rows: AuditLogRow[]; total: number }> {
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

    const rows = await queryMany<AuditLogRow>(
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

  async deleteLog(id: number): Promise<boolean> {
    const columns = await detectAuditLogColumns();
    const deleted = await queryOne<{ id: number }>(
      `DELETE FROM ims.audit_logs
        WHERE ${columns.idColumn} = $1
        RETURNING ${columns.idColumn} AS id`,
      [id]
    );
    return Boolean(deleted);
  },

  async clearLogs(): Promise<number> {
    const result = await queryOne<{ count: string }>(
      `WITH deleted AS (
          DELETE FROM ims.audit_logs
          RETURNING 1
       )
       SELECT COUNT(*)::text AS count
         FROM deleted`
    );
    return Number(result?.count || 0);
  },

  async auditBalances(branchId?: number): Promise<BalanceAuditResult> {
    const branchFilter = branchId ? `WHERE b.branch_id = $1` : `WHERE b.is_active = TRUE`;
    const branches = await queryMany<{ branch_id: number }>(
      `SELECT b.branch_id FROM ims.branches b ${branchFilter} ORDER BY b.branch_id`,
      branchId ? [branchId] : []
    );
    const issues: BalanceAuditRow[] = [];

    for (const b of branches) {
      const bid = Number(b.branch_id);

      const accountRows = await queryMany<{
        acc_id: number;
        name: string;
        stored: string;
        computed: string;
      }>(
        `WITH computed AS (
           SELECT acc_id, COALESCE(SUM(COALESCE(credit,0) - COALESCE(debit,0)), 0) AS amount
             FROM ims.account_transactions
            WHERE branch_id = $1
            GROUP BY acc_id
         )
         SELECT a.acc_id, a.name, a.balance::text AS stored, COALESCE(c.amount, 0)::text AS computed
           FROM ims.accounts a
           LEFT JOIN computed c ON c.acc_id = a.acc_id
          WHERE a.branch_id = $1
            AND a.is_active = TRUE`,
        [bid]
      );
      for (const r of accountRows) {
        const stored = Number(r.stored || 0);
        const computed = Number(r.computed || 0);
        const diff = Math.round((stored - computed) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
          issues.push({
            entity: 'account',
            branch_id: bid,
            id: Number(r.acc_id),
            name: r.name,
            expected: computed,
            actual: stored,
            diff,
          });
        }
      }

      // System accounts (AR/AP) are maintained outside account_transactions
      const ar = await queryOne<{ acc_id: number; name: string; balance: string }>(
        `SELECT acc_id, name, balance::text AS balance
           FROM ims.accounts
          WHERE branch_id = $1
            AND (LOWER(name) LIKE 'accounts receivable%' OR LOWER(name) LIKE 'account receivable%')
          ORDER BY acc_id
          LIMIT 1`,
        [bid]
      );
       if (ar) {
         const expected = await queryOne<{ amount: string }>(
          `SELECT GREATEST(COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0), 0)::text AS amount
             FROM ims.customer_ledger
            WHERE branch_id = $1`,
          [bid]
         );
        const stored = Number(ar.balance || 0);
        const exp = Number(expected?.amount || 0);
        const diff = Math.round((stored - exp) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
          issues.push({
            entity: 'account',
            branch_id: bid,
            id: Number(ar.acc_id),
            name: ar.name,
            expected: exp,
            actual: stored,
            diff,
          });
        }
      }

      const ap = await queryOne<{ acc_id: number; name: string; balance: string }>(
        `SELECT acc_id, name, balance::text AS balance
           FROM ims.accounts
          WHERE branch_id = $1
            AND (LOWER(name) LIKE 'accounts payable%' OR LOWER(name) LIKE 'account payable%')
          ORDER BY acc_id
          LIMIT 1`,
        [bid]
      );
       if (ap) {
         const expected = await queryOne<{ amount: string }>(
          `SELECT GREATEST(COALESCE(SUM(COALESCE(credit, 0) - COALESCE(debit, 0)), 0), 0)::text AS amount
             FROM ims.supplier_ledger
            WHERE branch_id = $1`,
          [bid]
         );
        const stored = Number(ap.balance || 0);
        const exp = Number(expected?.amount || 0);
        const diff = Math.round((stored - exp) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
          issues.push({
            entity: 'account',
            branch_id: bid,
            id: Number(ap.acc_id),
            name: ap.name,
            expected: exp,
            actual: stored,
            diff,
          });
        }
      }

      const customerRows = await queryMany<{
        customer_id: number;
        full_name: string;
        stored: string;
        computed: string;
      }>(
        `WITH ledger AS (
           SELECT customer_id, COALESCE(SUM(COALESCE(debit,0) - COALESCE(credit,0)), 0) AS amount
             FROM ims.customer_ledger
            WHERE branch_id = $1
            GROUP BY customer_id
         )
         SELECT c.customer_id, c.full_name,
                 COALESCE(NULLIF(to_jsonb(c) ->> 'remaining_balance','')::numeric,
                          NULLIF(to_jsonb(c) ->> 'open_balance','')::numeric,
                          0)::text AS stored,
                 GREATEST(COALESCE(l.amount, 0), 0)::text AS computed
            FROM ims.customers c
            LEFT JOIN ledger l ON l.customer_id = c.customer_id
           WHERE c.branch_id = $1
             AND c.is_active = TRUE`,
        [bid]
      );
       for (const r of customerRows) {
         const stored = Number(r.stored || 0);
         const computed = Number(r.computed || 0);
         const diff = Math.round((stored - computed) * 100) / 100;
         if (Math.abs(diff) >= 0.01) {
           issues.push({
             entity: 'customer',
             branch_id: bid,
             id: Number(r.customer_id),
             name: r.full_name,
             expected: computed,
             actual: stored,
             diff,
           });
         }
       }

      const supplierRows = await queryMany<{
        supplier_id: number;
        name: string;
        stored: string;
        computed: string;
      }>(
        `WITH ledger AS (
           SELECT supplier_id, COALESCE(SUM(COALESCE(credit,0) - COALESCE(debit,0)), 0) AS amount
             FROM ims.supplier_ledger
            WHERE branch_id = $1
            GROUP BY supplier_id
         )
         SELECT s.supplier_id,
                COALESCE(NULLIF(to_jsonb(s) ->> 'name',''), NULLIF(to_jsonb(s) ->> 'supplier_name',''), '') AS name,
                 COALESCE(NULLIF(to_jsonb(s) ->> 'remaining_balance','')::numeric,
                          NULLIF(to_jsonb(s) ->> 'open_balance','')::numeric,
                          0)::text AS stored,
                 GREATEST(COALESCE(l.amount, 0), 0)::text AS computed
            FROM ims.suppliers s
            LEFT JOIN ledger l ON l.supplier_id = s.supplier_id
           WHERE s.branch_id = $1
             AND s.is_active = TRUE`,
        [bid]
      );
       for (const r of supplierRows) {
         const stored = Number(r.stored || 0);
         const computed = Number(r.computed || 0);
         const diff = Math.round((stored - computed) * 100) / 100;
         if (Math.abs(diff) >= 0.01) {
           issues.push({
             entity: 'supplier',
             branch_id: bid,
             id: Number(r.supplier_id),
             name: r.name,
             expected: computed,
             actual: stored,
             diff,
           });
         }
       }

      const stockRows = await queryMany<{ store_id: number; product_id: number; quantity: string }>(
        `SELECT store_id, product_id, quantity::text AS quantity
           FROM ims.store_items
          WHERE quantity < 0
            AND store_id IN (SELECT store_id FROM ims.stores WHERE branch_id = $1)`,
        [bid]
      );
      for (const r of stockRows) {
        issues.push({
          entity: 'stock',
          branch_id: bid,
          id: Number(r.product_id),
          name: `store:${r.store_id}`,
          expected: 0,
          actual: Number(r.quantity || 0),
          diff: Number(r.quantity || 0),
        });
      }

      const itemQtyMismatch = await queryMany<{ item_id: number; name: string; item_qty: string; store_qty: string }>(
        `WITH store_sum AS (
            SELECT st.branch_id, si.product_id AS item_id, COALESCE(SUM(si.quantity), 0) AS store_qty
              FROM ims.store_items si
              JOIN ims.stores st ON st.store_id = si.store_id
             WHERE st.branch_id = $1
             GROUP BY st.branch_id, si.product_id
         )
         SELECT i.item_id, i.name,
                COALESCE(i.quantity, i.opening_balance, 0)::text AS item_qty,
                COALESCE(s.store_qty, 0)::text AS store_qty
           FROM ims.items i
           LEFT JOIN store_sum s ON s.branch_id = i.branch_id AND s.item_id = i.item_id
          WHERE i.branch_id = $1
            AND COALESCE(i.quantity, i.opening_balance, 0) <> COALESCE(s.store_qty, 0)`,
        [bid]
      );
      for (const r of itemQtyMismatch) {
        issues.push({
          entity: 'stock',
          branch_id: bid,
          id: Number(r.item_id),
          name: r.name,
          expected: Number(r.store_qty || 0),
          actual: Number(r.item_qty || 0),
          diff: Number(r.item_qty || 0) - Number(r.store_qty || 0),
        });
      }

      const returnMismatchSales = await queryMany<{
        sr_id: number;
        total: string;
        bal: string;
        refund: string;
        customer: string;
      }>(
        `WITH refund AS (
           SELECT ref_id AS sr_id, COALESCE(SUM(debit), 0) AS amount
             FROM ims.account_transactions
            WHERE branch_id = $1
              AND ref_table = 'sales_returns'
              AND txn_type = 'return_refund'
            GROUP BY ref_id
         )
         SELECT sr.sr_id,
                sr.total::text AS total,
                COALESCE(sr.balance_adjustment, 0)::text AS bal,
                COALESCE(r.amount, 0)::text AS refund,
                COALESCE(c.full_name,'') AS customer
           FROM ims.sales_returns sr
           LEFT JOIN refund r ON r.sr_id = sr.sr_id
           LEFT JOIN ims.customers c ON c.customer_id = sr.customer_id
          WHERE sr.branch_id = $1`,
        [bid]
      );
      for (const r of returnMismatchSales) {
        const total = Number(r.total || 0);
        const bal = Number(r.bal || 0);
        const refund = Number(r.refund || 0);
        const expectedRefund = Math.round((total - bal) * 100) / 100;
        const diff = Math.round((refund - expectedRefund) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
          issues.push({
            entity: 'sales_return',
            branch_id: bid,
            id: Number(r.sr_id),
            name: r.customer,
            expected: expectedRefund,
            actual: refund,
            diff,
          });
        }
      }

      const returnMismatchPurch = await queryMany<{
        pr_id: number;
        total: string;
        bal: string;
        refund: string;
        supplier: string;
      }>(
        `WITH refund AS (
           SELECT ref_id AS pr_id, COALESCE(SUM(credit), 0) AS amount
             FROM ims.account_transactions
            WHERE branch_id = $1
              AND ref_table = 'purchase_returns'
              AND txn_type = 'return_refund'
            GROUP BY ref_id
         )
         SELECT pr.pr_id,
                pr.total::text AS total,
                COALESCE(pr.balance_adjustment, 0)::text AS bal,
                COALESCE(r.amount, 0)::text AS refund,
                COALESCE(NULLIF(to_jsonb(s) ->> 'name',''), NULLIF(to_jsonb(s) ->> 'supplier_name',''), '') AS supplier
           FROM ims.purchase_returns pr
           LEFT JOIN refund r ON r.pr_id = pr.pr_id
           LEFT JOIN ims.suppliers s ON s.supplier_id = pr.supplier_id
          WHERE pr.branch_id = $1`,
        [bid]
      );
      for (const r of returnMismatchPurch) {
        const total = Number(r.total || 0);
        const bal = Number(r.bal || 0);
        const refund = Number(r.refund || 0);
        const expectedRefund = Math.round((total - bal) * 100) / 100;
        const diff = Math.round((refund - expectedRefund) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
          issues.push({
            entity: 'purchase_return',
            branch_id: bid,
            id: Number(r.pr_id),
            name: r.supplier,
            expected: expectedRefund,
            actual: refund,
            diff,
          });
        }
      }
    }

    const counts = issues.reduce((acc, row) => {
      acc[row.entity] = (acc[row.entity] || 0) + 1;
      return acc;
    }, {} as Record<BalanceAuditRow['entity'], number>);
    const allEntities: BalanceAuditRow['entity'][] = ['account', 'customer', 'supplier', 'sales_return', 'purchase_return', 'stock'];
    for (const e of allEntities) counts[e] = counts[e] || 0;

    return { issues, counts };
  },

  async reconcileBalances(branchId?: number): Promise<{ updated: { accounts: number; customers: number; suppliers: number }; audit: BalanceAuditResult }> {
    const updated = { accounts: 0, customers: 0, suppliers: 0 };

    await withTransaction(async (client) => {
      const customerColsRes = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'ims'
            AND table_name = 'customers'`
      );
      const customerCols = new Set(customerColsRes.rows.map((r) => r.column_name));
      const supplierColsRes = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'suppliers'`
      );
      const supplierCols = new Set(supplierColsRes.rows.map((r) => r.column_name));

      const branches = await client.query<{ branch_id: number }>(
        branchId
          ? `SELECT branch_id FROM ims.branches WHERE branch_id = $1`
          : `SELECT branch_id FROM ims.branches WHERE is_active = TRUE`,
        branchId ? [branchId] : []
      );

       for (const b of branches.rows) {
         const bid = Number(b.branch_id);

         // Normalize opening balances to be non-negative (opening balances should never be negative).
         await client.query(
           `UPDATE ims.customers
               SET open_balance = ABS(open_balance)
             WHERE branch_id = $1
               AND open_balance < 0`,
           [bid]
         );
         await client.query(
           `UPDATE ims.suppliers
               SET open_balance = ABS(open_balance)
             WHERE branch_id = $1
               AND open_balance < 0`,
           [bid]
         );

          // Rebuild core GL postings for legacy rows (capital/drawings/fixed-assets).
          // Do NOT "auto-balance" using single-sided entries.
          const capitalTable = await client.query<{ exists: boolean }>(
            `SELECT EXISTS (
               SELECT 1
                 FROM information_schema.tables
               WHERE table_schema = 'ims'
                 AND table_name = 'capital_contributions'
            ) AS exists`
          );
           if (capitalTable.rows[0]?.exists) {
             const coa = await ensureCoaAccounts(client, bid, ['openingBalanceEquity']);
             const rows = await client.query<{
               capital_id: number;
               acc_id: number;
               equity_acc_id: number;
               amount: string;
              contribution_date: string;
              owner_name: string;
              note: string | null;
            }>(
              `SELECT capital_id,
                      acc_id,
                      equity_acc_id,
                      amount::text AS amount,
                      contribution_date::text AS contribution_date,
                      owner_name,
                      note
                 FROM ims.capital_contributions
                WHERE branch_id = $1
                  AND amount > 0
                  AND acc_id IS NOT NULL
                  AND equity_acc_id IS NOT NULL`,
              [bid]
             );
             for (const cc of rows.rows) {
               const amount = Math.round(Number(cc.amount || 0) * 100) / 100;
               if (amount <= 0) continue;
              await client.query(
                `DELETE FROM ims.account_transactions
                  WHERE branch_id = $1
                    AND ref_table = 'capital_contributions'
                    AND ref_id = $2`,
                [bid, cc.capital_id]
              );
               const memo = `[CAPITAL] ${cc.owner_name}${cc.note ? ` - ${cc.note}` : ''}`;
               await postGl(client, {
                 branchId: bid,
                 txnDate: cc.contribution_date || null,
                 txnType: 'capital_contribution',
                 refTable: 'capital_contributions',
                 refId: Number(cc.capital_id),
                 note: memo,
                 lines: [
                   { accId: coa.openingBalanceEquity, debit: amount, credit: 0, note: 'Reclass from opening balance equity' },
                   { accId: Number(cc.equity_acc_id), debit: 0, credit: amount, note: 'Owner capital' },
                 ],
               });

               // Keep the capital record pointing to the equity source (not cash/bank).
               await client.query(`UPDATE ims.capital_contributions SET acc_id = $2 WHERE capital_id = $1`, [
                 Number(cc.capital_id),
                 coa.openingBalanceEquity,
               ]);
             }
           }

         const drawingTable = await client.query<{ exists: boolean }>(
           `SELECT EXISTS (
              SELECT 1
                FROM information_schema.tables
               WHERE table_schema = 'ims'
                 AND table_name = 'owner_drawings'
            ) AS exists`
          );
          if (drawingTable.rows[0]?.exists) {
            const coa = await ensureCoaAccounts(client, bid, ['ownerDrawings']);
            const rows = await client.query<{
              draw_id: number;
              acc_id: number;
              amount: string;
              draw_date: string;
              owner_name: string;
              note: string | null;
            }>(
              `SELECT draw_id,
                      acc_id,
                      amount::text AS amount,
                      draw_date::text AS draw_date,
                      owner_name,
                      note
                 FROM ims.owner_drawings
                WHERE branch_id = $1
                  AND amount > 0
                  AND acc_id IS NOT NULL`,
              [bid]
            );
            for (const od of rows.rows) {
              const amount = Math.round(Number(od.amount || 0) * 100) / 100;
              if (amount <= 0) continue;
              await client.query(
                `DELETE FROM ims.account_transactions
                  WHERE branch_id = $1
                    AND ref_table = 'owner_drawings'
                    AND ref_id = $2`,
                [bid, od.draw_id]
              );
              const memo = `[DRAWING] ${od.owner_name}${od.note ? ` - ${od.note}` : ''}`;
              await postGl(client, {
                branchId: bid,
                txnDate: od.draw_date || null,
                txnType: 'owner_drawing',
                refTable: 'owner_drawings',
                refId: Number(od.draw_id),
                note: memo,
                lines: [
                  { accId: coa.ownerDrawings, debit: amount, credit: 0, note: 'Owner drawings' },
                  { accId: Number(od.acc_id), debit: 0, credit: amount, note: 'Cash/bank paid out' },
                ],
              });
            }
          }

          const fixedAssetsTable = await client.query<{ exists: boolean }>(
            `SELECT EXISTS (
               SELECT 1
                 FROM information_schema.tables
               WHERE table_schema = 'ims'
                 AND table_name = 'fixed_assets'
            ) AS exists`
         );
          if (fixedAssetsTable.rows[0]?.exists) {
            // Ensure column exists even on older DBs.
            await adminQueryMany(`ALTER TABLE ims.fixed_assets ADD COLUMN IF NOT EXISTS acc_id BIGINT`);

            // Fixed Assets are a REGISTER only in this system.
            // Do NOT post GL entries or change cash/bank balances from this module, because the payment is recorded elsewhere.
            // Remove any legacy GL postings linked to fixed assets to avoid double-counting and balance distortion.
            // Also unwind any balance impact from those legacy postings.
            await client.query(
              `WITH impact AS (
                 SELECT
                   acc_id,
                   COALESCE(SUM(COALESCE(debit, 0)), 0) AS debit_sum,
                   COALESCE(SUM(COALESCE(credit, 0)), 0) AS credit_sum
                 FROM ims.account_transactions
                 WHERE branch_id = $1
                   AND ref_table = 'fixed_assets'
                 GROUP BY acc_id
               )
               UPDATE ims.accounts a
                  SET balance = COALESCE(a.balance, 0) - COALESCE(i.debit_sum, 0) + COALESCE(i.credit_sum, 0)
                 FROM impact i
                WHERE a.branch_id = $1
                  AND a.acc_id = i.acc_id`,
              [bid]
            );
            await client.query(
              `DELETE FROM ims.account_transactions
                WHERE branch_id = $1
                  AND ref_table = 'fixed_assets'`,
              [bid]
            );
          }

          // Recompute account balances from GL (no forced single-sided adjustments).
          const accountsRes = await client.query(
            `WITH computed AS (
               SELECT branch_id, acc_id, COALESCE(SUM(COALESCE(debit,0) - COALESCE(credit,0)), 0) AS amount
                 FROM ims.account_transactions
                WHERE branch_id = $1
                GROUP BY branch_id, acc_id
            )
            UPDATE ims.accounts a
               SET balance = COALESCE(c.amount, 0)
              FROM computed c
             WHERE a.branch_id = $1
               AND a.acc_id = c.acc_id`,
            [bid]
          );
          updated.accounts += accountsRes.rowCount ?? 0;

          // Remove legacy suspense/auto-balance postings. Suspense must always be ZERO in a proper double-entry system.
          const suspenseRes = await client.query<{ acc_id: number }>(
            `SELECT acc_id
               FROM ims.accounts
              WHERE branch_id = $1
                AND COALESCE(is_active, TRUE) = TRUE
                AND (
                  LOWER(COALESCE(name, '')) LIKE '%suspense%'
                  OR LOWER(COALESCE(name, '')) LIKE '%auto balance%'
                )`,
            [bid]
          );
          const suspenseIds = suspenseRes.rows.map((r) => Number(r.acc_id)).filter((x) => Number.isFinite(x) && x > 0);
          if (suspenseIds.length) {
            await client.query(
              `DELETE FROM ims.account_transactions
                WHERE branch_id = $1
                  AND acc_id = ANY($2::bigint[])`,
              [bid, suspenseIds]
            );
            await client.query(
              `UPDATE ims.accounts
                  SET balance = 0
                WHERE branch_id = $1
                  AND acc_id = ANY($2::bigint[])`,
              [bid, suspenseIds]
            );
          }

         // Remove previously inserted auto-reconcile entries so customer/supplier balances are driven by real ledgers.
         await client.query(
           `DELETE FROM ims.customer_ledger
             WHERE branch_id = $1
               AND ref_table = 'customers'
               AND COALESCE(note, '') ILIKE '[%] auto reconcile%'`,
           [bid]
         );
         await client.query(
           `DELETE FROM ims.supplier_ledger
             WHERE branch_id = $1
               AND ref_table = 'suppliers'
               AND COALESCE(note, '') ILIKE '[%] auto reconcile%'`,
           [bid]
         );

         // Ensure seeded opening balances match master tables (opening balances are stored on customer/supplier rows).
         // Customers: opening balance is a debit (receivable).
         await client.query(
           `DELETE FROM ims.customer_ledger
             WHERE branch_id = $1
               AND entry_type = 'opening'
               AND ref_table = 'opening_balance'
               AND COALESCE(note, '') ILIKE '[OPENING BALANCE] Seeded from customer.open_balance%'`,
           [bid]
         );
         await client.query(
           `WITH ledger_stats AS (
              SELECT
                customer_id,
                MIN(entry_date)::timestamptz AS first_at,
                SUM(CASE WHEN entry_type = 'opening' AND ref_table = 'opening_balance' THEN 1 ELSE 0 END)::int AS has_opening
              FROM ims.customer_ledger
              WHERE branch_id = $1
              GROUP BY customer_id
            ),
            candidates AS (
              SELECT
                c.customer_id,
                ABS(COALESCE(c.open_balance, 0))::numeric(14,2) AS seed_amount,
                COALESCE(ls.first_at, c.created_at, NOW())::timestamptz AS base_date,
                COALESCE(ls.has_opening, 0)::int AS has_opening
              FROM ims.customers c
              LEFT JOIN ledger_stats ls ON ls.customer_id = c.customer_id
              WHERE c.branch_id = $1
                AND c.is_active = TRUE
                AND COALESCE(c.open_balance, 0) <> 0
            )
            INSERT INTO ims.customer_ledger
              (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
            SELECT
              $1,
              c.customer_id,
              'opening',
              'opening_balance',
              c.customer_id,
              NULL,
              GREATEST(c.seed_amount, 0),
              GREATEST(-c.seed_amount, 0),
              c.base_date - INTERVAL '1 second',
              '[OPENING BALANCE] Seeded from customer.open_balance'
            FROM candidates c
            WHERE c.has_opening = 0`,
           [bid]
         );

         // Suppliers: opening balance is a credit (payable).
         await client.query(
           `DELETE FROM ims.supplier_ledger
             WHERE branch_id = $1
               AND entry_type = 'opening'
               AND ref_table = 'opening_balance'
               AND COALESCE(note, '') ILIKE '[OPENING BALANCE] Seeded from supplier.open_balance%'`,
           [bid]
         );
         const supplierSeedExpr = supplierCols.has('open_balance')
           ? `COALESCE(s.open_balance, 0)`
           : `COALESCE(s.remaining_balance, 0)`;
         await client.query(
           `WITH ledger_stats AS (
              SELECT
                supplier_id,
                MIN(entry_date)::timestamptz AS first_at,
                SUM(CASE WHEN entry_type = 'opening' AND ref_table = 'opening_balance' THEN 1 ELSE 0 END)::int AS has_opening
              FROM ims.supplier_ledger
              WHERE branch_id = $1
              GROUP BY supplier_id
            ),
            candidates AS (
              SELECT
                s.supplier_id,
                ABS((${supplierSeedExpr}))::numeric(14,2) AS seed_amount,
                COALESCE(ls.first_at, s.created_at, NOW())::timestamptz AS base_date,
                COALESCE(ls.has_opening, 0)::int AS has_opening
              FROM ims.suppliers s
              LEFT JOIN ledger_stats ls ON ls.supplier_id = s.supplier_id
              WHERE s.branch_id = $1
                AND s.is_active = TRUE
                AND (${supplierSeedExpr}) <> 0
            )
            INSERT INTO ims.supplier_ledger
              (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
            SELECT
              $1,
              c.supplier_id,
              'opening',
              'opening_balance',
              c.supplier_id,
              NULL,
              0,
              GREATEST(c.seed_amount, 0),
              c.base_date - INTERVAL '1 second',
              '[OPENING BALANCE] Seeded from supplier.open_balance'
            FROM candidates c
            WHERE c.has_opening = 0`,
           [bid]
         );

         // Backfill missing ledger rows for historical returns (older data may have returns without ledgers).
         // Sales return reduces AR by `balance_adjustment` and may include a cash refund.
         await client.query(
           `INSERT INTO ims.customer_ledger
              (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
            SELECT
              sr.branch_id,
              sr.customer_id,
              'return',
              'sales_returns',
              sr.sr_id,
              NULL,
              0,
              COALESCE(sr.total, 0),
              COALESCE(sr.return_date, NOW()),
              COALESCE(sr.note, NULL)
            FROM ims.sales_returns sr
            WHERE sr.branch_id = $1
              AND sr.customer_id IS NOT NULL
              AND COALESCE(sr.total, 0) > 0
              AND NOT EXISTS (
                SELECT 1
                  FROM ims.customer_ledger cl
                 WHERE cl.branch_id = sr.branch_id
                   AND cl.customer_id = sr.customer_id
                   AND cl.ref_table = 'sales_returns'
                   AND cl.ref_id = sr.sr_id
                   AND cl.entry_type = 'return'
              )`,
           [bid]
         );

         await client.query(
           `WITH refunds AS (
              SELECT
                sr.branch_id,
                sr.customer_id,
                sr.sr_id,
                GREATEST(COALESCE(sr.total, 0) - COALESCE(sr.balance_adjustment, COALESCE(sr.total, 0)), 0)::numeric(14,2) AS refund_amount,
                COALESCE(sr.return_date, NOW()) AS return_date
              FROM ims.sales_returns sr
              WHERE sr.branch_id = $1
                AND sr.customer_id IS NOT NULL
            )
            INSERT INTO ims.customer_ledger
              (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
            SELECT
              r.branch_id,
              r.customer_id,
              'adjustment',
              'sales_returns',
              r.sr_id,
              NULL,
              r.refund_amount,
              0,
              r.return_date,
              'Return refund (backfill)'
            FROM refunds r
            WHERE r.refund_amount > 0
              AND NOT EXISTS (
                SELECT 1
                  FROM ims.customer_ledger cl
                 WHERE cl.branch_id = r.branch_id
                   AND cl.customer_id = r.customer_id
                   AND cl.ref_table = 'sales_returns'
                   AND cl.ref_id = r.sr_id
                   AND COALESCE(cl.debit, 0) > 0
              )`,
           [bid]
         );

         await client.query(
           `INSERT INTO ims.supplier_ledger
              (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
            SELECT
              pr.branch_id,
              pr.supplier_id,
              'return',
              'purchase_returns',
              pr.pr_id,
              NULL,
              COALESCE(pr.total, 0),
              0,
              COALESCE(pr.return_date, NOW()),
              COALESCE(pr.note, NULL)
            FROM ims.purchase_returns pr
            WHERE pr.branch_id = $1
              AND pr.supplier_id IS NOT NULL
              AND COALESCE(pr.total, 0) > 0
              AND NOT EXISTS (
                SELECT 1
                  FROM ims.supplier_ledger sl
                 WHERE sl.branch_id = pr.branch_id
                   AND sl.supplier_id = pr.supplier_id
                   AND sl.ref_table = 'purchase_returns'
                   AND sl.ref_id = pr.pr_id
                   AND sl.entry_type = 'return'
              )`,
           [bid]
         );

         await client.query(
           `WITH refunds AS (
              SELECT
                pr.branch_id,
                pr.supplier_id,
                pr.pr_id,
                GREATEST(COALESCE(pr.total, 0) - COALESCE(pr.balance_adjustment, COALESCE(pr.total, 0)), 0)::numeric(14,2) AS refund_amount,
                COALESCE(pr.return_date, NOW()) AS return_date
              FROM ims.purchase_returns pr
              WHERE pr.branch_id = $1
                AND pr.supplier_id IS NOT NULL
            )
            INSERT INTO ims.supplier_ledger
              (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
            SELECT
              r.branch_id,
              r.supplier_id,
              'adjustment',
              'purchase_returns',
              r.pr_id,
              NULL,
              0,
              r.refund_amount,
              r.return_date,
              'Supplier refund (backfill)'
            FROM refunds r
            WHERE r.refund_amount > 0
              AND NOT EXISTS (
                SELECT 1
                  FROM ims.supplier_ledger sl
                 WHERE sl.branch_id = r.branch_id
                   AND sl.supplier_id = r.supplier_id
                   AND sl.ref_table = 'purchase_returns'
                   AND sl.ref_id = r.pr_id
                   AND COALESCE(sl.credit, 0) > 0
              )`,
           [bid]
         );

         const customerSets: string[] = [];
         // Keep `open_balance` as opening balance. Use `remaining_balance` as current outstanding when available.
         if (customerCols.has('remaining_balance')) {
           customerSets.push(`remaining_balance = b.amount`);
         } else if (customerCols.has('open_balance')) {
           customerSets.push(`open_balance = b.amount`);
         }
         if (customerSets.length) {
           const custRes = await client.query(
             `WITH ledger AS (
                SELECT customer_id, COALESCE(SUM(COALESCE(debit,0) - COALESCE(credit,0)), 0) AS amount
                  FROM ims.customer_ledger
                 WHERE branch_id = $1
                 GROUP BY customer_id
              ),
              balances AS (
                SELECT
                  c.customer_id,
                  GREATEST(COALESCE(l.amount, 0), 0)::numeric(14,2) AS amount
                FROM ims.customers c
                LEFT JOIN ledger l ON l.customer_id = c.customer_id
                WHERE c.branch_id = $1
                  AND c.is_active = TRUE
              )
              UPDATE ims.customers c
                 SET ${customerSets.join(', ')}
                FROM balances b
               WHERE c.branch_id = $1
                 AND c.customer_id = b.customer_id`,
             [bid]
           );
           updated.customers += custRes.rowCount ?? 0;
         }

         const supplierSets: string[] = [];
         if (supplierCols.has('remaining_balance')) {
           supplierSets.push(`remaining_balance = b.amount`);
         } else if (supplierCols.has('open_balance')) {
           supplierSets.push(`open_balance = b.amount`);
         }
         if (supplierSets.length) {
           const suppRes = await client.query(
             `WITH ledger AS (
                SELECT supplier_id, COALESCE(SUM(COALESCE(credit,0) - COALESCE(debit,0)), 0) AS amount
                  FROM ims.supplier_ledger
                 WHERE branch_id = $1
                 GROUP BY supplier_id
              ),
              balances AS (
                SELECT
                  s.supplier_id,
                  GREATEST(COALESCE(l.amount, 0), 0)::numeric(14,2) AS amount
                FROM ims.suppliers s
                LEFT JOIN ledger l ON l.supplier_id = s.supplier_id
                WHERE s.branch_id = $1
                  AND s.is_active = TRUE
              )
              UPDATE ims.suppliers s
                 SET ${supplierSets.join(', ')}
                FROM balances b
               WHERE s.branch_id = $1
                 AND s.supplier_id = b.supplier_id`,
             [bid]
           );
           updated.suppliers += suppRes.rowCount ?? 0;
         }

        await client.query(
          `WITH store_sum AS (
              SELECT st.branch_id, si.product_id AS item_id, COALESCE(SUM(si.quantity), 0) AS store_qty
                FROM ims.store_items si
                JOIN ims.stores st ON st.store_id = si.store_id
               WHERE st.branch_id = $1
               GROUP BY st.branch_id, si.product_id
           )
           UPDATE ims.items i
              SET quantity = COALESCE(s.store_qty, 0)
             FROM store_sum s
            WHERE i.branch_id = $1
              AND i.item_id = s.item_id`,
          [bid]
        );

         await syncSystemAccountBalancesWithClient(client, bid);
      }
    });

    const audit = await this.auditBalances(branchId);
    return { updated, audit };
  },
};
