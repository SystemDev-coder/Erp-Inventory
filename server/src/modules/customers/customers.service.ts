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
  credit_allowed: boolean;
  credit_days: number;
  balance: number;
  open_balance: number;
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
  creditAllowed?: boolean;
  creditDays?: number;
  remainingBalance?: number;
  editReason?: string;
}

type CustomerColumnMeta = {
  balanceColumn: 'open_balance' | 'remaining_balance';
  hasOpenBalance: boolean;
  hasRemainingBalance: boolean;
  hasGender: boolean;
  hasType: boolean;
  hasCreditAllowed: boolean;
  hasCreditDays: boolean;
};

let customerColumnMeta: CustomerColumnMeta | null = null;

const detectCustomerColumns = async (): Promise<CustomerColumnMeta> => {
  if (customerColumnMeta) return customerColumnMeta;
  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'`
  );
  const names = new Set(columns.map((row) => row.column_name));
  const hasRemainingBalance = names.has('remaining_balance');
  const hasOpenBalance = names.has('open_balance');
  customerColumnMeta = {
    hasOpenBalance,
    hasRemainingBalance,
    balanceColumn: hasRemainingBalance ? 'remaining_balance' : 'open_balance',
    hasGender: names.has('gender'),
    hasType: names.has('customer_type'),
    hasCreditAllowed: names.has('credit_allowed'),
    hasCreditDays: names.has('credit_days'),
  };
  return customerColumnMeta;
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
  credit_allowed?: boolean | null;
  credit_days?: number | string | null;
  balance_value: string | number;
  open_balance_value?: string | number | null;
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
  credit_allowed: row.credit_allowed !== false,
  credit_days: Number(row.credit_days ?? 30),
  balance: Number(row.balance_value || 0),
  open_balance: Number(row.open_balance_value ?? row.balance_value ?? 0),
  remaining_balance: Number(row.balance_value || 0),
});

const getGenderSelect = (meta: CustomerColumnMeta) =>
  meta.hasGender ? 'COALESCE(gender, sex::text) AS gender' : 'sex::text AS gender';
const getCustomerTypeSelect = (meta: CustomerColumnMeta) =>
  meta.hasType ? 'customer_type' : `'regular'::text AS customer_type`;
const getCreditAllowedSelect = (meta: CustomerColumnMeta) =>
  meta.hasCreditAllowed ? 'credit_allowed' : 'TRUE AS credit_allowed';
const getCreditDaysSelect = (meta: CustomerColumnMeta) =>
  meta.hasCreditDays ? 'credit_days' : '30 AS credit_days';
const getOpenBalanceSelect = (meta: CustomerColumnMeta) =>
  meta.hasOpenBalance ? 'open_balance::text AS open_balance_value' : 'NULL::text AS open_balance_value';

const scopedCustomer = async (
  id: number,
  scope: BranchScope
): Promise<Customer | null> => {
  const meta = await detectCustomerColumns();
  const balanceColumn = meta.balanceColumn;
  const genderSelect = getGenderSelect(meta);
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
        credit_allowed: boolean | null;
        credit_days: number | null;
        balance_value: string;
        open_balance_value: string | null;
      }>(
        `SELECT customer_id, full_name, phone, sex::text AS sex, address, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect(meta)}, ${getCreditAllowedSelect(meta)}, ${getCreditDaysSelect(meta)}, ${balanceColumn}::text AS balance_value, ${getOpenBalanceSelect(meta)}
           FROM ims.customers
          WHERE customer_id = $1
            AND COALESCE(is_deleted, 0)::int = 0`,
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
        credit_allowed: boolean | null;
        credit_days: number | null;
        balance_value: string;
        open_balance_value: string | null;
      }>(
        `SELECT customer_id, full_name, phone, sex::text AS sex, address, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect(meta)}, ${getCreditAllowedSelect(meta)}, ${getCreditDaysSelect(meta)}, ${balanceColumn}::text AS balance_value, ${getOpenBalanceSelect(meta)}
           FROM ims.customers
          WHERE customer_id = $1
            AND branch_id = ANY($2)
            AND COALESCE(is_deleted, 0)::int = 0`,
        [id, scope.branchIds]
      );

  return row ? mapCustomer(row) : null;
};

const findCustomerDeleteBlockReason = async (
  client: PoolClient,
  branchId: number,
  customerId: number
): Promise<string | null> => {
  const meta = await detectCustomerColumns();
  const balanceCol = meta.balanceColumn;
  const balanceRow = await client.query<{ balance: string }>(
    `SELECT COALESCE(${balanceCol}, 0)::text AS balance
       FROM ims.customers
      WHERE customer_id = $1
        AND branch_id = $2`,
    [customerId, branchId]
  );
  const balance = Math.abs(Number(balanceRow.rows[0]?.balance || 0));
  if (balance > 0.005) {
    return `Cannot delete — outstanding balance of ${balance.toFixed(2)} exists. Settle to zero first.`;
  }

  const saleLinked = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM ims.sales
        WHERE branch_id = $1 AND customer_id = $2
     ) AS exists`,
    [branchId, customerId]
  );
  if (Boolean(saleLinked.rows[0]?.exists)) {
    return 'Cannot delete customer because it has sales transactions';
  }

  const returnLinked = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM ims.sales_returns
        WHERE branch_id = $1 AND customer_id = $2
     ) AS exists`,
    [branchId, customerId]
  );
  if (Boolean(returnLinked.rows[0]?.exists)) {
    return 'Cannot delete customer because it has sales return transactions';
  }

  if (await hasCustomerNonOpeningLedger(client, branchId, customerId)) {
    return 'Cannot delete customer because it has ledger transactions';
  }

  return null;
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
    branchIds: number[],
    search?: string,
    dateRange?: { fromDate?: string; toDate?: string },
    pagination?: { page: number; limit: number }
  ): Promise<{ rows: Customer[]; total: number; page: number; limit: number }> {
    const meta = await detectCustomerColumns();
    const balanceColumn = meta.balanceColumn;
    const genderSelect = getGenderSelect(meta);
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 100;

    const params: unknown[] = [];
    const where: string[] = [];

    // UPDATED: Explicitly hide soft-deleted rows even when DB user bypasses RLS (e.g., postgres/superuser).
    where.push(`COALESCE(is_deleted, 0)::int = 0`);

    params.push(branchIds);
    where.push(`branch_id = ANY($${params.length})`);

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

    const countResult = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM ims.customers ${whereSql}`,
      params
    );

    const result = await queryMany<{
      customer_id: number;
      full_name: string;
      phone: string | null;
      address: string | null;
      sex: string | null;
      gender: string | null;
      registered_date: string;
      is_active: boolean;
      customer_type: string | null;
      credit_allowed: boolean | null;
      credit_days: number | null;
      balance_value: string;
      open_balance_value: string | null;
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
          ${getCustomerTypeSelect(meta)},
          ${getCreditAllowedSelect(meta)},
          ${getCreditDaysSelect(meta)},
          ${balanceColumn}::text AS balance_value,
          ${getOpenBalanceSelect(meta)}
       FROM ims.customers
       ${whereSql}
       ORDER BY full_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );

    return {
      rows: result.map(mapCustomer),
      total: Number(countResult?.total || 0),
      page,
      limit,
    };
  },

  async lookupCustomers(branchIds: number[], search?: string, limit = 50): Promise<Customer[]> {
    const meta = await detectCustomerColumns();
    const balanceColumn = meta.balanceColumn;
    const genderSelect = getGenderSelect(meta);

    const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));
    const params: unknown[] = [branchIds];

    // UPDATED: Explicitly hide soft-deleted rows even when DB user bypasses RLS (e.g., postgres/superuser).
    const where: string[] = [`branch_id = ANY($1)`, `is_active = TRUE`, `COALESCE(is_deleted, 0)::int = 0`];

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
      credit_allowed: boolean | null;
      credit_days: number | null;
      balance_value: string;
      open_balance_value: string | null;
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
          ${getCustomerTypeSelect(meta)},
          ${getCreditAllowedSelect(meta)},
          ${getCreditDaysSelect(meta)},
          ${balanceColumn}::text AS balance_value,
          ${getOpenBalanceSelect(meta)}
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
    const meta = await detectCustomerColumns();
    const genderSelect = getGenderSelect(meta);
    const genderValue = input.gender ?? input.sex ?? null;
    const customerType = input.customerType ?? 'regular';
    const opening = Math.max(0, Number(input.remainingBalance ?? 0));
    const creditAllowed =
      customerType === 'one-time' ? false : input.creditAllowed !== false;
    const creditDays = Math.max(0, Number(input.creditDays ?? 30));

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

      if (meta.hasGender) {
        insertColumns += `gender, `;
        insertValues += `$${p++}, `;
        values.push(genderValue);
      }
      if (meta.hasType) {
        insertColumns += `customer_type, `;
        insertValues += `$${p++}, `;
        values.push(customerType);
      }
      if (meta.hasCreditAllowed) {
        insertColumns += `credit_allowed, `;
        insertValues += `$${p++}, `;
        values.push(creditAllowed);
      }
      if (meta.hasCreditDays) {
        insertColumns += `credit_days, `;
        insertValues += `$${p++}, `;
        values.push(creditDays);
      }

      insertColumns += `address, `;
      insertValues += `$${p++}, `;
      values.push(input.address ?? null);

      if (meta.hasOpenBalance && meta.hasRemainingBalance) {
        insertColumns += `open_balance, remaining_balance, `;
        insertValues += `COALESCE($${p++}, 0), COALESCE($${p++}, 0), `;
        values.push(opening, opening);
      } else {
        insertColumns += `${meta.balanceColumn}, `;
        insertValues += `COALESCE($${p++}, 0), `;
        values.push(opening);
      }

      insertColumns += `is_active)`;
      insertValues += `COALESCE($${p++}, TRUE))`;
      values.push(input.isActive ?? true);

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
        credit_allowed: boolean | null;
        credit_days: number | null;
        balance_value: string;
        open_balance_value: string | null;
      }>(
        `INSERT INTO ims.customers
           ${insertColumns}
         VALUES
           ${insertValues}
         RETURNING customer_id, full_name, phone, address, sex::text AS sex, ${genderSelect}, registered_date::text, is_active, ${getCustomerTypeSelect(meta)}, ${getCreditAllowedSelect(meta)}, ${getCreditDaysSelect(meta)}, ${meta.balanceColumn}::text AS balance_value, ${getOpenBalanceSelect(meta)}`,
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
    const meta = await detectCustomerColumns();
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
      if (meta.hasGender) {
        updates.push(`gender = $${parameter++}`);
        values.push(input.gender ?? input.sex ?? null);
      }
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }
    if (input.customerType !== undefined && meta.hasType) {
      updates.push(`customer_type = $${parameter++}`);
      values.push(input.customerType);
      if (meta.hasCreditAllowed && input.customerType === 'one-time') {
        updates.push(`credit_allowed = $${parameter++}`);
        values.push(false);
      }
    }
    if (input.creditAllowed !== undefined && meta.hasCreditAllowed) {
      updates.push(`credit_allowed = $${parameter++}`);
      values.push(input.creditAllowed);
    }
    if (input.creditDays !== undefined && meta.hasCreditDays) {
      updates.push(`credit_days = $${parameter++}`);
      values.push(Math.max(0, Number(input.creditDays ?? 30)));
    }
    const wantsOpeningUpdate = input.remainingBalance !== undefined;
    const openingAmount = Math.max(0, Number(input.remainingBalance ?? 0));
    if (wantsOpeningUpdate) {
      if (meta.hasOpenBalance) {
        updates.push(`open_balance = $${parameter++}`);
        values.push(openingAmount);
      }
      if (meta.hasRemainingBalance) {
        updates.push(`remaining_balance = $${parameter++}`);
        values.push(openingAmount);
      } else if (!meta.hasOpenBalance) {
        updates.push(`${meta.balanceColumn} = $${parameter++}`);
        values.push(openingAmount);
      }
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
        const hasTransactions = await hasCustomerNonOpeningLedger(client, branchId, id);
        if (hasTransactions) {
          const reason = String(input.editReason || '').trim();
          if (!reason) {
            throw ApiError.badRequest(
              'Customer has transactions; provide a reason to change opening balance'
            );
          }
        }
        await upsertCustomerOpeningLedger(client, branchId, id, openingAmount);
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
        credit_allowed: boolean | null;
        credit_days: number | null;
        balance_value: string;
        open_balance_value: string | null;
      }>(
        `UPDATE ims.customers
            SET ${updates.join(', ')}
          WHERE ${whereSql}
          RETURNING customer_id, full_name, phone, address, sex::text AS sex, ${getGenderSelect(meta)}, registered_date::text, is_active, ${getCustomerTypeSelect(meta)}, ${getCreditAllowedSelect(meta)}, ${getCreditDaysSelect(meta)}, ${meta.balanceColumn}::text AS balance_value, ${getOpenBalanceSelect(meta)}`,
        values
      );

      const row = rowRes.rows[0];
      return row ? mapCustomer(row) : null;
    });
  },

  async deleteCustomer(id: number, scope: BranchScope): Promise<void> {
    await withTransaction(async (client) => {
      const row = await client.query<{ branch_id: number }>(
        scope.isAdmin
          ? `SELECT branch_id FROM ims.customers WHERE customer_id = $1`
          : `SELECT branch_id FROM ims.customers WHERE customer_id = $1 AND branch_id = ANY($2)`,
        scope.isAdmin ? [id] : [id, scope.branchIds]
      );
      const branchId = Number(row.rows[0]?.branch_id || 0);
      if (!branchId) throw ApiError.notFound('Customer not found');

      const blockReason = await findCustomerDeleteBlockReason(client, branchId, id);
      if (blockReason) throw ApiError.badRequest(blockReason);

      await client.query(`DELETE FROM ims.customer_ledger WHERE customer_id = $1 AND branch_id = $2`, [
        id,
        branchId,
      ]);
      await client.query(`DELETE FROM ims.customers WHERE customer_id = $1`, [id]);
    });
  },
};
