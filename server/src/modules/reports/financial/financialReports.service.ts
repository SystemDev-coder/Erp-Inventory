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
      stockPurchases,
      purchaseReturns,
      movementCostSales,
      movementCostSalesReturns,
      operatingExpensesCharged,
      operatingExpensesPaid,
      payrollExpenseAccrued,
      payrollExpensePaid,
      otherIncome,
      supplierRefunds,
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
        `SELECT COALESCE(SUM(ec.amount), 0)::double precision AS amount
           FROM ims.expense_charges ec
          WHERE ec.branch_id = $1
            AND ec.charge_date::date BETWEEN $2::date AND $3::date`,
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
        `SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
           FROM ims.employee_payments ep
          WHERE ep.branch_id = $1
            AND ep.pay_date::date BETWEEN $2::date AND $3::date`,
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
      queryAmount(
        `SELECT COALESCE(SUM(sr.amount), 0)::double precision AS amount
           FROM ims.supplier_receipts sr
          WHERE sr.branch_id = $1
            AND sr.receipt_date::date BETWEEN $2::date AND $3::date`,
        params
      ),
    ]);

    const netSales = grossSales - salesReturns;
    const purchaseIncome = purchaseReturns + supplierRefunds;
    const netPurchases = Math.max(stockPurchases - purchaseReturns, 0);
    const movementCost = Math.max(movementCostSales - movementCostSalesReturns, 0);
    const costOfSales = movementCost > 0 ? movementCost : netPurchases;
    const operatingExpenses = operatingExpensesCharged > 0 ? operatingExpensesCharged : operatingExpensesPaid;
    const payrollExpense = payrollExpenseAccrued > 0 ? payrollExpenseAccrued : payrollExpensePaid;
    const totalIncome = netSales + purchaseIncome + otherIncome;
    const totalExpenses = costOfSales + operatingExpenses + payrollExpense;
    const netIncome = totalIncome - totalExpenses;
    const netIncomeLabel = netIncome >= 0 ? 'Net Profit' : 'Net Loss';

    return [
      { section: 'Revenue', line_item: 'Gross Sales', amount: grossSales, row_type: 'detail' },
      { section: 'Revenue', line_item: 'Sales Returns', amount: -salesReturns, row_type: 'detail' },
      { section: 'Revenue', line_item: 'Purchase Income', amount: purchaseIncome, row_type: 'detail' },
      { section: 'Revenue', line_item: 'Other Income', amount: otherIncome, row_type: 'detail' },
      { section: 'Revenue', line_item: 'Total Income', amount: totalIncome, row_type: 'total' },
      { section: 'Cost of Sales', line_item: 'Cost of Goods Sold', amount: -costOfSales, row_type: 'detail' },
      { section: 'Expenses', line_item: 'Operating Expenses', amount: -operatingExpenses, row_type: 'detail' },
      { section: 'Expenses', line_item: 'Payroll Expense', amount: -payrollExpense, row_type: 'detail' },
      { section: 'Expenses', line_item: 'Total Expenses', amount: -totalExpenses, row_type: 'total' },
      { section: 'Profit', line_item: netIncomeLabel, amount: netIncome, row_type: 'total' },
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
             COALESCE(SUM(at.credit - at.debit), 0)::double precision AS txn_balance
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
        `WITH customer_ledger AS (
           SELECT
             l.customer_id,
             COALESCE(SUM(l.debit - l.credit), 0)::double precision AS balance
           FROM ims.customer_ledger l
          WHERE l.branch_id = $1
            AND l.entry_date::date <= $2::date
          GROUP BY l.customer_id
         )
         SELECT COALESCE(SUM(GREATEST(cl.balance, 0)), 0)::double precision AS amount
           FROM customer_ledger cl`,
        params
      ),
      queryAmount(
        `WITH customer_ledger AS (
           SELECT
             l.customer_id,
             COALESCE(SUM(l.debit - l.credit), 0)::double precision AS balance
           FROM ims.customer_ledger l
          WHERE l.branch_id = $1
            AND l.entry_date::date <= $2::date
          GROUP BY l.customer_id
         )
         SELECT COALESCE(SUM(GREATEST(-cl.balance, 0)), 0)::double precision AS amount
           FROM customer_ledger cl`,
        params
      ),
      queryAmount(
        `SELECT COALESCE(SUM(si.quantity * COALESCE(i.cost_price, 0)), 0)::double precision AS amount
           FROM ims.store_items si
           JOIN ims.stores st ON st.store_id = si.store_id
           JOIN ims.items i ON i.item_id = si.product_id
          WHERE st.branch_id = $1`,
        [branchId]
      ),
      queryAmount(
        `WITH supplier_ledger AS (
           SELECT
             l.supplier_id,
             COALESCE(SUM(l.credit - l.debit), 0)::double precision AS balance
           FROM ims.supplier_ledger l
          WHERE l.branch_id = $1
            AND l.entry_date::date <= $2::date
          GROUP BY l.supplier_id
         )
         SELECT COALESCE(SUM(GREATEST(sl.balance, 0)), 0)::double precision AS amount
           FROM supplier_ledger sl`,
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

    const fallbackCustomerReceivable = await queryAmount(
      `SELECT COALESCE(SUM(c.${customerBalanceColumn}), 0)::double precision AS amount
         FROM ims.customers c
        WHERE c.branch_id = $1
          AND c.is_active = TRUE`,
      [branchId]
    );
    const fallbackSupplierPayable = await queryAmount(
      `SELECT COALESCE(SUM(s.${supplierBalanceColumn}), 0)::double precision AS amount
         FROM ims.suppliers s
        WHERE s.branch_id = $1
          AND s.is_active = TRUE`,
      [branchId]
    );

    const accountsReceivable = receivableAmount > 0 ? receivableAmount : Math.max(fallbackCustomerReceivable, 0);
    const accountsPayable = supplierPayableAmount > 0 ? supplierPayableAmount : Math.max(fallbackSupplierPayable, 0);

    const netPurchasesToDate = Math.max(purchasesToDate - purchaseReturnsToDate, 0);
    const costOfSalesToDate = cogsByMovementToDate > 0 ? cogsByMovementToDate : netPurchasesToDate;
    const netProfitToDate =
      netSalesToDate + otherIncomeToDate + supplierRefundsToDate - costOfSalesToDate - operatingExpensesToDate - payrollExpenseToDate;
    const netResultLabel = netProfitToDate >= 0 ? 'Net Profit' : 'Net Loss';

    const totalAssets = cashAmount + accountsReceivable + inventoryAmount + employeeLoanReceivableAmount;
    const totalLiabilities = accountsPayable + customerAdvanceAmount + expensePayableAmount + payrollPayableAmount;
    const openingEquity = totalAssets - totalLiabilities - netProfitToDate;
    const totalEquity = openingEquity + netProfitToDate;
    const totalLiabilitiesEquity = totalLiabilities + totalEquity;

    const suffix = `As of ${asOfDate}`;

    return [
      { section: `Assets (${suffix})`, line_item: 'Cash & Bank Accounts', amount: cashAmount, row_type: 'detail' },
      { section: `Assets (${suffix})`, line_item: 'Accounts Receivable', amount: accountsReceivable, row_type: 'detail' },
      { section: `Assets (${suffix})`, line_item: 'Inventory Value', amount: inventoryAmount, row_type: 'detail' },
      {
        section: `Assets (${suffix})`,
        line_item: 'Employee Loan Receivable',
        amount: employeeLoanReceivableAmount,
        row_type: 'detail',
      },
      { section: `Assets (${suffix})`, line_item: 'Total Assets', amount: totalAssets, row_type: 'total' },
      { section: `Liabilities (${suffix})`, line_item: 'Accounts Payable', amount: accountsPayable, row_type: 'detail' },
      {
        section: `Liabilities (${suffix})`,
        line_item: 'Customer Advances',
        amount: customerAdvanceAmount,
        row_type: 'detail',
      },
      { section: `Liabilities (${suffix})`, line_item: 'Expense Payable', amount: expensePayableAmount, row_type: 'detail' },
      { section: `Liabilities (${suffix})`, line_item: 'Payroll Payable', amount: payrollPayableAmount, row_type: 'detail' },
      { section: `Liabilities (${suffix})`, line_item: 'Total Liabilities', amount: totalLiabilities, row_type: 'total' },
      { section: `Equity (${suffix})`, line_item: 'Opening / Owner Equity', amount: openingEquity, row_type: 'detail' },
      { section: `Equity (${suffix})`, line_item: netResultLabel, amount: netProfitToDate, row_type: 'detail' },
      { section: `Equity (${suffix})`, line_item: 'Total Equity', amount: totalEquity, row_type: 'total' },
      {
        section: `Liabilities + Equity (${suffix})`,
        line_item: 'Total Liabilities + Equity',
        amount: totalLiabilitiesEquity,
        row_type: 'total',
      },
    ];
  },

  async getCashFlowStatement(branchId: number, fromDate: string, toDate: string): Promise<CashFlowRow[]> {
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
    const totalInflows = salesCollections + supplierRefunds + loanRepayments;
    const totalOutflows = supplierPayments + expensePayments + payrollPayments + employeeLoanDisbursements;
    const netCashFlow = totalInflows - totalOutflows;

    return [
      {
        section: 'Operating Activities',
        line_item: 'Cash Collected From Customers',
        amount: salesCollections,
        row_type: 'detail',
      },
      {
        section: 'Operating Activities',
        line_item: 'Supplier Refunds Received',
        amount: supplierRefunds,
        row_type: 'detail',
      },
      {
        section: 'Operating Activities',
        line_item: 'Cash Paid To Suppliers',
        amount: -supplierPayments,
        row_type: 'detail',
      },
      {
        section: 'Operating Activities',
        line_item: 'Cash Paid For Expenses',
        amount: -expensePayments,
        row_type: 'detail',
      },
      {
        section: 'Operating Activities',
        line_item: 'Cash Paid For Payroll',
        amount: -payrollPayments,
        row_type: 'detail',
      },
      {
        section: 'Financing Activities',
        line_item: 'Employee Loan Disbursements',
        amount: -employeeLoanDisbursements,
        row_type: 'detail',
      },
      {
        section: 'Financing Activities',
        line_item: 'Employee Loan Repayments',
        amount: loanRepayments,
        row_type: 'detail',
      },
      { section: 'Summary', line_item: 'Net Cash Flow', amount: netCashFlow, row_type: 'total' },
    ];
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
