import { queryMany, queryOne } from '../../db/query';
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
  if (customerBalanceColumn) return customerBalanceColumn;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'`
  );
  const names = new Set(columns.map((row) => row.column_name));

  customerBalanceColumn = names.has('open_balance') ? 'open_balance' : 'remaining_balance';
  customerHasGenderColumn = names.has('gender');
  customerHasTypeColumn = names.has('customer_type');
  return customerBalanceColumn;
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

export const customersService = {
  async listCustomers(scope: BranchScope, search?: string): Promise<Customer[]> {
    const balanceColumn = await detectCustomerBalanceColumn();
    const genderSelect = getGenderSelect();
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
    values.push(input.address ?? null, input.remainingBalance ?? 0, input.isActive ?? true);

    const row = await queryOne<{
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
