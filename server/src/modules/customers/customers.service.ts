import { queryMany, queryOne } from '../../db/query';

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
}

export interface CustomerInput {
  fullName: string;
  phone?: string | null;
  customerType?: 'regular' | 'one-time' | string;
  address?: string | null;
  sex?: string | null;
  isActive?: boolean;
}

export const customersService = {
  async listCustomers(search?: string): Promise<Customer[]> {
    const params: any[] = [];
    let filter = '';
    if (search) {
      params.push(`%${search}%`);
      filter = 'WHERE c.full_name ILIKE $1 OR c.phone ILIKE $1';
    }

    return queryMany<Customer>(
      `WITH charge_totals AS (
         SELECT customer_id, SUM(amount) AS total_charges
           FROM ims.charges
          GROUP BY customer_id
       ), receipt_totals AS (
         SELECT customer_id, SUM(amount) AS total_receipts
           FROM ims.receipts
          GROUP BY customer_id
       )
       SELECT 
         c.customer_id,
         c.full_name,
         c.phone,
         c.customer_type,
         c.address,
         c.sex,
         c.registered_date,
         c.is_active,
         COALESCE(ct.total_charges, 0) - COALESCE(rt.total_receipts, 0) AS balance
       FROM ims.customers c
       LEFT JOIN charge_totals ct ON ct.customer_id = c.customer_id
       LEFT JOIN receipt_totals rt ON rt.customer_id = c.customer_id
       ${filter}
       ORDER BY c.full_name`,
      params
    );
  },

  async getCustomer(id: number): Promise<Customer | null> {
    return queryOne<Customer>(
      `SELECT 
          c.*,
          COALESCE(ct.total_charges, 0) - COALESCE(rt.total_receipts, 0) AS balance
       FROM ims.customers c
       LEFT JOIN (
         SELECT customer_id, SUM(amount) AS total_charges
         FROM ims.charges GROUP BY customer_id
       ) ct ON ct.customer_id = c.customer_id
       LEFT JOIN (
         SELECT customer_id, SUM(amount) AS total_receipts
         FROM ims.receipts GROUP BY customer_id
       ) rt ON rt.customer_id = c.customer_id
       WHERE c.customer_id = $1`,
      [id]
    );
  },

  async createCustomer(input: CustomerInput): Promise<Customer> {
    return queryOne<Customer>(
      `INSERT INTO ims.customers (
         full_name, phone, customer_type, address, sex, is_active
       ) VALUES ($1, $2, COALESCE($3, 'regular'), $4, $5, COALESCE($6, TRUE))
       RETURNING *`,
      [
        input.fullName,
        input.phone || null,
        input.customerType || 'regular',
        input.address || null,
        input.sex || null,
        input.isActive !== undefined ? input.isActive : true,
      ]
    ) as Promise<Customer>;
  },

  async updateCustomer(id: number, input: Partial<CustomerInput>): Promise<Customer | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let param = 1;

    if (input.fullName !== undefined) {
      updates.push(`full_name = $${param++}`);
      values.push(input.fullName);
    }
    if (input.phone !== undefined) {
      updates.push(`phone = $${param++}`);
      values.push(input.phone);
    }
    if (input.customerType !== undefined) {
      updates.push(`customer_type = $${param++}`);
      values.push(input.customerType);
    }
    if (input.address !== undefined) {
      updates.push(`address = $${param++}`);
      values.push(input.address);
    }
    if (input.sex !== undefined) {
      updates.push(`sex = $${param++}`);
      values.push(input.sex);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${param++}`);
      values.push(input.isActive);
    }

    if (updates.length === 0) {
      return this.getCustomer(id);
    }

    values.push(id);

    return queryOne<Customer>(
      `UPDATE ims.customers
          SET ${updates.join(', ')}, updated_at = NOW()
        WHERE customer_id = $${param}
        RETURNING *`,
      values
    );
  },

  async deleteCustomer(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.customers WHERE customer_id = $1`, [id]);
  },
};
