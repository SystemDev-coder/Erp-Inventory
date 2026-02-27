import { queryMany } from '../../../db/query';

export interface CustomerReportOption {
  id: number;
  label: string;
}

export interface CustomerListRow {
  customer_id: number;
  full_name: string;
  phone: string;
  customer_type: string;
  registered_date: string;
  balance: number;
  status: string;
}

export interface CustomerLedgerRow {
  cust_ledger_id: number;
  entry_date: string;
  customer_id: number;
  customer_name: string;
  entry_type: string;
  ref_table: string;
  ref_id: number | null;
  debit: number;
  credit: number;
  running_balance: number;
  note: string;
}

export interface OutstandingBalanceRow {
  customer_id: number;
  customer_name: string;
  phone: string;
  total_debit: number;
  total_credit: number;
  outstanding_balance: number;
}

export interface TopCustomerRow {
  customer_id: number;
  customer_name: string;
  sales_count: number;
  net_sales: number;
  total_receipts: number;
  outstanding_balance: number;
}

export interface CustomerPaymentHistoryRow {
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

export interface CreditCustomerRow {
  customer_id: number;
  customer_name: string;
  phone: string;
  customer_type: string;
  current_credit: number;
  status: string;
}

export interface NewCustomerRow {
  customer_id: number;
  full_name: string;
  phone: string;
  customer_type: string;
  registered_date: string;
  opening_balance: number;
  current_balance: number;
}

export interface CustomerActivityRow {
  customer_id: number;
  customer_name: string;
  sales_count: number;
  returns_count: number;
  receipts_count: number;
  gross_sales: number;
  sales_returns: number;
  total_receipts: number;
  net_exposure: number;
}

type CustomerBalanceColumn = 'open_balance' | 'remaining_balance';

let customerBalanceColumnCache: CustomerBalanceColumn | null = null;

const resolveCustomerBalanceColumn = async (): Promise<CustomerBalanceColumn> => {
  if (customerBalanceColumnCache) return customerBalanceColumnCache;

  const cols = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'customers'`
  );
  const names = new Set(cols.map((row) => row.column_name));
  customerBalanceColumnCache = names.has('remaining_balance') ? 'remaining_balance' : 'open_balance';
  return customerBalanceColumnCache;
};

export const customerReportsService = {
  async getCustomerReportOptions(branchId: number): Promise<{ customers: CustomerReportOption[] }> {
    const customers = await queryMany<CustomerReportOption>(
      `SELECT customer_id AS id, full_name AS label
         FROM ims.customers
        WHERE branch_id = $1
          AND is_active = TRUE
        ORDER BY full_name`,
      [branchId]
    );

    return { customers };
  },

  async getCustomerList(branchId: number, customerId?: number): Promise<CustomerListRow[]> {
    const balanceColumn = await resolveCustomerBalanceColumn();
    const params: Array<number> = [branchId];
    let filter = '';

    if (customerId) {
      params.push(customerId);
      filter = `AND c.customer_id = $${params.length}`;
    }

    return queryMany<CustomerListRow>(
      `SELECT
         c.customer_id,
         c.full_name,
         COALESCE(c.phone, '') AS phone,
         COALESCE(c.customer_type, 'regular') AS customer_type,
         c.registered_date::text AS registered_date,
         COALESCE(c.${balanceColumn}, 0)::double precision AS balance,
         CASE WHEN c.is_active THEN 'Active' ELSE 'Inactive' END AS status
       FROM ims.customers c
      WHERE c.branch_id = $1
        ${filter}
      ORDER BY c.full_name
      LIMIT 2000`,
      params
    );
  },

  async getCustomerLedger(
    branchId: number,
    fromDate: string,
    toDate: string,
    customerId?: number
  ): Promise<CustomerLedgerRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';

    if (customerId) {
      params.push(customerId);
      filter = `AND l.customer_id = $${params.length}`;
    }

    return queryMany<CustomerLedgerRow>(
      `WITH scoped AS (
         SELECT
           l.cust_ledger_id,
           l.entry_date,
           l.customer_id,
           COALESCE(c.full_name, 'Unknown Customer') AS customer_name,
           COALESCE(l.entry_type::text, 'sale') AS entry_type,
           COALESCE(l.ref_table, '') AS ref_table,
           l.ref_id,
           COALESCE(l.debit, 0)::double precision AS debit,
           COALESCE(l.credit, 0)::double precision AS credit,
           COALESCE(l.note, '') AS note
         FROM ims.customer_ledger l
         LEFT JOIN ims.customers c ON c.customer_id = l.customer_id
        WHERE l.branch_id = $1
          AND l.entry_date::date BETWEEN $2::date AND $3::date
          ${filter}
      )
      SELECT
        scoped.cust_ledger_id,
        scoped.entry_date::text AS entry_date,
        scoped.customer_id,
        scoped.customer_name,
        scoped.entry_type,
        scoped.ref_table,
        scoped.ref_id,
        scoped.debit,
        scoped.credit,
        SUM(scoped.debit - scoped.credit)
          OVER (
            PARTITION BY scoped.customer_id
            ORDER BY scoped.entry_date, scoped.cust_ledger_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )::double precision AS running_balance,
        scoped.note
      FROM scoped
      ORDER BY scoped.entry_date DESC, scoped.cust_ledger_id DESC
      LIMIT 4000`,
      params
    );
  },

  async getOutstandingBalances(branchId: number, customerId?: number): Promise<OutstandingBalanceRow[]> {
    const balanceColumn = await resolveCustomerBalanceColumn();
    const params: Array<number> = [branchId];
    let filter = '';

    if (customerId) {
      params.push(customerId);
      filter = `AND c.customer_id = $${params.length}`;
    }

    return queryMany<OutstandingBalanceRow>(
      `WITH ledger AS (
         SELECT
           l.customer_id,
           COALESCE(SUM(l.debit), 0)::double precision AS total_debit,
           COALESCE(SUM(l.credit), 0)::double precision AS total_credit,
           COALESCE(SUM(l.debit - l.credit), 0)::double precision AS ledger_balance
         FROM ims.customer_ledger l
        WHERE l.branch_id = $1
        GROUP BY l.customer_id
      )
      SELECT
        c.customer_id,
        c.full_name AS customer_name,
        COALESCE(c.phone, '') AS phone,
        COALESCE(l.total_debit, 0)::double precision AS total_debit,
        COALESCE(l.total_credit, 0)::double precision AS total_credit,
        GREATEST(COALESCE(c.${balanceColumn}, 0), COALESCE(l.ledger_balance, 0), 0)::double precision AS outstanding_balance
      FROM ims.customers c
      LEFT JOIN ledger l ON l.customer_id = c.customer_id
      WHERE c.branch_id = $1
        ${filter}
        AND GREATEST(COALESCE(c.${balanceColumn}, 0), COALESCE(l.ledger_balance, 0), 0) > 0
      ORDER BY outstanding_balance DESC, c.full_name
      LIMIT 2000`,
      params
    );
  },

  async getTopCustomers(branchId: number, fromDate: string, toDate: string): Promise<TopCustomerRow[]> {
    return queryMany<TopCustomerRow>(
      `WITH sales_scope AS (
         SELECT
           s.customer_id,
           COUNT(*)::int AS sales_count,
           COALESCE(SUM(s.total), 0)::double precision AS gross_sales
         FROM ims.sales s
        WHERE s.branch_id = $1
          AND s.customer_id IS NOT NULL
          AND s.sale_date::date BETWEEN $2::date AND $3::date
          AND LOWER(COALESCE(s.status::text, '')) <> 'void'
          AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
        GROUP BY s.customer_id
      ),
      returns_scope AS (
        SELECT
          sr.customer_id,
          COALESCE(SUM(sr.total), 0)::double precision AS sales_returns
        FROM ims.sales_returns sr
        WHERE sr.branch_id = $1
          AND sr.customer_id IS NOT NULL
          AND sr.return_date::date BETWEEN $2::date AND $3::date
        GROUP BY sr.customer_id
      ),
      receipt_scope AS (
        SELECT
          cr.customer_id,
          COALESCE(SUM(cr.amount), 0)::double precision AS total_receipts
        FROM ims.customer_receipts cr
        WHERE cr.branch_id = $1
          AND cr.customer_id IS NOT NULL
          AND cr.receipt_date::date BETWEEN $2::date AND $3::date
        GROUP BY cr.customer_id
      )
      SELECT
        c.customer_id,
        c.full_name AS customer_name,
        COALESCE(ss.sales_count, 0) AS sales_count,
        (COALESCE(ss.gross_sales, 0) - COALESCE(rs.sales_returns, 0))::double precision AS net_sales,
        COALESCE(rc.total_receipts, 0)::double precision AS total_receipts,
        GREATEST((COALESCE(ss.gross_sales, 0) - COALESCE(rs.sales_returns, 0)) - COALESCE(rc.total_receipts, 0), 0)::double precision AS outstanding_balance
      FROM ims.customers c
      LEFT JOIN sales_scope ss ON ss.customer_id = c.customer_id
      LEFT JOIN returns_scope rs ON rs.customer_id = c.customer_id
      LEFT JOIN receipt_scope rc ON rc.customer_id = c.customer_id
      WHERE c.branch_id = $1
        AND (
          COALESCE(ss.sales_count, 0) > 0 OR
          COALESCE(rs.sales_returns, 0) > 0 OR
          COALESCE(rc.total_receipts, 0) > 0
        )
      ORDER BY net_sales DESC, total_receipts DESC, c.full_name
      LIMIT 200`,
      [branchId, fromDate, toDate]
    );
  },

  async getCustomerPaymentHistory(
    branchId: number,
    fromDate: string,
    toDate: string,
    customerId?: number
  ): Promise<CustomerPaymentHistoryRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';

    if (customerId) {
      params.push(customerId);
      filter = `AND cr.customer_id = $${params.length}`;
    }

    return queryMany<CustomerPaymentHistoryRow>(
      `SELECT
         cr.receipt_id,
         cr.receipt_date::text AS receipt_date,
         cr.customer_id,
         COALESCE(c.full_name, 'Walk-in') AS customer_name,
         cr.sale_id,
         COALESCE(a.name, 'N/A') AS account_name,
         COALESCE(cr.amount, 0)::double precision AS amount,
         COALESCE(cr.payment_method, '') AS payment_method,
         COALESCE(cr.reference_no, '') AS reference_no,
         COALESCE(cr.note, '') AS note
       FROM ims.customer_receipts cr
       LEFT JOIN ims.customers c ON c.customer_id = cr.customer_id
       LEFT JOIN ims.accounts a ON a.acc_id = cr.acc_id
      WHERE cr.branch_id = $1
        AND cr.receipt_date::date BETWEEN $2::date AND $3::date
        ${filter}
      ORDER BY cr.receipt_date DESC, cr.receipt_id DESC
      LIMIT 3000`,
      params
    );
  },

  async getCreditCustomers(branchId: number, customerId?: number): Promise<CreditCustomerRow[]> {
    const balanceColumn = await resolveCustomerBalanceColumn();
    const params: Array<number> = [branchId];
    let filter = '';

    if (customerId) {
      params.push(customerId);
      filter = `AND c.customer_id = $${params.length}`;
    }

    return queryMany<CreditCustomerRow>(
      `WITH ledger AS (
         SELECT
           l.customer_id,
           COALESCE(SUM(l.debit - l.credit), 0)::double precision AS ledger_balance
         FROM ims.customer_ledger l
        WHERE l.branch_id = $1
        GROUP BY l.customer_id
      )
      SELECT
        c.customer_id,
        c.full_name AS customer_name,
        COALESCE(c.phone, '') AS phone,
        COALESCE(c.customer_type, 'regular') AS customer_type,
        GREATEST(COALESCE(c.${balanceColumn}, 0), COALESCE(l.ledger_balance, 0), 0)::double precision AS current_credit,
        CASE WHEN c.is_active THEN 'Active' ELSE 'Inactive' END AS status
      FROM ims.customers c
      LEFT JOIN ledger l ON l.customer_id = c.customer_id
      WHERE c.branch_id = $1
        ${filter}
        AND GREATEST(COALESCE(c.${balanceColumn}, 0), COALESCE(l.ledger_balance, 0), 0) > 0
      ORDER BY current_credit DESC, c.full_name
      LIMIT 2000`,
      params
    );
  },

  async getNewCustomers(branchId: number, fromDate: string, toDate: string): Promise<NewCustomerRow[]> {
    const balanceColumn = await resolveCustomerBalanceColumn();
    return queryMany<NewCustomerRow>(
      `WITH ledger AS (
         SELECT
           l.customer_id,
           COALESCE(SUM(l.debit - l.credit), 0)::double precision AS ledger_balance
         FROM ims.customer_ledger l
        WHERE l.branch_id = $1
        GROUP BY l.customer_id
      )
      SELECT
        c.customer_id,
        c.full_name,
        COALESCE(c.phone, '') AS phone,
        COALESCE(c.customer_type, 'regular') AS customer_type,
        c.registered_date::text AS registered_date,
        COALESCE(c.${balanceColumn}, 0)::double precision AS opening_balance,
        GREATEST(COALESCE(c.${balanceColumn}, 0), COALESCE(l.ledger_balance, 0), 0)::double precision AS current_balance
      FROM ims.customers c
      LEFT JOIN ledger l ON l.customer_id = c.customer_id
      WHERE c.branch_id = $1
        AND c.registered_date::date BETWEEN $2::date AND $3::date
      ORDER BY c.registered_date DESC, c.customer_id DESC`,
      [branchId, fromDate, toDate]
    );
  },

  async getCustomerActivity(
    branchId: number,
    fromDate: string,
    toDate: string,
    customerId?: number
  ): Promise<CustomerActivityRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let customerFilter = '';

    if (customerId) {
      params.push(customerId);
      customerFilter = `AND c.customer_id = $${params.length}`;
    }

    return queryMany<CustomerActivityRow>(
      `WITH sales_scope AS (
         SELECT
           s.customer_id,
           COUNT(*)::int AS sales_count,
           COALESCE(SUM(s.total), 0)::double precision AS gross_sales
         FROM ims.sales s
        WHERE s.branch_id = $1
          AND s.customer_id IS NOT NULL
          AND s.sale_date::date BETWEEN $2::date AND $3::date
          AND LOWER(COALESCE(s.status::text, '')) <> 'void'
          AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'
        GROUP BY s.customer_id
      ),
      returns_scope AS (
        SELECT
          sr.customer_id,
          COUNT(*)::int AS returns_count,
          COALESCE(SUM(sr.total), 0)::double precision AS sales_returns
        FROM ims.sales_returns sr
        WHERE sr.branch_id = $1
          AND sr.customer_id IS NOT NULL
          AND sr.return_date::date BETWEEN $2::date AND $3::date
        GROUP BY sr.customer_id
      ),
      receipt_scope AS (
        SELECT
          cr.customer_id,
          COUNT(*)::int AS receipts_count,
          COALESCE(SUM(cr.amount), 0)::double precision AS total_receipts
        FROM ims.customer_receipts cr
        WHERE cr.branch_id = $1
          AND cr.customer_id IS NOT NULL
          AND cr.receipt_date::date BETWEEN $2::date AND $3::date
        GROUP BY cr.customer_id
      )
      SELECT
        c.customer_id,
        c.full_name AS customer_name,
        COALESCE(ss.sales_count, 0) AS sales_count,
        COALESCE(rs.returns_count, 0) AS returns_count,
        COALESCE(rc.receipts_count, 0) AS receipts_count,
        COALESCE(ss.gross_sales, 0)::double precision AS gross_sales,
        COALESCE(rs.sales_returns, 0)::double precision AS sales_returns,
        COALESCE(rc.total_receipts, 0)::double precision AS total_receipts,
        (COALESCE(ss.gross_sales, 0) - COALESCE(rs.sales_returns, 0) - COALESCE(rc.total_receipts, 0))::double precision AS net_exposure
      FROM ims.customers c
      LEFT JOIN sales_scope ss ON ss.customer_id = c.customer_id
      LEFT JOIN returns_scope rs ON rs.customer_id = c.customer_id
      LEFT JOIN receipt_scope rc ON rc.customer_id = c.customer_id
      WHERE c.branch_id = $1
        ${customerFilter}
        AND (
          COALESCE(ss.sales_count, 0) > 0 OR
          COALESCE(rs.returns_count, 0) > 0 OR
          COALESCE(rc.receipts_count, 0) > 0
        )
      ORDER BY COALESCE(ss.gross_sales, 0) DESC, c.full_name
      LIMIT 2000`,
      params
    );
  },
};
