import { queryMany, queryOne } from '../../db/query';
import { pool } from '../../db/pool';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { BranchScope, pickBranchForWrite, assertBranchAccess } from '../../utils/branchScope';
import { adjustSystemAccountBalance } from '../../utils/systemAccounts';
import { postGl } from '../../utils/glPosting';
import { ensureCoaAccounts } from '../../utils/coaDefaults';
import {
  AccountTransferInput,
  accountTransferUpdateSchema,
  CustomerReceiptInput,
  SupplierReceiptInput,
  OtherIncomeInput,
  ExpenseChargeInput,
  ExpenseBudgetInput,
  ExpenseInput,
  ExpenseBudgetChargeInput,
  ExpensePaymentInput,
  PayrollChargeInput,
  PayrollPayInput,
  PayrollDeleteInput,
} from './finance.schemas';
import { PoolClient } from 'pg';

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

const hasColumn = async (table: string, column: string): Promise<boolean> => {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema='ims'
          AND table_name = $1
          AND column_name = $2
     ) AS exists`,
    [table, column]
  );
  return Boolean(row?.exists);
};

type DateRange = { fromDate?: string; toDate?: string };

const OPENING_EXPENSE_NOTE_PREFIX = '[OPENING BALANCE]';

const isOpeningExpenseNote = (note?: string | null): boolean =>
  typeof note === 'string' && note.trimStart().toUpperCase().startsWith(OPENING_EXPENSE_NOTE_PREFIX);

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const lockAccountBalance = async (client: PoolClient, branchId: number, accId: number) => {
  const row = (
    await client.query<{ acc_id: number; balance: string }>(
      `SELECT acc_id, balance::text AS balance
         FROM ims.accounts
        WHERE branch_id = $1
          AND acc_id = $2
        FOR UPDATE`,
      [branchId, accId]
    )
  ).rows[0];
  if (!row) throw ApiError.badRequest('Account not found in selected branch');
  return { accId: Number(row.acc_id), balance: Number(row.balance || 0) };
};

const debitAccount = async (client: PoolClient, branchId: number, accId: number, amount: number) => {
  const amt = roundMoney(amount);
  const current = await lockAccountBalance(client, branchId, accId);
  if (current.balance + 1e-9 < amt) {
    throw ApiError.badRequest('Insufficient funds in selected account');
  }
  await client.query(
    `UPDATE ims.accounts
        SET balance = balance - $3
      WHERE branch_id = $1
        AND acc_id = $2`,
    [branchId, accId, amt]
  );
};

const creditAccount = async (client: PoolClient, branchId: number, accId: number, amount: number) => {
  const amt = roundMoney(amount);
  await lockAccountBalance(client, branchId, accId);
  await client.query(
    `UPDATE ims.accounts
        SET balance = balance + $3
      WHERE branch_id = $1
        AND acc_id = $2`,
    [branchId, accId, amt]
  );
};

const rewriteExpenseChargeGl = async (
  client: PoolClient,
  params: { branchId: number; chargeId: number }
) => {
  const charge = (
    await client.query<{
      charge_id: number;
      branch_id: number;
      charge_date: string | null;
      amount: string;
      note: string | null;
      is_opening_paid: boolean;
    }>(
      `SELECT
          c.charge_id,
          c.branch_id,
          c.charge_date::text AS charge_date,
          COALESCE(c.amount, 0)::text AS amount,
          c.note,
          COALESCE(
            NULLIF(to_jsonb(c) ->> 'is_opening_paid', '')::boolean,
            COALESCE(c.note, '') ILIKE '${OPENING_EXPENSE_NOTE_PREFIX}%'
          ) AS is_opening_paid
       FROM ims.expense_charges c
      WHERE c.branch_id = $1
        AND c.charge_id = $2
      LIMIT 1`,
      [params.branchId, params.chargeId]
    )
  ).rows[0];
  if (!charge) return;

  await client.query(
    `DELETE FROM ims.account_transactions
      WHERE branch_id = $1
        AND ref_table = 'expense_charges'
        AND ref_id = $2`,
    [params.branchId, params.chargeId]
  );

  if (charge.is_opening_paid) return;
  const amount = roundMoney(Number(charge.amount || 0));
  if (amount <= 0) return;

  const coa = await ensureCoaAccounts(client, params.branchId, ['operatingExpense', 'expensePayable']);
  await postGl(client, {
    branchId: params.branchId,
    txnDate: charge.charge_date || null,
    txnType: 'other',
    refTable: 'expense_charges',
    refId: params.chargeId,
    note: `Expense charge #${params.chargeId}${charge.note ? ` â€” ${charge.note}` : ''}`,
    lines: [
      { accId: coa.operatingExpense, debit: amount, credit: 0, note: 'Operating expense' },
      { accId: coa.expensePayable, debit: 0, credit: amount, note: 'Expense payable' },
    ],
  });
};

export const financeService = {
  /* Account transfers */
  async listTransfers(scope: BranchScope, branchId?: number, range: DateRange = {}) {
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
    if (range.fromDate && range.toDate) {
      params.push(range.fromDate);
      where += ` AND at.transfer_date::date >= $${params.length}::date`;
      params.push(range.toDate);
      where += ` AND at.transfer_date::date <= $${params.length}::date`;
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

    return withTransaction(async (client) => {
      const row = (await client.query<{ acc_transfer_id: number }>(
        `INSERT INTO ims.account_transfers
           (branch_id, from_acc_id, to_acc_id, amount, transfer_date, user_id, status, reference_no, note)
         VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, 'posted', $7, $8)
         RETURNING acc_transfer_id`,
        [branchId, input.fromAccId, input.toAccId, input.amount, transferDate, userId, ref, note]
      )).rows[0];
      if (!row) throw ApiError.internal('Failed to create transfer');

      await debitAccount(client, branchId, input.fromAccId, input.amount);
      await creditAccount(client, branchId, input.toAccId, input.amount);

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'account_transfers'
            AND ref_id = $2`,
        [branchId, row.acc_transfer_id]
      );
      await postGl(client, {
        branchId,
        txnDate: transferDate,
        txnType: 'other',
        refTable: 'account_transfers',
        refId: Number(row.acc_transfer_id),
        note: `Account transfer #${row.acc_transfer_id}${note ? ` â€” ${note}` : ''}`,
        lines: [
          { accId: input.toAccId, debit: roundMoney(input.amount), credit: 0, note: 'Transfer in' },
          { accId: input.fromAccId, debit: 0, credit: roundMoney(input.amount), note: 'Transfer out' },
        ],
      });

      return (await client.query(`SELECT * FROM ims.account_transfers WHERE acc_transfer_id = $1`, [row.acc_transfer_id]))
        .rows[0];
    });
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
    return withTransaction(async (client) => {
      const locked = (await client.query<{ branch_id: number; status: string; from_acc_id: number; to_acc_id: number; amount: number; transfer_date: string | null }>(
        `SELECT branch_id, status::text AS status, from_acc_id, to_acc_id, amount, transfer_date::text AS transfer_date
           FROM ims.account_transfers
          WHERE acc_transfer_id = $1
          FOR UPDATE`,
        [id]
      )).rows[0];
      if (!locked) throw ApiError.notFound('Transfer not found');

      if (locked.status === 'posted') {
        await creditAccount(client, locked.branch_id, locked.from_acc_id, Number(locked.amount));
        await debitAccount(client, locked.branch_id, locked.to_acc_id, Number(locked.amount));
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

      const updated = (await client.query(
        `UPDATE ims.account_transfers SET ${updates.join(', ')} WHERE acc_transfer_id = $${p} RETURNING *`,
        values
      )).rows[0];

      if (locked.status === 'posted') {
        await debitAccount(client, locked.branch_id, newFrom, newAmount);
        await creditAccount(client, locked.branch_id, newTo, newAmount);

        await client.query(
          `DELETE FROM ims.account_transactions
            WHERE branch_id = $1
              AND ref_table = 'account_transfers'
              AND ref_id = $2`,
          [locked.branch_id, id]
        );
        await postGl(client, {
          branchId: locked.branch_id,
          txnDate: (newDate ?? locked.transfer_date) || null,
          txnType: 'other',
          refTable: 'account_transfers',
          refId: id,
          note: `Account transfer #${id}${newNote ? ` â€” ${newNote}` : ''}`,
          lines: [
            { accId: newTo, debit: roundMoney(newAmount), credit: 0, note: 'Transfer in' },
            { accId: newFrom, debit: 0, credit: roundMoney(newAmount), note: 'Transfer out' },
          ],
        });
      }

      return updated;
    });
  },

  /* Receipts */
  async listCustomerReceipts(scope: BranchScope, branchId?: number, range: DateRange = {}) {
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
    if (range.fromDate && range.toDate) {
      params.push(range.fromDate);
      where += ` AND r.receipt_date::date >= $${params.length}::date`;
      params.push(range.toDate);
      where += ` AND r.receipt_date::date <= $${params.length}::date`;
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
    if (!input.customerId) {
      throw ApiError.badRequest('Customer is required for customer receipt');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const customerBalanceColumn = await detectColumn('customers', 'remaining_balance', ['remaining_balance', 'open_balance']);
      const customerRow = await client.query<{ customer_id: number; balance: string }>(
        `SELECT customer_id, COALESCE(${customerBalanceColumn}, 0)::text AS balance
           FROM ims.customers
          WHERE customer_id = $1
            AND branch_id = $2
          FOR UPDATE`,
        [input.customerId, branchId]
      );
      if (!customerRow.rows[0]) {
        throw ApiError.badRequest('Customer not found in selected branch');
      }

      const accountExists = await client.query<{ acc_id: number }>(
        `SELECT acc_id
           FROM ims.accounts
          WHERE acc_id = $1
            AND branch_id = $2
          LIMIT 1`,
        [input.accId, branchId]
      );
      if (!accountExists.rows[0]) {
        throw ApiError.badRequest('Account not found in selected branch');
      }

      const outstandingBefore = Math.max(Number(customerRow.rows[0].balance || 0), 0);
      const amount = roundMoney(Number(input.amount || 0));
      if (amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');
      const applyToAr = roundMoney(Math.min(amount, outstandingBefore));
      const advance = roundMoney(amount - applyToAr);

      const hasSaleIdColumn = await hasColumn('customer_receipts', 'sale_id');
      const insertColumns = ['branch_id', 'customer_id', 'acc_id', 'receipt_date', 'amount', 'payment_method', 'reference_no', 'note'];
      const insertValues: unknown[] = [
        branchId,
        input.customerId,
        input.accId,
        input.receiptDate || null,
        amount,
        input.paymentMethod || null,
        input.referenceNo || null,
        input.note || null,
      ];

      if (hasSaleIdColumn) {
        insertColumns.splice(2, 0, 'sale_id');
        insertValues.splice(2, 0, input.saleId ?? null);
      }

      const placeholders = insertValues.map((_, idx) =>
        insertColumns[idx] === 'receipt_date' ? `COALESCE($${idx + 1}::timestamptz, NOW())` : `$${idx + 1}`
      );

      const receiptRes = await client.query<any>(
        `INSERT INTO ims.customer_receipts (${insertColumns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING receipt_id, receipt_date::text AS receipt_date`,
        insertValues as any[]
      );
      const receipt = receiptRes.rows[0];
      if (!receipt?.receipt_id) throw ApiError.internal('Failed to create customer receipt');

      await client.query(
        `UPDATE ims.customers
            SET ${customerBalanceColumn} = ${customerBalanceColumn} - $3
          WHERE customer_id = $1
            AND branch_id = $2`,
        [input.customerId, branchId, amount]
      );
      await adjustSystemAccountBalance(client, { branchId, kind: 'receivable', delta: -amount });

      const hasTotalPaid = await hasColumn('customers', 'total_paid');
      if (hasTotalPaid) {
        await client.query(
          `UPDATE ims.customers
              SET total_paid = COALESCE(total_paid, 0) + $3
            WHERE customer_id = $1
              AND branch_id = $2`,
          [input.customerId, branchId, amount]
        );
      }

      await client.query(
        `UPDATE ims.accounts
            SET balance = balance + $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [branchId, input.accId, amount]
      );

      await client.query(
        `INSERT INTO ims.customer_ledger
           (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
         VALUES ($1, $2, 'payment', 'customer_receipts', $3, $4, 0, $5, $6)`,
        [branchId, input.customerId, receipt.receipt_id, input.accId, amount, input.note || null]
      );

      const coa = await ensureCoaAccounts(client, branchId, ['accountsReceivable', 'customerAdvances']);
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'customer_receipts'
            AND ref_id = $2`,
        [branchId, receipt.receipt_id]
      );
      await postGl(client, {
        branchId,
        txnDate: receipt.receipt_date || input.receiptDate || null,
        txnType: 'sale_payment',
        refTable: 'customer_receipts',
        refId: Number(receipt.receipt_id),
        note: `Customer receipt #${receipt.receipt_id}`,
        lines: [
          { accId: input.accId, debit: amount, credit: 0, note: 'Cash/bank received' },
          ...(applyToAr > 0 ? [{ accId: coa.accountsReceivable, debit: 0, credit: applyToAr, note: 'Reduce receivable' }] : []),
          ...(advance > 0 ? [{ accId: coa.customerAdvances, debit: 0, credit: advance, note: 'Customer advance' }] : []),
        ],
      });

      await client.query('COMMIT');
      return receipt;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async listSupplierReceipts(scope: BranchScope, branchId?: number, range: DateRange = {}) {
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
    if (range.fromDate && range.toDate) {
      params.push(range.fromDate);
      where += ` AND r.receipt_date::date >= $${params.length}::date`;
      params.push(range.toDate);
      where += ` AND r.receipt_date::date <= $${params.length}::date`;
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let resolvedSupplierId = input.supplierId || null;
      const resolvedPurchaseId = input.purchaseId || null;

      if (resolvedPurchaseId) {
        const purchase = await client.query<{
          branch_id: number;
          supplier_id: number | null;
          status: string | null;
        }>(
          `SELECT branch_id, supplier_id, status::text AS status
             FROM ims.purchases
            WHERE purchase_id = $1
            FOR UPDATE`,
          [resolvedPurchaseId]
        );
        const row = purchase.rows[0];
        if (!row) throw ApiError.badRequest('Selected purchase was not found');
        if (Number(row.branch_id) !== branchId) {
          throw ApiError.badRequest('Selected purchase belongs to a different branch');
        }
        if ((row.status || '').toLowerCase() === 'void') {
          throw ApiError.badRequest('Cannot register payment for a void purchase');
        }

        const purchaseSupplierId = row.supplier_id ? Number(row.supplier_id) : null;
        if (resolvedSupplierId && purchaseSupplierId && resolvedSupplierId !== purchaseSupplierId) {
          throw ApiError.badRequest('Supplier does not match the selected purchase');
        }
        if (!resolvedSupplierId && purchaseSupplierId) {
          resolvedSupplierId = purchaseSupplierId;
        }
      }

      if (!resolvedSupplierId) {
        throw ApiError.badRequest('Supplier is required for supplier payment');
      }

      const supplierBalanceColumn = await detectColumn('suppliers', 'remaining_balance', ['remaining_balance', 'open_balance']);
      const supplierRow = await client.query<{ supplier_id: number; balance: string }>(
        `SELECT supplier_id, COALESCE(${supplierBalanceColumn}, 0)::text AS balance
           FROM ims.suppliers
          WHERE supplier_id = $1
            AND branch_id = $2
          FOR UPDATE`,
        [resolvedSupplierId, branchId]
      );
      if (!supplierRow.rows[0]) {
        throw ApiError.badRequest('Supplier not found in selected branch');
      }

      const accountRow = await client.query<{ acc_id: number; balance: string }>(
        `SELECT acc_id, balance::text AS balance
           FROM ims.accounts
          WHERE acc_id = $1
            AND branch_id = $2
          FOR UPDATE`,
        [input.accId, branchId]
      );
      if (!accountRow.rows[0]) throw ApiError.badRequest('Account not found in selected branch');

      const amount = roundMoney(Number(input.amount || 0));
      if (amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');

      const cashBalance = Number(accountRow.rows[0].balance || 0);
      if (cashBalance + 1e-9 < amount) throw ApiError.badRequest('Insufficient funds in selected account');

      const payableBefore = Math.max(Number(supplierRow.rows[0].balance || 0), 0);
      const applyToAp = roundMoney(Math.min(amount, payableBefore));
      const advance = roundMoney(amount - applyToAp);

      const receiptRes = await client.query<{
        receipt_id: number;
        receipt_date: string;
      }>(
        `INSERT INTO ims.supplier_receipts
           (branch_id, supplier_id, purchase_id, acc_id, receipt_date, amount, payment_method, reference_no, note)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()), $6, $7, $8, $9)
         RETURNING receipt_id, receipt_date::text AS receipt_date`,
        [
          branchId,
          resolvedSupplierId,
          resolvedPurchaseId,
          input.accId,
          input.receiptDate || null,
          amount,
          input.paymentMethod || null,
          input.referenceNo || null,
          input.note || null,
        ]
      );
      const receipt = receiptRes.rows[0];
      if (!receipt?.receipt_id) throw ApiError.internal('Failed to create supplier receipt');

      await client.query(
        `UPDATE ims.accounts
            SET balance = balance - $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [branchId, input.accId, amount]
      );

      await client.query(
        `UPDATE ims.suppliers
            SET ${supplierBalanceColumn} = ${supplierBalanceColumn} - $3
          WHERE supplier_id = $1
            AND branch_id = $2`,
        [resolvedSupplierId, branchId, amount]
      );
      await adjustSystemAccountBalance(client, { branchId, kind: 'payable', delta: -amount });

      await client.query(
        `INSERT INTO ims.supplier_ledger
           (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note)
         VALUES ($1, $2, 'payment', 'supplier_receipts', $3, $4, $5, 0, $6)`,
        [branchId, resolvedSupplierId, receipt.receipt_id, input.accId, amount, input.note || null]
      );

      const coa = await ensureCoaAccounts(client, branchId, ['accountsPayable', 'supplierAdvances']);
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'supplier_receipts'
            AND ref_id = $2`,
        [branchId, receipt.receipt_id]
      );
      await postGl(client, {
        branchId,
        txnDate: receipt.receipt_date || input.receiptDate || null,
        txnType: 'supplier_payment',
        refTable: 'supplier_receipts',
        refId: Number(receipt.receipt_id),
        note: `Supplier payment #${receipt.receipt_id}`,
        lines: [
          ...(applyToAp > 0 ? [{ accId: coa.accountsPayable, debit: applyToAp, credit: 0, note: 'Reduce payable' }] : []),
          ...(advance > 0 ? [{ accId: coa.supplierAdvances, debit: advance, credit: 0, note: 'Supplier advance' }] : []),
          { accId: input.accId, debit: 0, credit: amount, note: 'Cash/bank paid' },
        ],
      });

      await client.query('COMMIT');
      return { receipt_id: receipt.receipt_id, branch_id: branchId, acc_id: input.accId, amount };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async updateCustomerReceipt(id: number, input: Partial<CustomerReceiptInput>, scope: BranchScope) {
    return withTransaction(async (client) => {
      const receipt = (
        await client.query<{
          receipt_id: number;
          branch_id: number;
          customer_id: number | null;
          acc_id: number;
          amount: string;
          receipt_date: string | null;
          note: string | null;
          sale_id: number | null;
        }>(
          `SELECT
             r.receipt_id,
             r.branch_id,
             r.customer_id,
             r.acc_id,
             r.amount::text AS amount,
             r.receipt_date::text AS receipt_date,
             r.note,
             NULLIF(to_jsonb(r) ->> 'sale_id', '')::bigint AS sale_id
           FROM ims.customer_receipts r
          WHERE r.receipt_id = $1
          FOR UPDATE`,
          [id]
        )
      ).rows[0];
      if (!receipt) throw ApiError.notFound('Customer receipt not found');
      assertBranchAccess(scope, receipt.branch_id);

      const customerBalanceColumn = await detectColumn('customers', 'remaining_balance', ['remaining_balance', 'open_balance']);
      const oldCustomerId = receipt.customer_id ? Number(receipt.customer_id) : null;
      if (!oldCustomerId) throw ApiError.badRequest('Receipt has no customer');

      const oldAmount = roundMoney(Number(receipt.amount || 0));
      const oldAccId = Number(receipt.acc_id);

      const nextCustomerId = input.customerId !== undefined ? (input.customerId || null) : oldCustomerId;
      if (!nextCustomerId) throw ApiError.badRequest('Customer is required for customer receipt');
      const nextAccId = input.accId !== undefined ? Number(input.accId) : oldAccId;
      const nextAmount = input.amount !== undefined ? roundMoney(Number(input.amount || 0)) : oldAmount;
      if (nextAmount <= 0) throw ApiError.badRequest('Amount must be greater than zero');

      const hasSaleIdColumn = await hasColumn('customer_receipts', 'sale_id');
      const nextSaleId = hasSaleIdColumn
        ? (input.saleId !== undefined ? (input.saleId || null) : receipt.sale_id)
        : null;

      // Reverse old financial effects
      await client.query(
        `UPDATE ims.customers
            SET ${customerBalanceColumn} = ${customerBalanceColumn} + $3
          WHERE customer_id = $1
            AND branch_id = $2`,
        [oldCustomerId, receipt.branch_id, oldAmount]
      );
      await adjustSystemAccountBalance(client, { branchId: receipt.branch_id, kind: 'receivable', delta: oldAmount });

      await client.query(
        `UPDATE ims.accounts
            SET balance = balance - $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [receipt.branch_id, oldAccId, oldAmount]
      );

      await client.query(
        `DELETE FROM ims.customer_ledger
          WHERE branch_id = $1
            AND ref_table = 'customer_receipts'
            AND ref_id = $2`,
        [receipt.branch_id, id]
      );
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'customer_receipts'
            AND ref_id = $2`,
        [receipt.branch_id, id]
      );

      // Validate customer + account in branch
      const customerRow = (
        await client.query<{ balance: string }>(
          `SELECT COALESCE(${customerBalanceColumn}, 0)::text AS balance
             FROM ims.customers
            WHERE customer_id = $1
              AND branch_id = $2
            FOR UPDATE`,
          [nextCustomerId, receipt.branch_id]
        )
      ).rows[0];
      if (!customerRow) throw ApiError.badRequest('Customer not found in selected branch');

      const accountRow = (
        await client.query<{ acc_id: number }>(
          `SELECT acc_id
             FROM ims.accounts
            WHERE acc_id = $1
              AND branch_id = $2
            FOR UPDATE`,
          [nextAccId, receipt.branch_id]
        )
      ).rows[0];
      if (!accountRow) throw ApiError.badRequest('Account not found in selected branch');

      // Apply new financial effects
      await client.query(
        `UPDATE ims.customers
            SET ${customerBalanceColumn} = ${customerBalanceColumn} - $3
          WHERE customer_id = $1
            AND branch_id = $2`,
        [nextCustomerId, receipt.branch_id, nextAmount]
      );
      await adjustSystemAccountBalance(client, { branchId: receipt.branch_id, kind: 'receivable', delta: -nextAmount });

      await client.query(
        `UPDATE ims.accounts
            SET balance = balance + $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [receipt.branch_id, nextAccId, nextAmount]
      );

      await client.query(
        `INSERT INTO ims.customer_ledger
           (branch_id, customer_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note, entry_date)
         VALUES ($1, $2, 'payment', 'customer_receipts', $3, $4, 0, $5, $6, COALESCE($7::timestamptz, NOW()))`,
        [
          receipt.branch_id,
          nextCustomerId,
          id,
          nextAccId,
          nextAmount,
          input.note !== undefined ? input.note || null : receipt.note,
          input.receiptDate !== undefined ? input.receiptDate || null : receipt.receipt_date,
        ]
      );

      const outstandingBefore = Math.max(Number(customerRow.balance || 0), 0);
      const applyToAr = roundMoney(Math.min(nextAmount, outstandingBefore));
      const advance = roundMoney(nextAmount - applyToAr);

      const coa = await ensureCoaAccounts(client, receipt.branch_id, ['accountsReceivable', 'customerAdvances']);
      await postGl(client, {
        branchId: receipt.branch_id,
        txnDate: input.receiptDate !== undefined ? input.receiptDate || null : receipt.receipt_date,
        txnType: 'sale_payment',
        refTable: 'customer_receipts',
        refId: id,
        note: `Customer receipt #${id}`,
        lines: [
          { accId: nextAccId, debit: nextAmount, credit: 0, note: 'Cash/bank received' },
          ...(applyToAr > 0 ? [{ accId: coa.accountsReceivable, debit: 0, credit: applyToAr, note: 'Reduce receivable' }] : []),
          ...(advance > 0 ? [{ accId: coa.customerAdvances, debit: 0, credit: advance, note: 'Customer advance' }] : []),
        ],
      });

      const updates: string[] = [];
      const values: any[] = [];
      let p = 1;
      if (input.customerId !== undefined) { updates.push(`customer_id = $${p++}`); values.push(nextCustomerId); }
      if (hasSaleIdColumn && input.saleId !== undefined) { updates.push(`sale_id = $${p++}`); values.push(nextSaleId); }
      if (input.accId !== undefined) { updates.push(`acc_id = $${p++}`); values.push(nextAccId); }
      if (input.amount !== undefined) { updates.push(`amount = $${p++}`); values.push(nextAmount); }
      if (input.paymentMethod !== undefined) { updates.push(`payment_method = $${p++}`); values.push(input.paymentMethod || null); }
      if (input.referenceNo !== undefined) { updates.push(`reference_no = $${p++}`); values.push(input.referenceNo || null); }
      if (input.note !== undefined) { updates.push(`note = $${p++}`); values.push(input.note || null); }
      if (input.receiptDate !== undefined) { updates.push(`receipt_date = $${p++}`); values.push(input.receiptDate || null); }
      if (updates.length) {
        values.push(id);
        await client.query(`UPDATE ims.customer_receipts SET ${updates.join(', ')} WHERE receipt_id = $${p}`, values);
      }

      return (await client.query(`SELECT * FROM ims.customer_receipts WHERE receipt_id = $1`, [id])).rows[0];
    });
  },

  async deleteCustomerReceipt(id: number, scope: BranchScope) {
    return withTransaction(async (client) => {
      const receipt = (
        await client.query<{
          receipt_id: number;
          branch_id: number;
          customer_id: number | null;
          acc_id: number;
          amount: string;
        }>(
          `SELECT receipt_id, branch_id, customer_id, acc_id, amount::text AS amount
             FROM ims.customer_receipts
            WHERE receipt_id = $1
            FOR UPDATE`,
          [id]
        )
      ).rows[0];
      if (!receipt) throw ApiError.notFound('Customer receipt not found');
      assertBranchAccess(scope, receipt.branch_id);

      const customerBalanceColumn = await detectColumn('customers', 'remaining_balance', ['remaining_balance', 'open_balance']);
      const customerId = receipt.customer_id ? Number(receipt.customer_id) : null;
      if (!customerId) throw ApiError.badRequest('Receipt has no customer');
      const amount = roundMoney(Number(receipt.amount || 0));

      await client.query(
        `UPDATE ims.customers
            SET ${customerBalanceColumn} = ${customerBalanceColumn} + $3
          WHERE customer_id = $1
            AND branch_id = $2`,
        [customerId, receipt.branch_id, amount]
      );
      await adjustSystemAccountBalance(client, { branchId: receipt.branch_id, kind: 'receivable', delta: amount });

      await client.query(
        `UPDATE ims.accounts
            SET balance = balance - $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [receipt.branch_id, receipt.acc_id, amount]
      );

      await client.query(
        `DELETE FROM ims.customer_ledger
          WHERE branch_id = $1
            AND ref_table = 'customer_receipts'
            AND ref_id = $2`,
        [receipt.branch_id, id]
      );
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'customer_receipts'
            AND ref_id = $2`,
        [receipt.branch_id, id]
      );

      await client.query(`DELETE FROM ims.customer_receipts WHERE receipt_id = $1`, [id]);
      return { deleted: true };
    });
  },

  async updateSupplierReceipt(id: number, input: Partial<SupplierReceiptInput>, scope: BranchScope) {
    return withTransaction(async (client) => {
      const receipt = (
        await client.query<{
          receipt_id: number;
          branch_id: number;
          supplier_id: number | null;
          purchase_id: number | null;
          acc_id: number;
          amount: string;
          receipt_date: string | null;
          note: string | null;
        }>(
          `SELECT receipt_id,
                  branch_id,
                  supplier_id,
                  purchase_id,
                  acc_id,
                  amount::text AS amount,
                  receipt_date::text AS receipt_date,
                  note
             FROM ims.supplier_receipts
            WHERE receipt_id = $1
            FOR UPDATE`,
          [id]
        )
      ).rows[0];
      if (!receipt) throw ApiError.notFound('Supplier receipt not found');
      assertBranchAccess(scope, receipt.branch_id);

      const supplierBalanceColumn = await detectColumn('suppliers', 'remaining_balance', ['remaining_balance', 'open_balance']);
      const oldSupplierId = receipt.supplier_id ? Number(receipt.supplier_id) : null;
      if (!oldSupplierId) throw ApiError.badRequest('Receipt has no supplier');
      const oldAmount = roundMoney(Number(receipt.amount || 0));
      const oldAccId = Number(receipt.acc_id);

      const nextSupplierId = input.supplierId !== undefined ? (input.supplierId || null) : oldSupplierId;
      if (!nextSupplierId) throw ApiError.badRequest('Supplier is required for supplier payment');
      const nextAccId = input.accId !== undefined ? Number(input.accId) : oldAccId;
      const nextAmount = input.amount !== undefined ? roundMoney(Number(input.amount || 0)) : oldAmount;
      if (nextAmount <= 0) throw ApiError.badRequest('Amount must be greater than zero');
      const nextPurchaseId = input.purchaseId !== undefined ? (input.purchaseId || null) : receipt.purchase_id;

      if (nextPurchaseId) {
        const purchase = (await client.query<{ branch_id: number; supplier_id: number | null; status: string | null }>(
          `SELECT branch_id, supplier_id, status::text AS status
             FROM ims.purchases
            WHERE purchase_id = $1
            FOR UPDATE`,
          [nextPurchaseId]
        )).rows[0];
        if (!purchase) throw ApiError.badRequest('Selected purchase was not found');
        if (Number(purchase.branch_id) !== receipt.branch_id) {
          throw ApiError.badRequest('Selected purchase belongs to a different branch');
        }
        if ((purchase.status || '').toLowerCase() === 'void') {
          throw ApiError.badRequest('Cannot register payment for a void purchase');
        }
        const purchaseSupplierId = purchase.supplier_id ? Number(purchase.supplier_id) : null;
        if (purchaseSupplierId && nextSupplierId !== purchaseSupplierId) {
          throw ApiError.badRequest('Supplier does not match the selected purchase');
        }
      }

      // Reverse old effects
      await client.query(
        `UPDATE ims.suppliers
            SET ${supplierBalanceColumn} = ${supplierBalanceColumn} + $3
          WHERE supplier_id = $1
            AND branch_id = $2`,
        [oldSupplierId, receipt.branch_id, oldAmount]
      );
      await adjustSystemAccountBalance(client, { branchId: receipt.branch_id, kind: 'payable', delta: oldAmount });

      await client.query(
        `UPDATE ims.accounts
            SET balance = balance + $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [receipt.branch_id, oldAccId, oldAmount]
      );

      await client.query(
        `DELETE FROM ims.supplier_ledger
          WHERE branch_id = $1
            AND ref_table = 'supplier_receipts'
            AND ref_id = $2`,
        [receipt.branch_id, id]
      );
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'supplier_receipts'
            AND ref_id = $2`,
        [receipt.branch_id, id]
      );

      // Validate supplier + account
      const supplierRow = (
        await client.query<{ balance: string }>(
          `SELECT COALESCE(${supplierBalanceColumn}, 0)::text AS balance
             FROM ims.suppliers
            WHERE supplier_id = $1
              AND branch_id = $2
            FOR UPDATE`,
          [nextSupplierId, receipt.branch_id]
        )
      ).rows[0];
      if (!supplierRow) throw ApiError.badRequest('Supplier not found in selected branch');

      const accountRow = (
        await client.query<{ acc_id: number; balance: string }>(
          `SELECT acc_id, balance::text AS balance
             FROM ims.accounts
            WHERE acc_id = $1
              AND branch_id = $2
            FOR UPDATE`,
          [nextAccId, receipt.branch_id]
        )
      ).rows[0];
      if (!accountRow) throw ApiError.badRequest('Account not found in selected branch');
      const cashBalance = Number(accountRow.balance || 0);
      if (cashBalance + 1e-9 < nextAmount) throw ApiError.badRequest('Insufficient funds in selected account');

      const payableBefore = Math.max(Number(supplierRow.balance || 0), 0);
      const applyToAp = roundMoney(Math.min(nextAmount, payableBefore));
      const advance = roundMoney(nextAmount - applyToAp);

      // Apply new effects
      await client.query(
        `UPDATE ims.accounts
            SET balance = balance - $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [receipt.branch_id, nextAccId, nextAmount]
      );

      await client.query(
        `UPDATE ims.suppliers
            SET ${supplierBalanceColumn} = ${supplierBalanceColumn} - $3
          WHERE supplier_id = $1
            AND branch_id = $2`,
        [nextSupplierId, receipt.branch_id, nextAmount]
      );
      await adjustSystemAccountBalance(client, { branchId: receipt.branch_id, kind: 'payable', delta: -nextAmount });

      await client.query(
        `INSERT INTO ims.supplier_ledger
           (branch_id, supplier_id, entry_type, ref_table, ref_id, acc_id, debit, credit, note, entry_date)
         VALUES ($1, $2, 'payment', 'supplier_receipts', $3, $4, $5, 0, $6, COALESCE($7::timestamptz, NOW()))`,
        [
          receipt.branch_id,
          nextSupplierId,
          id,
          nextAccId,
          nextAmount,
          input.note !== undefined ? input.note || null : receipt.note,
          input.receiptDate !== undefined ? input.receiptDate || null : receipt.receipt_date,
        ]
      );

      const coa = await ensureCoaAccounts(client, receipt.branch_id, ['accountsPayable', 'supplierAdvances']);
      await postGl(client, {
        branchId: receipt.branch_id,
        txnDate: input.receiptDate !== undefined ? input.receiptDate || null : receipt.receipt_date,
        txnType: 'supplier_payment',
        refTable: 'supplier_receipts',
        refId: id,
        note: `Supplier payment #${id}`,
        lines: [
          ...(applyToAp > 0 ? [{ accId: coa.accountsPayable, debit: applyToAp, credit: 0, note: 'Reduce payable' }] : []),
          ...(advance > 0 ? [{ accId: coa.supplierAdvances, debit: advance, credit: 0, note: 'Supplier advance' }] : []),
          { accId: nextAccId, debit: 0, credit: nextAmount, note: 'Cash/bank paid' },
        ],
      });

      const updates: string[] = [];
      const values: any[] = [];
      let p = 1;
      if (input.supplierId !== undefined) { updates.push(`supplier_id = $${p++}`); values.push(nextSupplierId); }
      if (input.purchaseId !== undefined) { updates.push(`purchase_id = $${p++}`); values.push(nextPurchaseId); }
      if (input.accId !== undefined) { updates.push(`acc_id = $${p++}`); values.push(nextAccId); }
      if (input.amount !== undefined) { updates.push(`amount = $${p++}`); values.push(nextAmount); }
      if (input.paymentMethod !== undefined) { updates.push(`payment_method = $${p++}`); values.push(input.paymentMethod || null); }
      if (input.referenceNo !== undefined) { updates.push(`reference_no = $${p++}`); values.push(input.referenceNo || null); }
      if (input.note !== undefined) { updates.push(`note = $${p++}`); values.push(input.note || null); }
      if (input.receiptDate !== undefined) { updates.push(`receipt_date = $${p++}`); values.push(input.receiptDate || null); }
      if (updates.length) {
        values.push(id);
        await client.query(`UPDATE ims.supplier_receipts SET ${updates.join(', ')} WHERE receipt_id = $${p}`, values);
      }

      return (await client.query(`SELECT * FROM ims.supplier_receipts WHERE receipt_id = $1`, [id])).rows[0];
    });
  },

  async deleteSupplierReceipt(id: number, scope: BranchScope) {
    return withTransaction(async (client) => {
      const receipt = (
        await client.query<{
          receipt_id: number;
          branch_id: number;
          supplier_id: number | null;
          acc_id: number;
          amount: string;
        }>(
          `SELECT receipt_id, branch_id, supplier_id, acc_id, amount::text AS amount
             FROM ims.supplier_receipts
            WHERE receipt_id = $1
            FOR UPDATE`,
          [id]
        )
      ).rows[0];
      if (!receipt) throw ApiError.notFound('Supplier receipt not found');
      assertBranchAccess(scope, receipt.branch_id);

      const supplierBalanceColumn = await detectColumn('suppliers', 'remaining_balance', ['remaining_balance', 'open_balance']);
      const supplierId = receipt.supplier_id ? Number(receipt.supplier_id) : null;
      if (!supplierId) throw ApiError.badRequest('Receipt has no supplier');
      const amount = roundMoney(Number(receipt.amount || 0));

      await client.query(
        `UPDATE ims.suppliers
            SET ${supplierBalanceColumn} = ${supplierBalanceColumn} + $3
          WHERE supplier_id = $1
            AND branch_id = $2`,
        [supplierId, receipt.branch_id, amount]
      );
      await adjustSystemAccountBalance(client, { branchId: receipt.branch_id, kind: 'payable', delta: amount });

      await client.query(
        `UPDATE ims.accounts
            SET balance = balance + $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [receipt.branch_id, receipt.acc_id, amount]
      );

      await client.query(
        `DELETE FROM ims.supplier_ledger
          WHERE branch_id = $1
            AND ref_table = 'supplier_receipts'
            AND ref_id = $2`,
        [receipt.branch_id, id]
      );
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'supplier_receipts'
            AND ref_id = $2`,
        [receipt.branch_id, id]
      );

      await client.query(`DELETE FROM ims.supplier_receipts WHERE receipt_id = $1`, [id]);
      return { deleted: true };
    });
  },

  // Other income (ad-hoc income not tied to sales)
  async listOtherIncomes(scope: BranchScope, branchId?: number, range: DateRange = {}) {
    const exists = await queryOne<{ exists: boolean }>(
      `SELECT to_regclass('ims.other_incomes') IS NOT NULL AS exists`
    );
    if (!exists?.exists) {
      return [];
    }

    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      where += ` AND oi.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND oi.branch_id = ANY($${params.length})`;
    }

    if (range.fromDate && range.toDate) {
      params.push(range.fromDate);
      where += ` AND oi.income_date >= $${params.length}::date`;
      params.push(range.toDate);
      where += ` AND oi.income_date <= $${params.length}::date`;
    }

    return queryMany(
      `SELECT
         oi.*,
         a.name AS account_name,
         COALESCE(u.full_name, u.name, u.username) AS created_by_name
       FROM ims.other_incomes oi
       JOIN ims.accounts a
         ON a.acc_id = oi.acc_id
        AND a.branch_id = oi.branch_id
       LEFT JOIN ims.users u ON u.user_id = oi.created_by
       ${where}
       ORDER BY oi.income_date DESC, oi.other_income_id DESC
       LIMIT 200`,
      params
    );
  },

  async createOtherIncome(input: OtherIncomeInput, scope: BranchScope, userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const amount = roundMoney(Number(input.amount || 0));
    if (amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');
    return withTransaction(async (client) => {
      const account = await client.query<{ acc_id: number }>(
        `SELECT acc_id
           FROM ims.accounts
          WHERE branch_id = $1
            AND acc_id = $2
          FOR UPDATE`,
        [branchId, input.accId]
      );
      if (!account.rows[0]) throw ApiError.badRequest('Selected account was not found');

      const incomeDate = input.incomeDate ? input.incomeDate : null;
      const rowRes = await client.query<any>(
        `INSERT INTO ims.other_incomes
           (branch_id, income_name, income_date, acc_id, amount, note, created_by)
         VALUES
           ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7)
         RETURNING *`,
        [
          branchId,
          input.incomeName.trim(),
          incomeDate,
          input.accId,
          amount,
          input.note || null,
          userId,
        ]
      );
      const row = rowRes.rows[0];
      if (!row) throw ApiError.internal('Failed to create other income');

      await client.query(
        `UPDATE ims.accounts
            SET balance = balance + $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [branchId, input.accId, amount]
      );

      const note = `${input.incomeName.trim()}${input.note ? ` — ${input.note}` : ''}`;
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'other_incomes'
            AND ref_id = $2`,
        [branchId, row.other_income_id]
      );

      const coa = await ensureCoaAccounts(client, branchId, ['otherIncome']);
      await postGl(client, {
        branchId,
        txnDate: incomeDate,
        txnType: 'other',
        refTable: 'other_incomes',
        refId: Number(row.other_income_id),
        note,
        lines: [
          { accId: input.accId, debit: amount, credit: 0, note: 'Cash/bank received' },
          { accId: coa.otherIncome, debit: 0, credit: amount, note: 'Other income' },
        ],
      });

      return row;
    });
  },

  async updateOtherIncome(id: number, input: Partial<OtherIncomeInput>, scope: BranchScope) {
    return withTransaction(async (client) => {
      const existing = (await client.query<{
        other_income_id: number;
        branch_id: number;
        acc_id: number;
        amount: number;
        income_name: string;
        income_date: string;
        note: string | null;
      }>(
        `SELECT other_income_id, branch_id, acc_id, amount, income_name, income_date::text AS income_date, note
           FROM ims.other_incomes
          WHERE other_income_id = $1
          FOR UPDATE`,
        [id]
      )).rows[0];
      if (!existing) throw ApiError.notFound('Other income not found');
      assertBranchAccess(scope, existing.branch_id);

      const nextAccId = input.accId ?? existing.acc_id;
      const nextAmount = input.amount !== undefined ? roundMoney(input.amount) : roundMoney(Number(existing.amount));
      const nextName = input.incomeName !== undefined ? input.incomeName.trim() : existing.income_name;
      const nextDate = input.incomeDate !== undefined ? input.incomeDate : existing.income_date;
      const nextNote = input.note !== undefined ? input.note || null : existing.note;

      // Account balance adjustments (reverse old, apply new)
      if (nextAccId !== existing.acc_id || nextAmount !== roundMoney(Number(existing.amount))) {
        await client.query(`UPDATE ims.accounts SET balance = balance - $1 WHERE branch_id = $2 AND acc_id = $3`, [
          roundMoney(Number(existing.amount)),
          existing.branch_id,
          existing.acc_id,
        ]);
        await client.query(`UPDATE ims.accounts SET balance = balance + $1 WHERE branch_id = $2 AND acc_id = $3`, [
          nextAmount,
          existing.branch_id,
          nextAccId,
        ]);
      }

      const updated = (await client.query<any>(
        `UPDATE ims.other_incomes
            SET income_name = $2,
                income_date = COALESCE($3::date, income_date),
                acc_id = $4,
                amount = $5,
                note = $6,
                updated_at = NOW()
          WHERE other_income_id = $1
          RETURNING *`,
        [id, nextName, nextDate, nextAccId, nextAmount, nextNote]
      )).rows[0];

      const noteText = `${nextName}${nextNote ? ` — ${nextNote}` : ''}`;
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'other_incomes'
            AND ref_id = $2`,
        [existing.branch_id, id]
      );

      const coa = await ensureCoaAccounts(client, existing.branch_id, ['otherIncome']);
      await postGl(client, {
        branchId: existing.branch_id,
        txnDate: nextDate,
        txnType: 'other',
        refTable: 'other_incomes',
        refId: id,
        note: noteText,
        lines: [
          { accId: nextAccId, debit: nextAmount, credit: 0, note: 'Cash/bank received' },
          { accId: coa.otherIncome, debit: 0, credit: nextAmount, note: 'Other income' },
        ],
      });

      return updated;
    });
  },

  async deleteOtherIncome(id: number, scope: BranchScope) {
    return withTransaction(async (client) => {
      const existing = (
        await client.query<{
          other_income_id: number;
          branch_id: number;
          acc_id: number;
          amount: number;
        }>(
          `SELECT other_income_id, branch_id, acc_id, amount
             FROM ims.other_incomes
            WHERE other_income_id = $1
            FOR UPDATE`,
          [id]
        )
      ).rows[0];
      if (!existing) throw ApiError.notFound('Other income not found');
      assertBranchAccess(scope, existing.branch_id);

      await client.query(`UPDATE ims.accounts SET balance = balance - $1 WHERE branch_id = $2 AND acc_id = $3`, [
        roundMoney(Number(existing.amount)),
        existing.branch_id,
        existing.acc_id,
      ]);

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'other_incomes'
            AND ref_id = $2`,
        [existing.branch_id, id]
      );

      await client.query(
        `UPDATE ims.other_incomes
            SET is_deleted = 1,
                deleted_at = NOW(),
                updated_at = NOW()
          WHERE other_income_id = $1`,
        [id]
      );

      return { deleted: true };
    });
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
      `WITH payment_totals AS (
         SELECT x.purchase_id,
                COALESCE(SUM(x.paid_amount), 0) AS paid
           FROM (
             SELECT sp.purchase_id, COALESCE(sp.amount_paid, 0) AS paid_amount
               FROM ims.supplier_payments sp
             UNION ALL
             SELECT sr.purchase_id, COALESCE(sr.amount, 0) AS paid_amount
               FROM ims.supplier_receipts sr
              WHERE sr.purchase_id IS NOT NULL
           ) x
          GROUP BY x.purchase_id
       )
       SELECT p.purchase_id,
              p.supplier_id,
              p.purchase_date,
              p.total,
              COALESCE(pt.paid,0) AS paid,
              GREATEST(p.total - COALESCE(pt.paid,0), 0) AS outstanding,
              s.${supplierNameCol} AS supplier_name,
              p.status
         FROM ims.purchases p
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
         LEFT JOIN payment_totals pt ON pt.purchase_id = p.purchase_id
        ${where}
          AND GREATEST(p.total - COALESCE(pt.paid,0), 0) > 0
        ORDER BY p.purchase_date DESC
        LIMIT 200`,
      params
    );
  },

  /* Unpaid (current month) */
  async getCustomerCombinedBalance(scope: BranchScope, customerId: number, branchId?: number) {
    const params: any[] = [];
    let customerBranchFilter = '1=1';
    let salesBranchFilter = '1=1';
    let receiptBranchFilter = '1=1';

    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      customerBranchFilter = `c.branch_id = $${params.length}`;
      salesBranchFilter = `s.branch_id = $${params.length}`;
      receiptBranchFilter = `r.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      customerBranchFilter = `c.branch_id = ANY($${params.length})`;
      salesBranchFilter = `s.branch_id = ANY($${params.length})`;
      receiptBranchFilter = `r.branch_id = ANY($${params.length})`;
    }

    params.push(customerId);
    const customerParam = `$${params.length}`;

    const balanceColumn = await detectColumn('customers', 'remaining_balance', ['remaining_balance', 'open_balance']);
    const hasSalesDocType = await hasColumn('sales', 'doc_type');
    const salesDocTypeFilter = hasSalesDocType
      ? `AND COALESCE(s.doc_type::text, 'sale') <> 'quotation'`
      : '';

    const row = await queryOne<{
      customer_id: number;
      customer_name: string;
      opening_balance: number;
      credit_balance: number;
      total_balance: number;
    }>(
      `WITH customer_base AS (
         SELECT c.branch_id,
                c.customer_id,
                c.full_name AS customer_name,
                COALESCE(c.${balanceColumn}, 0) AS opening_balance
           FROM ims.customers c
          WHERE ${customerBranchFilter}
            AND c.customer_id = ${customerParam}
         LIMIT 1
       ),
       sales_totals AS (
         SELECT s.branch_id,
                s.customer_id,
                COALESCE(SUM(COALESCE(s.total, 0)), 0) AS total_sales
           FROM ims.sales s
          WHERE s.customer_id = ${customerParam}
            AND s.status <> 'void'
            AND ${salesBranchFilter}
            ${salesDocTypeFilter}
          GROUP BY s.branch_id, s.customer_id
       ),
       sales_payments AS (
         SELECT s.branch_id,
                s.customer_id,
                COALESCE(SUM(COALESCE(sp.amount_paid, 0)), 0) AS paid_from_sales
           FROM ims.sales s
           JOIN ims.sale_payments sp ON sp.sale_id = s.sale_id
          WHERE s.customer_id = ${customerParam}
            AND s.status <> 'void'
            AND ${salesBranchFilter}
            ${salesDocTypeFilter}
          GROUP BY s.branch_id, s.customer_id
       ),
       sales_bal AS (
         SELECT COALESCE(st.branch_id, sp.branch_id) AS branch_id,
                COALESCE(st.customer_id, sp.customer_id) AS customer_id,
                GREATEST(COALESCE(st.total_sales, 0) - COALESCE(sp.paid_from_sales, 0), 0) AS sales_balance
           FROM sales_totals st
           FULL JOIN sales_payments sp
             ON sp.branch_id = st.branch_id
            AND sp.customer_id = st.customer_id
       ),
       receipt_bal AS (
         SELECT r.branch_id,
                r.customer_id,
                COALESCE(SUM(COALESCE(r.amount, 0)), 0) AS paid_from_receipts
           FROM ims.customer_receipts r
          WHERE r.customer_id = ${customerParam}
            AND ${receiptBranchFilter}
          GROUP BY r.branch_id, r.customer_id
       )
       SELECT cb.customer_id,
              cb.customer_name,
              cb.opening_balance::double precision AS opening_balance,
              GREATEST(COALESCE(sb.sales_balance, 0) - COALESCE(rb.paid_from_receipts, 0), 0)::double precision AS credit_balance,
              GREATEST(
                CASE
                  WHEN cb.opening_balance > 0 THEN cb.opening_balance
                  ELSE GREATEST(COALESCE(sb.sales_balance, 0) - COALESCE(rb.paid_from_receipts, 0), 0)
                END,
                0
              )::double precision AS total_balance
         FROM customer_base cb
         LEFT JOIN sales_bal sb
           ON sb.branch_id = cb.branch_id
          AND sb.customer_id = cb.customer_id
         LEFT JOIN receipt_bal rb
           ON rb.branch_id = cb.branch_id
          AND rb.customer_id = cb.customer_id`,
      params
    );

    if (!row) throw ApiError.notFound('Customer not found');
    return row;
  },

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
    const balanceColumn = await detectColumn('customers', 'remaining_balance', ['remaining_balance', 'open_balance']);
    if (!month) {
      const hasSalesDocType = await hasColumn('sales', 'doc_type');
      const salesDocTypeFilter = hasSalesDocType
        ? `AND COALESCE(s.doc_type::text, 'sale') <> 'quotation'`
        : '';

      return queryMany(
        `WITH sales_totals AS (
           SELECT s.branch_id,
                  s.customer_id,
                  COALESCE(SUM(COALESCE(s.total, 0)), 0) AS total_sales
             FROM ims.sales s
            WHERE s.customer_id IS NOT NULL
              AND s.status <> 'void'
              ${salesDocTypeFilter}
            GROUP BY s.branch_id, s.customer_id
         ),
         sales_payments AS (
           SELECT s.branch_id,
                  s.customer_id,
                  COALESCE(SUM(COALESCE(sp.amount_paid, 0)), 0) AS paid_from_sales
             FROM ims.sales s
             JOIN ims.sale_payments sp ON sp.sale_id = s.sale_id
            WHERE s.customer_id IS NOT NULL
              AND s.status <> 'void'
              ${salesDocTypeFilter}
            GROUP BY s.branch_id, s.customer_id
         ),
         sales_bal AS (
           SELECT COALESCE(st.branch_id, sp.branch_id) AS branch_id,
                  COALESCE(st.customer_id, sp.customer_id) AS customer_id,
                  COALESCE(st.total_sales, 0) AS total_sales,
                  COALESCE(sp.paid_from_sales, 0) AS paid_from_sales,
                  GREATEST(COALESCE(st.total_sales, 0) - COALESCE(sp.paid_from_sales, 0), 0) AS sales_balance
             FROM sales_totals st
             FULL JOIN sales_payments sp
               ON sp.branch_id = st.branch_id
              AND sp.customer_id = st.customer_id
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
                  COALESCE(c.${balanceColumn}, 0) AS opening_balance,
                  GREATEST(COALESCE(sb.sales_balance, 0) - COALESCE(rb.paid_from_receipts, 0), 0) AS credit_balance,
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

  async getSupplierCombinedBalance(scope: BranchScope, supplierId: number, branchId?: number) {
    const params: any[] = [];
    let supplierBranchFilter = '1=1';
    let purchaseBranchFilter = '1=1';
    let receiptBranchFilter = '1=1';

    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      supplierBranchFilter = `s.branch_id = $${params.length}`;
      purchaseBranchFilter = `p.branch_id = $${params.length}`;
      receiptBranchFilter = `sr.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      supplierBranchFilter = `s.branch_id = ANY($${params.length})`;
      purchaseBranchFilter = `p.branch_id = ANY($${params.length})`;
      receiptBranchFilter = `sr.branch_id = ANY($${params.length})`;
    }

    params.push(supplierId);
    const supplierParam = `$${params.length}`;

    const supplierNameColumn = await detectColumn('suppliers', 'name', ['name', 'supplier_name']);
    const supplierBalanceColumn = await detectColumn('suppliers', 'remaining_balance', ['remaining_balance', 'open_balance']);

    const row = await queryOne<{
      supplier_id: number;
      supplier_name: string;
      opening_balance: number;
      credit_balance: number;
      total_balance: number;
    }>(
      `WITH supplier_base AS (
         SELECT s.branch_id,
                s.supplier_id,
                s.${supplierNameColumn} AS supplier_name,
                COALESCE(s.${supplierBalanceColumn}, 0) AS opening_balance
           FROM ims.suppliers s
          WHERE ${supplierBranchFilter}
            AND s.supplier_id = ${supplierParam}
         LIMIT 1
       ),
       scoped_purchases AS (
         SELECT p.purchase_id,
                p.branch_id,
                p.supplier_id,
                COALESCE(p.total, 0) AS total
           FROM ims.purchases p
          WHERE p.supplier_id = ${supplierParam}
            AND p.status <> 'void'
            AND ${purchaseBranchFilter}
       ),
       purchase_payments AS (
         SELECT x.purchase_id,
                COALESCE(SUM(x.amount), 0) AS paid_amount
           FROM (
             SELECT sp.purchase_id, COALESCE(sp.amount_paid, 0) AS amount
               FROM ims.supplier_payments sp
             UNION ALL
             SELECT sr.purchase_id, COALESCE(sr.amount, 0) AS amount
               FROM ims.supplier_receipts sr
              WHERE sr.purchase_id IS NOT NULL
           ) x
          GROUP BY x.purchase_id
       ),
       purchase_rollup AS (
         SELECT sp.branch_id,
                sp.supplier_id,
                COALESCE(SUM(sp.total), 0) AS total_purchase,
                COALESCE(SUM(COALESCE(pp.paid_amount, 0)), 0) AS paid_against_purchase
           FROM scoped_purchases sp
           LEFT JOIN purchase_payments pp ON pp.purchase_id = sp.purchase_id
          GROUP BY sp.branch_id, sp.supplier_id
       ),
       supplier_unallocated_payments AS (
         SELECT sr.branch_id,
                sr.supplier_id,
                COALESCE(SUM(sr.amount), 0) AS unallocated_paid
           FROM ims.supplier_receipts sr
          WHERE sr.purchase_id IS NULL
            AND sr.supplier_id = ${supplierParam}
            AND ${receiptBranchFilter}
          GROUP BY sr.branch_id, sr.supplier_id
       )
       SELECT sb.supplier_id,
              sb.supplier_name,
              sb.opening_balance::double precision AS opening_balance,
              GREATEST(
                COALESCE(pr.total_purchase, 0)
                - COALESCE(pr.paid_against_purchase, 0)
                - COALESCE(up.unallocated_paid, 0),
                0
              )::double precision AS credit_balance,
              GREATEST(
                sb.opening_balance
                + GREATEST(
                    COALESCE(pr.total_purchase, 0)
                    - COALESCE(pr.paid_against_purchase, 0)
                    - COALESCE(up.unallocated_paid, 0),
                    0
                  ),
                0
              )::double precision AS total_balance
         FROM supplier_base sb
         LEFT JOIN purchase_rollup pr
           ON pr.branch_id = sb.branch_id
          AND pr.supplier_id = sb.supplier_id
         LEFT JOIN supplier_unallocated_payments up
           ON up.branch_id = sb.branch_id
          AND up.supplier_id = sb.supplier_id`,
      params
    );

    if (!row) throw ApiError.notFound('Supplier not found');
    return row;
  },

  async listSupplierUnpaid(scope: BranchScope, month?: string, branchId?: number) {
    const params: any[] = [];
    let branchFilter = '1=1';
    let purchaseBranchFilter = '1=1';
    if (branchId) {
      assertBranchAccess(scope, branchId);
      params.push(branchId);
      branchFilter = `s.branch_id = $${params.length}`;
      purchaseBranchFilter = `p.branch_id = $${params.length}`;
    } else if (!scope.isAdmin) {
      params.push(scope.branchIds);
      branchFilter = `s.branch_id = ANY($${params.length})`;
      purchaseBranchFilter = `p.branch_id = ANY($${params.length})`;
    }

    const supplierNameColumn = await detectColumn('suppliers', 'name', ['name', 'supplier_name']);
    const supplierBalanceColumn = await detectColumn('suppliers', 'remaining_balance', ['remaining_balance', 'open_balance']);

    if (!month) {
      return queryMany(
        `WITH scoped_purchases AS (
           SELECT p.purchase_id,
                  p.branch_id,
                  p.supplier_id,
                  COALESCE(p.total, 0) AS total
             FROM ims.purchases p
            WHERE p.supplier_id IS NOT NULL
              AND p.status <> 'void'
              AND ${purchaseBranchFilter}
         ),
         purchase_payments AS (
           SELECT x.purchase_id,
                  COALESCE(SUM(x.amount), 0) AS paid_amount
             FROM (
               SELECT sp.purchase_id, COALESCE(sp.amount_paid, 0) AS amount
                 FROM ims.supplier_payments sp
               UNION ALL
               SELECT sr.purchase_id, COALESCE(sr.amount, 0) AS amount
                 FROM ims.supplier_receipts sr
                WHERE sr.purchase_id IS NOT NULL
             ) x
            GROUP BY x.purchase_id
         ),
         purchase_rollup AS (
           SELECT sp.branch_id,
                  sp.supplier_id,
                  COALESCE(SUM(sp.total), 0) AS total_purchase,
                  COALESCE(SUM(COALESCE(pp.paid_amount, 0)), 0) AS paid_against_purchase
             FROM scoped_purchases sp
             LEFT JOIN purchase_payments pp ON pp.purchase_id = sp.purchase_id
            GROUP BY sp.branch_id, sp.supplier_id
         ),
         supplier_unallocated_payments AS (
           SELECT sr.branch_id,
                  sr.supplier_id,
                  COALESCE(SUM(sr.amount), 0) AS unallocated_paid
             FROM ims.supplier_receipts sr
            WHERE sr.purchase_id IS NULL
              AND sr.supplier_id IS NOT NULL
            GROUP BY sr.branch_id, sr.supplier_id
         )
         SELECT s.branch_id,
                s.supplier_id,
                s.${supplierNameColumn} AS supplier_name,
                COALESCE(s.${supplierBalanceColumn}, 0) AS opening_balance,
                GREATEST(
                  COALESCE(pr.total_purchase, 0)
                  - COALESCE(pr.paid_against_purchase, 0)
                  - COALESCE(up.unallocated_paid, 0),
                  0
                ) AS credit_balance,
                GREATEST(
                  COALESCE(s.${supplierBalanceColumn}, 0)
                  + GREATEST(
                      COALESCE(pr.total_purchase, 0)
                      - COALESCE(pr.paid_against_purchase, 0)
                      - COALESCE(up.unallocated_paid, 0),
                      0
                    ),
                  0
                ) AS balance,
                COALESCE(pr.total_purchase, 0) + COALESCE(s.${supplierBalanceColumn}, 0) AS total,
                COALESCE(pr.paid_against_purchase, 0) + COALESCE(up.unallocated_paid, 0) AS paid
         FROM ims.suppliers s
         LEFT JOIN purchase_rollup pr
           ON pr.branch_id = s.branch_id
          AND pr.supplier_id = s.supplier_id
         LEFT JOIN supplier_unallocated_payments up
           ON up.branch_id = s.branch_id
          AND up.supplier_id = s.supplier_id
         WHERE ${branchFilter}
           AND GREATEST(
                 COALESCE(s.${supplierBalanceColumn}, 0)
                 + GREATEST(
                     COALESCE(pr.total_purchase, 0)
                     - COALESCE(pr.paid_against_purchase, 0)
                     - COALESCE(up.unallocated_paid, 0),
                     0
                   ),
                 0
               ) > 0
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
              s.${supplierNameColumn} AS supplier_name,
              COALESCE(SUM(l.credit - l.debit),0) AS balance,
              COALESCE(SUM(l.credit),0) AS total,
              COALESCE(SUM(l.debit),0) AS paid
       FROM ims.suppliers s
       LEFT JOIN ims.supplier_ledger l
         ON l.supplier_id = s.supplier_id
        AND l.branch_id = s.branch_id
        AND l.entry_date::date >= ${fromParam}::date
        AND l.entry_date < (${toParam}::date + INTERVAL '1 month')
       WHERE ${branchFilter}
       GROUP BY s.branch_id, s.supplier_id, s.${supplierNameColumn}
       HAVING COALESCE(SUM(l.credit - l.debit),0) > 0
       ORDER BY balance DESC, supplier_name`,
      params
    );
  },

  /* Expenses */
  async listExpenses(scope: BranchScope, branchId?: number, range: DateRange = {}) {
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
    if (range.fromDate && range.toDate) {
      params.push(range.fromDate);
      where += ` AND e.created_at::date >= $${params.length}::date`;
      params.push(range.toDate);
      where += ` AND e.created_at::date <= $${params.length}::date`;
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

  async listExpenseCharges(scope: BranchScope, branchId?: number, range: DateRange = {}) {
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
    if (range.fromDate && range.toDate) {
      params.push(range.fromDate);
      where += ` AND c.charge_date::date >= $${params.length}::date`;
      params.push(range.toDate);
      where += ` AND c.charge_date::date <= $${params.length}::date`;
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
              opening.is_opening_paid,
              COALESCE(pay.payment_count,0) AS payment_count,
              COALESCE(pay.paid_sum,0) AS paid_sum,
              CASE
                WHEN opening.is_opening_paid THEN 0::double precision
                ELSE GREATEST(COALESCE(c.amount, 0) - COALESCE(pay.paid_sum, 0), 0)::double precision
              END AS open_balance,
              CASE
                WHEN opening.is_opening_paid THEN 'paid'
                WHEN COALESCE(pay.paid_sum, 0) <= 0 THEN 'unpaid'
                WHEN COALESCE(pay.paid_sum, 0) + 0.000001 < COALESCE(c.amount, 0) THEN 'partial'
                ELSE 'paid'
              END AS payment_status
         FROM ims.expense_charges c
         JOIN ims.expenses e ON e.exp_id = c.exp_id
         JOIN ims.users u   ON u.user_id = c.user_id
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS payment_count,
             COALESCE(SUM(p.amount_paid), 0)::double precision AS paid_sum
           FROM ims.expense_payments p
           WHERE p.exp_ch_id = c.charge_id
         ) pay ON TRUE
         CROSS JOIN LATERAL (
           SELECT COALESCE(
                    NULLIF(to_jsonb(c) ->> 'is_opening_paid', '')::boolean,
                    COALESCE(c.note, '') ILIKE '${OPENING_EXPENSE_NOTE_PREFIX}%'
                  ) AS is_opening_paid
         ) opening
         ${where}
         ORDER BY c.charge_date DESC
         LIMIT 200`,
      params
    );
  },

  async createExpenseCharge(input: ExpenseChargeInput, scope: BranchScope, userId: number) {
    const branchId = pickBranchForWrite(scope, input.branchId);
    const isOpeningPaid =
      input.isOpeningPaid === true || (input.isOpeningPaid === undefined && isOpeningExpenseNote(input.note));

    return withTransaction(async (client) => {
      const exp = (
        await client.query<{ exp_id: number }>(
          `SELECT exp_id
             FROM ims.expenses
            WHERE exp_id = $1
              AND branch_id = $2
            FOR UPDATE`,
          [input.expId, branchId]
        )
      ).rows[0];
      if (!exp) throw ApiError.badRequest('Expense not found in selected branch');

      const hasOpeningPaidColumn = await hasColumn('expense_charges', 'is_opening_paid');
      const insertColumns = ['branch_id', 'exp_id', 'charge_date', 'reg_date', 'amount', 'ref_table', 'ref_id', 'note', 'user_id'];
      const insertValues: any[] = [
        branchId,
        input.expId,
        input.expDate || null,
        input.regDate || null,
        input.amount,
        input.expBudgetId ? 'expense_budgets' : null,
        input.expBudgetId || null,
        input.note || null,
        userId,
      ];
      if (hasOpeningPaidColumn) {
        insertColumns.push('is_opening_paid');
        insertValues.push(isOpeningPaid);
      }
      const chargeDateParam = insertColumns.indexOf('charge_date') + 1;
      const insertPlaceholders = insertColumns.map((column, idx) => {
        const param = `$${idx + 1}`;
        if (column === 'charge_date') return `COALESCE(${param}, NOW())`;
        if (column === 'reg_date') return `COALESCE(${param}, $${chargeDateParam}, NOW())`;
        return param;
      });

      const charge = (
        await client.query<{
          exp_ch_id: number;
          exp_date: string;
          reg_date: string;
          amount: number;
          exp_id: number;
          branch_id: number;
          note: string | null;
        }>(
          `INSERT INTO ims.expense_charges
             (${insertColumns.join(', ')})
           VALUES (${insertPlaceholders.join(', ')})
           RETURNING
             charge_id AS exp_ch_id,
             charge_date::text AS exp_date,
             reg_date::text AS reg_date,
             amount,
             exp_id,
             branch_id,
             note`,
          insertValues
        )
      ).rows[0];
      if (!charge) throw ApiError.internal('Failed to create expense charge');

      await rewriteExpenseChargeGl(client, { branchId, chargeId: Number(charge.exp_ch_id) });

      return {
        ...charge,
        is_opening_paid: isOpeningPaid,
        open_balance: isOpeningPaid ? 0 : Number(charge.amount || 0),
        payment_status: isOpeningPaid ? 'paid' : 'unpaid',
      };
    });
  },

  async updateExpenseCharge(id: number, input: Partial<ExpenseChargeInput>, scope: BranchScope, userId: number) {
    if (input.amount !== undefined) {
      const paid = await queryOne<{ paid_sum: number }>(
        `SELECT COALESCE(SUM(amount_paid), 0)::double precision AS paid_sum
           FROM ims.expense_payments
          WHERE exp_ch_id = $1`,
        [id]
      );
      const alreadyPaid = Number(paid?.paid_sum || 0);
      if (Number(input.amount) + 0.000001 < alreadyPaid) {
        throw ApiError.badRequest(
          `Amount cannot be less than paid amount (${alreadyPaid.toFixed(2)})`
        );
      }
    }

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
    if (input.isOpeningPaid !== undefined && (await hasColumn('expense_charges', 'is_opening_paid'))) {
      params.push(Boolean(input.isOpeningPaid));
      sets.push(`is_opening_paid = $${params.length}`);
    }
    if (sets.length === 0) throw ApiError.badRequest('Nothing to update');
    params.push(id);
    let where = `WHERE charge_id = $${params.length}`;
    if (!scope.isAdmin) {
      params.push(scope.branchIds);
      where += ` AND branch_id = ANY($${params.length})`;
    }
    const charge = await queryOne<{ exp_ch_id: number }>(
      `UPDATE ims.expense_charges
          SET ${sets.join(', ')}, user_id = ${userId}
         ${where}
        RETURNING charge_id AS exp_ch_id`,
      params
    );
    if (!charge) throw ApiError.notFound('Expense charge not found');

    const refreshed = await queryOne(
      `SELECT c.charge_id AS exp_ch_id,
              c.charge_date AS exp_date,
              c.reg_date,
              c.amount,
              c.exp_id,
              c.branch_id,
              c.note,
              COALESCE(
                NULLIF(to_jsonb(c) ->> 'is_opening_paid', '')::boolean,
                COALESCE(c.note, '') ILIKE '${OPENING_EXPENSE_NOTE_PREFIX}%'
              ) AS is_opening_paid,
              CASE
                WHEN COALESCE(
                  NULLIF(to_jsonb(c) ->> 'is_opening_paid', '')::boolean,
                  COALESCE(c.note, '') ILIKE '${OPENING_EXPENSE_NOTE_PREFIX}%'
                ) THEN 0::double precision
                ELSE GREATEST(COALESCE(c.amount, 0) - COALESCE(pay.paid_sum, 0), 0)::double precision
              END AS open_balance,
              CASE
                WHEN COALESCE(
                  NULLIF(to_jsonb(c) ->> 'is_opening_paid', '')::boolean,
                  COALESCE(c.note, '') ILIKE '${OPENING_EXPENSE_NOTE_PREFIX}%'
                ) THEN 'paid'
                WHEN COALESCE(pay.paid_sum, 0) <= 0 THEN 'unpaid'
                WHEN COALESCE(pay.paid_sum, 0) + 0.000001 < COALESCE(c.amount, 0) THEN 'partial'
                ELSE 'paid'
              END AS payment_status
         FROM ims.expense_charges c
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(p.amount_paid), 0)::double precision AS paid_sum
             FROM ims.expense_payments p
            WHERE p.exp_ch_id = c.charge_id
         ) pay ON TRUE
        WHERE c.charge_id = $1`,
      [charge.exp_ch_id]
    );
    if (!refreshed) throw ApiError.notFound('Expense charge not found');

    // Rebuild GL for this charge (outside transaction helper is safe since underlying posting is strict).
    await withTransaction(async (client) => {
      await rewriteExpenseChargeGl(client, { branchId: refreshed.branch_id, chargeId: Number(refreshed.exp_ch_id) });
    });
    return refreshed;
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

    await withTransaction(async (client) => {
      const locked = (await client.query<{ charge_id: number; branch_id: number }>(
        `SELECT charge_id, branch_id
           FROM ims.expense_charges
          WHERE charge_id = $1
          FOR UPDATE`,
        [id]
      )).rows[0];
      if (!locked) throw ApiError.notFound('Expense charge not found');
      assertBranchAccess(scope, locked.branch_id);

      const payment = (await client.query<{ exp_payment_id: number }>(
        `SELECT exp_payment_id FROM ims.expense_payments WHERE exp_ch_id = $1 LIMIT 1`,
        [id]
      )).rows[0];
      if (payment) {
        throw ApiError.badRequest('Cannot delete: this expense has payments recorded.');
      }

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'expense_charges'
            AND ref_id = $2`,
        [locked.branch_id, id]
      );

      await client.query(`DELETE FROM ims.expense_charges WHERE charge_id = $1`, [id]);
    });
  },

  async deleteExpensePayment(id: number, scope: BranchScope) {
    return withTransaction(async (client) => {
      const payment = (
        await client.query<{
          exp_payment_id: number;
          branch_id: number;
          acc_id: number;
          amount_paid: string;
          pay_date: string | null;
        }>(
          `SELECT exp_payment_id, branch_id, acc_id, amount_paid::text AS amount_paid, pay_date::text AS pay_date
             FROM ims.expense_payments
            WHERE exp_payment_id = $1
            FOR UPDATE`,
          [id]
        )
      ).rows[0];
      if (!payment) throw ApiError.notFound('Expense payment not found');
      assertBranchAccess(scope, payment.branch_id);

      const amount = roundMoney(Number(payment.amount_paid || 0));
      await client.query(
        `UPDATE ims.accounts
            SET balance = balance + $3
          WHERE branch_id = $1
            AND acc_id = $2`,
        [payment.branch_id, payment.acc_id, amount]
      );

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'expense_payments'
            AND ref_id = $2`,
        [payment.branch_id, id]
      );

      await client.query(`DELETE FROM ims.expense_payments WHERE exp_payment_id = $1`, [id]);
      return { deleted: true };
    });
  },

  async createExpensePayment(input: ExpensePaymentInput, scope: BranchScope, userId: number) {
    return withTransaction(async (client) => {
      const charge = (
        await client.query<{
          branch_id: number;
          amount: string;
          charge_id: number;
          is_opening_paid: boolean;
          charge_date: string | null;
        }>(
          `SELECT
              c.branch_id,
              COALESCE(c.amount, 0)::text AS amount,
              c.charge_id,
              COALESCE(
                NULLIF(to_jsonb(c) ->> 'is_opening_paid', '')::boolean,
                COALESCE(c.note, '') ILIKE '${OPENING_EXPENSE_NOTE_PREFIX}%'
              ) AS is_opening_paid,
              c.charge_date::text AS charge_date
             FROM ims.expense_charges c
            WHERE c.charge_id = $1
            FOR UPDATE`,
          [input.expChargeId]
        )
      ).rows[0];
      if (!charge) throw ApiError.notFound('Expense charge not found');
      if (charge.is_opening_paid) {
        throw ApiError.badRequest('Opening balance expense is already paid and cannot be paid again');
      }
      assertBranchAccess(scope, charge.branch_id);
      const branchId =
        input.branchId && input.branchId !== charge.branch_id ? (() => { throw ApiError.badRequest('Branch mismatch'); })() : charge.branch_id;

      const paidRow = (
        await client.query<{ paid_sum: string }>(
          `SELECT COALESCE(SUM(amount_paid), 0)::text AS paid_sum
             FROM ims.expense_payments
            WHERE exp_ch_id = $1`,
          [charge.charge_id]
        )
      ).rows[0];
      const paidSoFar = roundMoney(Number(paidRow?.paid_sum || 0));
      const chargeAmount = roundMoney(Number(charge.amount || 0));
      const remaining = Math.max(chargeAmount - paidSoFar, 0);
      if (remaining <= 0) {
        throw ApiError.badRequest('This expense is already fully paid');
      }

      const amount = input.amount !== undefined ? roundMoney(Number(input.amount)) : remaining;
      if (amount <= 0) throw ApiError.badRequest('Amount must be greater than zero');
      if (amount > remaining + 0.000001) {
        throw ApiError.badRequest(`Amount exceeds open balance (${remaining.toFixed(2)})`);
      }

      await lockAccountBalance(client, branchId, input.accId);
      await debitAccount(client, branchId, input.accId, amount);

      const payment = (
        await client.query<{ exp_payment_id: number; pay_date: string }>(
          `INSERT INTO ims.expense_payments
             (branch_id, exp_ch_id, acc_id, pay_date, amount_paid, reference_no, note, user_id)
           VALUES ($1,$2,$3,COALESCE($4,NOW()),$5,$6,$7,$8)
           RETURNING exp_payment_id, pay_date::text AS pay_date`,
          [
            branchId,
            charge.charge_id,
            input.accId,
            input.payDate || null,
            amount,
            input.referenceNo || null,
            input.note || null,
            userId,
          ]
        )
      ).rows[0];
      if (!payment?.exp_payment_id) throw ApiError.internal('Failed to record expense payment');

      const coa = await ensureCoaAccounts(client, branchId, ['expensePayable']);
      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'expense_payments'
            AND ref_id = $2`,
        [branchId, payment.exp_payment_id]
      );
      await postGl(client, {
        branchId,
        txnDate: payment.pay_date || input.payDate || null,
        txnType: 'expense_payment',
        refTable: 'expense_payments',
        refId: Number(payment.exp_payment_id),
        note: `Expense payment #${payment.exp_payment_id}`,
        lines: [
          { accId: coa.expensePayable, debit: amount, credit: 0, note: 'Pay expense payable' },
          { accId: input.accId, debit: 0, credit: amount, note: 'Cash/bank paid' },
        ],
      });

      return payment;
    });
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
  async listExpenseBudgets(scope: BranchScope, branchId?: number, range: DateRange = {}) {
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
    if (range.fromDate && range.toDate) {
      const hasCreatedAt = await hasColumn('expense_budgets', 'created_at');
      if (hasCreatedAt) {
        params.push(range.fromDate);
        where += ` AND b.created_at::date >= $${params.length}::date`;
        params.push(range.toDate);
        where += ` AND b.created_at::date <= $${params.length}::date`;
      }
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

    return withTransaction(async (client) => {
      const inserted = (await client.query<{ exp_ch_id: number }>(
        `INSERT INTO ims.expense_charges
           (branch_id, exp_id, acc_id, charge_date, reg_date, amount, ref_table, ref_id, exp_budget, budget_month, budget_year, note, user_id)
         VALUES
           ($1,$2,NULL,COALESCE($3, NOW()), COALESCE($3, NOW()), $4, 'expense_budgets', $5, 1, $6, $7, $8, $9)
         RETURNING charge_id AS exp_ch_id`,
        [branchId, budget.exp_id, chargeDate, amount, input.budgetId, month, year, note, userId]
      )).rows[0];
      if (!inserted?.exp_ch_id) throw ApiError.internal('Failed to charge budget');
      await rewriteExpenseChargeGl(client, { branchId, chargeId: Number(inserted.exp_ch_id) });
      return inserted;
    });
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

    return withTransaction(async (client) => {
      await client.query(
        `SELECT ims.sp_charge_expense_budget($1, $2, $3, $4)`,
        [null, input.regDate, op, userId] // p_budget_id null -> function will stage all budgets
      );

      const chargeParams: any[] = [dateStr];
      let where = `charge_date::date = $1::date AND ref_table = 'expense_budgets'`;
      if (input.branchId) {
        chargeParams.push(input.branchId);
        where += ` AND branch_id = $${chargeParams.length}`;
      }

      const charges = (await client.query<{ charge_id: number; branch_id: number }>(
        `SELECT charge_id, branch_id
           FROM ims.expense_charges
          WHERE ${where}`,
        chargeParams
      )).rows;

      for (const ch of charges) {
        await rewriteExpenseChargeGl(client, { branchId: Number(ch.branch_id), chargeId: Number(ch.charge_id) });
      }

      return { status: 'ok', oper: op };
    });
  },

  /* Payroll */
  async chargeSalaries(input: PayrollChargeInput, scope: BranchScope, userId: number) {
    if (!input.periodDate) throw ApiError.badRequest('periodDate required');
    // For now, operate across all branches; permission: at least one branch in scope
    if (!scope.branchIds.length && !scope.isAdmin) throw ApiError.forbidden('No branch access');

    const parts = String(input.periodDate).trim().split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    if (!year || !month || month < 1 || month > 12) {
      throw ApiError.badRequest('periodDate must be in YYYY-MM or YYYY-MM-DD format');
    }
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

    return withTransaction(async (client) => {
      const res = (await client.query<{ created: number }>(
        `SELECT ims.sp_charge_salary($1, $2) AS created`,
        [input.periodDate, userId]
      )).rows[0];

      const runParams: any[] = [year, month];
      let runWhere = `pr.period_year = $1 AND pr.period_month = $2`;
      if (!scope.isAdmin) {
        runParams.push(scope.branchIds);
        runWhere += ` AND pr.branch_id = ANY($${runParams.length})`;
      }

      const runIds = (await client.query<{ payroll_id: number; branch_id: number }>(
        `SELECT pr.payroll_id, pr.branch_id
           FROM ims.payroll_runs pr
          WHERE ${runWhere}`,
        runParams
      )).rows.map((r) => Number(r.payroll_id));

      if (runIds.length) {
        await client.query(
          `DELETE FROM ims.account_transactions at
            USING ims.payroll_lines pl
           WHERE at.branch_id = pl.branch_id
             AND at.ref_table = 'payroll_lines'
             AND at.ref_id = pl.payroll_line_id
             AND pl.payroll_id = ANY($1::bigint[])`,
          [runIds]
        );

        const lines = (await client.query<{ branch_id: number; payroll_line_id: number; net_salary: string }>(
          `SELECT pl.branch_id, pl.payroll_line_id, COALESCE(pl.net_salary, 0)::text AS net_salary
             FROM ims.payroll_lines pl
            WHERE pl.payroll_id = ANY($1::bigint[])
              AND COALESCE(pl.net_salary, 0) > 0`,
          [runIds]
        )).rows;

        const coaByBranch = new Map<number, { payrollExpense: number; payrollPayable: number }>();
        for (const line of lines) {
          const branchId = Number(line.branch_id);
          if (!coaByBranch.has(branchId)) {
            const coa = await ensureCoaAccounts(client, branchId, ['payrollExpense', 'payrollPayable']);
            coaByBranch.set(branchId, { payrollExpense: coa.payrollExpense, payrollPayable: coa.payrollPayable });
          }
          const coa = coaByBranch.get(branchId)!;
          const amount = roundMoney(Number(line.net_salary || 0));
          if (amount <= 0) continue;

          await postGl(client, {
            branchId,
            txnDate: monthEnd,
            txnType: 'other',
            refTable: 'payroll_lines',
            refId: Number(line.payroll_line_id),
            note: `Payroll charge ${year}-${String(month).padStart(2, '0')}`,
            lines: [
              { accId: coa.payrollExpense, debit: amount, credit: 0, note: 'Payroll expense' },
              { accId: coa.payrollPayable, debit: 0, credit: amount, note: 'Payroll payable' },
            ],
          });
        }
      }

      return { created: res?.created ?? 0 };
    });
  },

  async listPayroll(scope: BranchScope, period?: string, range: DateRange = {}) {
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
    if (range.fromDate && range.toDate) {
      params.push(range.fromDate);
      where += ` AND make_date(pr.period_year, pr.period_month, 1) >= $${params.length}::date`;
      params.push(range.toDate);
      where += ` AND make_date(pr.period_year, pr.period_month, 1) <= $${params.length}::date`;
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
    return withTransaction(async (client) => {
      const line = (
        await client.query<{
          payroll_line_id: number;
          payroll_id: number;
          branch_id: number;
          emp_id: number;
          net_salary: string;
          status: string | null;
        }>(
          `SELECT pl.payroll_line_id,
                  pl.payroll_id,
                  pl.branch_id,
                  pl.emp_id,
                  COALESCE(pl.net_salary, 0)::text AS net_salary,
                  COALESCE(pr.status::text, 'posted') AS status
             FROM ims.payroll_lines pl
             JOIN ims.payroll_runs pr ON pr.payroll_id = pl.payroll_id
            WHERE pl.payroll_line_id = $1
            FOR UPDATE`,
          [input.payrollLineId]
        )
      ).rows[0];
      if (!line) throw ApiError.notFound('Payroll line not found');
      assertBranchAccess(scope, line.branch_id);
      if ((line.status || '').toLowerCase() === 'void') {
        throw ApiError.badRequest('Cannot pay salary for a void payroll run');
      }

      const paidSumRow = (
        await client.query<{ paid: string }>(
          `SELECT COALESCE(SUM(amount_paid),0)::text AS paid
             FROM ims.employee_payments
            WHERE payroll_line_id = $1`,
          [input.payrollLineId]
        )
      ).rows[0];
      const paid = roundMoney(Number(paidSumRow?.paid || 0));
      const netSalary = roundMoney(Number(line.net_salary || 0));
      const remaining = Math.max(0, netSalary - paid);
      const amount = input.amount !== undefined ? roundMoney(Number(input.amount)) : remaining;
      if (amount <= 0) throw ApiError.badRequest('Amount must be greater than 0');
      if (amount > remaining + 0.000001) throw ApiError.badRequest('Amount exceeds remaining salary');

      await debitAccount(client, line.branch_id, input.accId, amount);

      const pay = (
        await client.query<{ emp_payment_id: number; pay_date: string }>(
          `INSERT INTO ims.employee_payments
             (branch_id, payroll_id, payroll_line_id, emp_id, paid_by, acc_id, amount_paid, note, pay_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,NOW()))
           RETURNING emp_payment_id, pay_date::text AS pay_date`,
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
        )
      ).rows[0];
      if (!pay?.emp_payment_id) throw ApiError.internal('Failed to record salary payment');

      await client.query(
        `DELETE FROM ims.account_transactions
          WHERE branch_id = $1
            AND ref_table = 'employee_payments'
            AND ref_id = $2`,
        [line.branch_id, pay.emp_payment_id]
      );

      const coa = await ensureCoaAccounts(client, line.branch_id, ['payrollPayable']);
      await postGl(client, {
        branchId: line.branch_id,
        txnDate: pay.pay_date || input.payDate || null,
        txnType: 'payroll_payment',
        refTable: 'employee_payments',
        refId: Number(pay.emp_payment_id),
        note: `Payroll payment #${pay.emp_payment_id}`,
        lines: [
          { accId: coa.payrollPayable, debit: amount, credit: 0, note: 'Reduce payroll payable' },
          { accId: input.accId, debit: 0, credit: amount, note: 'Cash/bank paid' },
        ],
      });

      return pay;
    });
  },

  async deletePayroll(input: PayrollDeleteInput, scope: BranchScope, _userId: number) {
    return withTransaction(async (client) => {
      if (input.mode === 'line') {
        if (!input.payrollLineId) throw ApiError.badRequest('payrollLineId required');
        const line = (await client.query<{ payroll_line_id: number; payroll_id: number; branch_id: number }>(
          `SELECT payroll_line_id, payroll_id, branch_id
             FROM ims.payroll_lines
            WHERE payroll_line_id = $1
            FOR UPDATE`,
          [input.payrollLineId]
        )).rows[0];
        if (!line) throw ApiError.notFound('Payroll line not found');
        assertBranchAccess(scope, line.branch_id);

        const payments = (await client.query<{ emp_payment_id: number; acc_id: number; amount_paid: string }>(
          `SELECT emp_payment_id, acc_id, amount_paid::text AS amount_paid
             FROM ims.employee_payments
            WHERE payroll_line_id = $1`,
          [line.payroll_line_id]
        )).rows;

        for (const payment of payments) {
          const amount = roundMoney(Number(payment.amount_paid || 0));
          await client.query(
            `UPDATE ims.accounts
                SET balance = balance + $3
              WHERE branch_id = $1
                AND acc_id = $2`,
            [line.branch_id, payment.acc_id, amount]
          );
          await client.query(
            `DELETE FROM ims.account_transactions
              WHERE branch_id = $1
                AND ref_table = 'employee_payments'
                AND ref_id = $2`,
            [line.branch_id, payment.emp_payment_id]
          );
        }

        await client.query(`DELETE FROM ims.employee_payments WHERE payroll_line_id = $1`, [line.payroll_line_id]);

        await client.query(
          `DELETE FROM ims.account_transactions
            WHERE branch_id = $1
              AND ref_table = 'payroll_lines'
              AND ref_id = $2`,
          [line.branch_id, line.payroll_line_id]
        );

        await client.query(`DELETE FROM ims.payroll_lines WHERE payroll_line_id = $1`, [line.payroll_line_id]);

        const remaining = (await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM ims.payroll_lines WHERE payroll_id = $1`,
          [line.payroll_id]
        )).rows[0];
        if (!remaining || Number(remaining.cnt) === 0) {
          await client.query(`DELETE FROM ims.payroll_runs WHERE payroll_id = $1`, [line.payroll_id]);
        }

        return { deleted: 1 };
      }

      // mode === 'period'
      if (!input.period) throw ApiError.badRequest('period required (YYYY-MM)');
      const [y, m] = input.period.split('-').map(Number);
      if (!y || !m) throw ApiError.badRequest('Invalid period');

      const runParams: any[] = [y, m];
      let runWhere = `period_year = $1 AND period_month = $2`;
      if (!scope.isAdmin) {
        runParams.push(scope.branchIds);
        runWhere += ` AND branch_id = ANY($${runParams.length})`;
      }

      const runs = (await client.query<{ payroll_id: number; branch_id: number }>(
        `SELECT payroll_id, branch_id
           FROM ims.payroll_runs
          WHERE ${runWhere}
          FOR UPDATE`,
        runParams
      )).rows;

      if (!runs.length) throw ApiError.notFound('No payroll runs for this period');
      for (const run of runs) {
        assertBranchAccess(scope, Number(run.branch_id));
      }
      const runIds = runs.map((r) => Number(r.payroll_id));

      const payments = (await client.query<{ emp_payment_id: number; branch_id: number; acc_id: number; amount_paid: string }>(
        `SELECT ep.emp_payment_id, ep.branch_id, ep.acc_id, ep.amount_paid::text AS amount_paid
           FROM ims.employee_payments ep
          WHERE ep.payroll_line_id IN (
            SELECT payroll_line_id FROM ims.payroll_lines WHERE payroll_id = ANY($1::bigint[])
          )`,
        [runIds]
      )).rows;

      for (const payment of payments) {
        const amount = roundMoney(Number(payment.amount_paid || 0));
        await client.query(
          `UPDATE ims.accounts
              SET balance = balance + $3
            WHERE branch_id = $1
              AND acc_id = $2`,
          [payment.branch_id, payment.acc_id, amount]
        );
        await client.query(
          `DELETE FROM ims.account_transactions
            WHERE branch_id = $1
              AND ref_table = 'employee_payments'
              AND ref_id = $2`,
          [payment.branch_id, payment.emp_payment_id]
        );
      }

      await client.query(
        `DELETE FROM ims.employee_payments
          WHERE payroll_line_id IN (
            SELECT payroll_line_id FROM ims.payroll_lines WHERE payroll_id = ANY($1::bigint[])
          )`,
        [runIds]
      );

      await client.query(
        `DELETE FROM ims.account_transactions at
          USING ims.payroll_lines pl
         WHERE at.branch_id = pl.branch_id
           AND at.ref_table = 'payroll_lines'
           AND at.ref_id = pl.payroll_line_id
           AND pl.payroll_id = ANY($1::bigint[])`,
        [runIds]
      );

      await client.query(`DELETE FROM ims.payroll_lines WHERE payroll_id = ANY($1::bigint[])`, [runIds]);
      await client.query(`DELETE FROM ims.payroll_runs WHERE payroll_id = ANY($1::bigint[])`, [runIds]);

      return { deleted: runIds.length };
    });
  },
};
