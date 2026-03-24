import { queryMany, queryOne } from '../../db/query';
import { adminQueryMany } from '../../db/adminQuery';
import { withTransaction } from '../../db/withTx';
import { BranchScope } from '../../utils/branchScope';
import { ApiError } from '../../utils/ApiError';
import { AccountInput } from './accounts.schemas';
import { postGl } from '../../utils/glPosting';
import { ensureCoaAccounts } from '../../utils/coaDefaults';

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
        OR BTRIM(account_type) = ''
  `);

  // Expand account_type values so GL can support full double-entry accounting.
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
    // Finance > Accounts is for cash/bank (payment) accounts only.
    // Keep ledger/system accounts in the database for reporting, but hide them from this list.
    const cashAccountsFilter = `
      AND a.account_type = 'asset'
      AND (
        LOWER(COALESCE(a.name, '')) LIKE '%cash%'
        OR LOWER(COALESCE(a.name, '')) LIKE '%bank%'
        OR COALESCE(NULLIF(BTRIM(a.institution), ''), '') <> ''
      )
    `;

    // Always present live balances:
    // - If the account has any GL postings, use SUM(debit-credit) from ims.account_transactions
    // - Otherwise fallback to ims.accounts.balance (opening balance entered directly)
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
           `WITH txn AS (
              SELECT
                at.branch_id,
                at.acc_id,
                COUNT(*)::int AS txn_count,
               COALESCE(SUM(COALESCE(at.debit, 0) - COALESCE(at.credit, 0)), 0)::double precision AS txn_balance
             FROM ims.account_transactions at
             WHERE at.txn_date::date <= CURRENT_DATE
             GROUP BY at.branch_id, at.acc_id
           )
           SELECT
             a.acc_id,
             a.branch_id,
             a.name,
             a.institution,
             (
               CASE
                 WHEN COALESCE(t.txn_count, 0) > 0 THEN COALESCE(t.txn_balance, 0)
                 ELSE COALESCE(a.balance, 0)::double precision
               END
             )::text AS balance,
             a.is_active,
             a.account_type,
             a.created_at::text
            FROM ims.accounts a
            LEFT JOIN txn t
              ON t.branch_id = a.branch_id
             AND t.acc_id = a.acc_id
            WHERE a.is_active = TRUE
              ${cashAccountsFilter}
            ORDER BY a.name, a.acc_id DESC`
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
          `WITH txn AS (
             SELECT
               at.branch_id,
               at.acc_id,
               COUNT(*)::int AS txn_count,
               COALESCE(SUM(COALESCE(at.debit, 0) - COALESCE(at.credit, 0)), 0)::double precision AS txn_balance
             FROM ims.account_transactions at
             WHERE at.branch_id = ANY($1)
               AND at.txn_date::date <= CURRENT_DATE
             GROUP BY at.branch_id, at.acc_id
           )
           SELECT
             a.acc_id,
             a.branch_id,
             a.name,
             a.institution,
             (
               CASE
                 WHEN COALESCE(t.txn_count, 0) > 0 THEN COALESCE(t.txn_balance, 0)
                 ELSE COALESCE(a.balance, 0)::double precision
               END
             )::text AS balance,
             a.is_active,
             a.account_type,
             a.created_at::text
            FROM ims.accounts a
            LEFT JOIN txn t
              ON t.branch_id = a.branch_id
             AND t.acc_id = a.acc_id
            WHERE a.branch_id = ANY($1)
              AND a.is_active = TRUE
              ${cashAccountsFilter}
            ORDER BY a.name, a.acc_id DESC`,
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

    const accountType = ((input as AccountInput & { accountType?: string }).accountType || 'asset').trim();
    const openingBalance = Number(input.balance ?? 0);

    return withTransaction(async (client) => {
      const rowRes = await client.query<{
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
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING acc_id, branch_id, name, institution, balance::text, is_active, account_type, created_at::text AS created_at`,
        [ctx.branchId, input.name, input.institution || null, openingBalance, input.isActive ?? true, accountType]
      );
      const row = rowRes.rows[0];
      if (!row) throw new Error('Failed to create account');

      if (Math.abs(openingBalance) > 0.000001) {
        const coa = await ensureCoaAccounts(client, ctx.branchId, ['openingBalanceEquity']);
        const debitNormal = ['asset', 'expense', 'cost'].includes(accountType);

        const debit = debitNormal ? Math.abs(openingBalance) : 0;
        const credit = debitNormal ? 0 : Math.abs(openingBalance);
        const equityDebit = credit;
        const equityCredit = debit;

        await postGl(client, {
          branchId: ctx.branchId,
          txnDate: (row.created_at as string) || null,
          txnType: 'opening',
          refTable: 'accounts',
          refId: Number(row.acc_id),
          note: `Opening balance: ${row.name}`,
          lines: [
            { accId: Number(row.acc_id), debit, credit, note: 'Opening balance' },
            { accId: coa.openingBalanceEquity, debit: equityDebit, credit: equityCredit, note: 'Offset (Opening Balance Equity)' },
          ],
        });
      }

      return mapAccount(row);
    }).catch((error: any) => {
      if (String(error?.code || '') === '23505') {
        throw ApiError.conflict('Account with this name already exists.');
      }
      throw error;
    });
  },

  async update(
    id: number,
    input: Partial<AccountInput>,
    scope: BranchScope
  ): Promise<Account | null> {
    await ensureAccountsSchema();

    return withTransaction(async (client) => {
      const existingRes = await client.query<{
        acc_id: number;
        branch_id: number;
        name: string;
        institution: string | null;
        balance: string;
        is_active: boolean;
        account_type: string;
        created_at?: string;
      }>(
        scope.isAdmin
          ? `SELECT acc_id, branch_id, name, institution, balance::text AS balance, is_active, account_type, created_at::text AS created_at
               FROM ims.accounts
              WHERE acc_id = $1
              FOR UPDATE`
          : `SELECT acc_id, branch_id, name, institution, balance::text AS balance, is_active, account_type, created_at::text AS created_at
               FROM ims.accounts
              WHERE acc_id = $1
                AND branch_id = ANY($2)
              FOR UPDATE`,
        scope.isAdmin ? [id] : [id, scope.branchIds]
      );
      const existing = existingRes.rows[0];
      if (!existing) return null;

      if (input.name !== undefined) {
        const dup = await client.query<{ acc_id: number }>(
          `SELECT acc_id
             FROM ims.accounts
            WHERE branch_id = $1
              AND LOWER(TRIM(name)) = LOWER(TRIM($2))
              AND acc_id <> $3
            LIMIT 1`,
          [existing.branch_id, input.name, id]
        );
        if (dup.rows[0]) throw ApiError.conflict('Account with this name already exists.');
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let p = 1;

      if (input.name !== undefined) {
        updates.push(`name = $${p++}`);
        values.push(input.name);
      }
      if (input.institution !== undefined) {
        updates.push(`institution = $${p++}`);
        values.push(input.institution || null);
      }
      if (input.isActive !== undefined) {
        updates.push(`is_active = $${p++}`);
        values.push(input.isActive);
      }

      const nextAccountType =
        (input as Partial<AccountInput> & { accountType?: string }).accountType !== undefined
          ? String((input as Partial<AccountInput> & { accountType?: string }).accountType || 'asset').trim()
          : String(existing.account_type || 'asset').trim();
      if ((input as Partial<AccountInput> & { accountType?: string }).accountType !== undefined) {
        updates.push(`account_type = $${p++}`);
        values.push(nextAccountType);
      }

      const balanceProvided = Object.prototype.hasOwnProperty.call(input, 'balance');
      const prevBalance = Number(existing.balance || 0);
      const nextBalance = balanceProvided ? Number((input as Partial<AccountInput>).balance ?? 0) : prevBalance;
      const balanceDiff = balanceProvided ? nextBalance - prevBalance : 0;
      if (balanceProvided) {
        updates.push(`balance = $${p++}`);
        values.push(nextBalance);
      }

      let updatedRow = existing;
      if (updates.length > 0) {
        values.push(id);
        let whereSql = `acc_id = $${p++}`;
        if (!scope.isAdmin) {
          values.push(scope.branchIds);
          whereSql += ` AND branch_id = ANY($${p++})`;
        }
        const rowRes = await client.query<typeof existing>(
          `UPDATE ims.accounts
              SET ${updates.join(', ')}
            WHERE ${whereSql}
            RETURNING acc_id, branch_id, name, institution, balance::text AS balance, is_active, account_type, created_at::text AS created_at`,
          values as any[]
        );
        if (rowRes.rows[0]) updatedRow = rowRes.rows[0];
      }

      if (balanceProvided && Math.abs(balanceDiff) > 0.000001) {
        const coa = await ensureCoaAccounts(client, Number(existing.branch_id), ['openingBalanceEquity']);
        const debitNormal = ['asset', 'expense', 'cost'].includes(nextAccountType);

        const increase = balanceDiff > 0 ? Math.abs(balanceDiff) : 0;
        const decrease = balanceDiff < 0 ? Math.abs(balanceDiff) : 0;

        const accountDebit = debitNormal ? increase : decrease;
        const accountCredit = debitNormal ? decrease : increase;

        await postGl(client, {
          branchId: Number(existing.branch_id),
          txnType: 'other',
          refTable: 'accounts',
          refId: Number(existing.acc_id),
          note: `Balance adjustment: ${updatedRow.name}`,
          lines: [
            { accId: Number(existing.acc_id), debit: accountDebit, credit: accountCredit, note: '[BALANCE ADJUST]' },
            {
              accId: coa.openingBalanceEquity,
              debit: accountCredit,
              credit: accountDebit,
              note: 'Offset (Opening Balance Equity)',
            },
          ],
        });
      }

      return mapAccount(updatedRow);
    }).catch((error: any) => {
      if (String(error?.code || '') === '23505') {
        throw ApiError.conflict('Account with this name already exists.');
      }
      throw error;
    });
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
