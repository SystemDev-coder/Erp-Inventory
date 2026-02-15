import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
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
  async listReceipts(scope: BranchScope, search?: string, branchId?: number): Promise<Receipt[]> {
    const params: any[] = [];
    const clauses: string[] = [];

    if (branchId) {
      params.push(branchId);
      clauses.push(`r.branch_id = $${params.length}`);
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      clauses.push(`r.branch_id = ANY($${params.length})`);
    }

    if (search) {
      params.push(`%${search}%`);
      clauses.push(`(c.full_name ILIKE $${params.length} OR r.reference_no ILIKE $${params.length})`);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return queryMany<Receipt>(
      `SELECT r.*, c.full_name AS customer_name
         FROM ims.receipts r
         LEFT JOIN ims.customers c ON c.customer_id = r.customer_id
         ${whereSql}
        ORDER BY r.receipt_date DESC`,
      params
    );
  },

  async createReceipt(input: ReceiptInput, ctx: { branchId: number; userId: number }): Promise<Receipt> {
    const account = await queryOne<{ acc_id: number }>(
      `SELECT acc_id
         FROM ims.accounts
        WHERE acc_id = $1
          AND branch_id = $2
          AND is_active = TRUE`,
      [input.accId, ctx.branchId]
    );
    if (!account) {
      throw ApiError.badRequest('Selected account is not available in this branch');
    }

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

  async updateReceipt(id: number, input: Partial<ReceiptInput>, scope: BranchScope): Promise<Receipt | null> {
    const target = await this.getReceipt(id, scope);
    if (!target) {
      return null;
    }

    if (input.accId !== undefined) {
      const account = await queryOne<{ acc_id: number }>(
        `SELECT acc_id
           FROM ims.accounts
          WHERE acc_id = $1
            AND branch_id = $2
            AND is_active = TRUE`,
        [input.accId, target.branch_id]
      );
      if (!account) {
        throw ApiError.badRequest('Selected account is not available in this branch');
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (input.chargeId !== undefined) {
      updates.push(`charge_id = $${p++}`);
      values.push(input.chargeId);
    }
    if (input.customerId !== undefined) {
      updates.push(`customer_id = $${p++}`);
      values.push(input.customerId);
    }
    if (input.accId !== undefined) {
      updates.push(`acc_id = $${p++}`);
      values.push(input.accId);
    }
    if (input.currencyCode !== undefined) {
      updates.push(`currency_code = $${p++}`);
      values.push(input.currencyCode);
    }
    if (input.fxRate !== undefined) {
      updates.push(`fx_rate = $${p++}`);
      values.push(input.fxRate);
    }
    if (input.receiptDate !== undefined) {
      updates.push(`receipt_date = $${p++}`);
      values.push(input.receiptDate);
    }
    if (input.amount !== undefined) {
      updates.push(`amount = $${p++}`);
      values.push(input.amount);
    }
    if (input.referenceNo !== undefined) {
      updates.push(`reference_no = $${p++}`);
      values.push(input.referenceNo);
    }
    if (input.note !== undefined) {
      updates.push(`note = $${p++}`);
      values.push(input.note);
    }

    if (updates.length === 0) return target;

    values.push(id);
    let whereSql = `receipt_id = $${p}`;
    if (!scope.isAdmin) {
      values.push(scope.branchIds);
      whereSql += ` AND branch_id = ANY($${p + 1})`;
    }

    return queryOne<Receipt>(
      `UPDATE ims.receipts
          SET ${updates.join(', ')}
        WHERE ${whereSql}
        RETURNING *`,
      values
    );
  },

  async getReceipt(id: number, scope: BranchScope): Promise<Receipt | null> {
    if (scope.isAdmin) {
      return queryOne<Receipt>(
        `SELECT r.*, c.full_name AS customer_name
           FROM ims.receipts r
           LEFT JOIN ims.customers c ON c.customer_id = r.customer_id
          WHERE r.receipt_id = $1`,
        [id]
      );
    }

    return queryOne<Receipt>(
      `SELECT r.*, c.full_name AS customer_name
         FROM ims.receipts r
         LEFT JOIN ims.customers c ON c.customer_id = r.customer_id
        WHERE r.receipt_id = $1
          AND r.branch_id = ANY($2)`,
      [id, scope.branchIds]
    );
  },

  async deleteReceipt(id: number, scope: BranchScope): Promise<void> {
    if (scope.isAdmin) {
      await queryOne(`DELETE FROM ims.receipts WHERE receipt_id = $1`, [id]);
      return;
    }

    await queryOne(`DELETE FROM ims.receipts WHERE receipt_id = $1 AND branch_id = ANY($2)`, [id, scope.branchIds]);
  },
};
