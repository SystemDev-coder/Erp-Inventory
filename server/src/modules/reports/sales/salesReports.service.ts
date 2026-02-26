import { queryMany } from '../../../db/query';

export interface ReportOption {
  id: number;
  label: string;
}

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

export const salesReportsService = {
  async getSalesReportOptions(branchId: number): Promise<{ customers: ReportOption[]; products: ReportOption[] }> {
    const [customers, products] = await Promise.all([
      queryMany<ReportOption>(
        `SELECT customer_id AS id, full_name AS label
           FROM ims.customers
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY full_name`,
        [branchId]
      ),
      queryMany<ReportOption>(
        `SELECT item_id AS id, name AS label
           FROM ims.items
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY name`,
        [branchId]
      ),
    ]);

    return { customers, products };
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
      ORDER BY s.sale_date DESC, s.sale_id DESC`,
      [branchId]
    );
  },

  async getSalesByCustomer(branchId: number, customerId?: number): Promise<SalesByCustomerRow[]> {
    const params: Array<number> = [branchId];
    const filters: string[] = ['s.branch_id = $1', `s.status <> 'void'`];

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
      ORDER BY s.sale_date DESC, s.sale_id DESC
      LIMIT 1500`,
      params
    );
  },

  async getSalesByProduct(branchId: number, productId?: number): Promise<SalesByProductRow[]> {
    const params: Array<number> = [branchId];
    const filters: string[] = ['s.branch_id = $1', `s.status <> 'void'`];

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
      ORDER BY s.sale_date DESC, s.sale_id DESC, i.name
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
      ORDER BY sr.return_date DESC, sr.sr_id DESC`,
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
