import { queryMany, queryOne } from '../../db/query';
import { BranchScope } from '../../utils/branchScope';
import { AccountInput } from './accounts.schemas';

export interface Account {
  acc_id: number;
  branch_id: number;
  name: string;
  institution: string | null;
  currency_code: string;
  balance: number;
  is_active: boolean;
  created_at?: string;
}

const mapAccount = (row: {
  acc_id: number;
  branch_id: number;
  name: string;
  institution: string | null;
  balance: string | number;
  is_active: boolean;
  created_at?: string;
}): Account => ({
  acc_id: Number(row.acc_id),
  branch_id: Number(row.branch_id),
  name: row.name,
  institution: row.institution,
  currency_code: 'USD',
  balance: Number(row.balance || 0),
  is_active: Boolean(row.is_active),
  created_at: row.created_at,
});

export const accountsService = {
  async findByNameAndCurrency(
    name: string,
    _currencyCode: string,
    branchId?: number
  ): Promise<Account | null> {
    const row = branchId
      ? await queryOne<{
          acc_id: number;
          branch_id: number;
          name: string;
          institution: string | null;
          balance: string;
          is_active: boolean;
          created_at?: string;
        }>(
          `SELECT acc_id, branch_id, name, institution, balance::text, is_active, created_at::text
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
          created_at?: string;
        }>(
          `SELECT acc_id, branch_id, name, institution, balance::text, is_active, created_at::text
             FROM ims.accounts
            WHERE LOWER(name) = LOWER($1)
            LIMIT 1`,
          [name]
        );

    return row ? mapAccount(row) : null;
  },

  async list(scope: BranchScope): Promise<Account[]> {
    const rows = scope.isAdmin
      ? await queryMany<{
          acc_id: number;
          branch_id: number;
          name: string;
          institution: string | null;
          balance: string;
          is_active: boolean;
          created_at?: string;
        }>(
          `SELECT acc_id, branch_id, name, institution, balance::text, is_active, created_at::text
             FROM ims.accounts
            ORDER BY name, acc_id DESC`
        )
      : await queryMany<{
          acc_id: number;
          branch_id: number;
          name: string;
          institution: string | null;
          balance: string;
          is_active: boolean;
          created_at?: string;
        }>(
          `SELECT acc_id, branch_id, name, institution, balance::text, is_active, created_at::text
             FROM ims.accounts
            WHERE branch_id = ANY($1)
            ORDER BY name, acc_id DESC`,
          [scope.branchIds]
        );

    return rows.map(mapAccount);
  },

  async create(input: AccountInput, ctx: { branchId: number }): Promise<Account> {
    const row = await queryOne<{
      acc_id: number;
      branch_id: number;
      name: string;
      institution: string | null;
      balance: string;
      is_active: boolean;
      created_at?: string;
    }>(
      `INSERT INTO ims.accounts (branch_id, name, institution, balance, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING acc_id, branch_id, name, institution, balance::text, is_active, created_at::text`,
      [
        ctx.branchId,
        input.name,
        input.institution || null,
        input.balance ?? 0,
        input.isActive ?? true,
      ]
    );

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
            created_at?: string;
          }>(
            `SELECT acc_id, branch_id, name, institution, balance::text, is_active, created_at::text
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
            created_at?: string;
          }>(
            `SELECT acc_id, branch_id, name, institution, balance::text, is_active, created_at::text
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
      created_at?: string;
    }>(
      `UPDATE ims.accounts
          SET ${updates.join(', ')}
        WHERE ${whereSql}
        RETURNING acc_id, branch_id, name, institution, balance::text, is_active, created_at::text`,
      values
    );

    return row ? mapAccount(row) : null;
  },

  async remove(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) {
      await queryOne(`DELETE FROM ims.accounts WHERE acc_id = $1`, [id]);
      return;
    }
    await queryOne(`DELETE FROM ims.accounts WHERE acc_id = $1 AND branch_id = ANY($2)`, [
      id,
      scope.branchIds,
    ]);
  },
};
