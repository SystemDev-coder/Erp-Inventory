import { queryMany, queryOne } from '../../../db/query';

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
  account_type?: string;
  current_balance: number;
  debit_balance?: number;
  credit_balance?: number;
  last_transaction_date: string | null;
}

export interface ProfitByItemRow {
  item_id: number;
  item_name: string;
  quantity_sold: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  margin_pct: number;
}

export interface ProfitByCustomerRow {
  customer_id: number;
  customer_name: string;
  quantity_sold: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  margin_pct: number;
}

export interface ProfitByStoreRow {
  store_id: number;
  store_name: string;
  quantity_sold: number;
  sales_amount: number;
  cost_amount: number;
  gross_profit: number;
  margin_pct: number;
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
  txn_number?: string;
  party_name?: string;
  memo?: string;
  split_account?: string;
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
const OPENING_EXPENSE_NOTE_PREFIX = '[OPENING BALANCE]';
const openingExpensePredicate = (alias: string) =>
  `COALESCE(NULLIF(to_jsonb(${alias}) ->> 'is_opening_paid', '')::boolean, COALESCE(${alias}.note, '') ILIKE '${OPENING_EXPENSE_NOTE_PREFIX}%')`;

const balanceColumnCache: Partial<Record<BalanceTable, BalanceColumn>> = {};
const columnExistsCache: Record<string, boolean> = {};

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

const resolveBalanceExpression = async (
  table: BalanceTable,
  alias: string
): Promise<string> => {
  const cols = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = $1`,
    [table]
  );
  const names = new Set(cols.map((row) => row.column_name));
  const hasRemaining = names.has('remaining_balance');
  const hasOpen = names.has('open_balance');

  if (hasRemaining && hasOpen) {
    // Some deployments maintain balances in `open_balance` while others use `remaining_balance`.
    // Prefer `remaining_balance` when it is populated; otherwise fall back to `open_balance`.
    // (We only apply this heuristic for suppliers, because customer balances are expected to be
    // maintained in a single column in this system.)
    if (table === 'suppliers') {
      return `COALESCE(NULLIF(${alias}.remaining_balance, 0), ${alias}.open_balance, 0)`;
    }
    return `COALESCE(${alias}.remaining_balance, ${alias}.open_balance, 0)`;
  }
  if (hasRemaining) {
    return `COALESCE(${alias}.remaining_balance, 0)`;
  }
  if (hasOpen) {
    return `COALESCE(${alias}.open_balance, 0)`;
  }
  return '0';
};

const resolveColumnExists = async (table: string, column: string): Promise<boolean> => {
  const cacheKey = `${table}.${column}`;
  if (cacheKey in columnExistsCache) return columnExistsCache[cacheKey];
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = $1
          AND column_name = $2
     ) AS exists`,
    [table, column]
  );
  const exists = Boolean(row?.exists);
  columnExistsCache[cacheKey] = exists;
  return exists;
};

const toMoney = (value: unknown) => Number(value || 0);

const queryAmount = async (sql: string, params: Array<string | number>): Promise<number> => {
  const rows = await queryMany<{ amount: number }>(sql, params);
  return toMoney(rows[0]?.amount);
};

const queryAmountIfTableExists = async (
  table: string,
  sql: string,
  params: Array<string | number>
): Promise<number> => {
  const exists = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'ims'
          AND table_name = $1
     ) AS exists`,
    [table]
  );
  if (!exists?.exists) return 0;
  return queryAmount(sql, params);
};

const queryManyIfTableExists = async <T = Record<string, unknown>>(
  table: string,
  sql: string,
  params: Array<string | number>
): Promise<T[]> => {
  const exists = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'ims'
          AND table_name = $1
     ) AS exists`,
    [table]
  );
  if (!exists?.exists) return [];
  const rows = await queryMany(sql, params);
  return rows as T[];
};

const isZeroTrialBalanceRow = (row: TrialBalanceRow, epsilon = 0.005) =>
  Math.abs(Number(row.opening_debit || 0)) <= epsilon
  && Math.abs(Number(row.opening_credit || 0)) <= epsilon
  && Math.abs(Number(row.period_debit || 0)) <= epsilon
  && Math.abs(Number(row.period_credit || 0)) <= epsilon
  && Math.abs(Number(row.closing_debit || 0)) <= epsilon
  && Math.abs(Number(row.closing_credit || 0)) <= epsilon;

const normalizeAccountName = (value: unknown) => String(value || '').trim().toLowerCase();
const moneyAbs = (value: unknown) => Math.abs(Number(value || 0));
const moneyPos = (value: unknown) => Math.max(Number(value || 0), 0);
const isApproxZero = (value: unknown, epsilon = 0.000001) => Math.abs(Number(value || 0)) <= epsilon;

const isInventoryAssetAccountName = (name: string) => {
  const n = normalizeAccountName(name);
  if (!n.includes('inventory')) return false;
  // Avoid misclassifying expense-style inventory accounts (e.g. "Inventory Loss") as stock assets.
  if (n.includes('loss') || n.includes('shrink') || n.includes('damage') || n.includes('write')) return false;
  return true;
};

const isInventoryLossAccountName = (name: string) => {
  const n = normalizeAccountName(name);
  if (!n.includes('inventory')) return false;
  return n.includes('loss') || n.includes('shrink') || n.includes('damage') || n.includes('write');
};

const queryInventoryOnHandValue = async (branchId: number): Promise<number> =>
  queryAmount(
    `WITH legacy_adjustments AS (
       SELECT
         i.branch_id,
         a.item_id,
         COALESCE(SUM(
           CASE
             WHEN UPPER(COALESCE(a.adjustment_type, 'INCREASE')) = 'DECREASE' THEN -COALESCE(a.quantity, 0)
             ELSE COALESCE(a.quantity, 0)
           END
         ), 0)::numeric(14,3) AS qty_delta
       FROM ims.stock_adjustment a
       JOIN ims.items i ON i.item_id = a.item_id
       WHERE i.is_active = TRUE
         AND COALESCE(a.is_deleted, 0)::int = 0
         AND UPPER(COALESCE(a.status, 'POSTED')) = 'POSTED'
         AND NOT EXISTS (
           SELECT 1
             FROM ims.inventory_movements m
            WHERE m.branch_id = i.branch_id
              AND m.ref_table = 'stock_adjustment'
              AND m.ref_id = a.adjustment_id
         )
       GROUP BY i.branch_id, a.item_id
    ),
    item_stock AS (
       SELECT
         i.item_id,
         (
           COALESCE(i.opening_balance, 0)
           + COALESCE(SUM(COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)), 0)
           + COALESCE(la.qty_delta, 0)
         )::numeric(14,3) AS total_qty,
         COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price
       FROM ims.items i
       LEFT JOIN ims.inventory_movements m
         ON m.branch_id = i.branch_id
        AND m.item_id = i.item_id
        AND COALESCE(LOWER(to_jsonb(m) ->> 'is_deleted'), '0') NOT IN ('1', 'true', 't', 'yes')
       LEFT JOIN legacy_adjustments la
         ON la.branch_id = i.branch_id
        AND la.item_id = i.item_id
      WHERE i.branch_id = $1
        AND i.is_active = TRUE
      GROUP BY i.item_id, i.branch_id, i.opening_balance, i.cost_price, la.qty_delta
     )
     SELECT COALESCE(SUM(item_stock.total_qty * item_stock.cost_price), 0)::double precision AS amount
       FROM item_stock`,
    [branchId]
  );

const queryInventoryAssetAccountIds = async (branchId: number): Promise<number[]> => {
  const rows = await queryMany<{ acc_id: number; name: string; account_type: string }>(
    `SELECT
        acc_id,
        COALESCE(NULLIF(BTRIM(name), ''), '') AS name,
        COALESCE(account_type::text, 'asset') AS account_type
     FROM ims.accounts
     WHERE branch_id = $1
       AND is_active = TRUE`,
    [branchId]
  );

  return rows
    .filter((row) => normalizeAccountName(row.account_type) === 'asset' && isInventoryAssetAccountName(row.name))
    .map((row) => Number(row.acc_id));
};

const addDaysIsoDate = (isoDate: string, days: number) => {
  const d = new Date(`${String(isoDate)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const resolveProfitStartDate = async (branchId: number, asOfDate: string) => {
  const yearStart = `${String(asOfDate).slice(0, 4)}-01-01`;
  const rows = await queryManyIfTableExists<{ last_to: string | null }>(
    'finance_closing_periods',
    `SELECT MAX(cp.period_to)::text AS last_to
       FROM ims.finance_closing_periods cp
      WHERE cp.branch_id = $1
        AND cp.status = 'closed'
        AND cp.period_to::date <= $2::date`,
    [branchId, asOfDate]
  );
  const lastTo = rows?.[0]?.last_to ? String(rows[0].last_to) : '';
  if (lastTo && lastTo >= yearStart) return addDaysIsoDate(lastTo, 1);
  return yearStart;
};

const hasAnyClosedClosingPeriod = async (branchId: number, asOfDate: string) => {
  const rows = await queryManyIfTableExists<{ exists: number }>(
    'finance_closing_periods',
    `SELECT 1::int AS exists
       FROM ims.finance_closing_periods cp
      WHERE cp.branch_id = $1
        AND cp.status = 'closed'
        AND cp.period_to::date <= $2::date
      LIMIT 1`,
    [branchId, asOfDate]
  );
  return (rows?.length || 0) > 0;
};

const isCashOrBankAccount = (name: string, institution?: string | null) => {
  const n = normalizeAccountName(name);
  const bankWords = ['cash', 'bank', 'merchant', 'evc', 'dahab', 'salaam', 'premier', 'wallet'];
  if (bankWords.some((word) => n.includes(word))) return true;
  return normalizeAccountName(institution).length > 0;
};

const isReceivableAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return n.includes('receivable') || n.includes('debtor');
};

const isPayableAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return n.includes('payable') || n.includes('creditor') || n.includes('tax payable') || n.includes('unearned');
};

const isAccountsPayableAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return n.includes('accounts payable') || n.includes('account payable');
};

const isAccumulatedDepreciationAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return n.includes('accumulated depreciation') || (n.includes('depreciation') && (n.includes('accumulated') || n.includes('accum.')));
};

const isFixedAssetAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return (
    n.includes('fixed asset')
    || n.includes('property')
    || n.includes('plant')
    || n.includes('building')
    || n.includes('improvement')
    || n.includes('land')
    || n.includes('furniture')
    || n.includes('fixture')
    || n.includes('equipment')
    || n.includes('computer')
    || n.includes('machinery')
    || n.includes('vehicle')
    || isAccumulatedDepreciationAccount(name)
  );
};

const isNonCurrentLiabilityAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return (
    n.includes('long-term')
    || n.includes('long term')
    || n.includes('lease liability')
    || n.includes('lease liabilities')
    || n.includes('bond')
    || n.includes('mortgage')
    || (n.includes('loan') && (n.includes('long') || n.includes('term')))
  );
};

const isInventoryAccount = (name: string) => normalizeAccountName(name).includes('inventory');
const isPrepaidAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return n.includes('prepaid') || n.includes('prepared');
};
const isSuppliesAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return n.includes('supplies') || n.includes('supply') || n.includes('stationery');
};
const isDrawingAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return n.includes('drawing') || n.includes('withdraw');
};
const isEquityLikeAccount = (name: string) => {
  const n = normalizeAccountName(name);
  return n.includes('capital') || n.includes('equity') || n.includes('retained') || n.includes('owner');
};

type BalanceSheetKind = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

const classifyForBalanceSheet = (accountType: string, accountName: string): BalanceSheetKind => {
  const type = normalizeAccountName(accountType);
  const name = normalizeAccountName(accountName);

  // Balance Sheet (name-first) overrides for mis-typed accounts:
  // Liabilities / Equity should never be shown in Assets even if account_type='asset'.
  if (isPayableAccount(accountName) || name.includes('tax payable') || name.includes('unearned') || name.includes('accrued')) return 'liability';
  if (name.includes('loan') || name.includes('bond') || name.includes('lease liability') || name.includes('mortgage')) return 'liability';

  if (isDrawingAccount(accountName)) return 'equity';
  if (isEquityLikeAccount(accountName) || name.includes('opening balance equity') || name.includes('share capital')) return 'equity';

  // Some setups classify "Supplies" as an expense account, but the business wants it on the balance sheet as a current asset.
  if (isSuppliesAccount(accountName) && !name.includes('expense')) return 'asset';

  // P&L accounts should roll into Net Income, not appear on the balance sheet detail.
  if (isInventoryLossAccountName(accountName)) return 'expense';
  if (name.includes('revenue') || name.includes('income') || (name.includes('sales') && !name.includes('tax'))) return 'revenue';
  if (
    name.includes('expense')
    || name.includes('cogs')
    || name.includes('cost of goods')
    || name.includes('cost')
    || name.includes('purchase')
    || name.includes('rent')
    || name.includes('salary')
    || name.includes('wage')
    || name.includes('payroll')
    || name.includes('depreciation')
  ) {
    return 'expense';
  }

  if (
    isCashOrBankAccount(accountName)
    || isReceivableAccount(accountName)
    || isInventoryAccount(accountName)
    || isPrepaidAccount(accountName)
    || isFixedAssetAccount(accountName)
  ) {
    return 'asset';
  }

  // Fallback to stored type.
  if (type === 'liability') return 'liability';
  if (type === 'equity') return 'equity';
  if (type === 'revenue' || type === 'income') return 'revenue';
  if (type === 'expense' || type === 'cost') return 'expense';
  return 'asset';
};

const resolveNaturalSide = (accountType: string, accountName: string): 'debit' | 'credit' => {
  const type = normalizeAccountName(accountType);
  const n = normalizeAccountName(accountName);
  if (isDrawingAccount(accountName)) return 'debit';
  if (isCashOrBankAccount(accountName)) return 'debit';
  if (isReceivableAccount(accountName) || isInventoryAccount(accountName) || isPrepaidAccount(accountName) || isFixedAssetAccount(accountName)) return 'debit';
  if (n.includes('payable') || n.includes('liability') || n.includes('loan')) return 'credit';
  if (n.includes('capital') || n.includes('equity') || n.includes('retained')) return 'credit';
  if (n.includes('revenue') || n.includes('income') || n.includes('sales')) return 'credit';
  if (n.includes('expense') || n.includes('rent') || n.includes('salary') || n.includes('wage') || n.includes('depreciation')) return 'debit';
  if (type === 'asset' || type === 'expense') return 'debit';
  if (type === 'liability' || type === 'equity' || type === 'revenue' || type === 'income') return 'credit';
  return 'debit';
};

// Convert a raw GL balance (debit - credit) into the account's natural balance (shown as positive on the normal side).
const toNaturalBalance = (debitMinusCredit: number, accountType: string, accountName: string) => {
  const side = resolveNaturalSide(accountType, accountName);
  return side === 'credit' ? -Number(debitMinusCredit || 0) : Number(debitMinusCredit || 0);
};

const normalizedAccountTransactionsCte = `
  WITH accounts_norm AS (
    SELECT
      a.branch_id,
      COALESCE(
        NULLIF(to_jsonb(a) ->> 'acc_id', '')::bigint,
        NULLIF(to_jsonb(a) ->> 'account_id', '')::bigint
      ) AS acc_id,
      COALESCE(
        NULLIF(BTRIM(to_jsonb(a) ->> 'name'), ''),
        NULLIF(BTRIM(to_jsonb(a) ->> 'account_name'), ''),
        NULLIF(BTRIM(to_jsonb(a) ->> 'label'), ''),
        ''
      ) AS name,
      COALESCE(NULLIF(BTRIM(to_jsonb(a) ->> 'institution'), ''), '') AS institution,
      COALESCE(NULLIF(BTRIM(to_jsonb(a) ->> 'account_type'), ''), 'asset') AS account_type,
      COALESCE(NULLIF(to_jsonb(a) ->> 'balance', '')::numeric, 0)::double precision AS balance,
      COALESCE(NULLIF(to_jsonb(a) ->> 'is_active', '')::boolean, TRUE) AS is_active
    FROM ims.accounts a
  ),
  payable_accounts AS (
    SELECT
      MAX(CASE WHEN LOWER(COALESCE(a.name, '')) LIKE '%payroll payable%' THEN a.acc_id END) AS payroll_payable_acc_id,
      MAX(
        CASE
          WHEN LOWER(COALESCE(a.name, '')) LIKE '%expense payable%' THEN a.acc_id
          WHEN LOWER(COALESCE(a.name, '')) LIKE '%accounts payable%' THEN a.acc_id
          WHEN LOWER(COALESCE(a.name, '')) LIKE '%account payable%' THEN a.acc_id
        END
      ) AS expense_payable_acc_id,
      MAX(
        CASE
          WHEN LOWER(COALESCE(a.name, '')) LIKE '%accounts receivable%' THEN a.acc_id
          WHEN LOWER(COALESCE(a.name, '')) LIKE '%account receivable%' THEN a.acc_id
          WHEN LOWER(COALESCE(a.name, '')) LIKE '%receivable%' THEN a.acc_id
          WHEN LOWER(COALESCE(a.name, '')) LIKE '%debtor%' THEN a.acc_id
        END
      ) AS receivable_acc_id
    FROM accounts_norm a
    WHERE a.branch_id = $1
      AND a.is_active = TRUE
  ),
  synthetic_expense_charge AS (
    SELECT
      (-2000000000 - ec.charge_id)::bigint AS txn_id,
      ec.branch_id,
      COALESCE(ec.acc_id, pa.expense_payable_acc_id) AS acc_id,
      'other'::text AS txn_type,
      'expense_charges'::text AS ref_table,
      ec.charge_id::bigint AS ref_id,
      0::double precision AS debit,
      COALESCE(ec.amount, 0)::double precision AS credit,
      COALESCE(ec.charge_date, ec.reg_date, NOW()) AS txn_date,
      CASE
        WHEN COALESCE(ec.note, '') = '' THEN '[Expense Charge]'
        ELSE '[Expense Charge] ' || ec.note
      END AS note
    FROM ims.expense_charges ec
    CROSS JOIN payable_accounts pa
    WHERE ec.branch_id = $1
      AND COALESCE(ec.amount, 0) > 0
      AND NOT ${openingExpensePredicate('ec')}
      AND COALESCE(ec.acc_id, pa.expense_payable_acc_id) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
          FROM ims.account_transactions at
         WHERE at.branch_id = ec.branch_id
           AND at.ref_table = 'expense_charges'
           AND at.ref_id = ec.charge_id
           AND COALESCE(at.is_deleted, 0) = 0
      )
  ),
  synthetic_payroll_charge AS (
    SELECT
      (-3000000000 - pl.payroll_line_id)::bigint AS txn_id,
      pl.branch_id,
      pa.payroll_payable_acc_id AS acc_id,
      'other'::text AS txn_type,
      'payroll_lines'::text AS ref_table,
      pl.payroll_line_id::bigint AS ref_id,
      0::double precision AS debit,
      COALESCE(pl.net_salary, 0)::double precision AS credit,
      COALESCE(pr.period_to::timestamptz, NOW()) AS txn_date,
      '[Payroll Charge]'::text AS note
    FROM ims.payroll_lines pl
    JOIN ims.payroll_runs pr
      ON pr.payroll_id = pl.payroll_id
     AND pr.branch_id = pl.branch_id
    CROSS JOIN payable_accounts pa
    WHERE pl.branch_id = $1
      AND COALESCE(pl.net_salary, 0) > 0
      AND pa.payroll_payable_acc_id IS NOT NULL
      AND COALESCE(pr.status::text, 'draft') <> 'void'
      AND NOT EXISTS (
        SELECT 1
          FROM ims.account_transactions at
         WHERE at.branch_id = pl.branch_id
           AND at.ref_table = 'payroll_lines'
           AND at.ref_id = pl.payroll_line_id
           AND COALESCE(at.is_deleted, 0) = 0
      )
  ),
  synthetic_expense AS (
    SELECT
      (-ep.exp_payment_id)::bigint AS txn_id,
      ep.branch_id,
      ep.acc_id,
      'expense_payment'::text AS txn_type,
      'expense_payments'::text AS ref_table,
      ep.exp_payment_id::bigint AS ref_id,
      COALESCE(ep.amount_paid, 0)::double precision AS debit,
      0::double precision AS credit,
      ep.pay_date AS txn_date,
      COALESCE(ep.note, '[Expense Payment]') AS note
    FROM ims.expense_payments ep
    JOIN ims.expense_charges ec ON ec.charge_id = ep.exp_ch_id
    WHERE ep.branch_id = $1
      AND NOT ${openingExpensePredicate('ec')}
      AND NOT EXISTS (
        SELECT 1
          FROM ims.account_transactions at
         WHERE at.branch_id = ep.branch_id
           AND at.txn_type = 'expense_payment'
           AND at.ref_table = 'expense_payments'
           AND at.ref_id = ep.exp_payment_id
           AND COALESCE(at.is_deleted, 0) = 0
      )
  ),
  synthetic_payroll AS (
    SELECT
      (-1000000000 - emp.emp_payment_id)::bigint AS txn_id,
      emp.branch_id,
      emp.acc_id,
      'payroll_payment'::text AS txn_type,
      'employee_payments'::text AS ref_table,
      emp.emp_payment_id::bigint AS ref_id,
      COALESCE(emp.amount_paid, 0)::double precision AS debit,
      0::double precision AS credit,
      emp.pay_date AS txn_date,
      COALESCE(emp.note, '[Payroll Payment]') AS note
    FROM ims.employee_payments emp
    WHERE emp.branch_id = $1
      AND NOT EXISTS (
        SELECT 1
          FROM ims.account_transactions at
         WHERE at.branch_id = emp.branch_id
           AND at.txn_type = 'payroll_payment'
           AND at.ref_table = 'employee_payments'
           AND at.ref_id = emp.emp_payment_id
           AND COALESCE(at.is_deleted, 0) = 0
      )
  ),
  synthetic_sale_payment_debit AS (
    -- Some deployments record payments in ims.sale_payments but never post them to GL.
    -- Synthesize the missing debit to the cash/bank account for financial reports.
    SELECT
      (-4000000000 - (sp.sale_payment_id::bigint * 2))::bigint AS txn_id,
      sp.branch_id,
      sp.acc_id,
      'sale_payment'::text AS txn_type,
      'sales'::text AS ref_table,
      sp.sale_id::bigint AS ref_id,
      COALESCE(sp.amount_paid, 0)::double precision AS debit,
      0::double precision AS credit,
      COALESCE(sp.pay_date, NOW()) AS txn_date,
      COALESCE(NULLIF(sp.note, ''), '[Sale Payment]') AS note
    FROM ims.sale_payments sp
    JOIN ims.sales s
      ON s.sale_id = sp.sale_id
     AND s.branch_id = sp.branch_id
    WHERE sp.branch_id = $1
      AND COALESCE(sp.amount_paid, 0) > 0
      AND LOWER(COALESCE(s.status::text, '')) <> 'void'
      AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
      AND NOT EXISTS (
        SELECT 1
          FROM ims.account_transactions at
       WHERE at.branch_id = sp.branch_id
            AND at.ref_table = 'sales'
            AND at.ref_id = sp.sale_id
            AND COALESCE(at.is_deleted, 0) = 0
            AND COALESCE(
              NULLIF(to_jsonb(at) ->> 'acc_id', '')::bigint,
              NULLIF(to_jsonb(at) ->> 'account_id', '')::bigint
            ) = COALESCE(
              NULLIF(to_jsonb(sp) ->> 'acc_id', '')::bigint,
              NULLIF(to_jsonb(sp) ->> 'account_id', '')::bigint
            )
            AND COALESCE(at.debit, 0) > 0
       )
   ),
  synthetic_sale_payment_credit AS (
    -- Matching credit to Accounts Receivable so AR reflects customer remaining balances correctly.
    SELECT
      (-4000000000 - (sp.sale_payment_id::bigint * 2) - 1)::bigint AS txn_id,
      sp.branch_id,
      pa.receivable_acc_id AS acc_id,
      'sale_payment'::text AS txn_type,
      'sales'::text AS ref_table,
      sp.sale_id::bigint AS ref_id,
      0::double precision AS debit,
      COALESCE(sp.amount_paid, 0)::double precision AS credit,
      COALESCE(sp.pay_date, NOW()) AS txn_date,
      COALESCE(NULLIF(sp.note, ''), '[Sale Payment]') AS note
    FROM ims.sale_payments sp
    JOIN ims.sales s
      ON s.sale_id = sp.sale_id
     AND s.branch_id = sp.branch_id
    CROSS JOIN payable_accounts pa
    WHERE sp.branch_id = $1
      AND COALESCE(sp.amount_paid, 0) > 0
      AND pa.receivable_acc_id IS NOT NULL
      AND LOWER(COALESCE(s.status::text, '')) <> 'void'
      AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
      AND NOT EXISTS (
        SELECT 1
          FROM ims.account_transactions at
         WHERE at.branch_id = sp.branch_id
            AND at.ref_table = 'sales'
            AND at.ref_id = sp.sale_id
            AND COALESCE(at.is_deleted, 0) = 0
            AND COALESCE(
              NULLIF(to_jsonb(at) ->> 'acc_id', '')::bigint,
              NULLIF(to_jsonb(at) ->> 'account_id', '')::bigint
            ) = COALESCE(
              NULLIF(to_jsonb(sp) ->> 'acc_id', '')::bigint,
              NULLIF(to_jsonb(sp) ->> 'account_id', '')::bigint
            )
            AND COALESCE(at.debit, 0) > 0
       )
   ),
   normalized_txn AS (
     SELECT
       at.txn_id::bigint AS txn_id,
       (at.txn_id::bigint * 10 + 0)::bigint AS sort_id,
       at.branch_id,
       COALESCE(
         NULLIF(to_jsonb(at) ->> 'acc_id', '')::bigint,
         NULLIF(to_jsonb(at) ->> 'account_id', '')::bigint
       ) AS acc_id,
       at.txn_type::text AS txn_type,
       COALESCE(at.ref_table, '')::text AS ref_table,
       at.ref_id,
       COALESCE(at.debit, 0)::double precision AS debit,
      COALESCE(at.credit, 0)::double precision AS credit,
      at.txn_date,
      COALESCE(at.note, '') AS note
    FROM ims.account_transactions at
    WHERE at.branch_id = $1
      AND COALESCE(at.is_deleted, 0) = 0
      AND NOT (
        COALESCE(at.ref_table, '') = 'expense_charges'
        AND EXISTS (
          SELECT 1
            FROM ims.expense_charges ec
           WHERE ec.branch_id = at.branch_id
             AND ec.charge_id = at.ref_id
             AND ${openingExpensePredicate('ec')}
        )
      )
      AND NOT (
        COALESCE(at.ref_table, '') = 'expense_payments'
        AND EXISTS (
          SELECT 1
            FROM ims.expense_payments ep
            JOIN ims.expense_charges ec
              ON ec.charge_id = ep.exp_ch_id
           WHERE ep.branch_id = at.branch_id
             AND ep.exp_payment_id = at.ref_id
             AND ${openingExpensePredicate('ec')}
        )
      )
    UNION ALL
    SELECT
      txn_id,
      (txn_id * 10)::bigint AS sort_id,
      branch_id,
      acc_id,
      txn_type,
      ref_table,
      ref_id,
      debit,
      credit,
      txn_date,
      note
    FROM synthetic_expense_charge
    UNION ALL
    SELECT
      txn_id,
      (txn_id * 10)::bigint AS sort_id,
      branch_id,
      acc_id,
      txn_type,
      ref_table,
      ref_id,
      debit,
      credit,
      txn_date,
      note
    FROM synthetic_payroll_charge
    UNION ALL
    SELECT
      txn_id,
      (txn_id * 10)::bigint AS sort_id,
      branch_id,
      acc_id,
      txn_type,
      ref_table,
      ref_id,
      debit,
      credit,
      txn_date,
      note
    FROM synthetic_expense
    UNION ALL
    SELECT
      txn_id,
      (txn_id * 10)::bigint AS sort_id,
      branch_id,
      acc_id,
      txn_type,
      ref_table,
      ref_id,
      debit,
      credit,
      txn_date,
      note
    FROM synthetic_payroll
    UNION ALL
    SELECT
      txn_id,
      (txn_id * 10)::bigint AS sort_id,
      branch_id,
      acc_id,
      txn_type,
      ref_table,
      ref_id,
      debit,
      credit,
      txn_date,
      note
    FROM synthetic_sale_payment_debit
    UNION ALL
    SELECT
      txn_id,
      (txn_id * 10)::bigint AS sort_id,
      branch_id,
      acc_id,
      txn_type,
      ref_table,
      ref_id,
      debit,
      credit,
      txn_date,
      note
    FROM synthetic_sale_payment_credit
    UNION ALL
    SELECT
      jl.journal_line_id::bigint AS txn_id,
      (jl.journal_line_id::bigint * 10 + 1)::bigint AS sort_id,
      je.branch_id,
      jl.acc_id,
      'journal'::text AS txn_type,
      'journal_entries'::text AS ref_table,
      je.journal_id::bigint AS ref_id,
      COALESCE(jl.debit, 0)::double precision AS debit,
      COALESCE(jl.credit, 0)::double precision AS credit,
      COALESCE(je.entry_date::timestamptz, je.created_at, NOW()) AS txn_date,
      CASE
        WHEN COALESCE(je.memo, '') = '' THEN '[Journal Entry]'
        ELSE '[Journal Entry] ' || je.memo
      END AS note
    FROM ims.journal_lines jl
    JOIN ims.journal_entries je ON je.journal_id = jl.journal_id
    WHERE je.branch_id = $1
  )
`;

export const buildBalanceSheetFromLedger = async (
  branchId: number,
  asOfDate: string,
  netIncomeFromDate?: string
): Promise<BalanceSheetRow[]> => {
  const [customerBalanceColumn, supplierBalanceExpr] = await Promise.all([
    resolveBalanceColumn('customers'),
    resolveBalanceExpression('suppliers', 's'),
  ]);
  const params: Array<number | string> = [branchId, asOfDate];

  const [
    accountRows,
    inventoryFallback,
    receivableFallback,
    payableFallback,
    payableFromSupplierLedger,
    currentAssetRows,
    fixedAssetRows,
    capitalFallback,
    drawingFallback,
    ownerCapitalRows,
    ownerDrawingRows,
    ownerProfitRows,
    prepaidExpenseRowsFallback,
    prepaidPayrollAssetFallback,
  ] =
    await Promise.all([
      queryMany<{
        account_name: string;
        institution: string;
        account_type: string;
        base_balance: number;
        txn_balance: number;
        txn_count: number;
      }>(
        `${normalizedAccountTransactionsCte},
         txn_rollup AS (
            SELECT
              at.acc_id,
              COUNT(*)::int AS txn_count,
              COALESCE(SUM(at.debit - at.credit), 0)::double precision AS txn_balance
            FROM normalized_txn at
            WHERE at.txn_date::date <= $2::date
            GROUP BY at.acc_id
          )
          SELECT
            COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS account_name,
            COALESCE(a.institution, '') AS institution,
            COALESCE(a.account_type::text, 'asset') AS account_type,
            COALESCE(a.balance, 0)::double precision AS base_balance,
            COALESCE(t.txn_balance, 0)::double precision AS txn_balance,
            COALESCE(t.txn_count, 0)::int AS txn_count
          FROM accounts_norm a
          LEFT JOIN txn_rollup t ON t.acc_id = a.acc_id
          WHERE a.branch_id = $1
            AND a.is_active = TRUE
          ORDER BY a.acc_id ASC`,
        params
      ),
      queryAmount(
        `WITH legacy_adjustments AS (
           SELECT
             i.branch_id,
             a.item_id,
             COALESCE(SUM(
               CASE
                 WHEN UPPER(COALESCE(a.adjustment_type, 'INCREASE')) = 'DECREASE' THEN -COALESCE(a.quantity, 0)
                 ELSE COALESCE(a.quantity, 0)
               END
             ), 0)::numeric(14,3) AS qty_delta
           FROM ims.stock_adjustment a
           JOIN ims.items i ON i.item_id = a.item_id
           WHERE i.is_active = TRUE
             AND COALESCE(a.is_deleted, 0)::int = 0
             AND UPPER(COALESCE(a.status, 'POSTED')) = 'POSTED'
             AND NOT EXISTS (
               SELECT 1
                 FROM ims.inventory_movements m
                WHERE m.branch_id = i.branch_id
                  AND m.ref_table = 'stock_adjustment'
                  AND m.ref_id = a.adjustment_id
             )
           GROUP BY i.branch_id, a.item_id
        ),
        item_stock AS (
           SELECT
             i.item_id,
             (
               COALESCE(i.opening_balance, 0)
               + COALESCE(SUM(COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)), 0)
               + COALESCE(la.qty_delta, 0)
             )::numeric(14,3) AS total_qty,
             COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price
           FROM ims.items i
           LEFT JOIN ims.inventory_movements m
             ON m.branch_id = i.branch_id
            AND m.item_id = i.item_id
            AND COALESCE(LOWER(to_jsonb(m) ->> 'is_deleted'), '0') NOT IN ('1', 'true', 't', 'yes')
           LEFT JOIN legacy_adjustments la
             ON la.branch_id = i.branch_id
            AND la.item_id = i.item_id
           WHERE i.branch_id = $1
             AND i.is_active = TRUE
           GROUP BY i.item_id, i.branch_id, i.opening_balance, i.cost_price, la.qty_delta
        )
        SELECT COALESCE(SUM(item_stock.total_qty * item_stock.cost_price), 0)::double precision AS amount
          FROM item_stock`,
        [branchId]
      ),
      queryAmount(
        `SELECT COALESCE(SUM(COALESCE(c.${customerBalanceColumn}, 0)), 0)::double precision AS amount
           FROM ims.customers c
          WHERE c.branch_id = $1
            AND c.is_active = TRUE`,
        [branchId]
      ),
      queryAmount(
        `SELECT COALESCE(SUM(${supplierBalanceExpr}), 0)::double precision AS amount
           FROM ims.suppliers s
          WHERE s.branch_id = $1
            AND s.is_active = TRUE`,
        [branchId]
      ),
      queryAmount(
        `WITH ledger_rows AS (
           SELECT
             l.supplier_id,
             (
               CASE
                 WHEN (COALESCE(l.entry_type::text, '') = 'refund' OR COALESCE(l.note, '') ILIKE '%refund%')
                   THEN ABS(COALESCE(l.debit, 0)) + ABS(COALESCE(l.credit, 0))
                 ELSE COALESCE(l.debit, 0)
               END
             )::double precision AS debit,
             (
               CASE
                 WHEN (COALESCE(l.entry_type::text, '') = 'refund' OR COALESCE(l.note, '') ILIKE '%refund%')
                   THEN 0
                 ELSE COALESCE(l.credit, 0)
               END
             )::double precision AS credit
           FROM ims.supplier_ledger l
          WHERE l.branch_id = $1
            AND l.entry_date::date <= $2::date
         ),
         opening_rows AS (
           SELECT
             s.supplier_id,
             0::double precision AS debit,
             GREATEST(COALESCE(${supplierBalanceExpr}, 0), 0)::double precision AS credit
           FROM ims.suppliers s
          WHERE s.branch_id = $1
            AND GREATEST(COALESCE(${supplierBalanceExpr}, 0), 0) > 0
            AND NOT EXISTS (
              SELECT 1
                FROM ims.supplier_ledger l
               WHERE l.branch_id = $1
                 AND l.supplier_id = s.supplier_id
                 AND l.entry_date::date <= $2::date
            )
         ),
         unioned AS (
           SELECT * FROM ledger_rows
           UNION ALL
           SELECT * FROM opening_rows
         )
         SELECT GREATEST(COALESCE(SUM(COALESCE(u.credit, 0) - COALESCE(u.debit, 0)), 0), 0)::double precision AS amount
           FROM unioned u`,
        params
      ),
      queryManyIfTableExists<{ asset_name: string; amount: number }>(
        'assets',
        `SELECT
           COALESCE(NULLIF(BTRIM(a.asset_name), ''), 'Current Asset') AS asset_name,
           COALESCE(SUM(a.amount), 0)::double precision AS amount
         FROM ims.assets a
         WHERE a.branch_id = $1
           AND a.asset_type = 'current'::ims.asset_type_enum
           AND a.purchased_date <= $2::date
           AND LOWER(COALESCE(a.state::text, 'active')) <> 'disposed'
         GROUP BY 1
         ORDER BY 1`,
        params
      ),
      queryManyIfTableExists<{ asset_name: string; amount: number }>(
        'assets',
        `SELECT
           COALESCE(NULLIF(BTRIM(a.asset_name), ''), 'Fixed Asset') AS asset_name,
           COALESCE(SUM(a.amount), 0)::double precision AS amount
         FROM ims.assets a
         WHERE a.branch_id = $1
           AND a.asset_type = 'fixed'::ims.asset_type_enum
           AND a.purchased_date <= $2::date
           AND LOWER(COALESCE(a.state::text, 'active')) <> 'disposed'
         GROUP BY 1
         ORDER BY 1`,
        params
      ),
      queryAmountIfTableExists(
        'capital_contributions',
        `SELECT COALESCE(SUM(cc.amount), 0)::double precision AS amount
           FROM ims.capital_contributions cc
          WHERE cc.branch_id = $1
            AND cc.contribution_date <= $2::date`,
        params
      ),
      queryAmountIfTableExists(
        'owner_drawings',
        `SELECT COALESCE(SUM(od.amount), 0)::double precision AS amount
           FROM ims.owner_drawings od
          WHERE od.branch_id = $1
            AND od.draw_date <= $2::date`,
        params
      ),
      queryManyIfTableExists<{ owner_name: string; amount: number }>(
        'capital_contributions',
        `SELECT
           COALESCE(NULLIF(BTRIM(cc.owner_name), ''), 'Owner') AS owner_name,
           COALESCE(SUM(cc.amount), 0)::double precision AS amount
         FROM ims.capital_contributions cc
         WHERE cc.branch_id = $1
           AND cc.contribution_date <= $2::date
         GROUP BY 1`,
        params
      ),
      queryManyIfTableExists<{ owner_name: string; amount: number }>(
        'owner_drawings',
        `SELECT
           COALESCE(NULLIF(BTRIM(od.owner_name), ''), 'Owner') AS owner_name,
           COALESCE(SUM(od.amount), 0)::double precision AS amount
         FROM ims.owner_drawings od
         WHERE od.branch_id = $1
           AND od.draw_date <= $2::date
         GROUP BY 1`,
        params
      ),
      queryManyIfTableExists<{ owner_name: string; amount: number }>(
        'finance_profit_allocations',
        `SELECT
           COALESCE(NULLIF(BTRIM(fpa.partner_name), ''), 'Owner') AS owner_name,
           COALESCE(SUM(fpa.amount), 0)::double precision AS amount
         FROM ims.finance_profit_allocations fpa
         JOIN ims.finance_closing_periods cp
           ON cp.closing_id = fpa.closing_id
         WHERE fpa.branch_id = $1
           AND fpa.allocation_type = 'partner'
           AND cp.status = 'closed'
           AND cp.period_to <= $2::date
          GROUP BY 1`,
        params
      ),
      queryMany<{ expense_name: string; amount: number }>(
        `WITH charge_rollup AS (
           SELECT
             e.name AS expense_name,
             COALESCE(SUM(CASE WHEN ${openingExpensePredicate('ec')} THEN ec.amount ELSE 0 END), 0)::double precision AS opening_amount,
             COALESCE(SUM(CASE WHEN NOT ${openingExpensePredicate('ec')} THEN ec.amount ELSE 0 END), 0)::double precision AS charge_amount
           FROM ims.expense_charges ec
           JOIN ims.expenses e
             ON e.exp_id = ec.exp_id
           WHERE ec.branch_id = $1
             AND ec.charge_date::date <= $2::date
           GROUP BY e.name
         ),
         payment_rollup AS (
           SELECT
             e.name AS expense_name,
             COALESCE(SUM(ep.amount_paid), 0)::double precision AS paid_amount
           FROM ims.expense_payments ep
           JOIN ims.expense_charges ec
             ON ec.charge_id = ep.exp_ch_id
           JOIN ims.expenses e
             ON e.exp_id = ec.exp_id
           WHERE ep.branch_id = $1
             AND ep.pay_date::date <= $2::date
             AND NOT ${openingExpensePredicate('ec')}
           GROUP BY e.name
         )
         SELECT
           cr.expense_name,
           GREATEST(COALESCE(cr.opening_amount, 0) + COALESCE(pr.paid_amount, 0) - COALESCE(cr.charge_amount, 0), 0)::double precision AS amount
         FROM charge_rollup cr
         LEFT JOIN payment_rollup pr
           ON pr.expense_name = cr.expense_name
         WHERE GREATEST(COALESCE(cr.opening_amount, 0) + COALESCE(pr.paid_amount, 0) - COALESCE(cr.charge_amount, 0), 0) > 0.005
         ORDER BY cr.expense_name`,
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
              AND COALESCE(pr.status::text, 'draft') <> 'void'
              AND pr.period_to::date <= $2::date
         ),
         payroll_paid AS (
           SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
             FROM ims.employee_payments ep
            WHERE ep.branch_id = $1
              AND ep.pay_date::date <= $2::date
         )
         SELECT GREATEST(payroll_paid.amount - payroll_due.amount, 0)::double precision AS amount
           FROM payroll_due, payroll_paid`,
        params
      ),
    ]);

  const fixedAssetNameSet = new Set(
    fixedAssetRows
      .map((asset) => normalizeAccountName(asset.asset_name))
      .filter((name) => name.length > 0)
  );

  const currentAssets: BalanceSheetRow[] = [];
  const nonCurrentAssets: BalanceSheetRow[] = [];
  const currentLiabilities: BalanceSheetRow[] = [];
  const equityAccountRows: BalanceSheetRow[] = [];
  const equityRows: BalanceSheetRow[] = [];

  let receivableFromAccounts = 0;
  let accountsPayableFromAccounts = 0;
  let inventoryFromAccounts = 0;
  let drawingFromAccounts = 0;
  let usedPrepaidAccounts = false;
  let usedOwnerEquityBreakdown = false;

  for (const row of accountRows) {
    const accountName = String(row.account_name || '').trim() || 'Account';
    const accountTypeRaw = String(row.account_type || 'asset');
    const accountType = normalizeAccountName(accountTypeRaw);

    // Prefer the stored account balance because it's the system's source of truth and includes
    // opening balances + all modules' adjustments. Some legacy deployments have incomplete
    // `account_transactions` history, which would understate balances if we used ledger rollups.
    // If the stored balance is effectively zero but we do have ledger entries, fall back to ledger.
    const baseBalanceRaw = Number(row.base_balance || 0);
    const baseSignedDebitMinusCredit = (() => {
      const side = resolveNaturalSide(accountTypeRaw, accountName);
      return side === 'credit' ? -Math.abs(baseBalanceRaw) : Math.abs(baseBalanceRaw);
    })();

    const isCashAccount = isCashOrBankAccount(accountName, row.institution);
    const txnBalanceRaw = Number(row.txn_balance || 0);
    const hasTxnBalance = Number(row.txn_count || 0) > 0 && !isApproxZero(txnBalanceRaw);
    const preferTxnForCash =
      isCashAccount
      && hasTxnBalance
      && (isApproxZero(baseBalanceRaw) || Math.abs(txnBalanceRaw - baseSignedDebitMinusCredit) > 0.005);
    const debitMinusCredit = isCashAccount
      ? (preferTxnForCash ? txnBalanceRaw : baseSignedDebitMinusCredit)
      : !isApproxZero(baseBalanceRaw)
        ? baseSignedDebitMinusCredit
        : (hasTxnBalance ? txnBalanceRaw : 0);

    if (isApproxZero(debitMinusCredit)) continue;

    const naturalBalance = toNaturalBalance(debitMinusCredit, accountTypeRaw, accountName);
    if (isApproxZero(naturalBalance)) continue;

    const kind = classifyForBalanceSheet(accountType, accountName);
    if (kind === 'revenue' || kind === 'expense') continue;

    if (isDrawingAccount(accountName)) {
      drawingFromAccounts += moneyAbs(naturalBalance);
      continue;
    }

    if (kind === 'liability' || isPayableAccount(accountName)) {
      if (isAccountsPayableAccount(accountName)) {
        accountsPayableFromAccounts += moneyPos(naturalBalance);
        continue;
      }
      currentLiabilities.push({
        section: 'Current Liabilities',
        line_item: accountName,
        amount: naturalBalance,
        row_type: 'detail',
      });
      continue;
    }

    if (kind === 'equity' || isEquityLikeAccount(accountName)) {
      equityAccountRows.push({
        section: 'Equity',
        line_item: accountName,
        amount: naturalBalance,
        row_type: 'detail',
      });
      continue;
    }

    if (fixedAssetNameSet.has(normalizeAccountName(accountName)) || isFixedAssetAccount(accountName)) {
      nonCurrentAssets.push({
        section: 'Non-Current Assets',
        line_item: accountName,
        amount: naturalBalance,
        row_type: 'detail',
      });
      continue;
    }

    if (isReceivableAccount(accountName)) {
      receivableFromAccounts += moneyPos(naturalBalance);
      currentAssets.push({
        section: 'Current Assets',
        line_item: accountName,
        amount: naturalBalance,
        row_type: 'detail',
      });
      continue;
    }

    if (kind === 'asset' && isInventoryAssetAccountName(accountName)) {
      inventoryFromAccounts += Number(naturalBalance || 0);
      continue;
    }

    if (isPrepaidAccount(accountName)) {
      usedPrepaidAccounts = true;
      currentAssets.push({
        section: 'Current Assets',
        line_item: accountName,
        amount: naturalBalance,
        row_type: 'detail',
      });
      continue;
    }

    if (kind === 'asset' || isCashOrBankAccount(accountName, row.institution)) {
      currentAssets.push({
        section: 'Current Assets',
        line_item: accountName,
        amount: naturalBalance,
        row_type: 'detail',
      });
    }
  }

  if (isApproxZero(receivableFromAccounts) && !isApproxZero(receivableFallback)) {
    currentAssets.push({
      section: 'Current Assets',
      line_item: 'Accounts Receivable',
      amount: moneyPos(receivableFallback),
      row_type: 'detail',
    });
  }

  const accountsPayableFromSuppliers =
    !isApproxZero(payableFromSupplierLedger)
      ? moneyPos(payableFromSupplierLedger)
      : moneyPos(payableFallback);
  const effectiveAccountsPayable =
    !isApproxZero(accountsPayableFromSuppliers)
      ? accountsPayableFromSuppliers
      : moneyPos(accountsPayableFromAccounts);

  if (!isApproxZero(effectiveAccountsPayable)) {
    currentLiabilities.push({
      section: 'Current Liabilities',
      line_item: 'Accounts Payable',
      amount: effectiveAccountsPayable,
      row_type: 'detail',
    });
  }

  // Inventory on the Balance Sheet should reflect current on-hand stock valuation (items/store_items),
  // not whatever was posted (or not posted) to the Inventory GL account.
  const inventoryValue = !isApproxZero(inventoryFallback)
    ? Number(inventoryFallback || 0)
    : Number(inventoryFromAccounts || 0);
  if (!isApproxZero(inventoryValue)) {
    currentAssets.push({
      section: 'Current Assets',
      line_item: 'Inventory',
      amount: inventoryValue,
      row_type: 'detail',
    });
  }

  const existingCurrent = new Set(currentAssets.map((row) => normalizeAccountName(row.line_item)));
  (currentAssetRows || []).forEach((asset) => {
    const amount = moneyPos(asset.amount);
    const lineItem = String(asset.asset_name || 'Current Asset');
    const key = normalizeAccountName(lineItem);
    if (isApproxZero(amount) || existingCurrent.has(key)) return;
    existingCurrent.add(key);
    currentAssets.push({
      section: 'Current Assets',
      line_item: lineItem,
      amount,
      row_type: 'detail',
    });
  });

  const existingFixed = new Set(nonCurrentAssets.map((row) => normalizeAccountName(row.line_item)));
  fixedAssetRows.forEach((asset) => {
    const amount = moneyPos(asset.amount);
    const lineItem = String(asset.asset_name || 'Fixed Asset');
    if (isApproxZero(amount) || existingFixed.has(normalizeAccountName(lineItem))) return;
    nonCurrentAssets.push({
      section: 'Non-Current Assets',
      line_item: lineItem,
      amount,
      row_type: 'detail',
    });
  });

  const ownerEquityMap = new Map<string, number>();
  ownerCapitalRows.forEach((row) => {
    const key = String(row.owner_name || 'Owner').trim() || 'Owner';
    ownerEquityMap.set(key, Number(ownerEquityMap.get(key) || 0) + Number(row.amount || 0));
  });
  ownerProfitRows.forEach((row) => {
    const key = String(row.owner_name || 'Owner').trim() || 'Owner';
    ownerEquityMap.set(key, Number(ownerEquityMap.get(key) || 0) + Number(row.amount || 0));
  });
  ownerDrawingRows.forEach((row) => {
    const key = String(row.owner_name || 'Owner').trim() || 'Owner';
    ownerEquityMap.set(key, Number(ownerEquityMap.get(key) || 0) - Number(row.amount || 0));
  });
  const ownerEquityBreakdown = Array.from(ownerEquityMap.entries())
    .map(([ownerName, amount]) => ({ ownerName, amount: Number(amount || 0) }))
    .filter((row) => !isApproxZero(row.amount));

  if (ownerEquityBreakdown.length > 0) {
    ownerEquityBreakdown
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName))
      .forEach((row) => {
        equityRows.push({
          section: 'Equity',
          line_item: row.ownerName,
          amount: row.amount,
          row_type: 'detail',
        });
      });
    usedOwnerEquityBreakdown = true;
  } else if (equityAccountRows.length > 0) {
    equityRows.push(...equityAccountRows);
  } else if (!isApproxZero(capitalFallback)) {
    equityRows.push({
      section: 'Equity',
      line_item: 'Capital',
      amount: Number(capitalFallback || 0),
      row_type: 'detail',
    });
  }

  const drawingAmount = !isApproxZero(drawingFromAccounts) ? drawingFromAccounts : moneyPos(drawingFallback);
  if (!usedOwnerEquityBreakdown && !isApproxZero(drawingAmount)) {
      equityRows.push({
        section: 'Equity',
        line_item: 'Drawing',
        amount: -drawingAmount,
        row_type: 'detail',
      });
    }

  const formatPrepaidLabel = (raw: string) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return 'Prepaid Expense';
    // Normalize "prepared"/"prepaid" spelling and keep the label client-friendly.
    const normalized = trimmed.replace(/^prepared\b/i, 'Prepaid').replace(/^prepaid\b/i, 'Prepaid');
    if (/\bprepaid\b|\bprepared\b/i.test(normalized)) return normalized;
    return `Prepaid ${normalized}`;
  };

  const addPrepaidRow = (label: string, amount: number) => {
    if (isApproxZero(amount)) return;
    currentAssets.push({
      section: 'Current Assets',
      line_item: label,
      amount: moneyPos(amount),
      row_type: 'detail',
    });
  };

  // If the chart-of-accounts already includes prepaid asset accounts, trust those balances.
  // Otherwise, infer prepaid balances from expenses/payments so the balance sheet is understandable
  // (Prepaid Rent, Prepaid Insurance, ...), instead of a single "Prepaid Expenses" line.
  if (!usedPrepaidAccounts) {
    const prepaidMap = new Map<string, number>();
    for (const row of prepaidExpenseRowsFallback || []) {
      const label = formatPrepaidLabel(row.expense_name);
      prepaidMap.set(label, (prepaidMap.get(label) || 0) + moneyPos(row.amount));
    }
    Array.from(prepaidMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([label, amount]) => addPrepaidRow(label, amount));
  }

  const payrollLabel = 'Prepaid Payroll';
  const hasPayrollPrepaidAccount =
    usedPrepaidAccounts &&
    currentAssets.some((row) => isPrepaidAccount(String(row.line_item || '')) && /payroll/i.test(String(row.line_item || '')));
  if (!hasPayrollPrepaidAccount && !isApproxZero(prepaidPayrollAssetFallback)) {
    addPrepaidRow(payrollLabel, prepaidPayrollAssetFallback);
  }

  const totalCurrentAssets = currentAssets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalNonCurrentAssets = nonCurrentAssets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

  const totalCurrentLiabilities = currentLiabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalLiabilities = totalCurrentLiabilities;
  const baseEquity = equityRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  // Retained earnings must stay synchronized with the Income Statement.
  // We compute:
  // - netIncomeYtd: Net Income from last closed period (or year start) to asOfDate
  // - openingRetained: prior retained earnings / opening imbalance
  // - retainedEarnings: openingRetained + netIncomeYtd (must equal residual for the BS to balance)
  const profitStart = await resolveProfitStartDate(branchId, asOfDate);
  const netIncomeStart = netIncomeFromDate || profitStart;
  const hasClosedPeriods = await hasAnyClosedClosingPeriod(branchId, asOfDate);
  const netIncomeRows = await financialReportsService.getIncomeStatement(branchId, netIncomeStart, asOfDate);
  const netIncomePeriod =
    Number(
      netIncomeRows.find((row) => String(row.line_item || '').toLowerCase() === 'net income')?.amount ?? 0
    ) || 0;
  const netIncomeYtd =
    netIncomeStart === profitStart
      ? netIncomePeriod
      : (Number(
          (
            await financialReportsService.getIncomeStatement(branchId, profitStart, asOfDate)
          ).find((row) => String(row.line_item || '').toLowerCase() === 'net income')?.amount ?? 0
        ) || 0);

  const residualRetained = totalAssets - totalLiabilities - baseEquity;
  const openingRetained = residualRetained - netIncomeYtd;
  const retainedEarnings = openingRetained + netIncomeYtd;

  // Replace any previously-computed retained rows.
  for (let idx = equityRows.length - 1; idx >= 0; idx -= 1) {
    if (/(retained earnings|accumulated loss|net income)/i.test(String(equityRows[idx].line_item || ''))) {
      equityRows.splice(idx, 1);
    }
  }

  if (hasClosedPeriods) {
    // After at least one finance closing period is closed, show the retained earnings breakdown:
    // Retained Earnings = Opening Retained + Net Income (YTD).
    if (!isApproxZero(openingRetained)) {
      equityRows.push({
        section: 'Equity',
        line_item: openingRetained >= 0 ? 'Opening Retained Earnings' : 'Opening Accumulated Loss',
        amount: openingRetained,
        row_type: 'detail',
      });
    }
    if (!isApproxZero(netIncomeYtd) && netIncomeStart === profitStart) {
      equityRows.push({
        section: 'Equity',
        line_item: netIncomeYtd >= 0 ? 'Net Income (YTD)' : 'Net Loss (YTD)',
        amount: netIncomeYtd,
        row_type: 'detail',
      });
    }
    if (!isApproxZero(retainedEarnings)) {
      equityRows.push({
        section: 'Equity',
        line_item: retainedEarnings >= 0 ? 'Retained Earnings' : 'Accumulated Loss',
        amount: retainedEarnings,
        row_type: 'detail',
      });
    }
  } else {
    // Before any closing period exists, keep Opening Balance Equity strictly for import-only entries.
    // Show retained earnings separately so daily transactions do not inflate Opening Balance Equity.
    if (!isApproxZero(retainedEarnings)) {
      equityRows.push({
        section: 'Equity',
        line_item: retainedEarnings >= 0 ? 'Retained Earnings' : 'Accumulated Loss',
        amount: retainedEarnings,
        row_type: 'detail',
      });
    }
  }

  if (!isApproxZero(netIncomePeriod)) {
    equityRows.push({
      section: 'Equity',
      line_item: netIncomePeriod >= 0 ? 'Net Income' : 'Net Loss',
      amount: netIncomePeriod,
      row_type: 'detail',
    });
  }

  // Total equity should NOT double-count the retained components.
  // Owners/capital + retained earnings (computed from historical + current profit).
  const totalEquity = baseEquity + retainedEarnings;
  const totalLiabilitiesEquity = totalLiabilities + totalEquity;
  const balanceDifference = totalAssets - totalLiabilitiesEquity;

  const rows: BalanceSheetRow[] = [
    ...currentAssets,
    { section: 'Current Assets', line_item: 'Total Current Assets', amount: totalCurrentAssets, row_type: 'total' },
    ...nonCurrentAssets,
    { section: 'Non-Current Assets', line_item: 'Total Non-Current Assets', amount: totalNonCurrentAssets, row_type: 'total' },
    { section: 'Assets', line_item: 'Total Assets', amount: totalAssets, row_type: 'total' },
    ...currentLiabilities,
    { section: 'Current Liabilities', line_item: 'Total Current Liabilities', amount: totalCurrentLiabilities, row_type: 'total' },
    ...equityRows,
    { section: 'Equity', line_item: 'Total Equity', amount: totalEquity, row_type: 'total' },
    { section: 'Summary', line_item: 'Total Liabilities', amount: totalLiabilities, row_type: 'total' },
    { section: 'Summary', line_item: 'Total Liabilities + Equity', amount: totalLiabilitiesEquity, row_type: 'total' },
    { section: 'Summary', line_item: 'Balance Difference', amount: balanceDifference, row_type: 'detail' },
  ];

  // Hide zero-balance detail lines (ERP-style), keep totals for structure.
  return rows.filter((row) => row.row_type === 'total' || !isApproxZero(row.amount));
};

// Professional balance sheet: no auto-plugging of retained earnings.
// - Assets / Liabilities / Equity come from posted GL (ims.account_transactions)
// - Net Income is shown as "Unclosed" when closing entries are not posted yet.
const buildBalanceSheetFromGl = async (branchId: number, asOfDate: string): Promise<BalanceSheetRow[]> => {
  const accountRows = await queryMany<{
    acc_id: number;
    account_name: string;
    institution: string;
    account_type: string;
    net: number;
  }>(
    `WITH accounts_norm AS (
       SELECT
         a.branch_id,
         COALESCE(
           NULLIF(to_jsonb(a) ->> 'acc_id', '')::bigint,
           NULLIF(to_jsonb(a) ->> 'account_id', '')::bigint
         ) AS acc_id,
         COALESCE(
           NULLIF(BTRIM(to_jsonb(a) ->> 'name'), ''),
           NULLIF(BTRIM(to_jsonb(a) ->> 'account_name'), ''),
           ''
         ) AS name,
         COALESCE(NULLIF(BTRIM(to_jsonb(a) ->> 'institution'), ''), '') AS institution,
         COALESCE(NULLIF(BTRIM(to_jsonb(a) ->> 'account_type'), ''), 'asset') AS account_type,
         COALESCE(NULLIF(to_jsonb(a) ->> 'balance', '')::numeric, 0)::double precision AS balance,
         COALESCE(NULLIF(to_jsonb(a) ->> 'is_active', '')::boolean, TRUE) AS is_active
       FROM ims.accounts a
     )
     SELECT
        a.acc_id,
        COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS account_name,
        COALESCE(a.institution, '') AS institution,
        COALESCE(a.account_type::text, 'asset') AS account_type,
        (
          CASE
            WHEN EXISTS (
              SELECT 1
                FROM ims.account_transactions at2
               WHERE at2.branch_id = a.branch_id
                 AND COALESCE(at2.is_deleted, 0) = 0
                 AND COALESCE(
                   NULLIF(to_jsonb(at2) ->> 'acc_id', '')::bigint,
                   NULLIF(to_jsonb(at2) ->> 'account_id', '')::bigint
                 ) = a.acc_id
               LIMIT 1
            ) THEN COALESCE(SUM(COALESCE(at.debit, 0) - COALESCE(at.credit, 0)), 0)
            ELSE (
              CASE
                WHEN COALESCE(a.account_type::text, 'asset') IN ('liability', 'equity', 'revenue', 'income')
                  THEN -ABS(COALESCE(a.balance, 0))
                ELSE ABS(COALESCE(a.balance, 0))
              END
            )
          END
        )::double precision AS net
      FROM accounts_norm a
      LEFT JOIN ims.account_transactions at
        ON at.branch_id = a.branch_id
       AND COALESCE(at.is_deleted, 0) = 0
       AND COALESCE(
         NULLIF(to_jsonb(at) ->> 'acc_id', '')::bigint,
         NULLIF(to_jsonb(at) ->> 'account_id', '')::bigint
       ) = a.acc_id
       AND at.txn_date::date <= $2::date
     WHERE a.branch_id = $1
       AND a.is_active = TRUE
     GROUP BY a.acc_id, a.name, a.institution, a.account_type, a.balance
     ORDER BY a.acc_id ASC`,
    [branchId, asOfDate]
  );

  const currentAssets: BalanceSheetRow[] = [];
  const nonCurrentAssets: BalanceSheetRow[] = [];
  const currentLiabilities: BalanceSheetRow[] = [];
  const nonCurrentLiabilities: BalanceSheetRow[] = [];
  const equityRows: BalanceSheetRow[] = [];

  const add = (target: BalanceSheetRow[], section: string, label: string, amount: number) => {
    if (isApproxZero(amount)) return;
    target.push({ section, line_item: label, amount, row_type: 'detail' as const });
  };

  let revenueTotal = 0;
  let expenseTotal = 0;

  for (const row of accountRows) {
    const type = String(row.account_type || 'asset').toLowerCase();
    const name = String(row.account_name || '').trim() || `Account #${row.acc_id}`;
    const net = Number(row.net || 0); // debit - credit
    const kind = classifyForBalanceSheet(type, name);

    if (kind === 'asset') {
      const amount = net;
      if (isFixedAssetAccount(name)) add(nonCurrentAssets, 'Non-Current Assets', name, amount);
      else add(currentAssets, 'Current Assets', name, amount);
      continue;
    }

    if (kind === 'liability') {
      if (isNonCurrentLiabilityAccount(name)) add(nonCurrentLiabilities, 'Non-Current Liabilities', name, -net);
      else add(currentLiabilities, 'Current Liabilities', name, -net);
      continue;
    }

    if (kind === 'equity') {
      add(equityRows, 'Equity', name, -net);
      continue;
    }

    if (kind === 'revenue') {
      revenueTotal += -net;
      continue;
    }

    if (kind === 'expense') {
      expenseTotal += net;
    }
  }

  const netIncome = revenueTotal - expenseTotal;
  if (!isApproxZero(netIncome)) {
    equityRows.push({
      section: 'Equity',
      line_item: netIncome >= 0 ? 'Net Income (Unclosed)' : 'Net Loss (Unclosed)',
      amount: netIncome,
      row_type: 'detail',
    });
  }

  const totalCurrentAssets = currentAssets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalNonCurrentAssets = nonCurrentAssets.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

  const totalCurrentLiabilities = currentLiabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalNonCurrentLiabilities = nonCurrentLiabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
  const totalEquity = equityRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalLiabilitiesEquity = totalLiabilities + totalEquity;
  const unbalanced = totalAssets - totalLiabilitiesEquity;

  const rows: BalanceSheetRow[] = [
    ...currentAssets,
    { section: 'Current Assets', line_item: 'Total Current Assets', amount: totalCurrentAssets, row_type: 'total' as const },
    ...nonCurrentAssets,
    { section: 'Non-Current Assets', line_item: 'Total Non-Current Assets', amount: totalNonCurrentAssets, row_type: 'total' as const },
    { section: 'Assets', line_item: 'Total Assets', amount: totalAssets, row_type: 'total' as const },
    ...currentLiabilities,
    { section: 'Current Liabilities', line_item: 'Total Current Liabilities', amount: totalCurrentLiabilities, row_type: 'total' as const },
    ...nonCurrentLiabilities,
    { section: 'Non-Current Liabilities', line_item: 'Total Non-Current Liabilities', amount: totalNonCurrentLiabilities, row_type: 'total' as const },
    ...equityRows,
    { section: 'Equity', line_item: 'Total Equity', amount: totalEquity, row_type: 'total' as const },
    { section: 'Summary', line_item: 'Total Liabilities', amount: totalLiabilities, row_type: 'total' as const },
    { section: 'Summary', line_item: 'Total Liabilities + Equity', amount: totalLiabilitiesEquity, row_type: 'total' as const },
    ...(isApproxZero(unbalanced)
      ? []
      : [{ section: 'Summary', line_item: 'Unbalanced Difference', amount: unbalanced, row_type: 'detail' as const }]),
  ];

  return rows.filter((row) => row.row_type === 'total' || !isApproxZero(row.amount));
};

const buildCashFlowFromLedger = async (
  branchId: number,
  fromDate: string,
  toDate: string
): Promise<CashFlowRow[]> => {
  const cashRows = await queryMany<{
    account_name: string;
    institution: string;
    txn_type: string;
    ref_table: string;
    note: string;
    debit: number;
    credit: number;
  }>(
    `${normalizedAccountTransactionsCte}
     SELECT
       COALESCE(a.name, '') AS account_name,
       COALESCE(a.institution, '') AS institution,
       COALESCE(at.txn_type::text, '') AS txn_type,
       COALESCE(at.ref_table, '') AS ref_table,
       COALESCE(at.note, '') AS note,
       COALESCE(at.debit, 0)::double precision AS debit,
       COALESCE(at.credit, 0)::double precision AS credit
     FROM normalized_txn at
      JOIN accounts_norm a
        ON a.acc_id = at.acc_id
      AND a.branch_id = $1
      WHERE at.txn_date::date BETWEEN $2::date AND $3::date
        AND COALESCE(a.is_active, TRUE) = TRUE
        AND COALESCE(a.account_type::text, 'asset') = 'asset'
       AND (
         -- prefer explicit keywords
         LOWER(COALESCE(a.name, '')) LIKE '%cash%'
         OR LOWER(COALESCE(a.name, '')) LIKE '%bank%'
         OR LOWER(COALESCE(a.name, '')) LIKE '%merchant%'
         OR LOWER(COALESCE(a.name, '')) LIKE '%evc%'
         OR LOWER(COALESCE(a.name, '')) LIKE '%dahab%'
         OR LOWER(COALESCE(a.name, '')) LIKE '%salaam%'
         OR LOWER(COALESCE(a.name, '')) LIKE '%premier%'
         OR LOWER(COALESCE(a.institution, '')) LIKE '%bank%'
         OR POSITION('@' IN COALESCE(a.name, '')) > 0
       )
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%receivable%'
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%inventory%'
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%stock%'
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%prepaid%'
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%fixed asset%'
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%equipment%'
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%furniture%'
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%computer%'
       AND LOWER(COALESCE(a.name, '')) NOT LIKE '%loan receivable%'`,
    [branchId, fromDate, toDate]
  );

  let salesReceipts = 0;
  let supplierPaid = 0;
  let expensesPaid = 0;
  let assetPurchases = 0;
  let assetSales = 0;
  let loanReceived = 0;
  let loanRepaid = 0;
  let ownerCapital = 0;
  let ownerDrawing = 0;
  let operatingOther = 0;
  let investingOther = 0;
  let financingOther = 0;
  let netMovement = 0;

  for (const row of cashRows) {
    const net = Number(row.credit || 0) - Number(row.debit || 0);
    if (isApproxZero(net)) continue;
    netMovement += net;

    const ref = normalizeAccountName(row.ref_table);
    const txn = normalizeAccountName(row.txn_type);
    const note = normalizeAccountName(row.note);
    const token = `${txn}|${ref}|${note}`;

    if (token.includes('account_transfer')) continue;

    if (token.includes('capital_contribution') || token.includes('capital_contributions')) {
      ownerCapital += net;
      continue;
    }
    if (token.includes('owner_drawing') || token.includes('owner_drawings') || token.includes('drawing')) {
      ownerDrawing += net < 0 ? Math.abs(net) : 0;
      if (net > 0) financingOther += net;
      continue;
    }
    if (token.includes('loan_payment') || token.includes('loan') || token.includes('borrow')) {
      if (net >= 0) loanReceived += net;
      else loanRepaid += Math.abs(net);
      continue;
    }
    if (token.includes('fixed_asset') || token.includes('asset')) {
      if (net >= 0) assetSales += net;
      else assetPurchases += Math.abs(net);
      continue;
    }
    if (token.includes('sale_payment') || token.includes('customer_receipts') || token.includes('sales')) {
      if (net >= 0) salesReceipts += net;
      else operatingOther += net;
      continue;
    }
    if (token.includes('supplier_payment') || token.includes('supplier_receipts') || token.includes('purchase')) {
      if (net < 0) supplierPaid += Math.abs(net);
      else operatingOther += net;
      continue;
    }
    if (token.includes('expense_payment') || token.includes('payroll_payment') || token.includes('expense') || token.includes('payroll')) {
      if (net < 0) expensesPaid += Math.abs(net);
      else operatingOther += net;
      continue;
    }

    operatingOther += net;
  }

  const netOperations = salesReceipts - supplierPaid - expensesPaid + operatingOther;
  const netInvesting = assetSales - assetPurchases + investingOther;
  const netFinancing = ownerCapital + loanReceived - loanRepaid - ownerDrawing + financingOther;
  const netIncreaseInCash = netMovement;

  return [
    { section: 'Cash Flow from Operations', line_item: 'Cash receipts from customers', amount: salesReceipts, row_type: 'detail' },
    { section: 'Cash Flow from Operations', line_item: 'Cash paid to suppliers', amount: -supplierPaid, row_type: 'detail' },
    { section: 'Cash Flow from Operations', line_item: 'Expenses paid', amount: -expensesPaid, row_type: 'detail' },
    ...(isApproxZero(operatingOther)
      ? []
      : [{ section: 'Cash Flow from Operations', line_item: 'Other operating cash movement', amount: operatingOther, row_type: 'detail' as const }]),
    { section: 'Cash Flow from Operations', line_item: 'Net Cash Flow from Operations', amount: netOperations, row_type: 'total' },

    { section: 'Cash Flow from Investing', line_item: 'Cash paid for fixed assets', amount: -assetPurchases, row_type: 'detail' },
    { section: 'Cash Flow from Investing', line_item: 'Cash received from sale of assets', amount: assetSales, row_type: 'detail' },
    ...(isApproxZero(investingOther)
      ? []
      : [{ section: 'Cash Flow from Investing', line_item: 'Other investing cash movement', amount: investingOther, row_type: 'detail' as const }]),
    { section: 'Cash Flow from Investing', line_item: 'Net Cash Flow from Investing', amount: netInvesting, row_type: 'total' },

    { section: 'Cash Flow from Financing', line_item: 'Owner capital', amount: ownerCapital, row_type: 'detail' },
    { section: 'Cash Flow from Financing', line_item: 'Loan received', amount: loanReceived, row_type: 'detail' },
    { section: 'Cash Flow from Financing', line_item: 'Loan repayment', amount: -loanRepaid, row_type: 'detail' },
    { section: 'Cash Flow from Financing', line_item: 'Drawing', amount: -ownerDrawing, row_type: 'detail' },
    ...(isApproxZero(financingOther)
      ? []
      : [{ section: 'Cash Flow from Financing', line_item: 'Other financing cash movement', amount: financingOther, row_type: 'detail' as const }]),
    { section: 'Cash Flow from Financing', line_item: 'Net Cash Flow from Financing', amount: netFinancing, row_type: 'total' },

    { section: 'Summary', line_item: 'Net Increase in Cash', amount: netIncreaseInCash, row_type: 'total' },
  ];
};

const buildIncomeStatementFromLedger = async (
  branchId: number,
  fromDate: string,
  toDate: string
): Promise<IncomeStatementRow[] | null> => {
  const ledgerRows = await queryMany<{
    account_id: number;
    account_name: string;
    account_type: string;
    amount: number; // credit - debit
  }>(
    `${normalizedAccountTransactionsCte}
     SELECT
       a.acc_id AS account_id,
       COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS account_name,
       COALESCE(a.account_type::text, 'asset') AS account_type,
       COALESCE(SUM(COALESCE(at.credit, 0) - COALESCE(at.debit, 0)), 0)::double precision AS amount
     FROM normalized_txn at
     JOIN accounts_norm a
       ON a.acc_id = at.acc_id
      AND a.branch_id = $1
     WHERE at.txn_date::date BETWEEN $2::date AND $3::date
     GROUP BY a.acc_id, a.name, a.account_type`,
    [branchId, fromDate, toDate]
  );

  if (ledgerRows.length === 0) return null;
  const purchaseDiscount = await queryAmount(
    `SELECT COALESCE(SUM(p.discount), 0)::double precision AS amount
       FROM ims.purchases p
      WHERE p.branch_id = $1
        AND p.purchase_date::date BETWEEN $2::date AND $3::date
        AND LOWER(COALESCE(p.status::text, '')) <> 'void'`,
    [branchId, fromDate, toDate]
  );

  type PnlKind = 'revenue' | 'cogs' | 'payroll' | 'expense' | 'ignore';

  const classify = (accountType: string, accountName: string): PnlKind => {
    const t = normalizeAccountName(accountType);
    const n = normalizeAccountName(accountName);

    // Exclude balance-sheet/control accounts that can contain keywords.
    if (n.includes('tax') && (n.includes('payable') || n.includes('vat') || n.includes('gst'))) return 'ignore';
    if (n.includes('sales tax') || n.includes('vat') || n.includes('gst')) return 'ignore';
    if (n.includes('payable') || n.includes('receivable') || n.includes('inventory') || n.includes('prepaid')) return 'ignore';

    if (t === 'revenue' || t === 'income') return 'revenue';
    if (t === 'cost') return 'cogs';
    if (t === 'expense') {
      if (n.includes('payroll') || n.includes('salary') || n.includes('wage')) return 'payroll';
      return 'expense';
    }

    // Heuristics for mis-typed charts of accounts.
    if ((n.includes('revenue') || n.includes('income') || n.includes('sale')) && !n.includes('tax')) return 'revenue';
    if (n.includes('cogs') || n.includes('cost of goods') || n.includes('purchase')) return 'cogs';
    if (n.includes('payroll') || n.includes('salary') || n.includes('wage')) return 'payroll';
    if (
      n.includes('expense')
      || n.includes('rent')
      || n.includes('utility')
      || n.includes('electric')
      || n.includes('water')
      || n.includes('internet')
      || n.includes('fuel')
      || n.includes('transport')
      || n.includes('maintenance')
      || n.includes('marketing')
      || n.includes('advertis')
      || n.includes('depreciation')
    ) return 'expense';

    return 'ignore';
  };

  const revenue: Array<{ name: string; amount: number }> = [];
  const cogs: Array<{ name: string; amount: number }> = [];
  const payroll: Array<{ name: string; amount: number }> = [];
  const expenses: Array<{ name: string; amount: number }> = [];

  for (const row of ledgerRows) {
    const amount = Number(row.amount || 0); // credit - debit (revenue +, expenses -)
    if (isApproxZero(amount)) continue;

    const kind = classify(String(row.account_type || 'asset'), String(row.account_name || ''));
    if (kind === 'ignore') continue;

    const line = { name: String(row.account_name || '').trim() || `Account #${row.account_id}`, amount };
    if (kind === 'revenue') revenue.push(line);
    else if (kind === 'cogs') cogs.push(line);
    else if (kind === 'payroll') payroll.push(line);
    else expenses.push(line);
  }

  const plSignal = [...revenue, ...cogs, ...payroll, ...expenses].reduce((sum, row) => sum + Math.abs(row.amount), 0);
  if (plSignal <= 0.000001) return null;

  const sum = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalRevenue = sum(revenue);
  const discountApplied = Math.max(purchaseDiscount, 0);
  const totalCogs = sum(cogs) + discountApplied;
  const grossProfit = totalRevenue + totalCogs;
  const payrollExpense = sum(payroll);
  const operatingExpense = sum(expenses);
  const totalOperatingExpenses = payrollExpense + operatingExpense;
  const netIncome = grossProfit + totalOperatingExpenses;

  const rows: IncomeStatementRow[] = [];

  revenue.sort((a, b) => a.name.localeCompare(b.name)).forEach((row) => {
    rows.push({ section: 'Revenue', line_item: row.name, amount: row.amount, row_type: 'detail' });
  });
  rows.push({ section: 'Revenue', line_item: 'Total Revenue', amount: totalRevenue, row_type: 'total' });

  cogs.sort((a, b) => a.name.localeCompare(b.name)).forEach((row) => {
    rows.push({ section: 'Cost of Goods Sold', line_item: row.name, amount: row.amount, row_type: 'detail' });
  });
  if (!isApproxZero(discountApplied)) {
    rows.push({ section: 'Cost of Goods Sold', line_item: 'Purchase Discount', amount: discountApplied, row_type: 'detail' });
  }
  rows.push({ section: 'Cost of Goods Sold', line_item: 'Total Cost of Goods Sold', amount: totalCogs, row_type: 'total' });

  rows.push({ section: 'Gross Profit', line_item: 'Gross Profit', amount: grossProfit, row_type: 'total' });

  expenses.sort((a, b) => a.name.localeCompare(b.name)).forEach((row) => {
    rows.push({ section: 'Operating Expenses', line_item: row.name, amount: row.amount, row_type: 'detail' });
  });
  if (!isApproxZero(payrollExpense)) {
    rows.push({ section: 'Operating Expenses', line_item: 'Payroll Expense', amount: payrollExpense, row_type: 'detail' });
  }
  if (expenses.length === 0 && isApproxZero(payrollExpense)) {
    rows.push({ section: 'Operating Expenses', line_item: 'Operating Expense', amount: 0, row_type: 'detail' });
  }
  rows.push({ section: 'Operating Expenses', line_item: 'Total Operating Expenses', amount: totalOperatingExpenses, row_type: 'total' });

  rows.push({ section: 'Net Income', line_item: 'Net Income', amount: netIncome, row_type: 'total' });

  return rows.filter((row) => row.row_type === 'total' || !isApproxZero(row.amount));
};

export const financialReportsService = {
  async getFinancialReportOptions(branchId: number): Promise<{
    accounts: FinancialReportOption[];
    customers: FinancialReportOption[];
    suppliers: FinancialReportOption[];
    salesStoreEnabled: boolean;
  }> {
    const [accounts, customers, suppliers, salesStoreEnabled] = await Promise.all([
      queryMany<FinancialReportOption>(
       `SELECT
           COALESCE(
             NULLIF(to_jsonb(a) ->> 'acc_id', '')::bigint,
             NULLIF(to_jsonb(a) ->> 'account_id', '')::bigint
           ) AS id,
           COALESCE(
             NULLIF(BTRIM(to_jsonb(a) ->> 'name'), ''),
             NULLIF(BTRIM(to_jsonb(a) ->> 'account_name'), ''),
             'Account #' || COALESCE(
               NULLIF(to_jsonb(a) ->> 'acc_id', '')::bigint,
               NULLIF(to_jsonb(a) ->> 'account_id', '')::bigint
             )::text
           ) AS label
          FROM ims.accounts a
         WHERE a.branch_id = $1
           AND COALESCE(NULLIF(to_jsonb(a) ->> 'is_active', '')::boolean, TRUE) = TRUE
           AND COALESCE(NULLIF(BTRIM(to_jsonb(a) ->> 'account_type'), ''), 'asset') = 'asset'
           AND (
             COALESCE(to_jsonb(a) ->> 'name', '') ILIKE '%cash%'
             OR COALESCE(to_jsonb(a) ->> 'name', '') ILIKE '%bank%'
             OR COALESCE(to_jsonb(a) ->> 'name', '') ILIKE '%checking%'
             OR COALESCE(to_jsonb(a) ->> 'name', '') ILIKE '%saving%'
             OR COALESCE(to_jsonb(a) ->> 'name', '') ILIKE '%merchant%'
             OR (COALESCE(to_jsonb(a) ->> 'institution', '') <> '')
           )
         ORDER BY id ASC`,
       [branchId]
     ),
      queryMany<FinancialReportOption>(
        `SELECT customer_id AS id, full_name AS label
           FROM ims.customers
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY customer_id ASC`,
        [branchId]
      ),
      queryMany<FinancialReportOption>(
        `SELECT supplier_id AS id, name AS label
           FROM ims.suppliers
         WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY supplier_id ASC`,
        [branchId]
      ),
      resolveColumnExists('sales', 'store_id'),
    ]);

    return { accounts, customers, suppliers, salesStoreEnabled };
  },

  async getIncomeStatement(branchId: number, fromDate: string, toDate: string): Promise<IncomeStatementRow[]> {
    const ledgerRows = await buildIncomeStatementFromLedger(branchId, fromDate, toDate);
    if (ledgerRows && ledgerRows.length > 0) {
      return ledgerRows;
    }

    const params: Array<number | string> = [branchId, fromDate, toDate];
    const [
      grossSales,
      salesReturns,
      movementCostSales,
      movementCostSalesReturns,
      purchaseDiscount,
      stockPurchases,
      purchaseReturns,
      payrollExpense,
      expenseRows,
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
        `SELECT COALESCE(SUM(p.discount), 0)::double precision AS amount
           FROM ims.purchases p
          WHERE p.branch_id = $1
            AND p.purchase_date::date BETWEEN $2::date AND $3::date
            AND LOWER(COALESCE(p.status::text, '')) <> 'void'`,
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
        `SELECT COALESCE(SUM(pl.net_salary), 0)::double precision AS amount
           FROM ims.payroll_lines pl
           JOIN ims.payroll_runs pr
             ON pr.payroll_id = pl.payroll_id
            AND pr.branch_id = pl.branch_id
          WHERE pl.branch_id = $1
            AND COALESCE(pr.status::text, 'draft') <> 'void'
            AND pr.period_to::date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryMany<{ expense_name: string; amount: number }>(
        `SELECT
           COALESCE(NULLIF(BTRIM(e.name), ''), 'Operating Expense') AS expense_name,
           COALESCE(SUM(ec.amount), 0)::double precision AS amount
         FROM ims.expense_charges ec
         LEFT JOIN ims.expenses e
           ON e.exp_id = ec.exp_id
          AND e.branch_id = ec.branch_id
         WHERE ec.branch_id = $1
           AND ec.charge_date::date BETWEEN $2::date AND $3::date
           AND NOT ${openingExpensePredicate('ec')}
         GROUP BY 1
         ORDER BY 1`,
        params
      ),
    ]);

    const revenueFromSales = grossSales - salesReturns;
    const movementCost = Math.max(movementCostSales - movementCostSalesReturns, 0);
    const purchaseCostFallback = Math.max(stockPurchases - purchaseReturns, 0);
    const rawCogs = movementCost > 0 ? movementCost : purchaseCostFallback;
    const discountApplied = Math.max(purchaseDiscount, 0);
    const costOfGoodsSold = Math.max(rawCogs - discountApplied, 0);
    const detailedExpenseTotal = expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalOperatingExpenses = detailedExpenseTotal + payrollExpense;
    const totalRevenue = revenueFromSales;
    const grossProfit = totalRevenue - costOfGoodsSold;
    const netIncome = grossProfit - totalOperatingExpenses;

    const rows: IncomeStatementRow[] = [
      { section: 'Revenue', line_item: 'Sales Revenue', amount: grossSales, row_type: 'detail' },
      { section: 'Revenue', line_item: 'Sales Returns', amount: -salesReturns, row_type: 'detail' },
    ];

    rows.push({ section: 'Revenue', line_item: 'Total Revenue', amount: totalRevenue, row_type: 'total' });

    rows.push({ section: 'Cost of Goods Sold', line_item: 'Cost of Goods Sold', amount: -rawCogs, row_type: 'detail' });
    if (!isApproxZero(discountApplied)) {
      rows.push({ section: 'Cost of Goods Sold', line_item: 'Purchase Discount', amount: discountApplied, row_type: 'detail' });
    }
    rows.push({ section: 'Cost of Goods Sold', line_item: 'Total Cost of Goods Sold', amount: -costOfGoodsSold, row_type: 'total' });
    rows.push({ section: 'Gross Profit', line_item: 'Gross Profit', amount: grossProfit, row_type: 'total' });

    if (expenseRows.length === 0) {
      rows.push({ section: 'Operating Expenses', line_item: 'Operating Expense', amount: 0, row_type: 'detail' });
    } else {
      expenseRows.forEach((expense) => {
        rows.push({
          section: 'Operating Expenses',
          line_item: expense.expense_name,
          amount: -Number(expense.amount || 0),
          row_type: 'detail',
        });
      });
    }
    rows.push({ section: 'Operating Expenses', line_item: 'Payroll Expense', amount: -payrollExpense, row_type: 'detail' });
    rows.push({ section: 'Operating Expenses', line_item: 'Total Operating Expenses', amount: -totalOperatingExpenses, row_type: 'total' });
    rows.push({ section: 'Net Income', line_item: 'Net Income', amount: netIncome, row_type: 'total' });

    return rows;
  },

  async getBalanceSheetLegacy(branchId: number, asOfDate: string): Promise<BalanceSheetRow[]> {
    return buildBalanceSheetFromGl(branchId, asOfDate);

    const [customerBalanceColumn, supplierBalanceExpr] = await Promise.all([
      resolveBalanceColumn('customers'),
      resolveBalanceExpression('suppliers', 's'),
    ]);
    const params: Array<number | string> = [branchId, asOfDate];

    const [
      accountBalanceRows,
      receivableAmount,
      customerAdvanceAmount,
      inventoryAmount,
      supplierPayableAmount,
      expensePayableAmount,
      payrollPayableAmount,
      prepaidExpenseAssetAmount,
      prepaidPayrollAssetAmount,
      employeeLoanReceivableAmount,
      fixedAssetRows,
      netSalesToDate,
      purchasesToDate,
      purchaseReturnsToDate,
      cogsByMovementToDate,
      operatingExpensesToDate,
      payrollExpenseToDate,
      ownerCapitalToDate,
      capitalByOwnerRows,
      drawingToDate,
    ] = await Promise.all([
      queryMany<{ account_id: number; account_name: string; institution: string; account_type: string; amount: number }>(
        `${normalizedAccountTransactionsCte},
         txn_rollup AS (
           SELECT
             at.acc_id,
             COUNT(*)::int AS txn_count,
             COALESCE(SUM(at.credit - at.debit), 0)::double precision AS txn_balance
           FROM normalized_txn at
           WHERE at.txn_date::date <= $2::date
           GROUP BY at.acc_id
         )
         SELECT
           a.acc_id AS account_id,
           COALESCE(NULLIF(BTRIM(a.name), ''), 'Cash Account') AS account_name,
           COALESCE(a.institution, '') AS institution,
           COALESCE(a.account_type::text, 'asset') AS account_type,
           (
             CASE
               WHEN COALESCE(t.txn_count, 0) > 0 THEN COALESCE(t.txn_balance, 0)
               ELSE COALESCE(a.balance, 0)::double precision
             END
           )::double precision AS amount
          FROM accounts_norm a
          LEFT JOIN txn_rollup t ON t.acc_id = a.acc_id
          WHERE a.branch_id = $1
            AND a.is_active = TRUE
          ORDER BY a.acc_id ASC`,
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
                      ${supplierBalanceExpr}
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
              AND COALESCE(pr.status::text, 'draft') <> 'void'
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
         SELECT GREATEST(payments.amount - charges.amount, 0)::double precision AS amount
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
              AND COALESCE(pr.status::text, 'draft') <> 'void'
              AND pr.period_to <= $2::date
         ),
         payroll_paid AS (
           SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS amount
             FROM ims.employee_payments ep
            WHERE ep.branch_id = $1
              AND ep.pay_date::date <= $2::date
         )
         SELECT GREATEST(payroll_paid.amount - payroll_due.amount, 0)::double precision AS amount
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
      queryManyIfTableExists<{ asset_name: string; amount: number }>(
        'assets',
        `SELECT
           COALESCE(NULLIF(BTRIM(a.asset_name), ''), 'Fixed Asset') AS asset_name,
           COALESCE(SUM(a.amount), 0)::double precision AS amount
         FROM ims.assets a
         WHERE a.branch_id = $1
           AND a.asset_type = 'fixed'::ims.asset_type_enum
           AND a.purchased_date <= $2::date
           AND LOWER(COALESCE(a.state::text, 'active')) <> 'disposed'
         GROUP BY 1
         ORDER BY 1`,
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
            AND COALESCE(pr.status::text, 'draft') <> 'void'
            AND pr.period_to <= $2::date`,
        params
      ),
      queryAmountIfTableExists(
        'capital_contributions',
        `SELECT COALESCE(SUM(cc.amount), 0)::double precision AS amount
           FROM ims.capital_contributions cc
          WHERE cc.branch_id = $1
            AND cc.contribution_date <= $2::date`,
        params
      ),
      queryManyIfTableExists<{ owner_name: string; total_amount: number }>(
        'capital_contributions',
        `SELECT
           COALESCE(NULLIF(BTRIM(cc.owner_name), ''), 'Owner') AS owner_name,
           COALESCE(SUM(cc.amount), 0)::double precision AS total_amount
         FROM ims.capital_contributions cc
         WHERE cc.branch_id = $1
           AND cc.contribution_date <= $2::date
         GROUP BY 1
         ORDER BY 1`,
        params
      ),
      queryAmount(
        `WITH accounts_norm AS (
           SELECT
             a.branch_id,
             COALESCE(
               NULLIF(to_jsonb(a) ->> 'acc_id', '')::bigint,
               NULLIF(to_jsonb(a) ->> 'account_id', '')::bigint
             ) AS acc_id,
             COALESCE(
               NULLIF(BTRIM(to_jsonb(a) ->> 'name'), ''),
               NULLIF(BTRIM(to_jsonb(a) ->> 'account_name'), ''),
               ''
             ) AS name,
             COALESCE(NULLIF(BTRIM(to_jsonb(a) ->> 'account_type'), ''), 'asset') AS account_type
           FROM ims.accounts a
         )
         SELECT COALESCE(SUM(GREATEST(at.debit - at.credit, 0)), 0)::double precision AS amount
           FROM ims.account_transactions at
           JOIN accounts_norm a
             ON a.acc_id = COALESCE(
               NULLIF(to_jsonb(at) ->> 'acc_id', '')::bigint,
               NULLIF(to_jsonb(at) ->> 'account_id', '')::bigint
             )
            AND a.branch_id = at.branch_id
          WHERE at.branch_id = $1
            AND at.txn_date::date <= $2::date
            AND a.account_type = 'equity'
            AND LOWER(a.name) LIKE '%drawing%'`,
        params
      ),
    ]);

    const fixedAssetsAmount = fixedAssetRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const fallbackCustomerReceivable = await queryAmount(
      `SELECT COALESCE(SUM(c.${customerBalanceColumn}), 0)::double precision AS amount
         FROM ims.customers c
        WHERE c.branch_id = $1
          AND c.is_active = TRUE`,
      [branchId]
    );
    const fallbackSupplierPayable = await queryAmount(
      `SELECT COALESCE(SUM(GREATEST(${supplierBalanceExpr}, 0)), 0)::double precision AS amount
         FROM ims.suppliers s
        WHERE s.branch_id = $1
          AND s.is_active = TRUE`,
      [branchId]
    );

    const lc = (value: string) => String(value || '').trim().toLowerCase();
    const isReceivableName = (name: string) => lc(name).includes('receivable');
    const isPayableName = (name: string) => lc(name).includes('payable');
    const isPrepaidName = (name: string) => lc(name).includes('prepaid') || lc(name).includes('prepared');
    const isInventoryName = (name: string) => lc(name).includes('inventory');
    const isFixedAssetName = (name: string) => {
      const n = lc(name);
      return n.includes('fixed asset') || n.includes('furniture') || n.includes('equipment') || n.includes('computer') || n.includes('machinery');
    };
    const isDrawingName = (name: string) => lc(name).includes('drawing');

    const cashAccountRows = accountBalanceRows
      .filter((row) => {
        const name = row.account_name;
        if (isReceivableName(name) || isPayableName(name) || isPrepaidName(name) || isInventoryName(name) || isFixedAssetName(name)) {
          return false;
        }
        const n = lc(name);
        return (
          row.account_type === 'asset'
          && (n.includes('cash') || n.includes('bank') || n.includes('merchant') || n.includes('evc') || n.includes('dahab') || n.includes('salaam') || n.includes('premier'))
        );
      })
      .map((row) => ({
        account_name: row.account_name,
        amount: Number(row.amount || 0),
      }));

    const receivableAccountAmount = accountBalanceRows
      .filter((row) => row.account_type === 'asset' && isReceivableName(row.account_name))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const payableAccountAmount = accountBalanceRows
      .filter((row) => isPayableName(row.account_name))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const prepaidAccountAmount = accountBalanceRows
      .filter((row) => row.account_type === 'asset' && isPrepaidName(row.account_name))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const inventoryAccountAmount = accountBalanceRows
      .filter((row) => row.account_type === 'asset' && isInventoryName(row.account_name))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const equityAccountRows = accountBalanceRows
      .filter((row) => row.account_type === 'equity' && !isDrawingName(row.account_name))
      .map((row) => ({
        owner_name: row.account_name,
        total_amount: Number(row.amount || 0),
      }))
      .filter((row) => Math.abs(row.total_amount) > 0.000001);

    const accountsReceivable =
      Math.abs(receivableAccountAmount) > 0.000001
        ? Math.max(receivableAccountAmount, 0)
        : Math.max(receivableAmount, fallbackCustomerReceivable, 0);
    const consolidatedReceivableFromAccount = Math.abs(receivableAccountAmount) > 0.000001;
    const effectiveCustomerAdvance = consolidatedReceivableFromAccount ? 0 : Math.max(customerAdvanceAmount, 0);
    const accountsPayable =
      Math.abs(payableAccountAmount) > 0.000001
        ? Math.max(payableAccountAmount, 0)
        : Math.max(supplierPayableAmount, fallbackSupplierPayable, 0);
    const consolidatedPayablesFromAccount = Math.abs(payableAccountAmount) > 0.000001;
    const effectiveExpensePayable = consolidatedPayablesFromAccount ? 0 : Math.max(expensePayableAmount, 0);
    const effectivePayrollPayable = consolidatedPayablesFromAccount ? 0 : Math.max(payrollPayableAmount, 0);
    const cashAmount = cashAccountRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const prepaidAmount =
      Math.abs(prepaidAccountAmount) > 0.000001
        ? Math.max(prepaidAccountAmount, 0)
        : Math.max(prepaidExpenseAssetAmount + prepaidPayrollAssetAmount, 0);
    const inventoryValue =
      Math.abs(inventoryAccountAmount) > 0.000001
        ? Math.max(inventoryAccountAmount, 0)
        : Math.max(inventoryAmount, 0);

    const ownerRowsSource = capitalByOwnerRows.length > 0 ? capitalByOwnerRows : equityAccountRows;
    const ownersCapitalFromRows = ownerRowsSource.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const ownerCapital = ownersCapitalFromRows > 0 ? ownersCapitalFromRows : ownerCapitalToDate;

    const netPurchasesToDate = Math.max(purchasesToDate - purchaseReturnsToDate, 0);
    const costOfSalesToDate = cogsByMovementToDate > 0 ? cogsByMovementToDate : netPurchasesToDate;
    const netProfitToDate =
      netSalesToDate - costOfSalesToDate - operatingExpensesToDate - payrollExpenseToDate;
    const totalCurrentAssets =
      cashAmount + accountsReceivable + inventoryValue + prepaidAmount;
    const totalNonCurrentAssets = employeeLoanReceivableAmount + fixedAssetsAmount;
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    const totalCurrentLiabilities = accountsPayable + effectiveCustomerAdvance + effectiveExpensePayable + effectivePayrollPayable;
    const totalNonCurrentLiabilities = 0;
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
    const drawingAmount = Math.max(drawingToDate, 0);
    const baseEquity = ownerCapital - drawingAmount;
    const retainedEarnings = totalAssets - totalLiabilities - baseEquity;
    const retainedLabel =
      Math.abs(retainedEarnings - netProfitToDate) <= 0.01
        ? 'Retained Earnings'
        : retainedEarnings >= 0
        ? 'Retained Earnings'
        : 'Accumulated Loss';
    const totalEquity = baseEquity + retainedEarnings;
    const totalLiabilitiesEquity = totalLiabilities + totalEquity;
    const balanceDifference = totalAssets - totalLiabilitiesEquity;

    const rows: BalanceSheetRow[] = [];

    cashAccountRows.forEach((account) => {
      rows.push({
        section: 'Current Assets',
        line_item: account.account_name,
        amount: Number(account.amount || 0),
        row_type: 'detail',
      });
    });

    rows.push(
      { section: 'Current Assets', line_item: 'Accounts Receivable', amount: accountsReceivable, row_type: 'detail' },
      { section: 'Current Assets', line_item: 'Prepaid Rents', amount: prepaidAmount, row_type: 'detail' },
      { section: 'Current Assets', line_item: 'Inventory', amount: inventoryValue, row_type: 'detail' },
      { section: 'Current Assets', line_item: 'Total Current Assets', amount: totalCurrentAssets, row_type: 'total' },
    );

    fixedAssetRows.forEach((asset) => {
      rows.push({
        section: 'Non-Current Assets',
        line_item: asset.asset_name,
        amount: Number(asset.amount || 0),
        row_type: 'detail',
      });
    });

    rows.push(
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
      { section: 'Assets', line_item: 'Total Assets', amount: totalAssets, row_type: 'total' },
      { section: 'Current Liabilities', line_item: 'Accounts Payable', amount: accountsPayable, row_type: 'detail' },
      {
        section: 'Current Liabilities',
        line_item: 'Customer Advances',
        amount: effectiveCustomerAdvance,
        row_type: 'detail',
      },
      { section: 'Current Liabilities', line_item: 'Expense Payable', amount: effectiveExpensePayable, row_type: 'detail' },
      { section: 'Current Liabilities', line_item: 'Payroll Payable', amount: effectivePayrollPayable, row_type: 'detail' },
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
    );

    ownerRowsSource.forEach((owner) => {
      rows.push({
        section: 'Equity',
        line_item: owner.owner_name,
        amount: Number(owner.total_amount || 0),
        row_type: 'detail',
      });
    });

    if (ownerRowsSource.length === 0) {
      rows.push({ section: 'Equity', line_item: 'Capital', amount: ownerCapital, row_type: 'detail' });
    }

    rows.push(
      { section: 'Equity', line_item: 'Drawing', amount: -drawingAmount, row_type: 'detail' },
      ...(Math.abs(retainedEarnings) > 0.000001
        ? [{ section: 'Equity', line_item: retainedLabel, amount: retainedEarnings, row_type: 'detail' as const }]
        : []),
      { section: 'Equity', line_item: 'Total Equity', amount: totalEquity, row_type: 'total' },
      { section: 'Summary', line_item: 'Total Liabilities', amount: totalLiabilities, row_type: 'total' },
      { section: 'Summary', line_item: 'Total Liabilities + Equity', amount: totalLiabilitiesEquity, row_type: 'total' },
      { section: 'Summary', line_item: 'Balance Difference', amount: balanceDifference, row_type: 'detail' },
    );

    return rows.filter((row) => {
      if (row.row_type === 'total') return true;
      return Math.abs(Number(row.amount || 0)) > 0.000001;
    });
  },

  async getBalanceSheet(branchId: number, asOfDate: string, fromDate?: string): Promise<BalanceSheetRow[]> {
    // Smart ERP balance sheet:
    // - Uses normalized transactions (fills missing postings from operational modules when possible)
    // - Falls back to system balances for legacy branches
    // - Keeps Total Assets = Total Liabilities + Equity via retained earnings reconciliation
    return buildBalanceSheetFromLedger(branchId, asOfDate, fromDate);
  },

  async getAccountsReceivable(branchId: number, fromDate: string, toDate: string): Promise<AccountsReceivableRow[]> {
    const customerBalanceColumn = await resolveBalanceColumn('customers');
    const customerBalanceRows = await queryMany<AccountsReceivableRow>(
      `SELECT
         COALESCE(c.full_name, 'Customer') AS customer_name,
         0::bigint AS invoice_no,
         $2::date::text AS invoice_date,
         $2::date::text AS due_date,
         GREATEST(COALESCE(c.${customerBalanceColumn}, 0), 0)::double precision AS amount,
         0::double precision AS paid,
         GREATEST(COALESCE(c.${customerBalanceColumn}, 0), 0)::double precision AS balance,
         'Open'::text AS status
        FROM ims.customers c
        WHERE c.branch_id = $1
          AND c.is_active = TRUE
          AND GREATEST(COALESCE(c.${customerBalanceColumn}, 0), 0) > 0.000001
        ORDER BY c.customer_id ASC`,
       [branchId, toDate]
     );
    if (customerBalanceRows.length > 0) {
      return customerBalanceRows;
    }

    // Fallback to invoice-based aging when customer balance column is not populated.
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
           AND s.sale_date::date <= $3::date
           AND LOWER(COALESCE(s.status::text, '')) <> 'void'
           AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
       ),
       sale_payments AS (
         SELECT
           sp.sale_id::bigint AS invoice_no,
           COALESCE(SUM(sp.amount_paid), 0)::double precision AS paid
         FROM ims.sale_payments sp
         WHERE sp.branch_id = $1
           AND sp.pay_date::date <= $3::date
         GROUP BY sp.sale_id
       ),
       receipt_payments AS (
         SELECT
           cr.sale_id::bigint AS invoice_no,
           COALESCE(SUM(cr.amount), 0)::double precision AS paid
         FROM ims.customer_receipts cr
         WHERE cr.branch_id = $1
           AND cr.sale_id IS NOT NULL
           AND cr.receipt_date::date <= $3::date
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
           WHEN ss.due_date < $3::date THEN 'Overdue'
           ELSE 'Open'
         END AS status
       FROM sales_scope ss
       LEFT JOIN sale_payments sp ON sp.invoice_no = ss.invoice_no
       LEFT JOIN receipt_payments rp ON rp.invoice_no = ss.invoice_no
       WHERE ss.invoice_date::date BETWEEN $2::date AND $3::date
        ORDER BY ss.invoice_date ASC, ss.invoice_no ASC
        LIMIT 5000`,
       [branchId, fromDate, toDate]
     );
  },

  async getAccountsPayable(branchId: number, fromDate: string, toDate: string): Promise<AccountsPayableRow[]> {
    const supplierBalanceExpr = await resolveBalanceExpression('suppliers', 's');
    const params: Array<number | string> = [branchId, fromDate, toDate];

    const [purchaseRows, openingRows, unallocatedRows] = await Promise.all([
      queryMany<AccountsPayableRow>(
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
             AND sp.pay_date::date <= $3::date
           GROUP BY sp.purchase_id
         ),
         receipt_payments AS (
           SELECT
             sr.purchase_id::bigint AS bill_no,
             COALESCE(SUM(sr.amount), 0)::double precision AS paid
           FROM ims.supplier_receipts sr
           WHERE sr.branch_id = $1
             AND sr.purchase_id IS NOT NULL
             AND sr.receipt_date::date <= $3::date
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
             WHEN ps.due_date < $3::date THEN 'Overdue'
             ELSE 'Open'
           END AS status
         FROM purchases_scope ps
         LEFT JOIN purchase_payments pp ON pp.bill_no = ps.bill_no
         LEFT JOIN receipt_payments rp ON rp.bill_no = ps.bill_no
          ORDER BY ps.bill_date ASC, ps.bill_no ASC
          LIMIT 5000`,
        params
      ),
      queryMany<{ supplier_id: number; supplier_name: string; opening_balance: number }>(
        `SELECT
           s.supplier_id,
           COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
           GREATEST(${supplierBalanceExpr}, 0)::double precision AS opening_balance
         FROM ims.suppliers s
        WHERE s.branch_id = $1
          AND s.is_active = TRUE
          AND GREATEST(${supplierBalanceExpr}, 0) > 0.000001`,
        [branchId]
      ),
      queryMany<{ supplier_id: number; supplier_name: string; unallocated_paid: number }>(
        `SELECT
           s.supplier_id,
           COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
           COALESCE(SUM(sr.amount), 0)::double precision AS unallocated_paid
         FROM ims.suppliers s
         LEFT JOIN ims.supplier_receipts sr
           ON sr.branch_id = s.branch_id
          AND sr.supplier_id = s.supplier_id
          AND sr.purchase_id IS NULL
          AND sr.receipt_date::date BETWEEN $2::date AND $3::date
         WHERE s.branch_id = $1
           AND s.is_active = TRUE
         GROUP BY s.supplier_id, s.name
         HAVING COALESCE(SUM(sr.amount), 0) > 0.000001`,
        params
      ),
    ]);

    const rows = [...purchaseRows];

    openingRows.forEach((row) => {
      rows.push({
        supplier_name: row.supplier_name,
        bill_no: 0,
        bill_date: toDate,
        due_date: toDate,
        amount: row.opening_balance,
        paid: 0,
        balance: row.opening_balance,
        status: 'Opening',
      });
    });

    unallocatedRows.forEach((row) => {
      rows.push({
        supplier_name: row.supplier_name,
        bill_no: 0,
        bill_date: toDate,
        due_date: toDate,
        amount: 0,
        paid: row.unallocated_paid,
        balance: -row.unallocated_paid,
        status: 'Unallocated',
      });
    });

    return rows.sort((a, b) => {
      const supplierCompare = String(a.supplier_name || '').localeCompare(String(b.supplier_name || ''));
      if (supplierCompare !== 0) return supplierCompare;
      const dateCompare = String(a.bill_date || '').localeCompare(String(b.bill_date || ''));
      if (dateCompare !== 0) return dateCompare;
      return Number(a.bill_no || 0) - Number(b.bill_no || 0);
    });
  },

  async getCashFlowStatement(branchId: number, fromDate: string, toDate: string): Promise<CashFlowRow[]> {
    // Prefer ledger-based cash flow so it matches Accounts + Balance Sheet.
    // If the ledger is missing legacy postings, fall back to the legacy table-based estimator.
    const ledgerRows = await buildCashFlowFromLedger(branchId, fromDate, toDate);
    const investingTotal = ledgerRows.find(
      (r) => r.section === 'Cash Flow from Investing' && r.line_item === 'Net Cash Flow from Investing'
    )?.amount ?? 0;
    const financingTotal = ledgerRows.find(
      (r) => r.section === 'Cash Flow from Financing' && r.line_item === 'Net Cash Flow from Financing'
    )?.amount ?? 0;
    if (!isApproxZero(investingTotal) || !isApproxZero(financingTotal)) {
      return ledgerRows;
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
      fixedAssetPurchases,
      capitalContributions,
      ownerDrawings,
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
      queryAmountIfTableExists(
        'assets',
        `SELECT COALESCE(SUM(a.amount), 0)::double precision AS amount
           FROM ims.assets a
          WHERE a.branch_id = $1
            AND a.asset_type = 'fixed'::ims.asset_type_enum
            AND a.purchased_date BETWEEN $2::date AND $3::date
            AND LOWER(COALESCE(a.state::text, 'active')) <> 'disposed'`,
        params
      ),
      queryAmountIfTableExists(
        'capital_contributions',
        `SELECT COALESCE(SUM(cc.amount), 0)::double precision AS amount
           FROM ims.capital_contributions cc
          WHERE cc.branch_id = $1
            AND cc.contribution_date BETWEEN $2::date AND $3::date`,
        params
      ),
      queryAmountIfTableExists(
        'owner_drawings',
        `SELECT COALESCE(SUM(od.amount), 0)::double precision AS amount
           FROM ims.owner_drawings od
          WHERE od.branch_id = $1
            AND od.draw_date BETWEEN $2::date AND $3::date`,
        params
      ),
    ]);

    const salesCollections = customerReceipts + salePayments;
    const netOperations = salesCollections - supplierPayments - expensePayments - payrollPayments;
    const netInvesting = supplierRefunds - employeeLoanDisbursements - fixedAssetPurchases;
    const netFinancing = loanRepayments + capitalContributions - ownerDrawings;
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
        line_item: 'Cash paid for fixed assets',
        amount: -fixedAssetPurchases,
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
        line_item: 'Capital contributions',
        amount: capitalContributions,
        row_type: 'detail',
      },
      {
        section: 'Cash Flow from Financing',
        line_item: 'Owner drawings',
        amount: -ownerDrawings,
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
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let accountFilter = '';
    if (accountId) {
      params.push(accountId);
      accountFilter = `AND at.acc_id = $${params.length}`;
    }

    const orderSql = accountId
      ? 'ORDER BY txn_date ASC, sort_id ASC, txn_id ASC'
      : 'ORDER BY account_name ASC, account_id ASC, txn_date ASC, sort_id ASC, txn_id ASC';

    const rows = await queryMany<
      AccountStatementRow & { account_type: string; running_balance_raw: number }
    >(
      `${normalizedAccountTransactionsCte},
        account_meta AS (
          SELECT
            a.acc_id,
            COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS account_name,
            COALESCE(a.account_type::text, 'asset') AS account_type
          FROM accounts_norm a
          WHERE a.branch_id = $1
        ),
       opening AS (
         SELECT
           at.acc_id AS account_id,
           COALESCE(SUM(COALESCE(at.debit, 0) - COALESCE(at.credit, 0)), 0)::double precision AS opening_balance
          FROM normalized_txn at
          WHERE at.branch_id = $1
            AND at.txn_date::date < $2::date
            ${accountFilter}
          GROUP BY at.acc_id
       ),
       filtered AS (
         SELECT
           at.txn_id,
           at.txn_date,
           at.acc_id AS account_id,
           COALESCE(am.account_name, 'N/A') AS account_name,
           COALESCE(am.account_type, 'asset') AS account_type,
           at.txn_type::text AS txn_type,
           COALESCE(at.ref_table, '') AS ref_table,
           at.ref_id,
           COALESCE(at.debit, 0)::double precision AS debit,
           COALESCE(at.credit, 0)::double precision AS credit,
           COALESCE(at.note, '') AS note,
           at.sort_id AS sort_id
         FROM normalized_txn at
         LEFT JOIN account_meta am ON am.acc_id = at.acc_id
         WHERE at.branch_id = $1
           AND at.txn_date::date BETWEEN $2::date AND $3::date
           ${accountFilter}
      ),
      split_meta AS (
        SELECT
          f.txn_id,
          f.account_id,
          CASE
            WHEN COALESCE(f.ref_table, '') = '' OR f.ref_id IS NULL THEN ''
            WHEN COUNT(DISTINCT ot.acc_id) FILTER (WHERE ot.acc_id IS NOT NULL) = 0 THEN ''
            WHEN COUNT(DISTINCT ot.acc_id) FILTER (WHERE ot.acc_id IS NOT NULL) = 1
              THEN COALESCE(
                     MAX(COALESCE(om.account_name, 'Account #' || ot.acc_id::text))
                     FILTER (WHERE ot.acc_id IS NOT NULL),
                     ''
                   )
            ELSE '-SPLIT-'
          END AS split_account
        FROM filtered f
        LEFT JOIN normalized_txn ot
          ON ot.branch_id = $1
         AND COALESCE(f.ref_table, '') <> ''
         AND f.ref_id IS NOT NULL
         AND COALESCE(ot.ref_table, '') = COALESCE(f.ref_table, '')
         AND ot.ref_id = f.ref_id
         AND COALESCE(ot.txn_type, '') = COALESCE(f.txn_type, '')
         AND ot.acc_id <> f.account_id
        LEFT JOIN account_meta om ON om.acc_id = ot.acc_id
        GROUP BY f.txn_id, f.account_id, f.ref_table, f.ref_id
      ),
       running AS (
         SELECT
           f.*,
           COALESCE(NULLIF(BTRIM(spl.split_account), ''), '') AS split_account,
           COALESCE(
             NULLIF(BTRIM(COALESCE(c_sale.full_name, c_receipt.full_name, s_purchase.name, s_receipt.name)), ''),
             ''
           ) AS party_name,
           (
             COALESCE(o.opening_balance, 0)
             + SUM(f.debit - f.credit)
              OVER (
                PARTITION BY f.account_id
                ORDER BY f.txn_date, f.sort_id, f.txn_id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
              )
           )::double precision AS running_balance_raw
         FROM filtered f
         LEFT JOIN opening o ON o.account_id = f.account_id
         LEFT JOIN split_meta spl
           ON spl.txn_id = f.txn_id
          AND spl.account_id = f.account_id
         LEFT JOIN ims.sales sale
           ON COALESCE(f.ref_table, '') = 'sales'
          AND sale.branch_id = $1
          AND sale.sale_id = f.ref_id
         LEFT JOIN ims.customers c_sale ON c_sale.customer_id = sale.customer_id
         LEFT JOIN ims.customer_receipts receipt
           ON COALESCE(f.ref_table, '') = 'customer_receipts'
          AND receipt.branch_id = $1
          AND receipt.receipt_id = f.ref_id
         LEFT JOIN ims.customers c_receipt ON c_receipt.customer_id = receipt.customer_id
         LEFT JOIN ims.purchases purchase
           ON COALESCE(f.ref_table, '') = 'purchases'
          AND purchase.branch_id = $1
          AND purchase.purchase_id = f.ref_id
         LEFT JOIN ims.suppliers s_purchase ON s_purchase.supplier_id = purchase.supplier_id
         LEFT JOIN ims.supplier_receipts supplier_receipt
           ON COALESCE(f.ref_table, '') = 'supplier_receipts'
          AND supplier_receipt.branch_id = $1
          AND supplier_receipt.receipt_id = f.ref_id
         LEFT JOIN ims.suppliers s_receipt ON s_receipt.supplier_id = supplier_receipt.supplier_id
       )
       SELECT
         txn_id,
         txn_date::text AS txn_date,
         account_id,
         account_name,
         account_type,
         txn_type,
         ref_table,
         ref_id,
         COALESCE(ref_id::text, '') AS txn_number,
         party_name,
         COALESCE(note, '') AS memo,
         split_account,
         debit,
         credit,
         running_balance_raw,
         note
       FROM running
       ${orderSql}
       LIMIT 5000`,
      params
    );

    const mapped = rows.map(({ account_type, running_balance_raw, ...row }) => ({
      ...row,
      running_balance: toNaturalBalance(running_balance_raw, account_type, row.account_name),
    }));

    if (!accountId) return mapped;

    const opening = await queryOne<{ opening_balance_raw: number; account_name: string; account_type: string }>(
      `${normalizedAccountTransactionsCte}
       SELECT
         COALESCE(SUM(COALESCE(at.debit, 0) - COALESCE(at.credit, 0)), 0)::double precision AS opening_balance_raw,
         COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS account_name,
         COALESCE(a.account_type::text, 'asset') AS account_type
       FROM accounts_norm a
       LEFT JOIN normalized_txn at
          ON at.branch_id = a.branch_id
         AND at.acc_id = a.acc_id
         AND at.txn_date::date < $3::date
      WHERE a.branch_id = $1
        AND a.acc_id = $2
      GROUP BY a.acc_id, a.name, a.account_type
      LIMIT 1`,
      [branchId, accountId, fromDate]
    );

    if (!opening) return mapped;

    const openingRow: AccountStatementRow = {
      txn_id: 0,
      txn_date: fromDate,
      account_id: accountId,
      account_name: opening.account_name,
      txn_type: 'opening',
      ref_table: '',
      ref_id: null,
      txn_number: 'OB',
      party_name: '',
      memo: 'Opening Balance',
      split_account: '',
      debit: 0,
      credit: 0,
      running_balance: toNaturalBalance(opening.opening_balance_raw, opening.account_type, opening.account_name),
      note: 'Opening Balance',
    };

    return [openingRow, ...mapped];
  },

  async getTrialBalance(
    branchId: number,
    fromDate: string,
    toDate: string,
    includeZero = false
  ): Promise<TrialBalanceRow[]> {
    const nonZeroSql = includeZero
      ? ''
      : `
       WHERE ABS(opening_debit) > 0.000001
           OR ABS(opening_credit) > 0.000001
           OR ABS(period_debit) > 0.000001
           OR ABS(period_credit) > 0.000001
           OR ABS(closing_debit) > 0.000001
           OR ABS(closing_credit) > 0.000001`;

    const [rows, inventoryOnHandValue, inventoryAccountIds, openingBalanceEquity] = await Promise.all([
      queryMany<TrialBalanceRow>(
	      `${normalizedAccountTransactionsCte},
         account_master AS (
	         SELECT
	           a.acc_id AS account_id,
	           COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS account_name,
	           (
	             CASE
	               WHEN COALESCE(a.account_type::text, 'asset') IN ('liability', 'equity', 'revenue', 'income')
	                 THEN -ABS(COALESCE(a.balance, 0))
	               ELSE ABS(COALESCE(a.balance, 0))
	             END
	           )::double precision AS base_balance,
	           EXISTS (
	             SELECT 1
	               FROM normalized_txn atx
	              WHERE atx.branch_id = a.branch_id
	                AND atx.acc_id = a.acc_id
	              LIMIT 1
           ) AS has_any_txn
          FROM accounts_norm a
          WHERE a.branch_id = $1
            AND a.is_active = TRUE
        ),
       opening AS (
         SELECT
           at.acc_id AS account_id,
           COALESCE(SUM(COALESCE(at.debit, 0) - COALESCE(at.credit, 0)), 0)::double precision AS opening_balance
         FROM normalized_txn at
         WHERE at.branch_id = $1
           AND at.txn_date::date < $2::date
         GROUP BY at.acc_id
       ),
       period AS (
         SELECT
           at.acc_id AS account_id,
           COALESCE(SUM(COALESCE(at.debit, 0)), 0)::double precision AS period_debit,
           COALESCE(SUM(COALESCE(at.credit, 0)), 0)::double precision AS period_credit
         FROM normalized_txn at
         WHERE at.branch_id = $1
           AND at.txn_date::date BETWEEN $2::date AND $3::date
         GROUP BY at.acc_id
       ),
       merged AS (
         SELECT
           am.account_id,
           am.account_name,
           (
             CASE
               WHEN am.has_any_txn THEN COALESCE(o.opening_balance, 0)
               ELSE COALESCE(am.base_balance, 0)
             END
           )::double precision AS opening_balance,
           COALESCE(p.period_debit, 0)::double precision AS period_debit,
           COALESCE(p.period_credit, 0)::double precision AS period_credit
         FROM account_master am
         LEFT JOIN opening o ON o.account_id = am.account_id
         LEFT JOIN period p ON p.account_id = am.account_id
       ),
        calc AS (
          SELECT
            account_id,
            account_name,
            CASE WHEN opening_balance >= 0 THEN opening_balance ELSE 0 END::double precision AS opening_debit,
            CASE WHEN opening_balance < 0 THEN ABS(opening_balance) ELSE 0 END::double precision AS opening_credit,
            period_debit,
            period_credit,
            (opening_balance + (period_debit - period_credit))::double precision AS closing_balance,
            CASE
              WHEN (opening_balance + (period_debit - period_credit)) >= 0 THEN (opening_balance + (period_debit - period_credit))
              ELSE 0
            END::double precision AS closing_debit,
            CASE
              WHEN (opening_balance + (period_debit - period_credit)) < 0 THEN ABS(opening_balance + (period_debit - period_credit))
              ELSE 0
            END::double precision AS closing_credit
          FROM merged
        )
        SELECT
          account_id,
          account_name,
          opening_debit,
          opening_credit,
          period_debit,
          period_credit,
          closing_debit,
          closing_credit
        FROM calc
        ${nonZeroSql}
        ORDER BY account_id ASC, account_name ASC`,
      [branchId, fromDate, toDate]
      ),
      queryInventoryOnHandValue(branchId),
      queryInventoryAssetAccountIds(branchId),
      queryOne<{ acc_id: number; name: string }>(
        `SELECT acc_id, name
           FROM ims.accounts
          WHERE branch_id = $1
            AND is_active = TRUE
            AND LOWER(COALESCE(name, '')) LIKE '%opening balance equity%'
          ORDER BY acc_id
          LIMIT 1`,
        [branchId]
      ),
    ]);

    const adjustedRows = (() => {
      if (inventoryAccountIds.length === 0) return rows;
      if (isApproxZero(inventoryOnHandValue)) return rows;

      const targetId = Math.min(...inventoryAccountIds);
      const onHand = Math.max(Number(inventoryOnHandValue || 0), 0);
      const currentInv = rows
        .filter((row) => inventoryAccountIds.includes(Number(row.account_id)))
        .reduce((sum, row) => sum + (Number(row.closing_debit || 0) - Number(row.closing_credit || 0)), 0);
      const delta = onHand - currentInv;

      const updated = rows.map((row) => {
        if (!inventoryAccountIds.includes(Number(row.account_id))) return row;

        // Replace the Inventory asset account(s) balance with on-hand valuation.
        // Keep it simple: put the full on-hand value on the primary inventory account id.
        const closingDebit = Number(row.account_id) === targetId ? onHand : 0;
        return {
          ...row,
          opening_debit: 0,
          opening_credit: 0,
          period_debit: 0,
          period_credit: 0,
          closing_debit: closingDebit,
          closing_credit: 0,
        };
      });

      if (isApproxZero(delta)) return updated;

      const obeId = Number(openingBalanceEquity?.acc_id || 0);
      const obeName = String(openingBalanceEquity?.name || 'Opening Balance Equity');
      const obeIndex = updated.findIndex((row) => Number(row.account_id) === obeId || /opening balance equity/i.test(String(row.account_name || '')));

      const debit = delta < 0 ? Math.abs(delta) : 0;
      const credit = delta > 0 ? delta : 0;

      if (obeIndex >= 0) {
        const row = updated[obeIndex];
        updated[obeIndex] = {
          ...row,
          opening_debit: row.opening_debit,
          opening_credit: row.opening_credit,
          period_debit: row.period_debit,
          period_credit: row.period_credit,
          closing_debit: Number(row.closing_debit || 0) + debit,
          closing_credit: Number(row.closing_credit || 0) + credit,
        };
        return updated;
      }

      updated.push({
        account_id: obeId || 0,
        account_name: obeName,
        opening_debit: 0,
        opening_credit: 0,
        period_debit: 0,
        period_credit: 0,
        closing_debit: debit,
        closing_credit: credit,
      });

      return updated;
    })();

    return includeZero ? adjustedRows : adjustedRows.filter((row) => !isZeroTrialBalanceRow(row));
  },

  async getAccountBalances(branchId: number, accountId?: number): Promise<AccountBalanceRow[]> {
    const params: number[] = [branchId];
    let filter = '';
    if (accountId) {
      params.push(accountId);
      filter = ` AND a.acc_id = $${params.length}`;
    }

    return queryMany<AccountBalanceRow>(
	      `${normalizedAccountTransactionsCte},
       txn AS (
	         SELECT
	           at.acc_id,
	           COUNT(*)::int AS txn_count,
	           COALESCE(SUM(COALESCE(at.debit, 0) - COALESCE(at.credit, 0)), 0)::double precision AS txn_balance,
	           MAX(at.txn_date)::text AS last_transaction_date
         FROM normalized_txn at
         WHERE at.branch_id = $1
           AND at.txn_date::date <= CURRENT_DATE
         GROUP BY at.acc_id
       ),
       calc AS (
         SELECT
           a.acc_id AS acc_id,
           a.acc_id AS account_id,
           COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS account_name,
           COALESCE(a.institution, '') AS institution,
           COALESCE(a.account_type::text, 'asset') AS account_type,
           (
             CASE
               WHEN COALESCE(txn.txn_count, 0) > 0 THEN COALESCE(txn.txn_balance, 0)
               ELSE (
                 CASE
                   WHEN COALESCE(a.account_type::text, 'asset') IN ('liability', 'equity', 'revenue', 'income')
                     THEN -ABS(COALESCE(a.balance, 0))
                   ELSE ABS(COALESCE(a.balance, 0))
                 END
               )::double precision
             END
           )::double precision AS current_balance,
           txn.last_transaction_date
         FROM accounts_norm a
         LEFT JOIN txn ON txn.acc_id = a.acc_id
          WHERE a.branch_id = $1
            AND a.is_active = TRUE
            ${filter}
        )
       SELECT
         a.account_id AS account_id,
         a.account_name,
         a.institution,
         a.account_type,
         a.current_balance,
         GREATEST(a.current_balance, 0)::double precision AS debit_balance,
         GREATEST(-a.current_balance, 0)::double precision AS credit_balance,
         a.last_transaction_date
       FROM calc a
      ORDER BY a.account_id ASC`,
      params
    );
  },

  async getProfitByItem(
    branchId: number,
    fromDate: string,
    toDate: string,
    itemId?: number,
    customerId?: number,
    storeId?: number
  ): Promise<ProfitByItemRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let salesFilter = '';
    let itemFilter = '';
    if (customerId) {
      params.push(customerId);
      salesFilter += ` AND s.customer_id = $${params.length}`;
    }
    if (storeId) {
      const hasStoreId = await resolveColumnExists('sales', 'store_id');
      if (hasStoreId) {
        params.push(storeId);
        salesFilter += ` AND s.store_id = $${params.length}`;
      }
    }
    if (itemId) {
      params.push(itemId);
      itemFilter = `AND i.item_id = $${params.length}`;
    }

    return queryMany<ProfitByItemRow>(
      `WITH sale_item_map AS (
         SELECT
           si.sale_id,
           COALESCE(
             (to_jsonb(si) ->> 'product_id')::bigint,
             (to_jsonb(si) ->> 'item_id')::bigint
           ) AS item_id,
           COALESCE((to_jsonb(si) ->> 'quantity')::numeric, 0) AS quantity,
           COALESCE((to_jsonb(si) ->> 'line_total')::numeric, 0) AS line_total
         FROM ims.sale_items si
       ),
       scoped_sales AS (
         SELECT
           m.item_id,
           m.quantity,
           m.line_total
         FROM sale_item_map m
         JOIN ims.sales s ON s.sale_id = m.sale_id
        WHERE s.branch_id = $1
          AND s.status <> 'void'
          AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
          AND s.sale_date::date BETWEEN $2::date AND $3::date
          ${salesFilter}
       )
       SELECT
         i.item_id,
         i.name AS item_name,
         COALESCE(SUM(sc.quantity), 0)::double precision AS quantity_sold,
         COALESCE(SUM(sc.line_total), 0)::double precision AS sales_amount,
         COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0)::double precision AS cost_amount,
         (COALESCE(SUM(sc.line_total), 0) - COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0))::double precision AS gross_profit,
         CASE
           WHEN COALESCE(SUM(sc.line_total), 0) > 0
             THEN ((COALESCE(SUM(sc.line_total), 0) - COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0)) / COALESCE(SUM(sc.line_total), 0) * 100)::double precision
           ELSE 0::double precision
         END AS margin_pct
       FROM scoped_sales sc
       JOIN ims.items i ON i.item_id = sc.item_id
      WHERE i.branch_id = $1
        ${itemFilter}
      GROUP BY i.item_id, i.name
      HAVING COALESCE(SUM(sc.quantity), 0) > 0
      ORDER BY gross_profit DESC, sales_amount DESC, i.name
      LIMIT 500`,
      params
    );
  },

  async getProfitByCustomer(
    branchId: number,
    fromDate: string,
    toDate: string,
    customerId?: number,
    itemId?: number,
    storeId?: number
  ): Promise<ProfitByCustomerRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let salesFilter = '';
    let itemFilter = '';
    if (customerId) {
      params.push(customerId);
      salesFilter += ` AND s.customer_id = $${params.length}`;
    }
    if (storeId) {
      const hasStoreId = await resolveColumnExists('sales', 'store_id');
      if (hasStoreId) {
        params.push(storeId);
        salesFilter += ` AND s.store_id = $${params.length}`;
      }
    }
    if (itemId) {
      params.push(itemId);
      itemFilter = `AND m.item_id = $${params.length}`;
    }

    return queryMany<ProfitByCustomerRow>(
      `WITH sale_item_map AS (
         SELECT
           si.sale_id,
           COALESCE(
             (to_jsonb(si) ->> 'product_id')::bigint,
             (to_jsonb(si) ->> 'item_id')::bigint
           ) AS item_id,
           COALESCE((to_jsonb(si) ->> 'quantity')::numeric, 0) AS quantity,
           COALESCE((to_jsonb(si) ->> 'line_total')::numeric, 0) AS line_total
         FROM ims.sale_items si
       ),
       scoped_sales AS (
         SELECT
           s.customer_id,
           COALESCE(c.full_name, 'Walk-in Customer') AS customer_name,
           m.item_id,
           m.quantity,
           m.line_total
         FROM sale_item_map m
         JOIN ims.sales s ON s.sale_id = m.sale_id
         LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
        WHERE s.branch_id = $1
          AND s.status <> 'void'
          AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
          AND s.sale_date::date BETWEEN $2::date AND $3::date
          ${salesFilter}
          ${itemFilter}
       )
       SELECT
         COALESCE(sc.customer_id, 0)::bigint AS customer_id,
         COALESCE(sc.customer_name, 'Walk-in Customer') AS customer_name,
         COALESCE(SUM(sc.quantity), 0)::double precision AS quantity_sold,
         COALESCE(SUM(sc.line_total), 0)::double precision AS sales_amount,
         COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0)::double precision AS cost_amount,
         (COALESCE(SUM(sc.line_total), 0) - COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0))::double precision AS gross_profit,
         CASE
           WHEN COALESCE(SUM(sc.line_total), 0) > 0
             THEN ((COALESCE(SUM(sc.line_total), 0) - COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0)) / COALESCE(SUM(sc.line_total), 0) * 100)::double precision
           ELSE 0::double precision
         END AS margin_pct
       FROM scoped_sales sc
       JOIN ims.items i ON i.item_id = sc.item_id
      WHERE i.branch_id = $1
      GROUP BY COALESCE(sc.customer_id, 0), COALESCE(sc.customer_name, 'Walk-in Customer')
      HAVING COALESCE(SUM(sc.quantity), 0) > 0
      ORDER BY gross_profit DESC, sales_amount DESC, customer_name
      LIMIT 500`,
      params
    );
  },

  async getProfitByStore(
    branchId: number,
    fromDate: string,
    toDate: string,
    customerId?: number,
    itemId?: number
  ): Promise<ProfitByStoreRow[]> {
    const hasStoreId = await resolveColumnExists('sales', 'store_id');
    if (!hasStoreId) return [];

    const params: Array<number | string> = [branchId, fromDate, toDate];
    let salesFilter = '';
    let itemFilter = '';
    if (customerId) {
      params.push(customerId);
      salesFilter += ` AND s.customer_id = $${params.length}`;
    }
    if (itemId) {
      params.push(itemId);
      itemFilter = `AND m.item_id = $${params.length}`;
    }

    return queryMany<ProfitByStoreRow>(
      `WITH sale_item_map AS (
         SELECT
           si.sale_id,
           COALESCE(
             (to_jsonb(si) ->> 'product_id')::bigint,
             (to_jsonb(si) ->> 'item_id')::bigint
           ) AS item_id,
           COALESCE((to_jsonb(si) ->> 'quantity')::numeric, 0) AS quantity,
           COALESCE((to_jsonb(si) ->> 'line_total')::numeric, 0) AS line_total
         FROM ims.sale_items si
       ),
       scoped_sales AS (
         SELECT
           s.store_id,
           m.item_id,
           m.quantity,
           m.line_total
         FROM sale_item_map m
         JOIN ims.sales s ON s.sale_id = m.sale_id
        WHERE s.branch_id = $1
          AND s.status <> 'void'
          AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
          AND s.sale_date::date BETWEEN $2::date AND $3::date
          ${salesFilter}
          ${itemFilter}
       )
       SELECT
         COALESCE(sc.store_id, 0)::bigint AS store_id,
         COALESCE(st.store_name, 'Unassigned Store') AS store_name,
         COALESCE(SUM(sc.quantity), 0)::double precision AS quantity_sold,
         COALESCE(SUM(sc.line_total), 0)::double precision AS sales_amount,
         COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0)::double precision AS cost_amount,
         (COALESCE(SUM(sc.line_total), 0) - COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0))::double precision AS gross_profit,
         CASE
           WHEN COALESCE(SUM(sc.line_total), 0) > 0
             THEN ((COALESCE(SUM(sc.line_total), 0) - COALESCE(SUM(sc.quantity * COALESCE(i.cost_price, 0)), 0)) / COALESCE(SUM(sc.line_total), 0) * 100)::double precision
           ELSE 0::double precision
         END AS margin_pct
       FROM scoped_sales sc
       JOIN ims.items i ON i.item_id = sc.item_id
       LEFT JOIN ims.stores st ON st.store_id = sc.store_id
      WHERE i.branch_id = $1
      GROUP BY COALESCE(sc.store_id, 0), COALESCE(st.store_name, 'Unassigned Store')
      HAVING COALESCE(SUM(sc.quantity), 0) > 0
      ORDER BY gross_profit DESC, sales_amount DESC, store_name
      LIMIT 500`,
      params
    );
  },

  async getExpenseSummary(branchId: number, fromDate: string, toDate: string): Promise<ExpenseSummaryRow[]> {
    const rows = await queryMany<ExpenseSummaryRow>(
      `WITH charge_scope AS (
         SELECT
           ec.exp_id,
           COUNT(*)::int AS charges_count,
           COALESCE(SUM(ec.amount), 0)::double precision AS total_charged,
           MAX(ec.charge_date)::text AS last_charge_date
         FROM ims.expense_charges ec
        WHERE ec.branch_id = $1
          AND ec.charge_date::date BETWEEN $2::date AND $3::date
          AND NOT ${openingExpensePredicate('ec')}
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
          AND NOT ${openingExpensePredicate('ec')}
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

    const [payrollSummary, payrollPaidRow] = await Promise.all([
      queryOne<{ charges_count: number; total_charged: number; last_charge_date: string | null }>(
        `SELECT
           COUNT(*)::int AS charges_count,
           COALESCE(SUM(pl.net_salary), 0)::double precision AS total_charged,
           MAX(pr.period_to)::text AS last_charge_date
         FROM ims.payroll_lines pl
         JOIN ims.payroll_runs pr
           ON pr.payroll_id = pl.payroll_id
          AND pr.branch_id = pl.branch_id
        WHERE pl.branch_id = $1
          AND COALESCE(pr.status::text, 'draft') <> 'void'
          AND pr.period_to::date BETWEEN $2::date AND $3::date`,
        [branchId, fromDate, toDate]
      ),
      queryOne<{ total_paid: number }>(
        `SELECT COALESCE(SUM(ep.amount_paid), 0)::double precision AS total_paid
           FROM ims.employee_payments ep
          WHERE ep.branch_id = $1
            AND ep.pay_date::date BETWEEN $2::date AND $3::date`,
        [branchId, fromDate, toDate]
      ),
    ]);

    const payrollCharged = Number(payrollSummary?.total_charged || 0);
    const payrollPaid = Number(payrollPaidRow?.total_paid || 0);
    const payrollChargesCount = Number(payrollSummary?.charges_count || 0);
    const payrollOutstanding = Math.max(payrollCharged - payrollPaid, 0);

    if (payrollCharged !== 0 || payrollPaid !== 0 || payrollChargesCount !== 0) {
      rows.unshift({
        exp_id: 0,
        expense_name: 'Payroll',
        charges_count: payrollChargesCount,
        total_charged: payrollCharged,
        total_paid: payrollPaid,
        outstanding_amount: payrollOutstanding,
        last_charge_date: payrollSummary?.last_charge_date || null,
      });
    }

    return rows;
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
      `WITH accounts_norm AS (
         SELECT
           a.branch_id,
           COALESCE(
             NULLIF(to_jsonb(a) ->> 'acc_id', '')::bigint,
             NULLIF(to_jsonb(a) ->> 'account_id', '')::bigint
           ) AS acc_id,
           COALESCE(
             NULLIF(BTRIM(to_jsonb(a) ->> 'name'), ''),
             NULLIF(BTRIM(to_jsonb(a) ->> 'account_name'), ''),
             ''
           ) AS name
         FROM ims.accounts a
       ),
       unified_receipts AS (
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
          LEFT JOIN accounts_norm a
            ON a.acc_id = COALESCE(
              NULLIF(to_jsonb(r) ->> 'acc_id', '')::bigint,
              NULLIF(to_jsonb(r) ->> 'account_id', '')::bigint
            )
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
          LEFT JOIN accounts_norm a
            ON a.acc_id = COALESCE(
              NULLIF(to_jsonb(sp) ->> 'acc_id', '')::bigint,
              NULLIF(to_jsonb(sp) ->> 'account_id', '')::bigint
            )
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
      ORDER BY receipt_date ASC, receipt_id ASC
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
    let supplierFilterPayments = '';
    let supplierFilterReceipts = '';
    if (supplierId) {
      params.push(supplierId);
      supplierFilterPayments = `AND p.supplier_id = $${params.length}`;
      supplierFilterReceipts = `AND sr.supplier_id = $${params.length}`;
    }

    return queryMany<SupplierPaymentRow>(
      `WITH accounts_norm AS (
         SELECT
           a.branch_id,
           COALESCE(
             NULLIF(to_jsonb(a) ->> 'acc_id', '')::bigint,
             NULLIF(to_jsonb(a) ->> 'account_id', '')::bigint
           ) AS acc_id,
           COALESCE(
             NULLIF(BTRIM(to_jsonb(a) ->> 'name'), ''),
             NULLIF(BTRIM(to_jsonb(a) ->> 'account_name'), ''),
             ''
           ) AS name
         FROM ims.accounts a
       ),
       unified_supplier_payments AS (
         SELECT
           sp.sup_payment_id::bigint AS sup_payment_id,
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
          LEFT JOIN accounts_norm a
            ON a.acc_id = COALESCE(
              NULLIF(to_jsonb(sp) ->> 'acc_id', '')::bigint,
              NULLIF(to_jsonb(sp) ->> 'account_id', '')::bigint
            )
         WHERE sp.branch_id = $1
           AND sp.pay_date::date BETWEEN $2::date AND $3::date
           ${supplierFilterPayments}

         UNION ALL

         SELECT
           sr.receipt_id::bigint AS sup_payment_id,
           sr.receipt_date::text AS pay_date,
           sr.purchase_id,
           sr.supplier_id,
           COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
           COALESCE(a.name, 'N/A') AS account_name,
           COALESCE(sr.amount, 0)::double precision AS amount_paid,
           COALESCE(sr.reference_no, '') AS reference_no,
           CASE
             WHEN COALESCE(sr.note, '') = '' THEN '[Supplier Receipt]'
             ELSE '[Supplier Receipt] ' || sr.note
           END AS note
          FROM ims.supplier_receipts sr
          LEFT JOIN ims.suppliers s ON s.supplier_id = sr.supplier_id
          LEFT JOIN accounts_norm a
            ON a.acc_id = COALESCE(
              NULLIF(to_jsonb(sr) ->> 'acc_id', '')::bigint,
              NULLIF(to_jsonb(sr) ->> 'account_id', '')::bigint
            )
         WHERE sr.branch_id = $1
           AND sr.receipt_date::date BETWEEN $2::date AND $3::date
           ${supplierFilterReceipts}
      )
      SELECT
        sup_payment_id,
        pay_date,
        purchase_id,
        supplier_id,
        supplier_name,
        account_name,
        amount_paid,
        reference_no,
        note
      FROM unified_supplier_payments
      ORDER BY pay_date ASC, sup_payment_id ASC
      LIMIT 4000`,
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
      `${normalizedAccountTransactionsCte}
      SELECT
         at.txn_id,
         at.txn_date::text AS txn_date,
         at.acc_id AS account_id,
         COALESCE(a.name, 'N/A') AS account_name,
         at.txn_type AS txn_type,
         COALESCE(at.ref_table, '') AS ref_table,
         at.ref_id,
         COALESCE(at.debit, 0)::double precision AS debit,
         COALESCE(at.credit, 0)::double precision AS credit,
         (COALESCE(at.credit, 0) - COALESCE(at.debit, 0))::double precision AS net_effect,
         COALESCE(at.note, '') AS note
       FROM normalized_txn at
        LEFT JOIN accounts_norm a ON a.acc_id = at.acc_id
       WHERE at.txn_date::date BETWEEN $2::date AND $3::date
         ${filter}
       ORDER BY at.txn_date ASC, at.sort_id ASC, at.txn_id ASC
       LIMIT 3000`,
      params
    );
  },
};
