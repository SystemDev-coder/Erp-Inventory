import { queryMany, queryOne } from '../../db/query';
import { AccountInput } from './accounts.schemas';

export interface Account {
  acc_id: number;
  name: string;
  institution: string | null;
  currency_code: string;
  balance: number;
  is_active: boolean;
}

export const accountsService = {
  findByNameAndCurrency(name: string, currencyCode: string): Promise<Account | null> {
    return queryOne<Account>(
      `SELECT * FROM ims.accounts WHERE LOWER(name) = LOWER($1) AND currency_code = $2 LIMIT 1`,
      [name, currencyCode]
    );
  },

  list(): Promise<Account[]> {
    return queryMany<Account>(`SELECT * FROM ims.accounts ORDER BY acc_id DESC`);
  },

  async create(input: AccountInput): Promise<Account> {
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
