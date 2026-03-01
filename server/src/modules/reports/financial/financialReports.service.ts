import { queryMany } from '../../../db/query';

export interface FinancialReportOption {
  id: number;
  label: string;
}

export interface IncomeStatementRow {
  section: string;
  line_item: string;
  amount: number;
  row_type: 'detail' | 'total';
}

export interface BalanceSheetRow {
  section: string;
  line_item: string;
  amount: number;
  row_type: 'detail' | 'total';
}

export interface CashFlowRow {
  section: string;
  line_item: string;
  amount: number;
  row_type: 'detail' | 'total';
}

export interface AccountBalanceRow {
  account_id: number;
  account_name: string;
  institution: string;
  current_balance: number;
  last_transaction_date: string | null;
}

export interface ExpenseSummaryRow {
  exp_id: number;
  expense_name: string;
  charges_count: number;
  total_charged: number;
  total_paid: number;
  outstanding_amount: number;
  last_charge_date: string | null;
}

export interface CustomerReceiptRow {
  receipt_id: number;
  receipt_date: string;
  customer_id: number | null;
  customer_name: string;
  sale_id: number | null;
  account_name: string;
  amount: number;
  payment_method: string;
  reference_no: string;
  note: string;
}

export interface SupplierPaymentRow {
  sup_payment_id: number;
  pay_date: string;
  purchase_id: number;
  supplier_id: number | null;
  supplier_name: string;
  account_name: string;
  amount_paid: number;
  reference_no: string;
  note: string;
}

export interface AccountTransactionRow {
  txn_id: number;
  txn_date: string;
  account_id: number;
  account_name: string;
  txn_type: string;
  ref_table: string;
  ref_id: number | null;
  debit: number;
  credit: number;
  net_effect: number;
  note: string;
}

export interface AccountStatementRow {
  txn_id: number;
  txn_date: string;
  account_id: number;
  account_name: string;
  txn_type: string;
  ref_table: string;
  ref_id: number | null;
  debit: number;
  credit: number;
  running_balance: number;
  note: string;
}

export interface TrialBalanceRow {
  account_id: number;
  account_name: string;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

export interface AccountsReceivableRow {
  customer_name: string;
  invoice_no: number;
  invoice_date: string;
  due_date: string;
  amount: number;
  paid: number;
  balance: number;
  status: string;
}

export interface AccountsPayableRow {
  supplier_name: string;
  bill_no: number;
  bill_date: string;
  due_date: string;
  amount: number;
  paid: number;
  balance: number;
  status: string;
}

type BalanceTable = 'customers' | 'suppliers';
type BalanceColumn = 'open_balance' | 'remaining_balance';

const balanceColumnCache: Partial<Record<BalanceTable, BalanceColumn>> = {};

const resolveBalanceColumn = async (table: BalanceTable): Promise<BalanceColumn> => {
  const cached = balanceColumnCache[table];
  if (cached) return cached;

  const cols = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = $1`,
    [table]
  );
  const names = new Set(cols.map((row) => row.column_name));
  const resolved: BalanceColumn = names.has('remaining_balance') ? 'remaining_balance' : 'open_balance';
  balanceColumnCache[table] = resolved;
  return resolved;
};

const toMoney = (value: unknown) => Number(value || 0);

const queryAmount = async (sql: string, params: Array<string | number>): Promise<number> => {
  const rows = await queryMany<{ amount: number }>(sql, params);
  return toMoney(rows[0]?.amount);
};

const isMissingBalanceSheetProcedureError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const code = String((error as { code?: string }).code || '');
  return code === '42883' || code === '42P01' || code === '42703';
};

export const financialReportsService = {
  async getFinancialReportOptions(branchId: number): Promise<{
    accounts: FinancialReportOption[];
    customers: FinancialReportOption[];
    suppliers: FinancialReportOption[];
  }> {
    const [accounts, customers, suppliers] = await Promise.all([
      queryMany<FinancialReportOption>(
        `SELECT acc_id AS id, name AS label
           FROM ims.accounts
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY name`,
        [branchId]
      ),
      queryMany<FinancialReportOption>(
        `SELECT customer_id AS id, full_name AS label
           FROM ims.customers
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY full_name`,
        [branchId]
      ),
      queryMany<FinancialReportOption>(
        `SELECT supplier_id AS id, name AS label
           FROM ims.suppliers
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY name`,
        [branchId]
      ),
    ]);

    return { accounts, customers, suppliers };
  },

  async getIncomeStatement(branchId: number, fromDate: string, toDate: string): Promise<IncomeStatementRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    const [
      grossSales,
      salesReturns,
      movementCostSales,
      movementCostSalesReturns,
      stockPurchases,
      purchaseReturns,
      operatingExpenses,
      payrollExpenseAccrued,
      otherIncome,
    ] = await Promise.all([
      queryAmount(
        `SELECT COALESCE(SUM(s.total), 0)::double precision AS amount
           FROM ims.sales s
          WHERE s.branch_id = $1
            AND s.sale_date::date BETWEEN $2::date AND $3::date
            AND LOWER(COALESCE(s.status::text, '')) <> 'void'
            AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(sr.total), 0)::double precision AS amount
           FROM ims.sales_returns sr
          WHERE sr.branch_id = $1
            AND sr.return_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(m.qty_out * m.unit_cost), 0)::double precision AS amount
           FROM ims.inventory_movements m
          WHERE m.branch_id = $1
            AND m.move_type = 'sale'
            AND m.move_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(m.qty_in * m.unit_cost), 0)::double precision AS amount
           FROM ims.inventory_movements m
          WHERE m.branch_id = $1
            AND m.move_type = 'sales_return'
            AND m.move_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(p.total), 0)::double precision AS amount
           FROM ims.purchases p
          WHERE p.branch_id = $1
            AND p.purchase_date::date BETWEEN $2::date AND $3::date
            AND LOWER(COALESCE(p.status::text, '')) <> 'void'`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(pr.total), 0)::double precision AS amount
           FROM ims.purchase_returns pr
          WHERE pr.branch_id = $1
            AND pr.return_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(ec.amount), 0)::double precision AS amount
           FROM ims.expense_charges ec
          WHERE ec.branch_id = $1
            AND ec.charge_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(pl.net_salary), 0)::double precision AS amount
           FROM ims.payroll_lines pl
           JOIN ims.payroll_runs pr
             ON pr.payroll_id = pl.payroll_id
            AND pr.branch_id = pl.branch_id
          WHERE pl.branch_id = $1
            AND COALESCE(pr.status::text, 'draft') = 'posted'
            AND pr.period_from <= $3::date
            AND pr.period_to >= $2::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(GREATEST(at.credit - at.debit, 0)), 0)::double precision AS amount
           FROM ims.account_transactions at
          WHERE at.branch_id = $1
            AND at.txn_date::date BETWEEN $2::date AND $3::date
            AND at.txn_type IN ('other', 'return_refund')`,
        params
      ),
    ]);

    const revenue = grossSales - salesReturns;
    const movementCost = Math.max(movementCostSales - movementCostSalesReturns, 0);
    const purchaseCostFallback = Math.max(stockPurchases - purchaseReturns, 0);
    const costOfGoodsSold = movementCost > 0 ? movementCost : purchaseCostFallback;
    const grossProfit = revenue - costOfGoodsSold;
    const totalOperatingExpenses = operatingExpenses + payrollExpenseAccrued;
    const netIncome = grossProfit - totalOperatingExpenses + otherIncome;

    return [
      { section: 'Revenue', line_item: 'Sales Revenue', amount: grossSales, row_type: 'detail' },
      { section: 'Revenue', line_item: 'Sales Returns', amount: -salesReturns, row_type: 'detail' },
      { section: 'Revenue', line_item: 'Total Revenue', amount: revenue, row_type: 'total' },
      { section: 'Cost of Goods Sold', line_item: 'Cost of Goods Sold', amount: -costOfGoodsSold, row_type: 'detail' },
      { section: 'Cost of Goods Sold', line_item: 'Total Cost of Goods Sold', amount: -costOfGoodsSold, row_type: 'total' },
      { section: 'Gross Profit', line_item: 'Gross Profit', amount: grossProfit, row_type: 'total' },
      { section: 'Operating Expenses', line_item: 'Operating Expenses', amount: -operatingExpenses, row_type: 'detail' },
      { section: 'Operating Expenses', line_item: 'Payroll Expense', amount: -payrollExpenseAccrued, row_type: 'detail' },
      {
        section: 'Operating Expenses',
        line_item: 'Total Operating Expenses',
        amount: -totalOperatingExpenses,
        row_type: 'total',
      },
      { section: 'Net Income', line_item: 'Other Income', amount: otherIncome, row_type: 'detail' },
      { section: 'Net Income', line_item: 'Net Income', amount: netIncome, row_type: 'total' },
    ];
  },

  async getBalanceSheet(branchId: number, asOfDate: string): Promise<BalanceSheetRow[]> {
    const [customerBalanceColumn, supplierBalanceColumn] = await Promise.all([
      resolveBalanceColumn('customers'),
      resolveBalanceColumn('suppliers'),
    ]);
    const params: Array<number | string> = [branchId, asOfDate];

    const [
      cashAmount,
      receivableAmount,
      customerAdvanceAmount,
      inventoryAmount,
      supplierPayableAmount,
      expensePayableAmount,
      payrollPayableAmount,
      employeeLoanReceivableAmount,
      netSalesToDate,
      purchasesToDate,
      purchaseReturnsToDate,
      cogsByMovementToDate,
      operatingExpensesToDate,
      payrollExpenseToDate,
      otherIncomeToDate,
      supplierRefundsToDate,
    ] = await Promise.all([
      queryAmount(
        `WITH txn AS (
           SELECT
             COUNT(*)::int AS txn_count,
             COALESCE(
               SUM(
                 CASE
                   -- Legacy customer-receipt rows were posted with reversed sign (debit instead of credit).
                   WHEN COALESCE(at.txn_type::text, '') = 'sale_payment'
                     AND COALESCE(at.ref_table, '') = 'customer_receipts'
                     AND COALESCE(at.credit, 0) = 0
                     AND COALESCE(at.debit, 0) > 0
                     THEN COALESCE(at.debit, 0)
                   ELSE COALESCE(at.credit, 0) - COALESCE(at.debit, 0)
                 END
               ),
               0
             )::double precision AS txn_balance
           FROM ims.account_transactions at
          WHERE at.branch_id = $1
            AND at.txn_date::date <= $2::date
         ),
         acc AS (
           SELECT COALESCE(SUM(a.balance), 0)::double precision AS current_balance
             FROM ims.accounts a
            WHERE a.branch_id = $1
              AND a.is_active = TRUE
         )
         SELECT
           CASE WHEN txn.txn_count > 0 THEN txn.txn_balance ELSE acc.current_balance END AS amount
         FROM txn, acc`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(GREATEST(COALESCE(c.${customerBalanceColumn}, 0), 0)), 0)::double precision AS amount
           FROM ims.customers c
          WHERE c.branch_id = $1
            AND c.is_active = TRUE`,
        [branchId]
      ),
      queryAmount(
        `SELECT COALESCE(SUM(GREATEST(-COALESCE(c.${customerBalanceColumn}, 0), 0)), 0)::double precision AS amount
           FROM ims.customers c
          WHERE c.branch_id = $1
            AND c.is_active = TRUE`,
        [branchId]
      ),
      queryAmount(
        `WITH item_stock AS (
           SELECT
             i.item_id,
             CASE
               WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
               ELSE COALESCE(st.total_qty, 0)
             END::numeric(14,3) AS total_qty,
             COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price
           FROM ims.items i
           LEFT JOIN (
             SELECT
               s.branch_id,
               si.product_id AS item_id,
               COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS total_qty,
               COUNT(*)::int AS row_count
             FROM ims.store_items si
             JOIN ims.stores s ON s.store_id = si.store_id
             GROUP BY s.branch_id, si.product_id
           ) st
             ON st.item_id = i.item_id
            AND st.branch_id = i.branch_id
          WHERE i.branch_id = $1
        )
        SELECT COALESCE(SUM(item_stock.total_qty * item_stock.cost_price), 0)::double precision AS amount
          FROM item_stock`,
        [branchId]
      ),
      queryAmount(
        `WITH scoped_purchases AS (
           SELECT
             p.purchase_id,
             p.branch_id,
             p.supplier_id,
             COALESCE(p.total, 0)::double precision AS total
           FROM ims.purchases p
          WHERE p.branch_id = $1
            AND p.supplier_id IS NOT NULL
            AND p.purchase_date::date <= $2::date
            AND LOWER(COALESCE(p.status::text, '')) <> 'void'
         ),
         purchase_payments AS (
           SELECT
             x.purchase_id,
             COALESCE(SUM(x.amount), 0)::double precision AS paid_amount
           FROM (
             SELECT
               sp.purchase_id,
               COALESCE(sp.amount_paid, 0)::double precision AS amount
             FROM ims.supplier_payments sp
            WHERE sp.branch_id = $1
              AND sp.pay_date::date <= $2::date
              AND sp.purchase_id IS NOT NULL
             UNION ALL
             SELECT
               sr.purchase_id,
               COALESCE(sr.amount, 0)::double precision AS amount
             FROM ims.supplier_receipts sr
            WHERE sr.branch_id = $1
              AND sr.receipt_date::date <= $2::date
              AND sr.purchase_id IS NOT NULL
           ) x
           GROUP BY x.purchase_id
         ),
         purchase_rollup AS (
           SELECT
             sp.branch_id,
             sp.supplier_id,
             COALESCE(SUM(sp.total), 0)::double precision AS total_purchase,
             COALESCE(SUM(COALESCE(pp.paid_amount, 0)), 0)::double precision AS paid_against_purchase
           FROM scoped_purchases sp
           LEFT JOIN purchase_payments pp ON pp.purchase_id = sp.purchase_id
           GROUP BY sp.branch_id, sp.supplier_id
         ),
         supplier_unallocated_payments AS (
           SELECT
             sr.branch_id,
             sr.supplier_id,
             COALESCE(SUM(sr.amount), 0)::double precision AS unallocated_paid
           FROM ims.supplier_receipts sr
          WHERE sr.branch_id = $1
            AND sr.receipt_date::date <= $2::date
            AND sr.purchase_id IS NULL
            AND sr.supplier_id IS NOT NULL
          GROUP BY sr.branch_id, sr.supplier_id
         )
         SELECT COALESCE(
                  SUM(
                    GREATEST(
                      COALESCE(s.${supplierBalanceColumn}, 0)
                      + GREATEST(
                          COALESCE(pr.total_purchase, 0)
                          - COALESCE(pr.paid_against_purchase, 0)
                          - COALESCE(up.unallocated_paid, 0),
                          0
                        ),
                      0
                    )
                  ),
                  0
                )::double precision AS amount
           FROM ims.suppliers s
           LEFT JOIN purchase_rollup pr
             ON pr.branch_id = s.branch_id
            AND pr.supplier_id = s.supplier_id
           LEFT JOIN supplier_unallocated_payments up
             ON up.branch_id = s.branch_id
            AND up.supplier_id = s.supplier_id
          WHERE s.branch_id = $1
            AND s.is_active = TRUE`,
        params
      ),
      queryAmount(
        `WITH charges AS (
           SELECT COALESCE(SUM(ec.amount), 0)::double precision AS amount
             FROM ims.expense_charges ec
            WHERE ec.branch_id = $1
              AND ec.charge_date::date <= $2::date
         ),
         payments AS (
           SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
             FROM ims.expense_payments ep
            WHERE ep.branch_id = $1
              AND ep.pay_date::date <= $2::date
         )
         SELECT GREATEST(charges.amount - payments.amount, 0)::double precision AS amount
           FROM charges, payments`,
        params
      ),
      queryAmount(
        `WITH payroll_due AS (
           SELECT COALESCE(SUM(pl.net_salary), 0)::double precision AS amount
             FROM ims.payroll_lines pl
             JOIN ims.payroll_runs pr
               ON pr.payroll_id = pl.payroll_id
              AND pr.branch_id = pl.branch_id
            WHERE pl.branch_id = $1
              AND COALESCE(pr.status::text, 'draft') = 'posted'
              AND pr.period_to <= $2::date
         ),
         payroll_paid AS (
           SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
             FROM ims.employee_payments ep
            WHERE ep.branch_id = $1
              AND ep.pay_date::date <= $2::date
         )
         SELECT GREATEST(payroll_due.amount - payroll_paid.amount, 0)::double precision AS amount
           FROM payroll_due, payroll_paid`,
        params
      ),
      queryAmount(
        `WITH loans AS (
           SELECT COALESCE(SUM(el.amount), 0)::double precision AS amount
             FROM ims.employee_loans el
            WHERE el.branch_id = $1
              AND el.loan_date <= $2::date
         ),
         repayments AS (
           SELECT COALESCE(SUM(lp.amount_paid), 0)::double precision AS amount
             FROM ims.loan_payments lp
            WHERE lp.branch_id = $1
              AND lp.pay_date::date <= $2::date
         )
         SELECT GREATEST(loans.amount - repayments.amount, 0)::double precision AS amount
           FROM loans, repayments`,
        params
      ),
      queryAmount(
        `WITH sales_total AS (
           SELECT COALESCE(SUM(s.total), 0)::double precision AS amount
             FROM ims.sales s
            WHERE s.branch_id = $1
              AND s.sale_date::date <= $2::date
              AND LOWER(COALESCE(s.status::text, '')) <> 'void'
              AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
         ),
         sales_returns AS (
           SELECT COALESCE(SUM(sr.total), 0)::double precision AS amount
             FROM ims.sales_returns sr
            WHERE sr.branch_id = $1
              AND sr.return_date::date <= $2::date
         )
         SELECT (sales_total.amount - sales_returns.amount)::double precision AS amount
         FROM sales_total, sales_returns`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(p.total), 0)::double precision AS amount
           FROM ims.purchases p
          WHERE p.branch_id = $1
            AND p.purchase_date::date <= $2::date
            AND LOWER(COALESCE(p.status::text, '')) <> 'void'`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(pr.total), 0)::double precision AS amount
           FROM ims.purchase_returns pr
          WHERE pr.branch_id = $1
            AND pr.return_date::date <= $2::date`,
        params
      ),
      queryAmount(
        `WITH sales_cost AS (
           SELECT COALESCE(SUM(m.qty_out * m.unit_cost), 0)::double precision AS amount
             FROM ims.inventory_movements m
            WHERE m.branch_id = $1
              AND m.move_type = 'sale'
              AND m.move_date::date <= $2::date
         ),
         returns_cost AS (
           SELECT COALESCE(SUM(m.qty_in * m.unit_cost), 0)::double precision AS amount
             FROM ims.inventory_movements m
            WHERE m.branch_id = $1
              AND m.move_type = 'sales_return'
              AND m.move_date::date <= $2::date
         )
         SELECT GREATEST(sales_cost.amount - returns_cost.amount, 0)::double precision AS amount
         FROM sales_cost, returns_cost`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(ec.amount), 0)::double precision AS amount
           FROM ims.expense_charges ec
          WHERE ec.branch_id = $1
            AND ec.charge_date::date <= $2::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(pl.net_salary), 0)::double precision AS amount
           FROM ims.payroll_lines pl
           JOIN ims.payroll_runs pr
             ON pr.payroll_id = pl.payroll_id
            AND pr.branch_id = pl.branch_id
          WHERE pl.branch_id = $1
            AND COALESCE(pr.status::text, 'draft') = 'posted'
            AND pr.period_to <= $2::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(GREATEST(at.credit - at.debit, 0)), 0)::double precision AS amount
           FROM ims.account_transactions at
          WHERE at.branch_id = $1
            AND at.txn_date::date <= $2::date
            AND at.txn_type = 'other'`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(sr.amount), 0)::double precision AS amount
           FROM ims.supplier_receipts sr
          WHERE sr.branch_id = $1
            AND sr.receipt_date::date <= $2::date`,
        params
      ),
    ]);

    let fixedAssetsAmount = 0;
    try {
      fixedAssetsAmount = await queryAmount(
        `SELECT COALESCE(SUM(fa.cost), 0)::double precision AS amount
           FROM ims.fixed_assets fa
          WHERE fa.branch_id = $1
            AND fa.purchase_date <= $2::date
            AND LOWER(COALESCE(fa.status, 'active')) <> 'disposed'`,
        params
      );
    } catch (error) {
      if (!isMissingBalanceSheetProcedureError(error)) {
        throw error;
      }
    }

    const fallbackCustomerReceivable = await queryAmount(
      `SELECT COALESCE(SUM(c.${customerBalanceColumn}), 0)::double precision AS amount
         FROM ims.customers c
        WHERE c.branch_id = $1
          AND c.is_active = TRUE`,
      [branchId]
    );
    const fallbackSupplierPayable = await queryAmount(
      `SELECT COALESCE(SUM(GREATEST(COALESCE(s.${supplierBalanceColumn}, 0), 0)), 0)::double precision AS amount
         FROM ims.suppliers s
        WHERE s.branch_id = $1
          AND s.is_active = TRUE`,
      [branchId]
    );

    const accountsReceivable = receivableAmount > 0 ? receivableAmount : Math.max(fallbackCustomerReceivable, 0);
    const accountsPayable = Math.max(supplierPayableAmount, fallbackSupplierPayable, 0);

    const netPurchasesToDate = Math.max(purchasesToDate - purchaseReturnsToDate, 0);
    const costOfSalesToDate = cogsByMovementToDate > 0 ? cogsByMovementToDate : netPurchasesToDate;
    const netProfitToDate =
      netSalesToDate + otherIncomeToDate + supplierRefundsToDate - costOfSalesToDate - operatingExpensesToDate - payrollExpenseToDate;
    const netResultLabel = netProfitToDate >= 0 ? 'Net Profit' : 'Net Loss';

    const totalCurrentAssets = cashAmount + accountsReceivable + inventoryAmount;
    const totalNonCurrentAssets = employeeLoanReceivableAmount + fixedAssetsAmount;
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    const totalCurrentLiabilities = accountsPayable + customerAdvanceAmount + expensePayableAmount + payrollPayableAmount;
    const totalNonCurrentLiabilities = 0;
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
    const openingEquity = totalAssets - totalLiabilities - netProfitToDate;
    const totalEquity = openingEquity + netProfitToDate;
    const totalLiabilitiesEquity = totalLiabilities + totalEquity;
    const balanceDifference = totalAssets - totalLiabilitiesEquity;

    return [
      { section: 'Current Assets', line_item: 'Cash & Bank Accounts', amount: cashAmount, row_type: 'detail' },
      { section: 'Current Assets', line_item: 'Accounts Receivable', amount: accountsReceivable, row_type: 'detail' },
      { section: 'Current Assets', line_item: 'Inventory Value', amount: inventoryAmount, row_type: 'detail' },
      { section: 'Current Assets', line_item: 'Total Current Assets', amount: totalCurrentAssets, row_type: 'total' },
      {
        section: 'Non-Current Assets',
        line_item: 'Fixed Assets',
        amount: fixedAssetsAmount,
        row_type: 'detail',
      },
      {
        section: 'Non-Current Assets',
        line_item: 'Employee Loan Receivable',
        amount: employeeLoanReceivableAmount,
        row_type: 'detail',
      },
      {
        section: 'Non-Current Assets',
        line_item: 'Total Non-Current Assets',
        amount: totalNonCurrentAssets,
        row_type: 'total',
      },
      { section: 'Current Liabilities', line_item: 'Accounts Payable', amount: accountsPayable, row_type: 'detail' },
      {
        section: 'Current Liabilities',
        line_item: 'Customer Advances',
        amount: customerAdvanceAmount,
        row_type: 'detail',
      },
      { section: 'Current Liabilities', line_item: 'Expense Payable', amount: expensePayableAmount, row_type: 'detail' },
      { section: 'Current Liabilities', line_item: 'Payroll Payable', amount: payrollPayableAmount, row_type: 'detail' },
      {
        section: 'Current Liabilities',
        line_item: 'Total Current Liabilities',
        amount: totalCurrentLiabilities,
        row_type: 'total',
      },
      { section: 'Non-Current Liabilities', line_item: 'Long-Term Liabilities', amount: 0, row_type: 'detail' },
      {
        section: 'Non-Current Liabilities',
        line_item: 'Total Non-Current Liabilities',
        amount: totalNonCurrentLiabilities,
        row_type: 'total',
      },
      { section: 'Equity', line_item: 'Opening / Owner Equity', amount: openingEquity, row_type: 'detail' },
      { section: 'Equity', line_item: netResultLabel, amount: netProfitToDate, row_type: 'detail' },
      { section: 'Equity', line_item: 'Total Equity', amount: totalEquity, row_type: 'total' },
      { section: 'Summary', line_item: 'Total Assets', amount: totalAssets, row_type: 'total' },
      { section: 'Summary', line_item: 'Total Liabilities', amount: totalLiabilities, row_type: 'total' },
      { section: 'Summary', line_item: 'Total Liabilities + Equity', amount: totalLiabilitiesEquity, row_type: 'total' },
      { section: 'Summary', line_item: 'Balance Difference', amount: balanceDifference, row_type: 'detail' },
    ];
  },

  async getAccountsReceivable(branchId: number, fromDate: string, toDate: string): Promise<AccountsReceivableRow[]> {
    return queryMany<AccountsReceivableRow>(
      `WITH sales_scope AS (
         SELECT
           s.sale_id::bigint AS invoice_no,
           COALESCE(c.full_name, 'Walk-in') AS customer_name,
           s.sale_date::date AS invoice_date,
           COALESCE(NULLIF(to_jsonb(s) ->> 'due_date', '')::date, s.sale_date::date) AS due_date,
           COALESCE(s.total, 0)::double precision AS amount
         FROM ims.sales s
         LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
         WHERE s.branch_id = $1
           AND s.sale_date::date BETWEEN $2::date AND $3::date
           AND LOWER(COALESCE(s.status::text, '')) <> 'void'
           AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
       ),
       sale_payments AS (
         SELECT
           sp.sale_id::bigint AS invoice_no,
           COALESCE(SUM(sp.amount_paid), 0)::double precision AS paid
         FROM ims.sale_payments sp
         WHERE sp.branch_id = $1
         GROUP BY sp.sale_id
       ),
       receipt_payments AS (
         SELECT
           cr.sale_id::bigint AS invoice_no,
           COALESCE(SUM(cr.amount), 0)::double precision AS paid
         FROM ims.customer_receipts cr
         WHERE cr.branch_id = $1
           AND cr.sale_id IS NOT NULL
         GROUP BY cr.sale_id
       )
       SELECT
         ss.customer_name,
         ss.invoice_no,
         ss.invoice_date::text AS invoice_date,
         ss.due_date::text AS due_date,
         ss.amount,
         LEAST(ss.amount, COALESCE(sp.paid, 0) + COALESCE(rp.paid, 0))::double precision AS paid,
         GREATEST(ss.amount - (COALESCE(sp.paid, 0) + COALESCE(rp.paid, 0)), 0)::double precision AS balance,
         CASE
           WHEN GREATEST(ss.amount - (COALESCE(sp.paid, 0) + COALESCE(rp.paid, 0)), 0) <= 0.009 THEN 'Paid'
           WHEN ss.due_date < CURRENT_DATE THEN 'Overdue'
           ELSE 'Open'
         END AS status
       FROM sales_scope ss
       LEFT JOIN sale_payments sp ON sp.invoice_no = ss.invoice_no
       LEFT JOIN receipt_payments rp ON rp.invoice_no = ss.invoice_no
       ORDER BY ss.invoice_date DESC, ss.invoice_no DESC
       LIMIT 5000`,
      [branchId, fromDate, toDate]
    );
  },

  async getAccountsPayable(branchId: number, fromDate: string, toDate: string): Promise<AccountsPayableRow[]> {
    return queryMany<AccountsPayableRow>(
      `WITH purchases_scope AS (
         SELECT
           p.purchase_id::bigint AS bill_no,
           COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
           p.purchase_date::date AS bill_date,
           COALESCE(NULLIF(to_jsonb(p) ->> 'due_date', '')::date, p.purchase_date::date) AS due_date,
           COALESCE(p.total, 0)::double precision AS amount
         FROM ims.purchases p
         LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
         WHERE p.branch_id = $1
           AND p.purchase_date::date BETWEEN $2::date AND $3::date
           AND LOWER(COALESCE(p.status::text, '')) <> 'void'
       ),
       purchase_payments AS (
         SELECT
           sp.purchase_id::bigint AS bill_no,
           COALESCE(SUM(sp.amount_paid), 0)::double precision AS paid
         FROM ims.supplier_payments sp
         WHERE sp.branch_id = $1
         GROUP BY sp.purchase_id
       ),
       receipt_payments AS (
         SELECT
           sr.purchase_id::bigint AS bill_no,
           COALESCE(SUM(sr.amount), 0)::double precision AS paid
         FROM ims.supplier_receipts sr
         WHERE sr.branch_id = $1
           AND sr.purchase_id IS NOT NULL
         GROUP BY sr.purchase_id
       )
       SELECT
         ps.supplier_name,
         ps.bill_no,
         ps.bill_date::text AS bill_date,
         ps.due_date::text AS due_date,
         ps.amount,
         LEAST(ps.amount, COALESCE(pp.paid, 0) + COALESCE(rp.paid, 0))::double precision AS paid,
         GREATEST(ps.amount - (COALESCE(pp.paid, 0) + COALESCE(rp.paid, 0)), 0)::double precision AS balance,
         CASE
           WHEN GREATEST(ps.amount - (COALESCE(pp.paid, 0) + COALESCE(rp.paid, 0)), 0) <= 0.009 THEN 'Settled'
           WHEN ps.due_date < CURRENT_DATE THEN 'Overdue'
           ELSE 'Open'
         END AS status
       FROM purchases_scope ps
       LEFT JOIN purchase_payments pp ON pp.bill_no = ps.bill_no
       LEFT JOIN receipt_payments rp ON rp.bill_no = ps.bill_no
       ORDER BY ps.bill_date DESC, ps.bill_no DESC
       LIMIT 5000`,
      [branchId, fromDate, toDate]
    );
  },

  async getCashFlowStatement(branchId: number, fromDate: string, toDate: string): Promise<CashFlowRow[]> {
    try {
      const procedureRows = await queryMany<CashFlowRow>(
        `SELECT
           section,
           line_item,
           COALESCE(amount, 0)::double precision AS amount,
           row_type::text AS row_type
         FROM ims.rpt_cash_flow_lines($1, $2::date, $3::date)`,
        [branchId, fromDate, toDate]
      );
      if (procedureRows.length > 0) {
        return procedureRows;
      }
    } catch (error) {
      if (!isMissingBalanceSheetProcedureError(error)) {
        throw error;
      }
    }

    const params: Array<number | string> = [branchId, fromDate, toDate];
    const [
      customerReceipts,
      salePayments,
      supplierRefunds,
      loanRepayments,
      supplierPayments,
      expensePayments,
      payrollPayments,
      employeeLoanDisbursements,
    ] = await Promise.all([
      queryAmount(
        `SELECT COALESCE(SUM(cr.amount), 0)::double precision AS amount
           FROM ims.customer_receipts cr
          WHERE cr.branch_id = $1
            AND cr.receipt_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(sp.amount_paid), 0)::double precision AS amount
           FROM ims.sale_payments sp
          WHERE sp.branch_id = $1
            AND sp.pay_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(sr.amount), 0)::double precision AS amount
           FROM ims.supplier_receipts sr
          WHERE sr.branch_id = $1
            AND sr.receipt_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(lp.amount_paid), 0)::double precision AS amount
           FROM ims.loan_payments lp
          WHERE lp.branch_id = $1
            AND lp.pay_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(sp.amount_paid), 0)::double precision AS amount
           FROM ims.supplier_payments sp
           JOIN ims.purchases p ON p.purchase_id = sp.purchase_id
          WHERE sp.branch_id = $1
            AND sp.pay_date::date BETWEEN $2::date AND $3::date
            AND LOWER(COALESCE(p.status::text, '')) <> 'void'`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
           FROM ims.expense_payments ep
          WHERE ep.branch_id = $1
            AND ep.pay_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
           FROM ims.employee_payments ep
          WHERE ep.branch_id = $1
            AND ep.pay_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(el.amount), 0)::double precision AS amount
           FROM ims.employee_loans el
          WHERE el.branch_id = $1
            AND el.loan_date BETWEEN $2::date AND $3::date`,
        params
      ),
    ]);

    const salesCollections = customerReceipts + salePayments;
    const netOperations = salesCollections - supplierPayments - expensePayments - payrollPayments;
    const netInvesting = supplierRefunds - employeeLoanDisbursements;
    const netFinancing = loanRepayments;
    const netIncreaseInCash = netOperations + netInvesting + netFinancing;

    return [
      {
        section: 'Cash Flow from Operations',
        line_item: 'Cash receipts from customers',
        amount: salesCollections,
        row_type: 'detail',
      },
      {
        section: 'Cash Flow from Operations',
        line_item: 'Cash paid for inventory',
        amount: -supplierPayments,
        row_type: 'detail',
      },
      {
        section: 'Cash Flow from Operations',
        line_item: 'Cash paid for operating expenses',
        amount: -expensePayments,
        row_type: 'detail',
      },
      {
        section: 'Cash Flow from Operations',
        line_item: 'Cash paid for wages',
        amount: -payrollPayments,
        row_type: 'detail',
      },
      {
        section: 'Cash Flow from Operations',
        line_item: 'Net Cash Flow from Operations',
        amount: netOperations,
        row_type: 'total',
      },
      {
        section: 'Cash Flow from Investing',
        line_item: 'Cash receipts from supplier refunds',
        amount: supplierRefunds,
        row_type: 'detail',
      },
      {
        section: 'Cash Flow from Investing',
        line_item: 'Cash paid for employee loans',
        amount: -employeeLoanDisbursements,
        row_type: 'detail',
      },
      {
        section: 'Cash Flow from Investing',
        line_item: 'Net Cash Flow from Investing',
        amount: netInvesting,
        row_type: 'total',
      },
      {
        section: 'Cash Flow from Financing',
        line_item: 'Loan repayments received',
        amount: loanRepayments,
        row_type: 'detail',
      },
      {
        section: 'Cash Flow from Financing',
        line_item: 'Net Cash Flow from Financing',
        amount: netFinancing,
        row_type: 'total',
      },
      { section: 'Summary', line_item: 'Net Increase in Cash', amount: netIncreaseInCash, row_type: 'total' },
    ];
  },

  async getAccountStatement(
    branchId: number,
    fromDate: string,
    toDate: string,
    accountId?: number
  ): Promise<AccountStatementRow[]> {
    const params: Array<number | string | null> = [branchId, fromDate, toDate, accountId ?? null];

    try {
      const procedureRows = await queryMany<AccountStatementRow>(
        `SELECT
           txn_id,
           txn_date::text AS txn_date,
           account_id,
           account_name,
           txn_type::text AS txn_type,
           COALESCE(ref_table, '') AS ref_table,
           ref_id,
           COALESCE(debit, 0)::double precision AS debit,
           COALESCE(credit, 0)::double precision AS credit,
           COALESCE(running_balance, 0)::double precision AS running_balance,
           COALESCE(note, '') AS note
         FROM ims.rpt_account_statement($1, $2::date, $3::date, $4::bigint)`,
        params
      );
      return procedureRows;
    } catch (error) {
      if (!isMissingBalanceSheetProcedureError(error)) {
        throw error;
      }
    }

    const accountFilter = accountId ? 'AND at.acc_id = $4' : '';

    return queryMany<AccountStatementRow>(
      `WITH filtered AS (
         SELECT
           at.txn_id,
           at.txn_date,
           at.acc_id AS account_id,
           COALESCE(a.name, 'N/A') AS account_name,
           at.txn_type::text AS txn_type,
           COALESCE(at.ref_table, '') AS ref_table,
           at.ref_id,
           COALESCE(at.debit, 0)::double precision AS debit,
           COALESCE(at.credit, 0)::double precision AS credit,
           COALESCE(at.note, '') AS note
         FROM ims.account_transactions at
         LEFT JOIN ims.accounts a ON a.acc_id = at.acc_id
         WHERE at.branch_id = $1
           AND at.txn_date::date BETWEEN $2::date AND $3::date
           ${accountFilter}
      ),
      running AS (
        SELECT
          f.*,
          SUM(f.credit - f.debit)
            OVER (PARTITION BY f.account_id ORDER BY f.txn_date, f.txn_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            ::double precision AS running_balance
        FROM filtered f
      )
      SELECT
        txn_id,
        txn_date::text AS txn_date,
        account_id,
        account_name,
        txn_type,
        ref_table,
        ref_id,
        debit,
        credit,
        running_balance,
        note
      FROM running
      ORDER BY txn_date ASC, txn_id ASC
      LIMIT 5000`,
      params
    );
  },

  async getTrialBalance(branchId: number, fromDate: string, toDate: string): Promise<TrialBalanceRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];

    try {
      const procedureRows = await queryMany<TrialBalanceRow>(
        `SELECT
           account_id,
           account_name,
           COALESCE(opening_debit, 0)::double precision AS opening_debit,
           COALESCE(opening_credit, 0)::double precision AS opening_credit,
           COALESCE(period_debit, 0)::double precision AS period_debit,
           COALESCE(period_credit, 0)::double precision AS period_credit,
           COALESCE(closing_debit, 0)::double precision AS closing_debit,
           COALESCE(closing_credit, 0)::double precision AS closing_credit
         FROM ims.rpt_trial_balance($1, $2::date, $3::date)`,
        params
      );
      return procedureRows;
    } catch (error) {
      if (!isMissingBalanceSheetProcedureError(error)) {
        throw error;
      }
    }

    return queryMany<TrialBalanceRow>(
      `WITH acc AS (
         SELECT a.acc_id, a.name
         FROM ims.accounts a
         WHERE a.branch_id = $1
           AND a.is_active = TRUE
      ),
      opening AS (
        SELECT
          at.acc_id,
          COALESCE(SUM(at.credit - at.debit), 0)::double precision AS opening_net
        FROM ims.account_transactions at
        WHERE at.branch_id = $1
          AND at.txn_date::date < $2::date
        GROUP BY at.acc_id
      ),
      period AS (
        SELECT
          at.acc_id,
          COALESCE(SUM(at.debit), 0)::double precision AS period_debit,
          COALESCE(SUM(at.credit), 0)::double precision AS period_credit
        FROM ims.account_transactions at
        WHERE at.branch_id = $1
          AND at.txn_date::date BETWEEN $2::date AND $3::date
        GROUP BY at.acc_id
      ),
      merged AS (
        SELECT
          acc.acc_id AS account_id,
          acc.name AS account_name,
          COALESCE(opening.opening_net, 0)::double precision AS opening_net,
          COALESCE(period.period_debit, 0)::double precision AS period_debit,
          COALESCE(period.period_credit, 0)::double precision AS period_credit
        FROM acc
        LEFT JOIN opening ON opening.acc_id = acc.acc_id
        LEFT JOIN period ON period.acc_id = acc.acc_id
      ),
      calc AS (
        SELECT
          account_id,
          account_name,
          CASE WHEN opening_net < 0 THEN ABS(opening_net) ELSE 0 END::double precision AS opening_debit,
          CASE WHEN opening_net > 0 THEN opening_net ELSE 0 END::double precision AS opening_credit,
          period_debit,
          period_credit,
          (opening_net + period_credit - period_debit)::double precision AS closing_net
        FROM merged
      )
      SELECT
        account_id,
        account_name,
        opening_debit,
        opening_credit,
        period_debit,
        period_credit,
        CASE WHEN closing_net < 0 THEN ABS(closing_net) ELSE 0 END::double precision AS closing_debit,
        CASE WHEN closing_net > 0 THEN closing_net ELSE 0 END::double precision AS closing_credit
      FROM calc
      WHERE opening_debit <> 0
         OR opening_credit <> 0
         OR period_debit <> 0
         OR period_credit <> 0
         OR closing_net <> 0
      ORDER BY account_name`,
      params
    );
  },

  async getAccountBalances(branchId: number, accountId?: number): Promise<AccountBalanceRow[]> {
    const params: number[] = [branchId];
    let filter = '';
    if (accountId) {
      params.push(accountId);
      filter = ` AND a.acc_id = $${params.length}`;
    }

    return queryMany<AccountBalanceRow>(
      `SELECT
         a.acc_id AS account_id,
         a.name AS account_name,
         COALESCE(a.institution, '') AS institution,
         COALESCE(a.balance, 0)::double precision AS current_balance,
         MAX(at.txn_date)::text AS last_transaction_date
       FROM ims.accounts a
       LEFT JOIN ims.account_transactions at
              ON at.acc_id = a.acc_id
             AND at.branch_id = a.branch_id
      WHERE a.branch_id = $1
        AND a.is_active = TRUE
        ${filter}
      GROUP BY a.acc_id, a.name, a.institution, a.balance
      ORDER BY a.name`,
      params
    );
  },

  async getExpenseSummary(branchId: number, fromDate: string, toDate: string): Promise<ExpenseSummaryRow[]> {
    return queryMany<ExpenseSummaryRow>(
      `WITH charge_scope AS (
         SELECT
           ec.exp_id,
           COUNT(*)::int AS charges_count,
           COALESCE(SUM(ec.amount), 0)::double precision AS total_charged,
           MAX(ec.charge_date)::text AS last_charge_date
         FROM ims.expense_charges ec
        WHERE ec.branch_id = $1
          AND ec.charge_date::date BETWEEN $2::date AND $3::date
        GROUP BY ec.exp_id
       ),
       payment_scope AS (
         SELECT
           ec.exp_id,
           COALESCE(SUM(ep.amount_paid), 0)::double precision AS total_paid
         FROM ims.expense_payments ep
         JOIN ims.expense_charges ec ON ec.charge_id = ep.exp_ch_id
        WHERE ep.branch_id = $1
          AND ep.pay_date::date BETWEEN $2::date AND $3::date
        GROUP BY ec.exp_id
       )
       SELECT
         e.exp_id,
         e.name AS expense_name,
         COALESCE(cs.charges_count, 0) AS charges_count,
         COALESCE(cs.total_charged, 0)::double precision AS total_charged,
         COALESCE(ps.total_paid, 0)::double precision AS total_paid,
         (COALESCE(cs.total_charged, 0) - COALESCE(ps.total_paid, 0))::double precision AS outstanding_amount,
         cs.last_charge_date
       FROM ims.expenses e
       LEFT JOIN charge_scope cs ON cs.exp_id = e.exp_id
       LEFT JOIN payment_scope ps ON ps.exp_id = e.exp_id
      WHERE e.branch_id = $1
      ORDER BY total_charged DESC, e.name`,
      [branchId, fromDate, toDate]
    );
  },

  async getCustomerReceipts(
    branchId: number,
    fromDate: string,
    toDate: string,
    customerId?: number
  ): Promise<CustomerReceiptRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let customerFilterReceipts = '';
    let customerFilterSalePayments = '';
    if (customerId) {
      params.push(customerId);
      customerFilterReceipts = `AND r.customer_id = $${params.length}`;
      customerFilterSalePayments = `AND s.customer_id = $${params.length}`;
    }

    return queryMany<CustomerReceiptRow>(
      `WITH unified_receipts AS (
         SELECT
           r.receipt_id::bigint AS receipt_id,
           r.receipt_date::text AS receipt_date,
           r.customer_id,
           COALESCE(c.full_name, 'Walk-in') AS customer_name,
           r.sale_id,
           COALESCE(a.name, 'N/A') AS account_name,
           COALESCE(r.amount, 0)::double precision AS amount,
           COALESCE(r.payment_method, '') AS payment_method,
           COALESCE(r.reference_no, '') AS reference_no,
           COALESCE(r.note, '') AS note
         FROM ims.customer_receipts r
         LEFT JOIN ims.customers c ON c.customer_id = r.customer_id
         LEFT JOIN ims.accounts a ON a.acc_id = r.acc_id
        WHERE r.branch_id = $1
          AND r.receipt_date::date BETWEEN $2::date AND $3::date
         ${customerFilterReceipts}

        UNION ALL

         SELECT
           sp.sale_payment_id::bigint AS receipt_id,
           sp.pay_date::text AS receipt_date,
           s.customer_id,
           COALESCE(c.full_name, 'Walk-in') AS customer_name,
           sp.sale_id,
           COALESCE(a.name, 'N/A') AS account_name,
           COALESCE(sp.amount_paid, 0)::double precision AS amount,
           COALESCE(s.sale_type::text, 'cash') AS payment_method,
           COALESCE(sp.reference_no, '') AS reference_no,
           CASE
             WHEN COALESCE(sp.note, '') = '' THEN '[Sales Payment]'
             ELSE '[Sales Payment] ' || sp.note
           END AS note
         FROM ims.sale_payments sp
         JOIN ims.sales s ON s.sale_id = sp.sale_id
         LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
         LEFT JOIN ims.accounts a ON a.acc_id = sp.acc_id
        WHERE sp.branch_id = $1
          AND sp.pay_date::date BETWEEN $2::date AND $3::date
          AND LOWER(COALESCE(s.status::text, '')) <> 'void'
          ${customerFilterSalePayments}
      )
      SELECT
        receipt_id,
        receipt_date,
        customer_id,
        customer_name,
        sale_id,
        account_name,
        amount,
        payment_method,
        reference_no,
        note
      FROM unified_receipts
      ORDER BY receipt_date DESC, receipt_id DESC
      LIMIT 4000`,
      params
    );
  },

  async getSupplierPayments(
    branchId: number,
    fromDate: string,
    toDate: string,
    supplierId?: number
  ): Promise<SupplierPaymentRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';
    if (supplierId) {
      params.push(supplierId);
      filter = `AND p.supplier_id = $${params.length}`;
    }

    return queryMany<SupplierPaymentRow>(
      `SELECT
         sp.sup_payment_id,
         sp.pay_date::text AS pay_date,
         sp.purchase_id,
         p.supplier_id,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COALESCE(a.name, 'N/A') AS account_name,
         COALESCE(sp.amount_paid, 0)::double precision AS amount_paid,
         COALESCE(sp.reference_no, '') AS reference_no,
         COALESCE(sp.note, '') AS note
       FROM ims.supplier_payments sp
       JOIN ims.purchases p ON p.purchase_id = sp.purchase_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
       LEFT JOIN ims.accounts a ON a.acc_id = sp.acc_id
      WHERE sp.branch_id = $1
        AND sp.pay_date::date BETWEEN $2::date AND $3::date
        ${filter}
      ORDER BY sp.pay_date DESC, sp.sup_payment_id DESC
      LIMIT 2000`,
      params
    );
  },

  async getAccountTransactions(
    branchId: number,
    fromDate: string,
    toDate: string,
    accountId?: number
  ): Promise<AccountTransactionRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';
    if (accountId) {
      params.push(accountId);
      filter = `AND at.acc_id = $${params.length}`;
    }

    return queryMany<AccountTransactionRow>(
      `SELECT
         at.txn_id,
         at.txn_date::text AS txn_date,
         at.acc_id AS account_id,
         COALESCE(a.name, 'N/A') AS account_name,
         at.txn_type::text AS txn_type,
         COALESCE(at.ref_table, '') AS ref_table,
         at.ref_id,
         COALESCE(at.debit, 0)::double precision AS debit,
         COALESCE(at.credit, 0)::double precision AS credit,
         (COALESCE(at.credit, 0) - COALESCE(at.debit, 0))::double precision AS net_effect,
         COALESCE(at.note, '') AS note
       FROM ims.account_transactions at
       LEFT JOIN ims.accounts a ON a.acc_id = at.acc_id
      WHERE at.branch_id = $1
        AND at.txn_date::date BETWEEN $2::date AND $3::date
        ${filter}
      ORDER BY at.txn_date DESC, at.txn_id DESC
      LIMIT 3000`,
      params
    );
  },
};
