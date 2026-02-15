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
  created_by?: number | null;
  updated_by?: number | null;
  created_at?: string;
  updated_at?: string;
}

export const accountsService = {
  findByNameAndCurrency(name: string, currencyCode: string, branchId?: number): Promise<Account | null> {
    if (branchId) {
      return queryOne<Account>(
        `SELECT *
           FROM ims.accounts
          WHERE branch_id = $1
            AND LOWER(name) = LOWER($2)
            AND currency_code = $3
          LIMIT 1`,
        [branchId, name, currencyCode]
      );
    }

    return queryOne<Account>(
      `SELECT *
         FROM ims.accounts
        WHERE LOWER(name) = LOWER($1)
          AND currency_code = $2
        LIMIT 1`,
      [name, currencyCode]
    );
  },

  list(scope: BranchScope): Promise<Account[]> {
    if (!scope.isAdmin) {
      return queryMany<Account>(
        `SELECT *
           FROM ims.accounts
          WHERE branch_id = ANY($1)
          ORDER BY name, acc_id DESC`,
        [scope.branchIds]
      );
    }

    return queryMany<Account>(`SELECT * FROM ims.accounts ORDER BY name, acc_id DESC`);
  },

  async create(input: AccountInput, ctx: { branchId: number }): Promise<Account> {
    return queryOne<Account>(
      `INSERT INTO ims.accounts (branch_id, name, institution, currency_code, balance, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        ctx.branchId,
        input.name,
        input.institution || null,
        input.currencyCode || 'USD',
        input.balance ?? 0,
        input.isActive ?? true,
      ]
    ) as Promise<Account>;
  },

  async update(id: number, input: Partial<AccountInput>, scope: BranchScope): Promise<Account | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${p++}`);
      values.push(input.name);
    }
    if (input.institution !== undefined) {
      updates.push(`institution = $${p++}`);
      values.push(input.institution || null);
    }
    if (input.currencyCode !== undefined) {
      updates.push(`currency_code = $${p++}`);
      values.push(input.currencyCode);
    }
    if (input.balance !== undefined) {
      updates.push(`balance = $${p++}`);
      values.push(input.balance);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${p++}`);
      values.push(input.isActive);
    }

    if (!updates.length) {
      if (scope.isAdmin) {
        return queryOne<Account>(`SELECT * FROM ims.accounts WHERE acc_id = $1`, [id]);
      }
      return queryOne<Account>(
        `SELECT * FROM ims.accounts WHERE acc_id = $1 AND branch_id = ANY($2)`,
        [id, scope.branchIds]
      );
    }

    values.push(id);
    let whereSql = `acc_id = $${p}`;
    if (!scope.isAdmin) {
      values.push(scope.branchIds);
      whereSql += ` AND branch_id = ANY($${p + 1})`;
    }

    return queryOne<Account>(
      `UPDATE ims.accounts
          SET ${updates.join(', ')}
        WHERE ${whereSql}
        RETURNING *`,
      values
    );
  },

  async remove(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) {
      await queryOne(`DELETE FROM ims.accounts WHERE acc_id = $1`, [id]);
      return;
    }

    await queryOne(`DELETE FROM ims.accounts WHERE acc_id = $1 AND branch_id = ANY($2)`, [id, scope.branchIds]);
  },
};
