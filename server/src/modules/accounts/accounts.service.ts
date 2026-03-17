import { queryMany, queryOne } from '../../db/query';
import { adminQueryMany } from '../../db/adminQuery';
import { BranchScope } from '../../utils/branchScope';
import { ApiError } from '../../utils/ApiError';
import { AccountInput } from './accounts.schemas';

export interface Account {
  acc_id: number;
  branch_id: number;
  name: string;
  institution: string | null;
  currency_code: string;
  balance: number;
  is_active: boolean;
  account_type?: string;
  created_at?: string;
  can_delete?: boolean;
}

const mapAccount = (row: {
  acc_id: number;
  branch_id: number;
  name: string;
  institution: string | null;
  balance: string | number;
  is_active: boolean;
  account_type?: string;
  created_at?: string;
}): Account => ({
  acc_id: Number(row.acc_id),
  branch_id: Number(row.branch_id),
  name: row.name,
  institution: row.institution,
  currency_code: 'USD',
  balance: Number(row.balance || 0),
  is_active: Boolean(row.is_active),
  account_type: row.account_type || 'asset',
  created_at: row.created_at,
  can_delete:
    (row.account_type || 'asset') === 'asset' &&
    Math.abs(Number(row.balance || 0)) < 0.000001,
});

let accountsSchemaReady = false;
const ensureAccountsSchema = async () => {
  if (accountsSchemaReady) return;
  await adminQueryMany(`
    ALTER TABLE ims.accounts
      ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'asset'
  `);
  await adminQueryMany(`
    UPDATE ims.accounts
       SET account_type = 'asset'
     WHERE account_type IS NULL
        OR account_type NOT IN ('asset', 'equity')
  `);
  accountsSchemaReady = true;
};

export const accountsService = {
  async findDuplicateInBranch(
    branchId: number,
    name: string,
    excludeAccId?: number
  ): Promise<Account | null> {
    await ensureAccountsSchema();
    const row = await queryOne<{
      acc_id: number;
      branch_id: number;
      name: string;
      institution: string | null;
      balance: string;
      is_active: boolean;
      account_type: string;
      created_at?: string;
    }>(
      `SELECT acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text
         FROM ims.accounts
        WHERE branch_id = $1
          AND LOWER(TRIM(name)) = LOWER(TRIM($2))
          AND ($3::bigint IS NULL OR acc_id <> $3::bigint)
        LIMIT 1`,
      [branchId, name, excludeAccId ?? null]
    );
    return row ? mapAccount(row) : null;
  },

  async findByNameAndCurrency(
    name: string,
    _currencyCode: string,
    branchId?: number
  ): Promise<Account | null> {
    await ensureAccountsSchema();
    const row = branchId
      ? await queryOne<{
          acc_id: number;
          branch_id: number;
          name: string;
          institution: string | null;
          balance: string;
          is_active: boolean;
          account_type: string;
          created_at?: string;
        }>(
          `SELECT acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text
             FROM ims.accounts
            WHERE branch_id = $1
              AND LOWER(name) = LOWER($2)
            LIMIT 1`,
          [branchId, name]
        )
      : await queryOne<{
          acc_id: number;
          branch_id: number;
          name: string;
          institution: string | null;
          balance: string;
          is_active: boolean;
          account_type: string;
          created_at?: string;
        }>(
          `SELECT acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text
             FROM ims.accounts
            WHERE LOWER(name) = LOWER($1)
            LIMIT 1`,
          [name]
        );

    return row ? mapAccount(row) : null;
  },

  async list(scope: BranchScope): Promise<Account[]> {
    await ensureAccountsSchema();
    const hiddenSystemFilter = `
      AND NOT (
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
      )
    `;
    const rows = scope.isAdmin
      ? await queryMany<{
          acc_id: number;
          branch_id: number;
          name: string;
          institution: string | null;
          balance: string;
          is_active: boolean;
          account_type: string;
          created_at?: string;
        }>(
          `SELECT acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text
             FROM ims.accounts
            WHERE 1=1
              ${hiddenSystemFilter}
            ORDER BY name, acc_id DESC`
        )
      : await queryMany<{
          acc_id: number;
          branch_id: number;
          name: string;
          institution: string | null;
          balance: string;
          is_active: boolean;
          account_type: string;
          created_at?: string;
        }>(
          `SELECT acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text
             FROM ims.accounts
            WHERE branch_id = ANY($1)
              ${hiddenSystemFilter}
            ORDER BY name, acc_id DESC`,
          [scope.branchIds]
        );

    return rows.map(mapAccount);
  },

  async create(input: AccountInput, ctx: { branchId: number }): Promise<Account> {
    await ensureAccountsSchema();
    const duplicate = await this.findDuplicateInBranch(ctx.branchId, input.name);
    if (duplicate) {
      throw ApiError.conflict('Account with this name already exists.');
    }

    const row = await queryOne<{
      acc_id: number;
      branch_id: number;
      name: string;
      institution: string | null;
      balance: string;
      is_active: boolean;
      account_type: string;
      created_at?: string;
    }>(
      `INSERT INTO ims.accounts (branch_id, name, institution, balance, is_active, account_type)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'asset'))
       RETURNING acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text`,
      [
        ctx.branchId,
        input.name,
        input.institution || null,
        input.balance ?? 0,
        input.isActive ?? true,
        (input as AccountInput & { accountType?: string }).accountType || 'asset',
      ]
    ).catch((error: any) => {
      if (String(error?.code || '') === '23505') {
        throw ApiError.conflict('Account with this name already exists.');
      }
      throw error;
    });

    if (!row) {
      throw new Error('Failed to create account');
    }
    return mapAccount(row);
  },

  async update(
    id: number,
    input: Partial<AccountInput>,
    scope: BranchScope
  ): Promise<Account | null> {
    await ensureAccountsSchema();
    const existing = scope.isAdmin
      ? await queryOne<{ branch_id: number }>(
          `SELECT branch_id
             FROM ims.accounts
            WHERE acc_id = $1`,
          [id]
        )
      : await queryOne<{ branch_id: number }>(
          `SELECT branch_id
             FROM ims.accounts
            WHERE acc_id = $1
              AND branch_id = ANY($2)`,
          [id, scope.branchIds]
        );
    if (!existing) return null;

    if (input.name !== undefined) {
      const duplicate = await this.findDuplicateInBranch(
        Number(existing.branch_id),
        input.name,
        id
      );
      if (duplicate) {
        throw ApiError.conflict('Account with this name already exists.');
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${parameter++}`);
      values.push(input.name);
    }
    if (input.institution !== undefined) {
      updates.push(`institution = $${parameter++}`);
      values.push(input.institution || null);
    }
    if (input.balance !== undefined) {
      updates.push(`balance = $${parameter++}`);
      values.push(input.balance);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }

    if (!updates.length) {
      const row = scope.isAdmin
        ? await queryOne<{
            acc_id: number;
            branch_id: number;
            name: string;
            institution: string | null;
            balance: string;
            is_active: boolean;
            account_type: string;
            created_at?: string;
          }>(
            `SELECT acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text
               FROM ims.accounts
              WHERE acc_id = $1`,
            [id]
          )
        : await queryOne<{
            acc_id: number;
            branch_id: number;
            name: string;
            institution: string | null;
            balance: string;
            is_active: boolean;
            account_type: string;
            created_at?: string;
          }>(
            `SELECT acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text
               FROM ims.accounts
              WHERE acc_id = $1
                AND branch_id = ANY($2)`,
            [id, scope.branchIds]
          );
      return row ? mapAccount(row) : null;
    }

    values.push(id);
    let whereSql = `acc_id = $${parameter++}`;
    if (!scope.isAdmin) {
      values.push(scope.branchIds);
      whereSql += ` AND branch_id = ANY($${parameter++})`;
    }

    const row = await queryOne<{
      acc_id: number;
      branch_id: number;
      name: string;
      institution: string | null;
      balance: string;
      is_active: boolean;
      account_type: string;
      created_at?: string;
    }>(
      `UPDATE ims.accounts
          SET ${updates.join(', ')}
        WHERE ${whereSql}
        RETURNING acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text`,
      values
    ).catch((error: any) => {
      if (String(error?.code || '') === '23505') {
        throw ApiError.conflict('Account with this name already exists.');
      }
      throw error;
    });

    return row ? mapAccount(row) : null;
  },

  async remove(id: number, scope: BranchScope): Promise<void> {
    await ensureAccountsSchema();

    const target = scope.isAdmin
      ? await queryOne<{
          acc_id: number;
          branch_id: number;
          name: string;
          balance: string | number;
          account_type: string;
        }>(
          `SELECT acc_id, branch_id, name, balance::text AS balance, account_type
             FROM ims.accounts
            WHERE acc_id = $1`,
          [id]
        )
      : await queryOne<{
          acc_id: number;
          branch_id: number;
          name: string;
          balance: string | number;
          account_type: string;
        }>(
          `SELECT acc_id, branch_id, name, balance::text AS balance, account_type
             FROM ims.accounts
            WHERE acc_id = $1
              AND branch_id = ANY($2)`,
          [id, scope.branchIds]
        );

    if (!target) {
      throw ApiError.notFound('Account not found');
    }

    if ((target.account_type || 'asset') !== 'asset') {
      throw ApiError.badRequest('Only current asset accounts can be deleted.');
    }

    const balance = Number(target.balance || 0);
    if (Math.abs(balance) > 0.000001) {
      throw ApiError.badRequest('Only zero-balance accounts can be deleted.');
    }

    try {
      if (scope.isAdmin) {
        await queryOne(`DELETE FROM ims.accounts WHERE acc_id = $1`, [id]);
        return;
      }
      await queryOne(`DELETE FROM ims.accounts WHERE acc_id = $1 AND branch_id = ANY($2)`, [
        id,
        scope.branchIds,
      ]);
    } catch (error: any) {
      if (String(error?.code || '') === '23503') {
        throw ApiError.badRequest(
          'Account cannot be deleted because it is linked to existing transactions.'
        );
      }
      throw error;
    }
  },
};
