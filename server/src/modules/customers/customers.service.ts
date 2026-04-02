import { PoolClient } from 'pg';
import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';

export interface Customer {
  customer_id: number;
  full_name: string;
  phone: string | null;
  customer_type: 'regular' | 'one-time' | string;
  address: string | null;
  sex: string | null;
  gender: string | null;
  registered_date: string;
  is_active: boolean;
  balance: number;
  remaining_balance: number;
}

export interface CustomerInput {
  fullName: string;
  phone?: string | null;
  customerType?: 'regular' | 'one-time' | string;
  address?: string | null;
  sex?: string | null;
  gender?: string | null;
  isActive?: boolean;
  remainingBalance?: number;
}

let customerBalanceColumn: 'open_balance' | 'remaining_balance' | null = null;
let customerHasGenderColumn: boolean | null = null;
let customerHasTypeColumn: boolean | null = null;

const detectCustomerBalanceColumn = async (): Promise<'open_balance' | 'remaining_balance'> => {
  if (customerBalanceColumn === 'remaining_balance') return customerBalanceColumn;
  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'`
  );
  const names = new Set(columns.map((row) => row.column_name));

  // Prefer `remaining_balance` as the live outstanding; keep `open_balance` as opening balance.
  // NOTE: The system can add `remaining_balance` at runtime (e.g. during "Prepare Accounts").
  // So we must not permanently cache `open_balance` as the live column.
  const next = names.has('remaining_balance') ? 'remaining_balance' : 'open_balance';
  customerBalanceColumn = next;
  customerHasGenderColumn = names.has('gender');
  customerHasTypeColumn = names.has('customer_type');
  return next;
};

const mapCustomer = (row: {
  customer_id: number;
  full_name: string;
  phone: string | null;
  address: string | null;
  sex: string | null;
  gender: string | null;
  registered_date: string;
  is_active: boolean;
  customer_type: string | null;
  balance_value: string | number;
}): Customer => ({
  customer_id: Number(row.customer_id),
  full_name: row.full_name,
  phone: row.phone,
  customer_type: row.customer_type || 'regular',
  address: row.address,
  sex: row.sex,
  gender: row.gender,
  registered_date: row.registered_date,
  is_active: Boolean(row.is_active),
  balance: Number(row.balance_value || 0),
  remaining_balance: Number(row.balance_value || 0),
});

const getGenderSelect = () =>
  customerHasGenderColumn ? 'COALESCE(gender, sex::text) AS gender' : 'sex::text AS gender';
const getCustomerTypeSelect = () =>
  customerHasTypeColumn ? 'customer_type' : `'regular'::text AS customer_type`;

const scopedCustomer = async (
  id: number,
  scope: BranchScope
): Promise<Customer | null> => {
  const balanceColumn = await detectCustomerBalanceColumn();
  const genderSelect = getGenderSelect();
  const row = scope.isAdmin
    ? await queryOne<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        balance_value: string;
      }>(
        `SELECT customer_id, full_name, phone, sex::text AS sex, address, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect()}, ${balanceColumn}::text AS balance_value
           FROM ims.customers
          WHERE customer_id = $1`,
        [id]
      )
    : await queryOne<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        balance_value: string;
      }>(
        `SELECT customer_id, full_name, phone, sex::text AS sex, address, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect()}, ${balanceColumn}::text AS balance_value
           FROM ims.customers
          WHERE customer_id = $1
            AND branch_id = ANY($2)`,
        [id, scope.branchIds]
      );

  return row ? mapCustomer(row) : null;
};

const hasCustomerNonOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  customerId: number
): Promise<boolean> => {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM ims.customer_ledger
        WHERE branch_id = $1
          AND customer_id = $2
          AND NOT (entry_type = 'opening' AND ref_table = 'opening_balance')
     ) AS exists`,
    [branchId, customerId]
  );
  return Boolean(result.rows[0]?.exists);
};

const upsertCustomerOpeningLedger = async (
  client: PoolClient,
  branchId: number,
  customerId: number,
  amount: number
) => {
  await client.query(
    `DELETE FROM ims.customer_ledger
      WHERE branch_id = $1
        AND customer_id = $2
        AND entry_type = 'opening'
        AND ref_table = 'opening_balance'`,
    [branchId, customerId]
  );

  if (!amount) return;

  await client.query(
    `INSERT INTO ims.customer_ledger
      (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, entry_date, note)
     VALUES
      ($1, $2, 'opening', 'opening_balance', $2, NULL, $3, 0, NOW() - INTERVAL '1 second', $4)`,
    [branchId, customerId, amount, '[OPENING BALANCE] Set from customer form']
  );
};

export const customersService = {
  async listCustomers(
    scope: BranchScope,
    search?: string,
    dateRange?: { fromDate?: string; toDate?: string }
  ): Promise<Customer[]> {
    const balanceColumn = await detectCustomerBalanceColumn();
    const genderSelect = getGenderSelect();

    return withTransaction(async (client) => {
      // Keep customer table balances aligned with refund/return ledger logic so the Customers page updates immediately.
      // Only applies when the system is using `remaining_balance` as the live outstanding column.
      if (balanceColumn === 'remaining_balance' && scope.branchIds.length) {
        await client.query(
          `WITH touched AS (
             SELECT DISTINCT l.customer_id
               FROM ims.customer_ledger l
              WHERE l.branch_id = ANY($1)
                AND (
                  COALESCE(l.ref_table, '') = 'sales_returns'
                  OR COALESCE(l.entry_type::text, '') = 'refund'
                  OR COALESCE(l.note, '') ILIKE '%refund%'
                )
           ),
           ledger AS (
             SELECT
               l.customer_id,
               COALESCE(
                 SUM(
                   CASE
                     WHEN (COALESCE(l.entry_type::text, '') = 'refund' OR COALESCE(l.note, '') ILIKE '%refund%')
                       THEN -ABS(COALESCE(l.debit, 0) + COALESCE(l.credit, 0))
                     ELSE COALESCE(l.debit, 0) - COALESCE(l.credit, 0)
                   END
                 ),
                 0
               ) AS amount
              FROM ims.customer_ledger l
              JOIN touched t ON t.customer_id = l.customer_id
             WHERE l.branch_id = ANY($1)
               AND NOT (
                 COALESCE(l.ref_table, '') = 'sales'
                 AND l.ref_id IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1
                     FROM ims.sales s
                    WHERE s.branch_id = l.branch_id
                      AND s.sale_id = l.ref_id
                      AND LOWER(COALESCE(s.status::text, '')) <> 'void'
                      AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
                 )
               )
             GROUP BY l.customer_id
           )
           UPDATE ims.customers c
              SET remaining_balance = GREATEST(COALESCE(l.amount, 0), 0)::numeric(14,2)
             FROM ledger l
            WHERE c.branch_id = ANY($1)
              AND c.customer_id = l.customer_id
              AND c.is_active = TRUE`,
          [scope.branchIds]
        );
      }

      const params: unknown[] = [];
      const where: string[] = [];

      if (!scope.isAdmin) {
        params.push(scope.branchIds);
        where.push(`branch_id = ANY($${params.length})`);
      }

      if (search) {
        params.push(`%${search}%`);
        where.push(
          `(full_name ILIKE $${params.length} OR COALESCE(phone, '') ILIKE $${params.length})`
        );
      }

      if (dateRange?.fromDate && dateRange?.toDate) {
        params.push(dateRange.fromDate);
        where.push(`registered_date >= $${params.length}::date`);
        params.push(dateRange.toDate);
        where.push(`registered_date <= $${params.length}::date`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const result = await client.query<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        balance_value: string;
      }>(
        `SELECT
            customer_id,
            full_name,
            phone,
            address,
            sex::text AS sex,
            ${genderSelect},
            registered_date::text,
            is_active,
            ${getCustomerTypeSelect()},
            ${balanceColumn}::text AS balance_value
         FROM ims.customers
         ${whereSql}
         ORDER BY full_name`,
        params
      );

      return result.rows.map(mapCustomer);
    });
  },

  async lookupCustomers(scope: BranchScope, search?: string, limit = 50): Promise<Customer[]> {
    const balanceColumn = await detectCustomerBalanceColumn();
    const genderSelect = getGenderSelect();

    const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));
    const params: unknown[] = [scope.branchIds];
    const where: string[] = [`branch_id = ANY($1)`, `is_active = TRUE`];

    const q = String(search || '').trim();
    if (q) {
      params.push(`%${q}%`);
      where.push(`(full_name ILIKE $${params.length} OR COALESCE(phone, '') ILIKE $${params.length})`);
    }

    params.push(safeLimit);
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const rows = await queryMany<{
      customer_id: number;
      full_name: string;
      phone: string | null;
      address: string | null;
      sex: string | null;
      gender: string | null;
      registered_date: string;
      is_active: boolean;
      customer_type: string | null;
      balance_value: string;
    }>(
      `SELECT
          customer_id,
          full_name,
          phone,
          address,
          sex::text AS sex,
          ${genderSelect},
          registered_date::text,
          is_active,
          ${getCustomerTypeSelect()},
          ${balanceColumn}::text AS balance_value
       FROM ims.customers
       ${whereSql}
       ORDER BY full_name
       LIMIT $${params.length}`,
      params
    );

    return rows.map(mapCustomer);
  },

  async getCustomer(id: number, scope: BranchScope): Promise<Customer | null> {
    return scopedCustomer(id, scope);
  },

  async createCustomer(
    input: CustomerInput,
    context: { branchId: number }
  ): Promise<Customer> {
    const balanceColumn = await detectCustomerBalanceColumn();
    const genderSelect = getGenderSelect();
    const hasGender = Boolean(customerHasGenderColumn);
    const hasType = Boolean(customerHasTypeColumn);
    const genderValue = input.gender ?? input.sex ?? null;
    const customerType = input.customerType ?? 'regular';
    const opening = Math.max(0, Number(input.remainingBalance ?? 0));

    return withTransaction(async (client) => {
      let insertColumns = `(branch_id, full_name, phone, sex, `;
      let insertValues = `($1, $2, $3, $4::ims.sex_enum, `;
      const values: unknown[] = [
        context.branchId,
        input.fullName,
        input.phone ?? null,
        (genderValue ?? null) as 'male' | 'female' | null,
      ];
      let p = 5;

      if (hasGender) {
        insertColumns += `gender, `;
        insertValues += `$${p++}, `;
        values.push(genderValue);
      }
      if (hasType) {
        insertColumns += `customer_type, `;
        insertValues += `$${p++}, `;
        values.push(customerType);
      }

      insertColumns += `address, ${balanceColumn}, is_active)`;
      insertValues += `$${p++}, COALESCE($${p++}, 0), COALESCE($${p++}, TRUE))`;
      values.push(input.address ?? null, opening, input.isActive ?? true);

      const rowRes = await client.query<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        balance_value: string;
      }>(
        `INSERT INTO ims.customers
           ${insertColumns}
         VALUES
           ${insertValues}
         RETURNING customer_id, full_name, phone, address, sex::text AS sex, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect()}, ${balanceColumn}::text AS balance_value`,
        values
      );

      const row = rowRes.rows[0];
      if (!row) {
        throw new Error('Failed to create customer');
      }

      // Persist opening balance into ledger so "Prepare Accounts" reconciliation won't reset it.
      await upsertCustomerOpeningLedger(client, context.branchId, Number(row.customer_id), opening);

      return mapCustomer(row);
    });
  },

  async updateCustomer(
    id: number,
    input: Partial<CustomerInput>,
    scope: BranchScope
  ): Promise<Customer | null> {
    const balanceColumn = await detectCustomerBalanceColumn();
    const hasGender = Boolean(customerHasGenderColumn);
    const hasType = Boolean(customerHasTypeColumn);
    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.fullName !== undefined) {
      updates.push(`full_name = $${parameter++}`);
      values.push(input.fullName);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${parameter++}`);
      values.push(input.phone ?? null);
    }
    if (input.address !== undefined) {
      updates.push(`address = $${parameter++}`);
      values.push(input.address ?? null);
    }
    if (input.sex !== undefined || input.gender !== undefined) {
      const val = (input.gender ?? input.sex ?? null) as 'male' | 'female' | null;
      updates.push(`sex = $${parameter++}::ims.sex_enum`);
      values.push(val);
      if (hasGender) {
        updates.push(`gender = $${parameter++}`);
        values.push(input.gender ?? input.sex ?? null);
      }
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }
    if (input.customerType !== undefined && hasType) {
      updates.push(`customer_type = $${parameter++}`);
      values.push(input.customerType);
    }
    const wantsOpeningUpdate = input.remainingBalance !== undefined;
    if (wantsOpeningUpdate) {
      updates.push(`${balanceColumn} = $${parameter++}`);
      values.push(Math.max(0, Number(input.remainingBalance ?? 0)));
    }

    if (!updates.length) {
      return scopedCustomer(id, scope);
    }

    values.push(id);
    let whereSql = `customer_id = $${parameter++}`;
    if (!scope.isAdmin) {
      values.push(scope.branchIds);
      whereSql += ` AND branch_id = ANY($${parameter++})`;
    }

    return withTransaction(async (client) => {
      const branchRow = await client.query<{ branch_id: number }>(
        scope.isAdmin
          ? `SELECT branch_id FROM ims.customers WHERE customer_id = $1`
          : `SELECT branch_id FROM ims.customers WHERE customer_id = $1 AND branch_id = ANY($2)`,
        scope.isAdmin ? [id] : [id, scope.branchIds]
      );
      const branchId = Number(branchRow.rows[0]?.branch_id || 0);
      if (!branchId) return null;

      if (wantsOpeningUpdate) {
        if (await hasCustomerNonOpeningLedger(client, branchId, id)) {
          throw ApiError.badRequest('Customer has transactions; cannot change opening balance');
        }
        await upsertCustomerOpeningLedger(
          client,
          branchId,
          id,
          Math.max(0, Number(input.remainingBalance ?? 0))
        );
      }

      const rowRes = await client.query<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        gender: string | null;
        registered_date: string;
        is_active: boolean;
        customer_type: string | null;
        balance_value: string;
      }>(
        `UPDATE ims.customers
            SET ${updates.join(', ')}
          WHERE ${whereSql}
          RETURNING customer_id, full_name, phone, address, sex::text AS sex, ${getGenderSelect()}, registered_date::text, is_active, ${getCustomerTypeSelect()}, ${balanceColumn}::text AS balance_value`,
        values
      );

      const row = rowRes.rows[0];
      return row ? mapCustomer(row) : null;
    });
  },

  async deleteCustomer(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) {
      await queryOne(`DELETE FROM ims.customers WHERE customer_id = $1`, [id]);
      return;
    }

    await queryOne(
      `DELETE FROM ims.customers
        WHERE customer_id = $1
          AND branch_id = ANY($2)`,
      [id, scope.branchIds]
    );
  },
};
