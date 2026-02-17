import { queryMany, queryOne } from '../../db/query';
import { BranchScope } from '../../utils/branchScope';

export interface Customer {
  customer_id: number;
  full_name: string;
  phone: string | null;
  customer_type: 'regular' | 'one-time' | string;
  address: string | null;
  sex: string | null;
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
  isActive?: boolean;
  remainingBalance?: number;
}

let customerBalanceColumn: 'open_balance' | 'remaining_balance' | null = null;

const detectCustomerBalanceColumn = async (): Promise<'open_balance' | 'remaining_balance'> => {
  if (customerBalanceColumn) return customerBalanceColumn;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'`
  );
  const names = new Set(columns.map((row) => row.column_name));

  customerBalanceColumn = names.has('open_balance') ? 'open_balance' : 'remaining_balance';
  return customerBalanceColumn;
};

const mapCustomer = (row: {
  customer_id: number;
  full_name: string;
  phone: string | null;
  address: string | null;
  sex: string | null;
  registered_date: string;
  is_active: boolean;
  balance_value: string | number;
}): Customer => ({
  customer_id: Number(row.customer_id),
  full_name: row.full_name,
  phone: row.phone,
  customer_type: 'regular',
  address: row.address,
  sex: row.sex,
  registered_date: row.registered_date,
  is_active: Boolean(row.is_active),
  balance: Number(row.balance_value || 0),
  remaining_balance: Number(row.balance_value || 0),
});

const scopedCustomer = async (
  id: number,
  scope: BranchScope
): Promise<Customer | null> => {
  const balanceColumn = await detectCustomerBalanceColumn();
  const row = scope.isAdmin
    ? await queryOne<{
        customer_id: number;
        full_name: string;
        phone: string | null;
        address: string | null;
        sex: string | null;
        registered_date: string;
        is_active: boolean;
        balance_value: string;
      }>(
        `SELECT customer_id, full_name, phone, address, sex, registered_date::text, is_active, ${balanceColumn}::text AS balance_value
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
        registered_date: string;
        is_active: boolean;
        balance_value: string;
      }>(
        `SELECT customer_id, full_name, phone, address, sex, registered_date::text, is_active, ${balanceColumn}::text AS balance_value
           FROM ims.customers
          WHERE customer_id = $1
            AND branch_id = ANY($2)`,
        [id, scope.branchIds]
      );

  return row ? mapCustomer(row) : null;
};

export const customersService = {
  async listCustomers(scope: BranchScope, search?: string): Promise<Customer[]> {
    const balanceColumn = await detectCustomerBalanceColumn();
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

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await queryMany<{
      customer_id: number;
      full_name: string;
      phone: string | null;
      address: string | null;
      sex: string | null;
      registered_date: string;
      is_active: boolean;
      balance_value: string;
    }>(
      `SELECT
          customer_id,
          full_name,
          phone,
          address,
          sex,
          registered_date::text,
          is_active,
          ${balanceColumn}::text AS balance_value
       FROM ims.customers
       ${whereSql}
       ORDER BY full_name`,
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
    const row = await queryOne<{
      customer_id: number;
      full_name: string;
      phone: string | null;
      address: string | null;
      sex: string | null;
      registered_date: string;
      is_active: boolean;
      balance_value: string;
    }>(
      `INSERT INTO ims.customers
         (branch_id, full_name, phone, sex, address, ${balanceColumn}, is_active)
       VALUES
         ($1, $2, $3, $4::ims.sex_enum, $5, COALESCE($6, 0), COALESCE($7, TRUE))
       RETURNING customer_id, full_name, phone, address, sex::text, registered_date::text, is_active, ${balanceColumn}::text AS balance_value`,
      [
        context.branchId,
        input.fullName,
        input.phone ?? null,
        input.sex ?? null,
        input.address ?? null,
        input.remainingBalance ?? 0,
        input.isActive ?? true,
      ]
    );

    if (!row) {
      throw new Error('Failed to create customer');
    }
    return mapCustomer(row);
  },

  async updateCustomer(
    id: number,
    input: Partial<CustomerInput>,
    scope: BranchScope
  ): Promise<Customer | null> {
    const balanceColumn = await detectCustomerBalanceColumn();
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
    if (input.sex !== undefined) {
      updates.push(`sex = $${parameter++}::ims.sex_enum`);
      values.push(input.sex ?? null);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${parameter++}`);
      values.push(input.isActive);
    }
    if (input.remainingBalance !== undefined) {
      updates.push(`${balanceColumn} = $${parameter++}`);
      values.push(input.remainingBalance);
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

    const row = await queryOne<{
      customer_id: number;
      full_name: string;
      phone: string | null;
      address: string | null;
      sex: string | null;
      registered_date: string;
      is_active: boolean;
      balance_value: string;
    }>(
      `UPDATE ims.customers
          SET ${updates.join(', ')}
        WHERE ${whereSql}
        RETURNING customer_id, full_name, phone, address, sex::text, registered_date::text, is_active, ${balanceColumn}::text AS balance_value`,
      values
    );

    return row ? mapCustomer(row) : null;
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
