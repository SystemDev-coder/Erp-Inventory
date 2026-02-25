import { queryMany, queryOne } from '../../db/query';
import { ApiError } from '../../utils/ApiError';
import { BranchScope, pickBranchForWrite, assertBranchAccess } from '../../utils/branchScope';
import {
  AccountTransferInput,
  accountTransferUpdateSchema,
  CustomerReceiptInput,
  SupplierReceiptInput,
  ExpenseChargeInput,
  ExpenseBudgetInput,
  ExpenseInput,
  ExpenseBudgetChargeInput,
  ExpensePaymentInput,
  PayrollChargeInput,
  PayrollPayInput,
  PayrollDeleteInput,
} from './finance.schemas';

const detectColumn = async (
  table: 'customers' | 'suppliers',
  fallback: string,
  candidates: string[]
): Promise<string> => {
  const cols = await queryMany<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='ims' AND table_name=$1`,
    [table]
  );
  const names = new Set(cols.map((c) => c.column_name));
  const found = candidates.find((c) => names.has(c));
  return found || fallback;
};

const adjustEntityBalance = async (
  table: 'customers' | 'suppliers',
  id: number | null,
  branchId: number,
  delta: number
) => {
  if (!id) return;
  const column = await detectColumn(table, 'remaining_balance', ['open_balance', 'remaining_balance']);
  await queryOne(
    `UPDATE ims.${table}
        SET ${column} = GREATEST(${column} + $3, 0)
      WHERE ${table.slice(0, -1)}_id = $1
        AND branch_id = $2`,
    [id, branchId, delta]
  );
};

export const financeService = {
  /* Account transfers */
  async listTransfers(scope: BranchScope, branchId?: number) {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND at.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND at.branch_id = ANY($${params.length})`;
    }

    return queryMany(
      `SELECT at.*, fa.name AS from_account, ta.name AS to_account, u.name AS created_by
         FROM ims.account_transfers at
         JOIN ims.accounts fa ON fa.acc_id = at.from_acc_id
         JOIN ims.accounts ta ON ta.acc_id = at.to_acc_id
         JOIN ims.users u ON u.user_id = at.user_id
        ${where}
        ORDER BY at.transfer_date DESC
        LIMIT 200`,
      params
    );
  },

  async createTransfer(input: AccountTransferInput, scope: BranchScope, userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    if (input.fromAccId === input.toAccId) {
      throw ApiError.badRequest('Source and destination accounts must differ');
    }

    const transferDate = input.transferDate || null;
    const ref = input.referenceNo || null;
    const note = input.note || null;

    await queryOne('BEGIN');
    try {
      const row = await queryOne<{ acc_transfer_id: number }>(
        `INSERT INTO ims.account_transfers
           (branch_id, from_acc_id, to_acc_id, amount, transfer_date, user_id, status, reference_no, note)
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, 'posted', $7, $8)
         RETURNING acc_transfer_id`,
        [branchId, input.fromAccId, input.toAccId, input.amount, transferDate, userId, ref, note]
      );
      if (!row) throw ApiError.internal('Failed to create transfer');

      // Apply balance moves (ignore insufficiency to allow admin override)
      await queryOne(
        `UPDATE ims.accounts SET balance = balance - $3 WHERE branch_id = $1 AND acc_id = $2`,
        [branchId, input.fromAccId, input.amount]
      );
      await queryOne(
        `UPDATE ims.accounts SET balance = balance + $3 WHERE branch_id = $1 AND acc_id = $2`,
        [branchId, input.toAccId, input.amount]
      );

      await queryOne('COMMIT');
      return queryOne(`SELECT * FROM ims.account_transfers WHERE acc_transfer_id = $1`, [row.acc_transfer_id]);
    } catch (err) {
      await queryOne('ROLLBACK');
      throw err;
    }
  },

  async updateTransfer(id: number, body: unknown, scope: BranchScope) {
    const input = accountTransferUpdateSchema.parse(body);
    const existing = await queryOne<{ branch_id: number; status: string; from_acc_id: number; to_acc_id: number; amount: number }>(
      `SELECT branch_id, status, from_acc_id, to_acc_id, amount FROM ims.account_transfers WHERE acc_transfer_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Transfer not found');
    assertBranchAccess(scope, existing.branch_id);
    const newFrom = input.fromAccId ?? existing.from_acc_id;
    const newTo = input.toAccId ?? existing.to_acc_id;
    const newAmount = input.amount ?? existing.amount;
    const newDate = input.transferDate;
    const newRef = input.referenceNo;
    const newNote = input.note;

    // transactional rebuild: reverse old posting if posted, update row, reapply new posting if posted
    await queryOne('BEGIN');
    try {
      if (existing.status === 'posted') {
        // reverse old posting (allow negative temporarily)
        await queryOne(
          `UPDATE ims.accounts SET balance = balance + $3 WHERE branch_id = $1 AND acc_id = $2`,
          [existing.branch_id, existing.from_acc_id, existing.amount]
        );
        await queryOne(
          `UPDATE ims.accounts SET balance = balance - $3 WHERE branch_id = $1 AND acc_id = $2`,
          [existing.branch_id, existing.to_acc_id, existing.amount]
        );
      }

      const updates: string[] = [];
      const values: any[] = [];
      let p = 1;
      updates.push(`from_acc_id = $${p++}`); values.push(newFrom);
      updates.push(`to_acc_id = $${p++}`); values.push(newTo);
      updates.push(`amount = $${p++}`); values.push(newAmount);
      if (newDate !== undefined) { updates.push(`transfer_date = COALESCE($${p++}, transfer_date)`); values.push(newDate); }
      if (newRef !== undefined) { updates.push(`reference_no = $${p++}`); values.push(newRef); }
      if (newNote !== undefined) { updates.push(`note = $${p++}`); values.push(newNote); }
      values.push(id);

      await queryOne(
        `UPDATE ims.account_transfers SET ${updates.join(', ')} WHERE acc_transfer_id = $${p}`,
        values
      );

      if (existing.status === 'posted') {
        await queryOne(
          `UPDATE ims.accounts SET balance = balance - $3 WHERE branch_id = $1 AND acc_id = $2`,
          [existing.branch_id, newFrom, newAmount]
        );
        await queryOne(
          `UPDATE ims.accounts SET balance = balance + $3 WHERE branch_id = $1 AND acc_id = $2`,
          [existing.branch_id, newTo, newAmount]
        );
      }

      await queryOne('COMMIT');
    } catch (err) {
      await queryOne('ROLLBACK');
      throw err;
    }

    return queryOne(`SELECT * FROM ims.account_transfers WHERE acc_transfer_id = $1`, [id]);
  },

  /* Receipts */
  async listCustomerReceipts(scope: BranchScope, branchId?: number) {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND r.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND r.branch_id = ANY($${params.length})`;
    }

    return queryMany(
      `SELECT r.*, c.full_name AS customer_name, a.name AS account_name
         FROM ims.customer_receipts r
         LEFT JOIN ims.customers c ON c.customer_id = r.customer_id
         JOIN ims.accounts a ON a.acc_id = r.acc_id
        ${where}
        ORDER BY r.receipt_date DESC
        LIMIT 200`,
      params
    );
  },

  async createCustomerReceipt(input: CustomerReceiptInput, scope: BranchScope, _userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const row = await queryOne<{ out_receipt_id?: number; receipt_id?: number; out_message: string }>(
      `SELECT * FROM ims.sp_record_customer_receipt($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        branchId,
        input.customerId,
        input.accId,
        input.amount,
        input.paymentMethod || null,
        input.referenceNo || null,
        input.note || null,
        input.receiptDate || null,
      ]
    );
    if (!row) throw ApiError.internal('Failed to record receipt');
    const receiptId = row.out_receipt_id ?? row.receipt_id;
    if (!receiptId) throw ApiError.internal('Receipt ID not returned');
    // return full receipt row for API
    return queryOne(`SELECT * FROM ims.customer_receipts WHERE receipt_id = $1`, [receiptId]);
  },

  async listSupplierReceipts(scope: BranchScope, branchId?: number) {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND r.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND r.branch_id = ANY($${params.length})`;
    }

    return queryMany(
      `SELECT r.*, s.name AS supplier_name, a.name AS account_name
         FROM ims.supplier_receipts r
         LEFT JOIN ims.suppliers s ON s.supplier_id = r.supplier_id
         JOIN ims.accounts a ON a.acc_id = r.acc_id
        ${where}
        ORDER BY r.receipt_date DESC
        LIMIT 200`,
      params
    );
  },

  async createSupplierReceipt(input: SupplierReceiptInput, scope: BranchScope, _userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    await queryOne('BEGIN');
    try {
      const receipt = await queryOne<{
        receipt_id: number;
        branch_id: number;
        acc_id: number;
        amount: number;
      }>(
        `INSERT INTO ims.supplier_receipts
           (branch_id, supplier_id, purchase_id, acc_id, receipt_date, amount, payment_method, reference_no, note)
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, $7, $8, $9)
         RETURNING *`,
        [
          branchId,
          input.supplierId || null,
          input.purchaseId || null,
          input.accId,
          input.receiptDate || null,
          input.amount,
          input.paymentMethod || null,
          input.referenceNo || null,
          input.note || null,
        ]
      );
      if (!receipt) throw ApiError.internal('Failed to create supplier receipt');

      // Decrease paying account balance
      await queryOne(`UPDATE ims.accounts SET balance = balance - $2 WHERE branch_id = $1 AND acc_id = $3`, [
        branchId,
        input.amount,
        input.accId,
      ]);

      // Reduce supplier balance (payable)
      await adjustEntityBalance('suppliers', input.supplierId || null, branchId, -input.amount);

      // Supplier ledger entry
      if (input.supplierId) {
        await queryOne(
          `INSERT INTO ims.supplier_ledger
             (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
           VALUES ($1, $2, 'payment', 'supplier_receipts', $3, $4, $5, 0, $6, $7)`,
          [branchId, input.supplierId, receipt.receipt_id, input.accId, input.amount, input.note || null]
        );
      }

      // Account transaction (cash out)
      await queryOne(
        `INSERT INTO ims.account_transactions
           (branch_id, acc_id, txn_type, ref_table, ref_id, debit, credit, note)
         VALUES ($1, $2, 'out', 'supplier_receipts', $3, 0, $4, $5)`,
        [branchId, input.accId, receipt.receipt_id, input.amount, input.note || null]
      );

      await queryOne('COMMIT');
      return receipt;
    } catch (err) {
      await queryOne('ROLLBACK');
      throw err;
    }
  },

  async updateCustomerReceipt(id: number, input: Partial<CustomerReceiptInput>, scope: BranchScope) {
    const existing = await queryOne<{ branch_id: number }>(
      `SELECT branch_id FROM ims.customer_receipts WHERE receipt_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Customer receipt not found');
    assertBranchAccess(scope, existing.branch_id);

    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;
    if (input.customerId !== undefined) { updates.push(`customer_id = $${p++}`); values.push(input.customerId || null); }
    if (input.saleId !== undefined) { updates.push(`sale_id = $${p++}`); values.push(input.saleId || null); }
    if (input.accId !== undefined) { updates.push(`acc_id = $${p++}`); values.push(input.accId); }
    if (input.amount !== undefined) { updates.push(`amount = $${p++}`); values.push(input.amount); }
    if (input.paymentMethod !== undefined) { updates.push(`payment_method = $${p++}`); values.push(input.paymentMethod || null); }
    if (input.referenceNo !== undefined) { updates.push(`reference_no = $${p++}`); values.push(input.referenceNo || null); }
    if (input.note !== undefined) { updates.push(`note = $${p++}`); values.push(input.note || null); }
    if (input.receiptDate !== undefined) { updates.push(`receipt_date = $${p++}`); values.push(input.receiptDate || null); }
    if (updates.length === 0) return queryOne(`SELECT * FROM ims.customer_receipts WHERE receipt_id = $1`, [id]);
    values.push(id);
    return queryOne(
      `UPDATE ims.customer_receipts SET ${updates.join(', ')} WHERE receipt_id = $${p} RETURNING *`,
      values
    );
  },

  async deleteCustomerReceipt(id: number, scope: BranchScope) {
    const existing = await queryOne<{ branch_id: number }>(
      `SELECT branch_id FROM ims.customer_receipts WHERE receipt_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Customer receipt not found');
    assertBranchAccess(scope, existing.branch_id);
    await queryOne(`DELETE FROM ims.customer_receipts WHERE receipt_id = $1`, [id]);
  },

  async updateSupplierReceipt(id: number, input: Partial<SupplierReceiptInput>, scope: BranchScope) {
    const existing = await queryOne<{ branch_id: number }>(
      `SELECT branch_id FROM ims.supplier_receipts WHERE receipt_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Supplier receipt not found');
    assertBranchAccess(scope, existing.branch_id);

    const updates: string[] = [];
    const values: any[] = [];
    let p = 1;
    if (input.supplierId !== undefined) { updates.push(`supplier_id = $${p++}`); values.push(input.supplierId || null); }
    if (input.purchaseId !== undefined) { updates.push(`purchase_id = $${p++}`); values.push(input.purchaseId || null); }
    if (input.accId !== undefined) { updates.push(`acc_id = $${p++}`); values.push(input.accId); }
    if (input.amount !== undefined) { updates.push(`amount = $${p++}`); values.push(input.amount); }
    if (input.paymentMethod !== undefined) { updates.push(`payment_method = $${p++}`); values.push(input.paymentMethod || null); }
    if (input.referenceNo !== undefined) { updates.push(`reference_no = $${p++}`); values.push(input.referenceNo || null); }
    if (input.note !== undefined) { updates.push(`note = $${p++}`); values.push(input.note || null); }
    if (input.receiptDate !== undefined) { updates.push(`receipt_date = $${p++}`); values.push(input.receiptDate || null); }
    if (updates.length === 0) return queryOne(`SELECT * FROM ims.supplier_receipts WHERE receipt_id = $1`, [id]);
    values.push(id);
    return queryOne(
      `UPDATE ims.supplier_receipts SET ${updates.join(', ')} WHERE receipt_id = $${p} RETURNING *`,
      values
    );
  },

  async deleteSupplierReceipt(id: number, scope: BranchScope) {
    const existing = await queryOne<{ branch_id: number }>(
      `SELECT branch_id FROM ims.supplier_receipts WHERE receipt_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Supplier receipt not found');
    assertBranchAccess(scope, existing.branch_id);
    await queryOne(`DELETE FROM ims.supplier_receipts WHERE receipt_id = $1`, [id]);
  },

  /* Supplier outstanding balances (purchases not fully paid) */
  async listSupplierOutstandingPurchases(scope: BranchScope, supplierId?: number) {
    const supplierNameCol = await detectColumn('suppliers', 'name', ['name', 'supplier_name']);
    const params: any[] = [];
    let where = 'WHERE p.status != $1';
    params.push('void');
    if (supplierId) {
      params.push(supplierId);
      where += ` AND p.supplier_id = $${params.length}`;
    }
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND p.branch_id = ANY($${params.length})`;
    }
    return queryMany(
      `SELECT p.purchase_id,
              p.purchase_date,
              p.total,
              COALESCE(SUM(sp.amount_paid),0) AS paid,
              p.total - COALESCE(SUM(sp.amount_paid),0) AS outstanding,
              s.${supplierNameCol} AS supplier_name,
              p.status
         FROM ims.purchases p
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
         LEFT JOIN ims.supplier_payments sp ON sp.purchase_id = p.purchase_id
        ${where}
        GROUP BY p.purchase_id, p.purchase_date, p.total, s.${supplierNameCol}, p.status
        HAVING p.total - COALESCE(SUM(sp.amount_paid),0) > 0
        ORDER BY p.purchase_date DESC
        LIMIT 200`,
      params
    );
  },

  /* Unpaid (current month) */
  async listCustomerUnpaid(scope: BranchScope, month?: string, branchId?: number) {
    const params: any[] = [];
    let branchFilter = '1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      branchFilter = `c.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      branchFilter = `c.branch_id = ANY($${params.length})`;
    }

    // If month provided, use ledger movements for that month; else use customers balance column if available.
    const balanceColumn = await detectColumn('customers', 'remaining_balance', ['open_balance', 'remaining_balance']);
    if (!month) {
      return queryMany(
        `WITH sales_bal AS (
           SELECT s.branch_id,
                  s.customer_id,
                  COALESCE(SUM(GREATEST(COALESCE(s.total, 0) - COALESCE(s.paid_amount, 0), 0)), 0) AS sales_balance,
                  COALESCE(SUM(COALESCE(s.total, 0)), 0) AS total_sales,
                  COALESCE(SUM(COALESCE(s.paid_amount, 0)), 0) AS paid_from_sales
             FROM ims.sales s
            WHERE s.customer_id IS NOT NULL
              AND s.status <> 'void'
              AND COALESCE(s.doc_type, 'sale') <> 'quotation'
            GROUP BY s.branch_id, s.customer_id
         ),
         receipt_bal AS (
           SELECT r.branch_id,
                  r.customer_id,
                  COALESCE(SUM(COALESCE(r.amount, 0)), 0) AS paid_from_receipts
             FROM ims.customer_receipts r
            WHERE r.customer_id IS NOT NULL
            GROUP BY r.branch_id, r.customer_id
         ),
         merged AS (
           SELECT c.branch_id,
                  c.customer_id,
                  c.full_name AS customer_name,
                  GREATEST(
                    CASE
                      WHEN COALESCE(c.${balanceColumn}, 0) > 0 THEN COALESCE(c.${balanceColumn}, 0)
                      ELSE COALESCE(sb.sales_balance, 0) - COALESCE(rb.paid_from_receipts, 0)
                    END,
                    0
                  ) AS balance,
                  COALESCE(sb.total_sales, 0) AS total,
                  COALESCE(sb.paid_from_sales, 0) + COALESCE(rb.paid_from_receipts, 0) AS paid
             FROM ims.customers c
             LEFT JOIN sales_bal sb
               ON sb.branch_id = c.branch_id
              AND sb.customer_id = c.customer_id
             LEFT JOIN receipt_bal rb
               ON rb.branch_id = c.branch_id
              AND rb.customer_id = c.customer_id
            WHERE ${branchFilter}
         )
         SELECT *
           FROM merged
          WHERE balance > 0
         ORDER BY balance DESC, customer_name`,
        params
      );
    }

    const monthStart = `${month}-01`;
    params.push(monthStart);
    const fromParam = `$${params.length}`;
    params.push(monthStart);
    const toParam = `$${params.length}`;

    return queryMany(
      `SELECT c.branch_id,
              c.customer_id,
              c.full_name AS customer_name,
              COALESCE(SUM(l.debit - l.credit),0) AS balance,
              COALESCE(SUM(l.debit - l.credit),0) AS total,
              0 AS paid
       FROM ims.customers c
       LEFT JOIN ims.customer_ledger l
         ON l.customer_id = c.customer_id
        AND l.branch_id = c.branch_id
        AND l.entry_date::date >= ${fromParam}::date
        AND l.entry_date < (${toParam}::date + INTERVAL '1 month')
       WHERE ${branchFilter}
       GROUP BY c.branch_id, c.customer_id, c.full_name
       HAVING COALESCE(SUM(l.debit - l.credit),0) > 0
       ORDER BY balance DESC, customer_name`,
      params
    );
  },

  async listSupplierUnpaid(scope: BranchScope, month?: string, branchId?: number) {
    const params: any[] = [];
    let branchFilter = '1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      branchFilter = `s.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      branchFilter = `s.branch_id = ANY($${params.length})`;
    }

    const balanceColumn = await detectColumn('suppliers', 'remaining_balance', ['open_balance', 'remaining_balance']);
    if (!month) {
      return queryMany(
        `SELECT s.branch_id,
                s.supplier_id,
                s.name AS supplier_name,
                s.${balanceColumn} AS balance,
                s.${balanceColumn} AS total,
                0 AS paid
         FROM ims.suppliers s
         WHERE ${branchFilter}
           AND s.${balanceColumn} > 0
         ORDER BY balance DESC, supplier_name`,
        params
      );
    }

    const monthStart = `${month}-01`;
    params.push(monthStart);
    const fromParam = `$${params.length}`;
    params.push(monthStart);
    const toParam = `$${params.length}`;

    return queryMany(
      `SELECT s.branch_id,
              s.supplier_id,
              s.name AS supplier_name,
              COALESCE(SUM(l.debit - l.credit),0) AS balance,
              COALESCE(SUM(l.debit - l.credit),0) AS total,
              0 AS paid
       FROM ims.suppliers s
       LEFT JOIN ims.supplier_ledger l
         ON l.supplier_id = s.supplier_id
        AND l.branch_id = s.branch_id
        AND l.entry_date::date >= ${fromParam}::date
        AND l.entry_date < (${toParam}::date + INTERVAL '1 month')
       WHERE ${branchFilter}
       GROUP BY s.branch_id, s.supplier_id, s.name
       HAVING COALESCE(SUM(l.debit - l.credit),0) > 0
       ORDER BY balance DESC, supplier_name`,
      params
    );
  },

  /* Expenses */
  async listExpenses(scope: BranchScope, branchId?: number) {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND e.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND e.branch_id = ANY($${params.length})`;
    }

    return queryMany(
      `SELECT e.*,
              COALESCE(u.full_name, u.name) AS created_by
         FROM ims.expenses e
         JOIN ims.users u ON u.user_id = e.user_id
        ${where}
        ORDER BY e.created_at DESC, e.exp_id DESC
        LIMIT 200`,
      params
    );
  },

  async createExpense(input: ExpenseInput, scope: BranchScope, userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    return queryOne(
      `INSERT INTO ims.expenses (branch_id, name, user_id)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [branchId, input.name, userId]
    );
  },

  async updateExpense(id: number, input: Partial<ExpenseInput>, scope: BranchScope) {
    const sets: string[] = [];
    const params: any[] = [];
    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
    }
    if (input.branchId !== undefined) {
      params.push(input.branchId);
      sets.push(`branch_id = $${params.length}`);
    }
    if (sets.length === 0) throw ApiError.badRequest('Nothing to update');
    params.push(id);
    let where = `WHERE exp_id = $${params.length}`;
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND branch_id = ANY($${params.length})`;
    }
    return queryOne(
      `UPDATE ims.expenses
          SET ${sets.join(', ')}
        ${where}
        RETURNING *`,
      params
    );
  },

  async deleteExpense(id: number, scope: BranchScope) {
    const params: any[] = [id];
    let where = 'WHERE exp_id = $1';
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND branch_id = ANY($${params.length})`;
    }
    await queryOne(`DELETE FROM ims.expenses ${where} RETURNING exp_id`, params);
  },

  async listExpenseCharges(scope: BranchScope, branchId?: number) {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND c.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND c.branch_id = ANY($${params.length})`;
    }

    return queryMany(
      `SELECT c.charge_id  AS exp_ch_id,
              c.charge_date AS exp_date,
              c.reg_date,
              c.amount,
              c.note,
              c.ref_table,
              c.ref_id,
              c.exp_budget,
              CASE WHEN c.exp_budget = 1 OR c.ref_table = 'expense_budgets' THEN 1 ELSE 0 END AS is_budget,
              e.exp_id,
              COALESCE(e.name, 'Expense '||e.exp_id) AS expense_name,
              COALESCE(u.full_name, u.name) AS created_by,
              c.branch_id,
              COALESCE((SELECT COUNT(*) FROM ims.expense_payments p WHERE p.exp_ch_id = c.charge_id),0) AS payment_count,
              COALESCE((SELECT SUM(amount_paid) FROM ims.expense_payments p WHERE p.exp_ch_id = c.charge_id),0) AS paid_sum
         FROM ims.expense_charges c
         JOIN ims.expenses e ON e.exp_id = c.exp_id
         JOIN ims.users u   ON u.user_id = c.user_id
        ${where}
        ORDER BY c.charge_date DESC
        LIMIT 200`,
      params
    );
  },

  async createExpenseCharge(input: ExpenseChargeInput, scope: BranchScope, userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const charge = await queryOne(
      `INSERT INTO ims.expense_charges
         (branch_id, exp_id, charge_date, reg_date, amount, ref_table, ref_id, note, user_id)
       VALUES ($1,$2,COALESCE($3,NOW()),COALESCE($4,$3,NOW()),$5,$6,$7,$8,$9)
       RETURNING charge_id AS exp_ch_id, charge_date AS exp_date, reg_date, amount, exp_id, branch_id, note`,
      [
        branchId,
        input.expId,
        input.expDate || null,
        input.regDate || null,
        input.amount,
        input.expBudgetId ? 'expense_budgets' : null,
        input.expBudgetId || null,
        input.note || null,
        userId
      ]
    );
    return charge;
  },

  async updateExpenseCharge(id: number, input: Partial<ExpenseChargeInput>, scope: BranchScope, userId: number) {
    const sets: string[] = [];
    const params: any[] = [];
    if (input.expId !== undefined) {
      params.push(input.expId);
      sets.push(`exp_id = $${params.length}`);
    }
    if (input.expDate !== undefined) {
      params.push(input.expDate || null);
      sets.push(`charge_date = COALESCE($${params.length}, charge_date)`);
    }
    if (input.amount !== undefined) {
      params.push(input.amount);
      sets.push(`amount = $${params.length}`);
    }
    if (input.regDate !== undefined) {
      params.push(input.regDate || null);
      sets.push(`reg_date = $${params.length}`);
    }
    if (input.note !== undefined) {
      params.push(input.note || null);
      sets.push(`note = $${params.length}`);
    }
    if (input.expBudgetId !== undefined) {
      params.push(input.expBudgetId ? 'expense_budgets' : null);
      sets.push(`ref_table = $${params.length}`);
      params.push(input.expBudgetId || null);
      sets.push(`ref_id = $${params.length}`);
    }
    if (sets.length === 0) throw ApiError.badRequest('Nothing to update');
    params.push(id);
    let where = `WHERE charge_id = $${params.length}`;
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND branch_id = ANY($${params.length})`;
    }
    const charge = await queryOne(
      `UPDATE ims.expense_charges
          SET ${sets.join(', ')}, user_id = ${userId}
        ${where}
        RETURNING charge_id AS exp_ch_id, charge_date AS exp_date, amount, exp_id, branch_id, note`,
      params
    );
    return charge;
  },

  async deleteExpenseCharge(id: number, scope: BranchScope) {
    // fetch charge and branch/expense for validation
    const charge = await queryOne<{ charge_id: number; branch_id: number; exp_id: number }>(
      `SELECT charge_id, branch_id, exp_id FROM ims.expense_charges WHERE charge_id = $1`,
      [id]
    );
    if (!charge) throw ApiError.notFound('Expense charge not found');
    assertBranchAccess(scope, charge.branch_id);

    // block deletion if any payment exists for this expense
    const payment = await queryOne<{ exp_payment_id: number }>(
      `SELECT exp_payment_id FROM ims.expense_payments WHERE exp_ch_id = $1 LIMIT 1`,
      [charge.charge_id]
    );
    if (payment) {
      throw ApiError.badRequest('Cannot delete: this expense has payments recorded.');
    }

    await queryOne(
      `DELETE FROM ims.expense_charges
        WHERE charge_id = $1`,
      [id]
    );
  },

  async deleteExpensePayment(id: number, scope: BranchScope) {
    const payment = await queryOne<{
      exp_payment_id: number;
      branch_id: number;
      acc_id: number;
      amount_paid: number;
      exp_ch_id: number;
    }>(
      `SELECT exp_payment_id, branch_id, acc_id, amount_paid, exp_ch_id
         FROM ims.expense_payments
         WHERE exp_payment_id = $1`,
      [id]
    );
    if (!payment) throw ApiError.notFound('Expense payment not found');
    assertBranchAccess(scope, payment.branch_id);

    await queryOne(`UPDATE ims.accounts SET balance = balance + $1 WHERE acc_id = $2`, [
      payment.amount_paid,
      payment.acc_id,
    ]);

    await queryOne(`DELETE FROM ims.expense_payments WHERE exp_payment_id = $1`, [id]);
  },

  async createExpensePayment(input: ExpensePaymentInput, scope: BranchScope, userId: number) {
    const charge = await queryOne<{ branch_id: number; amount: number; exp_id: number; charge_id: number }>(
      `SELECT branch_id, amount, exp_id, charge_id FROM ims.expense_charges WHERE charge_id = $1`,
      [input.expChargeId]
    );
    if (!charge) throw ApiError.notFound('Expense charge not found');
    assertBranchAccess(scope, charge.branch_id);
    const branchId = input.branchId && input.branchId !== charge.branch_id ? (() => { throw ApiError.badRequest('Branch mismatch'); })() : charge.branch_id;
    const amount = input.amount ?? charge.amount;
    const payDate = input.payDate || null;
    const ref = input.referenceNo || null;
    const note = input.note || null;

    await queryOne('BEGIN');
    try {
      const payment = await queryOne<{ exp_payment_id: number }>(
        `INSERT INTO ims.expense_payments
           (branch_id, exp_ch_id, acc_id, pay_date, amount_paid, reference_no, note, user_id)
         VALUES ($1,$2,$3,COALESCE($4,NOW()),$5,$6,$7,$8)
         RETURNING exp_payment_id`,
        [branchId, charge.charge_id, input.accId, payDate, amount, ref, note, userId]
      );
      if (!payment) throw ApiError.internal('Failed to record expense payment');

      // Decrement account balance
      await queryOne(
        `UPDATE ims.accounts SET balance = balance - $3 WHERE branch_id = $1 AND acc_id = $2`,
        [branchId, input.accId, amount]
      );

      await queryOne('COMMIT');
      return payment;
    } catch (err) {
      await queryOne('ROLLBACK');
      throw err;
    }
  },

  async listExpensePayments(scope: BranchScope, chargeId?: number, expenseId?: number) {
    if (!chargeId && !expenseId) throw ApiError.badRequest('expenseId or chargeId required');
    const params: any[] = [];
    let where = '';
    if (chargeId) {
      const charge = await queryOne<{ branch_id: number }>(
        `SELECT branch_id FROM ims.expense_charges WHERE charge_id = $1`,
        [chargeId]
      );
      if (!charge) throw ApiError.notFound('Expense charge not found');
      assertBranchAccess(scope, charge.branch_id);
      params.push(chargeId);
      where = `p.exp_ch_id = $1`;
    } else if (expenseId) {
      const expRow = await queryOne<{ branch_id: number }>(
        `SELECT branch_id FROM ims.expenses WHERE exp_id = $1`,
        [expenseId]
      );
      if (!expRow) throw ApiError.notFound('Expense not found');
      assertBranchAccess(scope, expRow.branch_id);
      params.push(expenseId);
      where = `p.exp_ch_id IN (SELECT charge_id FROM ims.expense_charges WHERE exp_id = $1)`;
    }

    return queryMany(
      `SELECT p.*, a.name AS account_name
         FROM ims.expense_payments p
         JOIN ims.accounts a ON a.acc_id = p.acc_id
        WHERE ${where}
        ORDER BY p.pay_date DESC`,
      params
    );
  },

  /* Expense budgets */
  async listExpenseBudgets(scope: BranchScope, branchId?: number) {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND e.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND e.branch_id = ANY($${params.length})`;
    }

    return queryMany(
      `SELECT b.*,
              e.name AS expense_name,
              b.fixed_amount AS amount_limit,
              COALESCE(u.full_name, u.name) AS created_by
         FROM ims.expense_budgets b
         JOIN ims.expenses e ON e.exp_id = b.exp_id
         JOIN ims.users u ON u.user_id = b.user_id
        ${where}
        ORDER BY b.budget_id DESC
        LIMIT 200`,
      params
    );
  },

  async createExpenseBudget(input: ExpenseBudgetInput, scope: BranchScope, userId: number) {
    pickBranchForWrite(scope, input.branchId); // permission check only
    const amount = input.fixedAmount ?? input.amountLimit;
    if (amount === undefined || amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');
    const expId = input.expId ?? input.expTypeId;
    if (!expId) throw ApiError.badRequest('Expense is required');
    return queryOne(
      `INSERT INTO ims.expense_budgets
         (exp_id, fixed_amount, note, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        expId,
        amount,
        input.note || null,
        userId,
      ]
    );
  },

  async updateExpenseBudget(id: number, input: Partial<ExpenseBudgetInput>, scope: BranchScope, userId: number) {
    const existing = await queryOne<{ budget_id: number; exp_id: number; branch_id: number }>(
      `SELECT b.budget_id, b.exp_id, e.branch_id
         FROM ims.expense_budgets b
         JOIN ims.expenses e ON e.exp_id = b.exp_id
        WHERE b.budget_id = $1`,
      [id]
    );
    if (!existing) throw ApiError.notFound('Expense budget not found');
    assertBranchAccess(scope, existing.branch_id);

    const sets: string[] = [];
    const params: any[] = [];
    if (input.expId !== undefined || input.expTypeId !== undefined) {
      const newExpId = input.expId ?? input.expTypeId;
      if (!newExpId) throw ApiError.badRequest('Expense is required');
      const expBranch = await queryOne<{ branch_id: number }>(
        `SELECT branch_id FROM ims.expenses WHERE exp_id = $1`,
        [newExpId]
      );
      if (!expBranch) throw ApiError.badRequest('Expense not found');
      assertBranchAccess(scope, expBranch.branch_id);
      params.push(newExpId);
      sets.push(`exp_id = $${params.length}`);
    }
    if (input.fixedAmount !== undefined || input.amountLimit !== undefined) {
      const amt = input.fixedAmount ?? input.amountLimit;
      if (amt !== undefined) {
        if (amt <= 0) throw ApiError.badRequest('Amount must be greater than zero');
        params.push(amt);
        sets.push(`fixed_amount = $${params.length}`);
      }
    }
    if (input.note !== undefined) {
      params.push(input.note || null);
      sets.push(`note = $${params.length}`);
    }
    if (sets.length === 0) throw ApiError.badRequest('Nothing to update');
    params.push(userId);
    sets.push(`user_id = $${params.length}`);
    params.push(id);
    return queryOne(
      `UPDATE ims.expense_budgets
          SET ${sets.join(', ')}
        WHERE budget_id = $${params.length}
        RETURNING *`,
      params
    );
  },

  async deleteExpenseBudget(id: number, scope: BranchScope) {
    const budget = await queryOne<{ budget_id: number; branch_id: number }>(
      `SELECT b.budget_id, e.branch_id
         FROM ims.expense_budgets b
         JOIN ims.expenses e ON e.exp_id = b.exp_id
        WHERE b.budget_id = $1`,
      [id]
    );
    if (!budget) throw ApiError.notFound('Expense budget not found');
    assertBranchAccess(scope, budget.branch_id);
    await queryOne(`DELETE FROM ims.expense_charges WHERE ref_table = 'expense_budgets' AND ref_id = $1`, [id]);
    await queryOne(`DELETE FROM ims.expense_budgets WHERE budget_id = $1`, [id]);
  },

  async chargeExpenseBudget(input: ExpenseBudgetChargeInput, scope: BranchScope, userId: number) {
    const budget = await queryOne<{ exp_id: number; fixed_amount: number | null }>(
      `SELECT exp_id, fixed_amount FROM ims.expense_budgets WHERE budget_id = $1`,
      [input.budgetId]
    );
    if (!budget) throw ApiError.notFound('Budget not found');

    const branchId = pickBranchForWrite(scope, input.branchId);
    const amount = budget.fixed_amount;
    if (!amount || amount <= 0) throw ApiError.badRequest('Budget amount must be greater than zero');
    const chargeDate = input.payDate || null;
    const note = input.note || null;
    const d = chargeDate ? new Date(chargeDate) : new Date();
    const month = d.getUTCMonth() + 1;
    const year = d.getUTCFullYear();

    const existing = await queryOne<{ charge_id: number }>(
      `SELECT charge_id
         FROM ims.expense_charges
        WHERE ref_table = 'expense_budgets'
          AND ref_id = $1
          AND budget_month = $2
          AND budget_year = $3
        LIMIT 1`,
      [input.budgetId, month, year]
    );
    if (existing) throw ApiError.badRequest('Budget already charged for this period');

    const inserted = await queryOne<{ exp_ch_id: number }>(
      `INSERT INTO ims.expense_charges
         (branch_id, exp_id, acc_id, charge_date, reg_date, amount, ref_table, ref_id, exp_budget, budget_month, budget_year, note, user_id)
       VALUES
         ($1,$2,NULL,COALESCE($3, NOW()), COALESCE($3, NOW()), $4, 'expense_budgets', $5, 1, $6, $7, $8, $9)
       RETURNING charge_id AS exp_ch_id`,
      [branchId, budget.exp_id, chargeDate, amount, input.budgetId, month, year, note, userId]
    );

    return inserted;
  },

  async manageExpenseBudgetCharges(
    input: { regDate: string; oper?: string; branchId?: number },
    _scope: BranchScope,
    userId: number
  ) {
    const op = (input.oper || 'SYNC').toUpperCase();
    if (!['INSERT', 'UPDATE', 'DELETE', 'SYNC'].includes(op)) throw ApiError.badRequest('Invalid oper');

    const d = new Date(input.regDate);
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest('Invalid regDate');
    const dateStr = d.toISOString().slice(0, 10);

    // Do not run if there are no budgets
    const budgetCount = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM ims.expense_budgets`
    );
    if (!budgetCount || Number(budgetCount.cnt) === 0) {
      throw ApiError.badRequest('No expense budgets found. Please create a budget before charging.');
    }

    // Prevent double-charge for the same date
    const already = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt
         FROM ims.expense_charges
        WHERE ref_table = 'expense_budgets'
          AND charge_date::date = $1::date`,
      [dateStr]
    );
    if (already && Number(already.cnt) > 0 && op === 'INSERT') {
      throw ApiError.badRequest('Budgets already charged for this date');
    }

    await queryOne(
      `SELECT ims.sp_charge_expense_budget($1, $2, $3, $4)`,
      [null, input.regDate, op, userId] // p_budget_id null -> function will stage all budgets
    );
    return { status: 'ok', oper: op };
  },

  /* Payroll */
  async chargeSalaries(input: PayrollChargeInput, scope: BranchScope, userId: number) {
    if (!input.periodDate) throw ApiError.badRequest('periodDate required');
    // For now, operate across all branches; permission: at least one branch in scope
    if (!scope.branchIds.length && !scope.isAdmin) throw ApiError.forbidden('No branch access');
    const res = await queryOne<{ sp_charge_salary: number }>(
      `SELECT ims.sp_charge_salary($1, $2)`,
      [input.periodDate, userId]
    );
    return { created: res?.sp_charge_salary ?? 0 };
  },

  async listPayroll(scope: BranchScope, period?: string) {
    const params: any[] = [];
    let where = 'WHERE e.status = $1';
    params.push('active');
    if (period) {
      const [y, m] = period.split('-').map((x) => Number(x));
      if (y && m) {
        params.push(y, m);
        where += ` AND pr.period_year = $${params.length - 1} AND pr.period_month = $${params.length}`;
      }
    }
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND e.branch_id = ANY($${params.length})`;
    }
    return queryMany(
      `SELECT pr.payroll_id,
              pr.period_year,
              pr.period_month,
              pr.status,
              pl.payroll_line_id,
              e.emp_id,
              e.full_name,
              pl.net_salary,
              COALESCE( (SELECT SUM(amount_paid) FROM ims.employee_payments ep WHERE ep.payroll_line_id = pl.payroll_line_id), 0) AS paid_sum,
              pr.branch_id
         FROM ims.employees e
         LEFT JOIN ims.payroll_runs pr
           ON pr.period_year = COALESCE($2::int, pr.period_year)
          AND pr.period_month = COALESCE($3::int, pr.period_month)
          AND pr.branch_id = e.branch_id
         LEFT JOIN ims.payroll_lines pl
           ON pl.payroll_id = pr.payroll_id AND pl.emp_id = e.emp_id
        ${where}
        ORDER BY e.full_name`,
      params
    );
  },

  async paySalary(input: PayrollPayInput, scope: BranchScope, userId: number) {
    const line = await queryOne<{
      payroll_line_id: number;
      payroll_id: number;
      branch_id: number;
      emp_id: number;
      net_salary: number;
    }>(
      `SELECT pl.payroll_line_id, pl.payroll_id, pl.branch_id, pl.emp_id, pl.net_salary
         FROM ims.payroll_lines pl
         JOIN ims.payroll_runs pr ON pr.payroll_id = pl.payroll_id
        WHERE pl.payroll_line_id = $1`,
      [input.payrollLineId]
    );
    if (!line) throw ApiError.notFound('Payroll line not found');
    assertBranchAccess(scope, line.branch_id);

    const paidSumRow = await queryOne<{ paid: number }>(
      `SELECT COALESCE(SUM(amount_paid),0) AS paid
         FROM ims.employee_payments WHERE payroll_line_id = $1`,
      [input.payrollLineId]
    );
    const paid = Number(paidSumRow?.paid || 0);
    const remaining = Math.max(0, Number(line.net_salary || 0) - paid);
    const amount = input.amount !== undefined ? Number(input.amount) : remaining;
    if (amount <= 0) throw ApiError.badRequest('Amount must be greater than 0');
    if (amount > remaining) throw ApiError.badRequest('Amount exceeds remaining salary');

    await queryOne('BEGIN');
    try {
      const pay = await queryOne<{ emp_payment_id: number }>(
        `INSERT INTO ims.employee_payments
           (branch_id, payroll_id, payroll_line_id, emp_id, paid_by, acc_id, amount_paid, note, pay_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,NOW()))
         RETURNING emp_payment_id`,
        [
          line.branch_id,
          line.payroll_id,
          line.payroll_line_id,
          line.emp_id,
          userId,
          input.accId,
          amount,
          input.note || null,
          input.payDate || null,
        ]
      );
      if (!pay) throw ApiError.internal('Failed to record salary payment');

      await queryOne(
        `UPDATE ims.accounts SET balance = balance - $2 WHERE acc_id = $1`,
        [input.accId, amount]
      );

      await queryOne('COMMIT');
      return pay;
    } catch (e) {
      await queryOne('ROLLBACK');
      throw e;
    }
  },

  async deletePayroll(input: PayrollDeleteInput, scope: BranchScope, _userId: number) {
    if (input.mode === 'line') {
      if (!input.payrollLineId) throw ApiError.badRequest('payrollLineId required');
      const line = await queryOne<{ payroll_line_id: number; payroll_id: number; branch_id: number }>(
        `SELECT payroll_line_id, payroll_id, branch_id FROM ims.payroll_lines WHERE payroll_line_id = $1`,
        [input.payrollLineId]
      );
      if (!line) throw ApiError.notFound('Payroll line not found');
      assertBranchAccess(scope, line.branch_id);

      await queryOne('BEGIN');
      try {
        await queryOne(`DELETE FROM ims.employee_payments WHERE payroll_line_id = $1`, [line.payroll_line_id]);
        await queryOne(`DELETE FROM ims.payroll_lines WHERE payroll_line_id = $1`, [line.payroll_line_id]);

        const remaining = await queryOne<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM ims.payroll_lines WHERE payroll_id = $1`,
          [line.payroll_id]
        );
        if (!remaining || Number(remaining.cnt) === 0) {
          await queryOne(`DELETE FROM ims.payroll_runs WHERE payroll_id = $1`, [line.payroll_id]);
        }

        await queryOne('COMMIT');
        return { deleted: 1 };
      } catch (e) {
        await queryOne('ROLLBACK');
        throw e;
      }
    }

    // mode === 'period'
    if (!input.period) throw ApiError.badRequest('period required (YYYY-MM)');
    const [y, m] = input.period.split('-').map(Number);
    if (!y || !m) throw ApiError.badRequest('Invalid period');

    await queryOne('BEGIN');
    try {
      // find runs in scope
      const runs = await queryMany<{ payroll_id: number; branch_id: number }>(
        `SELECT payroll_id, branch_id
           FROM ims.payroll_runs
          WHERE period_year = $1 AND period_month = $2`,
        [y, m]
      );
      for (const run of runs) {
        assertBranchAccess(scope, run.branch_id);
      }

      const runIds = runs.map((r) => r.payroll_id);
      if (runIds.length === 0) {
        await queryOne('ROLLBACK');
        throw ApiError.notFound('No payroll runs for this period');
      }

      await queryOne(
        `DELETE FROM ims.employee_payments WHERE payroll_line_id IN (
           SELECT payroll_line_id FROM ims.payroll_lines WHERE payroll_id = ANY($1::bigint[])
         )`,
        [runIds]
      );
      await queryOne(`DELETE FROM ims.payroll_lines WHERE payroll_id = ANY($1::bigint[])`, [runIds]);
      await queryOne(`DELETE FROM ims.payroll_runs WHERE payroll_id = ANY($1::bigint[])`, [runIds]);

      await queryOne('COMMIT');
      return { deleted: runIds.length };
    } catch (e) {
      await queryOne('ROLLBACK');
      throw e;
    }
  },
};
