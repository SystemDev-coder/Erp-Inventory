import { queryMany } from '../../../db/query';

export interface ReportOption {
  id: number;
  label: string;
}

const nonQuotationSalesWhere = `COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') <> 'quotation'`;

export interface DailySalesRow {
  sale_id: number;
  sale_date: string;
  customer_name: string;
  cashier_name: string;
  total: number;
  status: string;
}

export interface SalesByCustomerRow {
  sale_id: number;
  sale_date: string;
  customer_name: string;
  cashier_name: string;
  total: number;
  status: string;
}

export interface SalesByProductRow {
  sale_id: number;
  sale_date: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  customer_name: string;
  cashier_name: string;
}

export interface TopSellingItemRow {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  sales_amount: number;
  sales_count: number;
}

export interface SalesReturnRow {
  return_id: number;
  return_date: string;
  sale_id: number | null;
  customer_name: string;
  cashier_name: string;
  subtotal: number;
  total: number;
  note: string;
}

export interface CashierPerformanceRow {
  user_id: number;
  cashier_name: string;
  sales_count: number;
  gross_sales: number;
  returns_count: number;
  returns_total: number;
  net_sales: number;
}

export interface SalesSummaryRow {
  metric: string;
  kind: 'money' | 'count';
  value: number;
}

export interface InvoiceStatusRow {
  sale_id: number;
  sale_date: string;
  customer_name: string;
  cashier_name: string;
  sale_type: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
}

export interface SalesByStoreRow {
  store_id: number | null;
  store_name: string;
  quantity_sold: number;
  sales_amount: number;
  sales_count: number;
}

export interface PaymentByAccountRow {
  acc_id: number;
  account_name: string;
  sales_count: number;
  payment_count: number;
  amount_paid: number;
}

export interface QuotationRow {
  quotation_id: number;
  quotation_date: string;
  valid_until: string | null;
  customer_name: string;
  cashier_name: string;
  total: number;
  status: string;
  note: string;
}

export interface TopCustomerRow {
  customer_id: number | null;
  customer_name: string;
  invoice_count: number;
  quantity: number;
  sales_total: number;
  returns_total: number;
  net_sales: number;
}

export const salesReportsService = {
  async getSalesReportOptions(branchId: number): Promise<{ customers: ReportOption[]; products: ReportOption[]; stores: ReportOption[] }> {
    const [customers, products, stores] = await Promise.all([
      queryMany<ReportOption>(
        `SELECT customer_id AS id, full_name AS label
           FROM ims.customers
           WHERE branch_id = $1
             AND is_active = TRUE
           ORDER BY customer_id ASC`,
        [branchId]
      ),
      queryMany<ReportOption>(
        `SELECT item_id AS id, name AS label
           FROM ims.items
           WHERE branch_id = $1
             AND is_active = TRUE
           ORDER BY item_id ASC`,
        [branchId]
      ),
      queryMany<ReportOption>(
        `SELECT store_id AS id, store_name AS label
           FROM ims.stores
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY store_id ASC`,
        [branchId]
      ),
    ]);

    return { customers, products, stores };
  },

  async getSalesSummary(branchId: number, fromDate: string, toDate: string): Promise<SalesSummaryRow[]> {
    return queryMany<SalesSummaryRow>(
      `WITH sales_base AS (
         SELECT
           COUNT(*)::int AS invoice_count,
           COALESCE(SUM(s.subtotal), 0)::double precision AS gross_sales,
           COALESCE(SUM(s.discount), 0)::double precision AS discount_total,
           COALESCE(SUM(s.tax_amount), 0)::double precision AS tax_total,
           COALESCE(SUM(s.total), 0)::double precision AS net_sales,
           COALESCE(SUM(CASE WHEN s.sale_type = 'cash' THEN s.total ELSE 0 END), 0)::double precision AS cash_sales,
           COALESCE(SUM(CASE WHEN s.sale_type = 'credit' THEN s.total ELSE 0 END), 0)::double precision AS credit_sales,
           COALESCE(COUNT(*) FILTER (WHERE s.status = 'paid'), 0)::int AS paid_count,
           COALESCE(COUNT(*) FILTER (WHERE s.status = 'partial'), 0)::int AS partial_count,
           COALESCE(COUNT(*) FILTER (WHERE s.status = 'unpaid'), 0)::int AS unpaid_count
         FROM ims.sales s
        WHERE s.branch_id = $1
          AND s.status <> 'void'
          AND ${nonQuotationSalesWhere}
          AND s.sale_date::date BETWEEN $2::date AND $3::date
       ),
       returns_base AS (
         SELECT
           COUNT(*)::int AS returns_count,
           COALESCE(SUM(sr.total), 0)::double precision AS returns_total
         FROM ims.sales_returns sr
        WHERE sr.branch_id = $1
          AND sr.return_date::date BETWEEN $2::date AND $3::date
       )
       SELECT *
       FROM (
         VALUES
           ('Invoices', 'count', (SELECT invoice_count::double precision FROM sales_base)),
           ('Gross Sales (Subtotal)', 'money', (SELECT gross_sales FROM sales_base)),
           ('Discount', 'money', (SELECT discount_total FROM sales_base)),
           ('Tax', 'money', (SELECT tax_total FROM sales_base)),
           ('Net Sales', 'money', (SELECT net_sales FROM sales_base)),
           ('Sales Returns', 'money', (SELECT returns_total FROM returns_base)),
           ('Net After Returns', 'money', (SELECT (sales_base.net_sales - returns_base.returns_total)::double precision FROM sales_base, returns_base)),
           ('Average Invoice', 'money', (SELECT CASE WHEN invoice_count > 0 THEN (net_sales / invoice_count)::double precision ELSE 0 END FROM sales_base)),
           ('Cash Sales', 'money', (SELECT cash_sales FROM sales_base)),
           ('Credit Sales', 'money', (SELECT credit_sales FROM sales_base)),
           ('Paid Invoices', 'count', (SELECT paid_count::double precision FROM sales_base)),
           ('Partial Invoices', 'count', (SELECT partial_count::double precision FROM sales_base)),
           ('Unpaid Invoices', 'count', (SELECT unpaid_count::double precision FROM sales_base)),
           ('Returns Count', 'count', (SELECT returns_count::double precision FROM returns_base))
       ) AS t(metric, kind, value)
       ORDER BY
         CASE metric
           WHEN 'Invoices' THEN 1
           WHEN 'Gross Sales (Subtotal)' THEN 2
           WHEN 'Discount' THEN 3
           WHEN 'Tax' THEN 4
           WHEN 'Net Sales' THEN 5
           WHEN 'Sales Returns' THEN 6
           WHEN 'Net After Returns' THEN 7
           WHEN 'Average Invoice' THEN 8
           WHEN 'Cash Sales' THEN 9
           WHEN 'Credit Sales' THEN 10
           WHEN 'Paid Invoices' THEN 11
           WHEN 'Partial Invoices' THEN 12
           WHEN 'Unpaid Invoices' THEN 13
           WHEN 'Returns Count' THEN 14
           ELSE 99
         END`,
      [branchId, fromDate, toDate]
    );
  },

  async getInvoiceStatus(
    branchId: number,
    fromDate: string,
    toDate: string,
    status: 'all' | 'paid' | 'partial' | 'unpaid'
  ): Promise<InvoiceStatusRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    const filters: string[] = [
      's.branch_id = $1',
      `s.status <> 'void'`,
      nonQuotationSalesWhere,
      's.sale_date::date BETWEEN $2::date AND $3::date',
    ];

    if (status !== 'all') {
      params.push(status);
      filters.push(`LOWER(COALESCE(s.status::text, '')) = $${params.length}`);
    }

    return queryMany<InvoiceStatusRow>(
      `WITH pay_sum AS (
         SELECT
           sp.sale_id,
           COALESCE(SUM(sp.amount_paid), 0)::double precision AS paid
         FROM ims.sale_payments sp
        WHERE sp.branch_id = $1
          AND sp.pay_date::date <= $3::date
        GROUP BY sp.sale_id
       )
       SELECT
         s.sale_id,
         s.sale_date::text AS sale_date,
         COALESCE(c.full_name, 'Walk-in') AS customer_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS cashier_name,
         COALESCE(s.sale_type::text, 'cash') AS sale_type,
         COALESCE(s.total, 0)::double precision AS total,
         COALESCE(ps.paid, 0)::double precision AS paid,
         GREATEST(COALESCE(s.total, 0) - COALESCE(ps.paid, 0), 0)::double precision AS balance,
         COALESCE(s.status::text, 'unpaid') AS status
       FROM ims.sales s
       LEFT JOIN pay_sum ps ON ps.sale_id = s.sale_id
       LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
       LEFT JOIN ims.users u ON u.user_id = s.user_id
      WHERE ${filters.join(' AND ')}
      ORDER BY s.sale_date ASC, s.sale_id ASC`,
      params
    );
  },

  async getSalesByStore(branchId: number, fromDate: string, toDate: string, storeId?: number): Promise<SalesByStoreRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let storeFilter = '';
    if (storeId) {
      params.push(storeId);
      storeFilter = `AND i.store_id = $${params.length}`;
    }

    return queryMany<SalesByStoreRow>(
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
       )
       SELECT
         i.store_id,
         COALESCE(st.store_name, 'Unassigned') AS store_name,
         COALESCE(SUM(m.quantity), 0)::double precision AS quantity_sold,
         COALESCE(SUM(m.line_total), 0)::double precision AS sales_amount,
         COUNT(DISTINCT s.sale_id)::int AS sales_count
       FROM sale_item_map m
       JOIN ims.sales s ON s.sale_id = m.sale_id
       JOIN ims.items i ON i.item_id = m.item_id
       LEFT JOIN ims.stores st ON st.store_id = i.store_id
      WHERE s.branch_id = $1
        AND s.status <> 'void'
        AND ${nonQuotationSalesWhere}
        AND s.sale_date::date BETWEEN $2::date AND $3::date
        ${storeFilter}
      GROUP BY i.store_id, st.store_name
      HAVING COALESCE(SUM(m.quantity), 0) > 0
      ORDER BY sales_amount DESC, quantity_sold DESC, store_name
      LIMIT 250`,
      params
    );
  },

  async getSalesPaymentsByAccount(branchId: number, fromDate: string, toDate: string): Promise<PaymentByAccountRow[]> {
    return queryMany<PaymentByAccountRow>(
      `SELECT
         a.acc_id,
         COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS account_name,
         COUNT(DISTINCT sp.sale_id)::int AS sales_count,
         COUNT(*)::int AS payment_count,
         COALESCE(SUM(sp.amount_paid), 0)::double precision AS amount_paid
       FROM ims.sale_payments sp
       JOIN ims.sales s ON s.sale_id = sp.sale_id
       JOIN ims.accounts a ON a.acc_id = sp.acc_id
      WHERE sp.branch_id = $1
        AND sp.pay_date::date BETWEEN $2::date AND $3::date
        AND s.status <> 'void'
        AND ${nonQuotationSalesWhere}
      GROUP BY a.acc_id, a.name
      HAVING COALESCE(SUM(sp.amount_paid), 0) > 0
      ORDER BY amount_paid DESC, sales_count DESC, account_name`,
      [branchId, fromDate, toDate]
    );
  },

  async getQuotations(branchId: number, fromDate: string, toDate: string): Promise<QuotationRow[]> {
    return queryMany<QuotationRow>(
      `SELECT
         s.sale_id AS quotation_id,
         s.sale_date::text AS quotation_date,
         s.quote_valid_until::text AS valid_until,
         COALESCE(c.full_name, 'Walk-in') AS customer_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS cashier_name,
         COALESCE(s.total, 0)::double precision AS total,
         COALESCE(s.status::text, 'unpaid') AS status,
         COALESCE(s.note, '') AS note
       FROM ims.sales s
       LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
       LEFT JOIN ims.users u ON u.user_id = s.user_id
      WHERE s.branch_id = $1
        AND COALESCE((to_jsonb(s) ->> 'doc_type'), 'sale') = 'quotation'
        AND s.sale_date::date BETWEEN $2::date AND $3::date
      ORDER BY s.sale_date ASC, s.sale_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getTopCustomers(branchId: number, fromDate: string, toDate: string): Promise<TopCustomerRow[]> {
    return queryMany<TopCustomerRow>(
      `WITH sales_base AS (
         SELECT
           s.sale_id,
           s.customer_id,
           COALESCE(s.total, 0)::double precision AS total
         FROM ims.sales s
        WHERE s.branch_id = $1
          AND s.status <> 'void'
          AND ${nonQuotationSalesWhere}
          AND s.sale_date::date BETWEEN $2::date AND $3::date
       ),
       sale_item_map AS (
         SELECT
           si.sale_id,
           COALESCE(
             (to_jsonb(si) ->> 'product_id')::bigint,
             (to_jsonb(si) ->> 'item_id')::bigint
           ) AS item_id,
           COALESCE((to_jsonb(si) ->> 'quantity')::numeric, 0) AS quantity
         FROM ims.sale_items si
       ),
       qty_by_sale AS (
         SELECT
           m.sale_id,
           COALESCE(SUM(m.quantity), 0)::double precision AS quantity
         FROM sale_item_map m
         GROUP BY m.sale_id
       ),
       returns_base AS (
         SELECT
           sr.customer_id,
           COALESCE(SUM(sr.total), 0)::double precision AS returns_total
         FROM ims.sales_returns sr
        WHERE sr.branch_id = $1
          AND sr.return_date::date BETWEEN $2::date AND $3::date
        GROUP BY sr.customer_id
       )
       SELECT
         sb.customer_id,
         COALESCE(c.full_name, 'Walk-in') AS customer_name,
         COUNT(*)::int AS invoice_count,
         COALESCE(SUM(qs.quantity), 0)::double precision AS quantity,
         COALESCE(SUM(sb.total), 0)::double precision AS sales_total,
         COALESCE(rb.returns_total, 0)::double precision AS returns_total,
         (COALESCE(SUM(sb.total), 0) - COALESCE(rb.returns_total, 0))::double precision AS net_sales
       FROM sales_base sb
       LEFT JOIN ims.customers c ON c.customer_id = sb.customer_id
       LEFT JOIN qty_by_sale qs ON qs.sale_id = sb.sale_id
       LEFT JOIN returns_base rb ON rb.customer_id IS NOT DISTINCT FROM sb.customer_id
      GROUP BY sb.customer_id, c.full_name, rb.returns_total
      HAVING COALESCE(SUM(sb.total), 0) > 0
      ORDER BY net_sales DESC, invoice_count DESC, customer_name
      LIMIT 200`,
      [branchId, fromDate, toDate]
    );
  },

  async getDailySales(branchId: number): Promise<DailySalesRow[]> {
    return queryMany<DailySalesRow>(
      `SELECT
         s.sale_id,
         s.sale_date::text AS sale_date,
         COALESCE(c.full_name, 'Walk-in') AS customer_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS cashier_name,
         COALESCE(s.total, 0)::double precision AS total,
         s.status::text AS status
       FROM ims.sales s
       LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
       LEFT JOIN ims.users u ON u.user_id = s.user_id
      WHERE s.branch_id = $1
        AND s.sale_date::date = CURRENT_DATE
        AND s.status <> 'void'
        AND ${nonQuotationSalesWhere}
      ORDER BY s.sale_date ASC, s.sale_id ASC`,
      [branchId]
    );
  },

  async getSalesByCustomer(branchId: number, customerId?: number): Promise<SalesByCustomerRow[]> {
    const params: Array<number> = [branchId];
    const filters: string[] = ['s.branch_id = $1', `s.status <> 'void'`, nonQuotationSalesWhere];

    if (customerId) {
      params.push(customerId);
      filters.push(`s.customer_id = $${params.length}`);
    }

    return queryMany<SalesByCustomerRow>(
      `SELECT
         s.sale_id,
         s.sale_date::text AS sale_date,
         COALESCE(c.full_name, 'Walk-in') AS customer_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS cashier_name,
         COALESCE(s.total, 0)::double precision AS total,
         s.status::text AS status
       FROM ims.sales s
       LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
       LEFT JOIN ims.users u ON u.user_id = s.user_id
      WHERE ${filters.join(' AND ')}
      ORDER BY s.sale_date ASC, s.sale_id ASC
      LIMIT 1500`,
      params
    );
  },

  async getSalesByProduct(branchId: number, productId?: number): Promise<SalesByProductRow[]> {
    const params: Array<number> = [branchId];
    const filters: string[] = ['s.branch_id = $1', `s.status <> 'void'`, nonQuotationSalesWhere];

    if (productId) {
      params.push(productId);
      filters.push(`i.item_id = $${params.length}`);
    }

    return queryMany<SalesByProductRow>(
      `WITH sale_item_map AS (
         SELECT
           si.sale_item_id,
           si.sale_id,
           COALESCE(
             (to_jsonb(si) ->> 'product_id')::bigint,
             (to_jsonb(si) ->> 'item_id')::bigint
           ) AS item_id,
           COALESCE((to_jsonb(si) ->> 'quantity')::numeric, 0) AS quantity,
           COALESCE((to_jsonb(si) ->> 'unit_price')::numeric, 0) AS unit_price,
           COALESCE((to_jsonb(si) ->> 'line_total')::numeric, 0) AS line_total
         FROM ims.sale_items si
       )
       SELECT
         s.sale_id,
         s.sale_date::text AS sale_date,
         i.item_id AS product_id,
         i.name AS product_name,
         m.quantity::double precision AS quantity,
         m.unit_price::double precision AS unit_price,
         m.line_total::double precision AS line_total,
         COALESCE(c.full_name, 'Walk-in') AS customer_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS cashier_name
       FROM sale_item_map m
       JOIN ims.sales s ON s.sale_id = m.sale_id
       JOIN ims.items i ON i.item_id = m.item_id
      LEFT JOIN ims.customers c ON c.customer_id = s.customer_id
      LEFT JOIN ims.users u ON u.user_id = s.user_id
      WHERE ${filters.join(' AND ')}
      ORDER BY s.sale_date ASC, s.sale_id ASC, i.item_id ASC
      LIMIT 2000`,
      params
    );
  },

  async getTopSellingItems(branchId: number, fromDate: string, toDate: string): Promise<TopSellingItemRow[]> {
    return queryMany<TopSellingItemRow>(
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
       )
       SELECT
         i.item_id AS product_id,
         i.name AS product_name,
         COALESCE(SUM(m.quantity), 0)::double precision AS quantity_sold,
         COALESCE(SUM(m.line_total), 0)::double precision AS sales_amount,
         COUNT(DISTINCT s.sale_id)::int AS sales_count
       FROM sale_item_map m
       JOIN ims.sales s ON s.sale_id = m.sale_id
       JOIN ims.items i ON i.item_id = m.item_id
      WHERE s.branch_id = $1
        AND s.status <> 'void'
        AND ${nonQuotationSalesWhere}
        AND s.sale_date::date BETWEEN $2::date AND $3::date
      GROUP BY i.item_id, i.name
      HAVING COALESCE(SUM(m.quantity), 0) > 0
      ORDER BY quantity_sold DESC, sales_amount DESC, i.name
      LIMIT 200`,
      [branchId, fromDate, toDate]
    );
  },

  async getSalesReturns(branchId: number, fromDate: string, toDate: string): Promise<SalesReturnRow[]> {
    return queryMany<SalesReturnRow>(
      `SELECT
         sr.sr_id AS return_id,
         sr.return_date::text AS return_date,
         sr.sale_id,
         COALESCE(c.full_name, 'Walk-in') AS customer_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS cashier_name,
         COALESCE(sr.subtotal, 0)::double precision AS subtotal,
         COALESCE(sr.total, 0)::double precision AS total,
         COALESCE(sr.note, '') AS note
       FROM ims.sales_returns sr
       LEFT JOIN ims.customers c ON c.customer_id = sr.customer_id
       LEFT JOIN ims.users u ON u.user_id = sr.user_id
      WHERE sr.branch_id = $1
        AND sr.return_date::date BETWEEN $2::date AND $3::date
      ORDER BY sr.return_date ASC, sr.sr_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getCashierPerformance(branchId: number, fromDate: string, toDate: string): Promise<CashierPerformanceRow[]> {
    return queryMany<CashierPerformanceRow>(
      `WITH sales_agg AS (
         SELECT
           s.user_id,
           COUNT(*)::int AS sales_count,
           COALESCE(SUM(s.total), 0)::double precision AS gross_sales
         FROM ims.sales s
        WHERE s.branch_id = $1
          AND s.status <> 'void'
          AND ${nonQuotationSalesWhere}
          AND s.sale_date::date BETWEEN $2::date AND $3::date
        GROUP BY s.user_id
       ),
       returns_agg AS (
         SELECT
           sr.user_id,
           COUNT(*)::int AS returns_count,
           COALESCE(SUM(sr.total), 0)::double precision AS returns_total
         FROM ims.sales_returns sr
        WHERE sr.branch_id = $1
          AND sr.return_date::date BETWEEN $2::date AND $3::date
        GROUP BY sr.user_id
       )
       SELECT
         u.user_id,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS cashier_name,
         COALESCE(sa.sales_count, 0) AS sales_count,
         COALESCE(sa.gross_sales, 0)::double precision AS gross_sales,
         COALESCE(ra.returns_count, 0) AS returns_count,
         COALESCE(ra.returns_total, 0)::double precision AS returns_total,
         (COALESCE(sa.gross_sales, 0) - COALESCE(ra.returns_total, 0))::double precision AS net_sales
       FROM ims.users u
       LEFT JOIN sales_agg sa ON sa.user_id = u.user_id
       LEFT JOIN returns_agg ra ON ra.user_id = u.user_id
      WHERE sa.user_id IS NOT NULL OR ra.user_id IS NOT NULL
      ORDER BY net_sales DESC, sales_count DESC, u.user_id`,
      [branchId, fromDate, toDate]
    );
  },
};
