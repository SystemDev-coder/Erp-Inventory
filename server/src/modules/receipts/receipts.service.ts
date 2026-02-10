import { queryMany, queryOne } from '../../db/query';
import { ReceiptInput } from './receipts.schemas';

export interface Receipt {
  receipt_id: number;
  charge_id: number;
  customer_id: number | null;
  branch_id: number;
  user_id: number;
  acc_id: number;
  currency_code: string;
  fx_rate: number;
  receipt_date: string;
  amount: number;
  reference_no: string | null;
  note: string | null;
  customer_name?: string | null;
}

export const receiptsService = {
  async listReceipts(search?: string): Promise<Receipt[]> {
    const params: any[] = [];
    let filter = '';
    if (search) {
      params.push(`%${search}%`);
      filter = `WHERE (c.full_name ILIKE $1 OR r.reference_no ILIKE $1)`;
    }
    return queryMany<Receipt>(
      `SELECT r.*,
              c.full_name AS customer_name
         FROM ims.receipts r
         LEFT JOIN ims.customers c ON c.customer_id = r.customer_id
         ${filter}
        ORDER BY r.receipt_date DESC`,
      params
    );
  },

  async createReceipt(input: ReceiptInput, ctx: { branchId: number; userId: number }): Promise<Receipt> {
    return queryOne<Receipt>(
      `INSERT INTO ims.receipts (
         charge_id, customer_id, branch_id, user_id, acc_id,
         currency_code, fx_rate, receipt_date, amount, reference_no, note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()), $9, $10, $11)
       RETURNING *`,
      [
        input.chargeId,
        input.customerId ?? null,
        ctx.branchId,
        ctx.userId,
        input.accId,
        input.currencyCode || 'USD',
        input.fxRate || 1,
        input.receiptDate || null,
        input.amount,
        input.referenceNo || null,
        input.note || null,
      ]
    ) as Promise<Receipt>;
  },

  async updateReceipt(id: number, input: Partial<ReceiptInput>): Promise<Receipt | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (input.chargeId !== undefined) { updates.push(`charge_id = $${p++}`); values.push(input.chargeId); }
    if (input.customerId !== undefined) { updates.push(`customer_id = $${p++}`); values.push(input.customerId); }
    if (input.accId !== undefined) { updates.push(`acc_id = $${p++}`); values.push(input.accId); }
    if (input.currencyCode !== undefined) { updates.push(`currency_code = $${p++}`); values.push(input.currencyCode); }
    if (input.fxRate !== undefined) { updates.push(`fx_rate = $${p++}`); values.push(input.fxRate); }
    if (input.receiptDate !== undefined) { updates.push(`receipt_date = $${p++}`); values.push(input.receiptDate); }
    if (input.amount !== undefined) { updates.push(`amount = $${p++}`); values.push(input.amount); }
    if (input.referenceNo !== undefined) { updates.push(`reference_no = $${p++}`); values.push(input.referenceNo); }
    if (input.note !== undefined) { updates.push(`note = $${p++}`); values.push(input.note); }

    if (updates.length === 0) return this.getReceipt(id);

    values.push(id);
    return queryOne<Receipt>(
      `UPDATE ims.receipts
          SET ${updates.join(', ')}
        WHERE receipt_id = $${p}
        RETURNING *`,
      values
    );
  },

  async getReceipt(id: number): Promise<Receipt | null> {
    return queryOne<Receipt>(
      `SELECT r.*, c.full_name AS customer_name
         FROM ims.receipts r
         LEFT JOIN ims.customers c ON c.customer_id = r.customer_id
        WHERE r.receipt_id = $1`,
      [id]
    );
  },

  async deleteReceipt(id: number): Promise<void> {
    await queryOne(`DELETE FROM ims.receipts WHERE receipt_id = $1`, [id]);
  },
};
