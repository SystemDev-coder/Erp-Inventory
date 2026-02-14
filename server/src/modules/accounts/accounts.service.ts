import { queryMany, queryOne } from '../../db/query';
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
    // If branch_id provided, scope to that branch (prevents duplicates per branch)
    if (branchId) {
      return queryOne<Account>(
        `SELECT * FROM ims.accounts 
         WHERE branch_id = $1 AND LOWER(name) = LOWER($2) AND currency_code = $3 
         LIMIT 1`,
        [branchId, name, currencyCode]
      );
    }
    // Otherwise check globally (for backward compatibility)
    return queryOne<Account>(
      `SELECT * FROM ims.accounts WHERE LOWER(name) = LOWER($1) AND currency_code = $2 LIMIT 1`,
      [name, currencyCode]
    );
  },

  list(branchIds?: number[]): Promise<Account[]> {
    // If branch IDs provided, filter by them
    if (branchIds && branchIds.length > 0) {
      return queryMany<Account>(
        `SELECT * FROM ims.accounts 
         WHERE branch_id = ANY($1) 
         ORDER BY name, acc_id DESC`,
        [branchIds]
      );
    }
    // Otherwise return all (for super admin)
    return queryMany<Account>(`SELECT * FROM ims.accounts ORDER BY name, acc_id DESC`);
  },

  async create(input: AccountInput): Promise<Account> {
    // branch_id is automatically added by database trigger!
    // created_by and created_at also automatic!
    return queryOne<Account>(
      `INSERT INTO ims.accounts (name, institution, currency_code, balance, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        input.name,
        input.institution || null,
        input.currencyCode || 'USD',
        input.balance ?? 0,
        input.isActive ?? true,
      ]
      // ✅ branch_id, created_by, created_at added automatically by trigger!
    ) as Promise<Account>;
  },

  async update(id: number, input: Partial<AccountInput>): Promise<Account | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;
    if (input.name !== undefined) { updates.push(`name = $${p++}`); values.push(input.name); }
    if (input.institution !== undefined) { updates.push(`institution = $${p++}`); values.push(input.institution || null); }
    if (input.currencyCode !== undefined) { updates.push(`currency_code = $${p++}`); values.push(input.currencyCode); }
    if (input.balance !== undefined) { updates.push(`balance = $${p++}`); values.push(input.balance); }
    if (input.isActive !== undefined) { updates.push(`is_active = $${p++}`); values.push(input.isActive); }

    if (!updates.length) {
      return queryOne<Account>(`SELECT * FROM ims.accounts WHERE acc_id = $1`, [id]);
    }

    values.push(id);
    return queryOne<Account>(
      `UPDATE ims.accounts SET ${updates.join(', ')} WHERE acc_id = $${p} RETURNING *`,
      values
    );
  },

  async remove(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.accounts WHERE acc_id = $1`, [id]);
  },
};
