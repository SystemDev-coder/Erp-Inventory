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
  AccountTransferUpdateInput,
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
        `SELECT c.branch_id,
                c.customer_id,
                c.full_name AS customer_name,
                c.${balanceColumn} AS balance,
                c.${balanceColumn} AS total,
                0 AS paid
         FROM ims.customers c
         WHERE ${branchFilter}
           AND c.${balanceColumn} > 0
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
      `SELECT e.*, u.name AS created_by
         FROM ims.expense e
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
      `INSERT INTO ims.expense (branch_id, name, user_id)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [branchId, input.name, userId]
    );
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
      `SELECT c.*, e.name AS expense_name
         FROM ims.expense_charge c
         JOIN ims.expense e ON e.exp_id = c.exp_id
        ${where}
        ORDER BY c.exp_date DESC
        LIMIT 200`,
      params
    );
  },

  async createExpenseCharge(input: ExpenseChargeInput, scope: BranchScope, userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const charge = await queryOne(
      `INSERT INTO ims.expense_charge
         (branch_id, exp_id, amount, exp_date, note, exp_budget, user_id)
       VALUES ($1,$2,$3,COALESCE($4,NOW()),$5,COALESCE($6,0),$7)
       RETURNING *`,
      [branchId, input.expId, input.amount, input.expDate || null, input.note || null, input.expBudgetId || null, userId]
    );
    return charge;
  },

  /* Expense budgets */
  async listExpenseBudgets(scope: BranchScope, branchId?: number) {
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND b.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND b.branch_id = ANY($${params.length})`;
    }

    return queryMany(
      `SELECT b.*, e.name AS expense_name, b.fixed_amount AS amount_limit
         FROM ims.expense_budgets b
         JOIN ims.expense e ON e.exp_id = b.exp_id
        ${where}
        ORDER BY b.period_year DESC, b.period_month DESC, e.name
        LIMIT 200`,
      params
    );
  },

  async createExpenseBudget(input: ExpenseBudgetInput, scope: BranchScope, userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const amount = input.fixedAmount ?? input.amountLimit;
    if (amount === undefined || amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');
    const expId = input.expId ?? input.expTypeId;
    if (!expId) throw ApiError.badRequest('Expense is required');
    return queryOne(
      `INSERT INTO ims.expense_budgets
         (branch_id, exp_id, period_year, period_month, fixed_amount, note, user_id)
       VALUES ($1, $2, COALESCE($3, EXTRACT(YEAR FROM NOW())::INT), COALESCE($4, EXTRACT(MONTH FROM NOW())::INT), $5, $6, $7)
       RETURNING *`,
      [
        branchId,
        expId,
        input.periodYear || null,
        input.periodMonth || null,
        amount,
        input.note || null,
        userId,
      ]
    );
  },

  async chargeExpenseBudget(input: ExpenseBudgetChargeInput, scope: BranchScope, userId: number) {
    const row = await queryOne<{ exp_ch_id: number; exp_payment_id: number }>(
      `SELECT * FROM ims.sp_charge_expense_budget($1,$2,$3,$4,$5,$6)`,
      [
        input.budgetId,
        input.accId,
        input.amount || null,
        input.payDate || null,
        input.note || null,
        userId,
      ]
    );
    return row;
  },
};
