import { queryMany } from '../../../db/query';

export interface PurchaseReportOption {
  id: number;
  label: string;
}

export interface PurchaseOrdersSummaryRow {
  purchase_id: number;
  purchase_date: string;
  supplier_name: string;
  buyer_name: string;
  store_name: string;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  status: string;
}

export interface SupplierWisePurchaseRow {
  purchase_id: number;
  purchase_date: string;
  supplier_id: number;
  supplier_name: string;
  buyer_name: string;
  store_name: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
}

export interface PurchaseReturnRow {
  return_id: number;
  return_date: string;
  purchase_id: number | null;
  supplier_name: string;
  buyer_name: string;
  subtotal: number;
  total: number;
  note: string;
}

export interface PurchasePaymentStatusRow {
  purchase_id: number;
  purchase_date: string;
  supplier_name: string;
  total: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  status: string;
}

export interface SupplierLedgerRow {
  sup_ledger_id: number;
  entry_date: string;
  supplier_id: number;
  supplier_name: string;
  entry_type: string;
  ref_table: string;
  ref_id: number | null;
  debit: number;
  credit: number;
  running_balance: number;
  note: string;
}

export interface PurchaseByDateRangeRow {
  purchase_id: number;
  purchase_date: string;
  supplier_name: string;
  item_lines: number;
  total_quantity: number;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
}

export interface BestSupplierRow {
  supplier_id: number;
  supplier_name: string;
  purchases_count: number;
  total_amount: number;
  total_paid: number;
  outstanding_amount: number;
  avg_purchase_value: number;
}

export interface PurchasePriceVarianceRow {
  item_id: number;
  item_name: string;
  min_unit_cost: number;
  max_unit_cost: number;
  avg_unit_cost: number;
  last_unit_cost: number;
  variance_amount: number;
  variance_percent: number;
  purchase_lines: number;
}

export const purchaseReportsService = {
  async getPurchaseReportOptions(branchId: number): Promise<{ suppliers: PurchaseReportOption[]; products: PurchaseReportOption[] }> {
    const [suppliers, products] = await Promise.all([
      queryMany<PurchaseReportOption>(
        `SELECT supplier_id AS id, name AS label
           FROM ims.suppliers
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY supplier_id ASC`,
        [branchId]
      ),
      queryMany<PurchaseReportOption>(
        `SELECT item_id AS id, name AS label
           FROM ims.items
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY item_id ASC`,
        [branchId]
      ),
    ]);

    return { suppliers, products };
  },

  async getPurchaseOrdersSummary(branchId: number, fromDate: string, toDate: string): Promise<PurchaseOrdersSummaryRow[]> {
    return queryMany<PurchaseOrdersSummaryRow>(
      `WITH payments AS (
         SELECT
           sp.purchase_id,
           COALESCE(SUM(sp.amount_paid), 0)::double precision AS paid_amount
         FROM ims.supplier_payments sp
         GROUP BY sp.purchase_id
       )
       SELECT
         p.purchase_id,
         p.purchase_date::text AS purchase_date,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS buyer_name,
         COALESCE(st.store_name, 'N/A') AS store_name,
         COALESCE(p.subtotal, 0)::double precision AS subtotal,
         COALESCE(p.discount, 0)::double precision AS discount,
         COALESCE(p.total, 0)::double precision AS total,
         COALESCE(pay.paid_amount, 0)::double precision AS paid_amount,
         GREATEST(COALESCE(p.total, 0) - COALESCE(pay.paid_amount, 0), 0)::double precision AS outstanding_amount,
         CASE
           WHEN LOWER(COALESCE(p.status::text, '')) = 'void' THEN 'VOID'
           WHEN COALESCE(pay.paid_amount, 0) >= COALESCE(p.total, 0) THEN 'PAID'
           WHEN COALESCE(pay.paid_amount, 0) > 0 THEN 'PARTIAL'
           ELSE 'UNPAID'
         END AS payment_status,
         COALESCE(p.status::text, 'unpaid') AS status
       FROM ims.purchases p
       LEFT JOIN payments pay ON pay.purchase_id = p.purchase_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
       LEFT JOIN ims.users u ON u.user_id = p.user_id
       LEFT JOIN ims.stores st ON st.store_id = p.store_id
      WHERE p.branch_id = $1
        AND p.purchase_date::date BETWEEN $2::date AND $3::date
      ORDER BY p.purchase_date ASC, p.purchase_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getSupplierWisePurchases(branchId: number, supplierId?: number): Promise<SupplierWisePurchaseRow[]> {
    const params: Array<number> = [branchId];
    const filters: string[] = ['p.branch_id = $1'];

    if (supplierId) {
      params.push(supplierId);
      filters.push(`p.supplier_id = $${params.length}`);
    }

    return queryMany<SupplierWisePurchaseRow>(
      `SELECT
         p.purchase_id,
         p.purchase_date::text AS purchase_date,
         COALESCE(s.supplier_id, 0)::bigint AS supplier_id,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS buyer_name,
         COALESCE(st.store_name, 'N/A') AS store_name,
         COALESCE(p.subtotal, 0)::double precision AS subtotal,
         COALESCE(p.discount, 0)::double precision AS discount,
         COALESCE(p.total, 0)::double precision AS total,
         COALESCE(p.status::text, 'unpaid') AS status
       FROM ims.purchases p
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
       LEFT JOIN ims.users u ON u.user_id = p.user_id
       LEFT JOIN ims.stores st ON st.store_id = p.store_id
      WHERE ${filters.join(' AND ')}
      ORDER BY p.purchase_date ASC, p.purchase_id ASC
      LIMIT 2000`,
      params
    );
  },

  async getPurchaseReturns(branchId: number, fromDate: string, toDate: string): Promise<PurchaseReturnRow[]> {
    return queryMany<PurchaseReturnRow>(
      `SELECT
         pr.pr_id AS return_id,
         pr.return_date::text AS return_date,
         pr.purchase_id,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS buyer_name,
         COALESCE(pr.subtotal, 0)::double precision AS subtotal,
         COALESCE(pr.total, 0)::double precision AS total,
         COALESCE(pr.note, '') AS note
       FROM ims.purchase_returns pr
       LEFT JOIN ims.suppliers s ON s.supplier_id = pr.supplier_id
       LEFT JOIN ims.users u ON u.user_id = pr.user_id
      WHERE pr.branch_id = $1
        AND pr.return_date::date BETWEEN $2::date AND $3::date
      ORDER BY pr.return_date ASC, pr.pr_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getPurchasePaymentStatus(branchId: number, fromDate: string, toDate: string): Promise<PurchasePaymentStatusRow[]> {
    return queryMany<PurchasePaymentStatusRow>(
      `WITH payments AS (
         SELECT
           sp.purchase_id,
           COALESCE(SUM(sp.amount_paid), 0)::double precision AS paid_amount
         FROM ims.supplier_payments sp
         GROUP BY sp.purchase_id
       )
       SELECT
         p.purchase_id,
         p.purchase_date::text AS purchase_date,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COALESCE(p.total, 0)::double precision AS total,
         COALESCE(pay.paid_amount, 0)::double precision AS paid_amount,
         GREATEST(COALESCE(p.total, 0) - COALESCE(pay.paid_amount, 0), 0)::double precision AS outstanding_amount,
         CASE
           WHEN LOWER(COALESCE(p.status::text, '')) = 'void' THEN 'VOID'
           WHEN COALESCE(pay.paid_amount, 0) >= COALESCE(p.total, 0) THEN 'PAID'
           WHEN COALESCE(pay.paid_amount, 0) > 0 THEN 'PARTIAL'
           ELSE 'UNPAID'
         END AS payment_status,
         COALESCE(p.status::text, 'unpaid') AS status
       FROM ims.purchases p
       LEFT JOIN payments pay ON pay.purchase_id = p.purchase_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
      WHERE p.branch_id = $1
        AND p.purchase_date::date BETWEEN $2::date AND $3::date
      ORDER BY p.purchase_date ASC, p.purchase_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getSupplierLedger(branchId: number, supplierId?: number): Promise<SupplierLedgerRow[]> {
    const params: Array<number> = [branchId];
    const filters: string[] = ['l.branch_id = $1'];
    const supplierFilters: string[] = ['s.branch_id = $1'];

    if (supplierId) {
      params.push(supplierId);
      filters.push(`l.supplier_id = $${params.length}`);
      supplierFilters.push(`s.supplier_id = $${params.length}`);
    }

       return queryMany<SupplierLedgerRow>(
      `WITH ledger_rows AS (
         SELECT
           l.sup_ledger_id::bigint AS sup_ledger_id,
           l.entry_date,
           l.supplier_id,
           COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
           COALESCE(l.entry_type::text, 'purchase') AS entry_type,
           COALESCE(l.ref_table, '') AS ref_table,
           l.ref_id,
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
           )::double precision AS credit,
           COALESCE(l.note, '') AS note
         FROM ims.supplier_ledger l
         LEFT JOIN ims.suppliers s ON s.supplier_id = l.supplier_id
        WHERE ${filters.join(' AND ')}
       ),
       opening_rows AS (
         SELECT
           (-s.supplier_id)::bigint AS sup_ledger_id,
           COALESCE(s.created_at, NOW()) AS entry_date,
           s.supplier_id,
           COALESCE(NULLIF(to_jsonb(s) ->> 'name', ''), NULLIF(to_jsonb(s) ->> 'supplier_name', ''), 'Unknown Supplier') AS supplier_name,
           'opening'::text AS entry_type,
           'suppliers'::text AS ref_table,
           NULL::bigint AS ref_id,
           0::double precision AS debit,
           GREATEST(
             COALESCE(NULLIF(to_jsonb(s) ->> 'remaining_balance', '')::double precision, 0),
             COALESCE(NULLIF(to_jsonb(s) ->> 'open_balance', '')::double precision, 0)
           )::double precision AS credit,
           'Opening payable balance'::text AS note
         FROM ims.suppliers s
        WHERE ${supplierFilters.join(' AND ')}
          -- Only inject an opening row when there are no supplier ledger rows.
          -- If ledger rows exist, remaining_balance already reflects the live outstanding and would double-count.
          AND NOT EXISTS (
            SELECT 1
              FROM ims.supplier_ledger l
             WHERE l.branch_id = $1
               AND l.supplier_id = s.supplier_id
          )
          AND GREATEST(
                COALESCE(NULLIF(to_jsonb(s) ->> 'remaining_balance', '')::double precision, 0),
                COALESCE(NULLIF(to_jsonb(s) ->> 'open_balance', '')::double precision, 0)
              ) > 0
       ),
       unioned AS (
         SELECT * FROM opening_rows
         UNION ALL
         SELECT * FROM ledger_rows
       )
       SELECT
         u.sup_ledger_id,
         u.entry_date::text AS entry_date,
         u.supplier_id,
         u.supplier_name,
         u.entry_type,
         u.ref_table,
         u.ref_id,
         u.debit,
         u.credit,
         SUM(COALESCE(u.credit, 0) - COALESCE(u.debit, 0))
           OVER (
             PARTITION BY u.supplier_id
             ORDER BY u.entry_date, u.sup_ledger_id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           )::double precision AS running_balance,
         u.note
        FROM unioned u
      ORDER BY u.entry_date ASC, u.sup_ledger_id ASC
      LIMIT 4000`,
      params
    );
  },

  async getPurchaseByDateRange(branchId: number, fromDate: string, toDate: string): Promise<PurchaseByDateRangeRow[]> {
    return queryMany<PurchaseByDateRangeRow>(
      `SELECT
         p.purchase_id,
         p.purchase_date::text AS purchase_date,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COUNT(pi.purchase_item_id)::int AS item_lines,
         COALESCE(SUM(pi.quantity), 0)::double precision AS total_quantity,
         COALESCE(p.subtotal, 0)::double precision AS subtotal,
         COALESCE(p.discount, 0)::double precision AS discount,
         COALESCE(p.total, 0)::double precision AS total,
         COALESCE(p.status::text, 'unpaid') AS status
       FROM ims.purchases p
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
       LEFT JOIN ims.purchase_items pi ON pi.purchase_id = p.purchase_id
      WHERE p.branch_id = $1
        AND p.purchase_date::date BETWEEN $2::date AND $3::date
      GROUP BY p.purchase_id, p.purchase_date, s.name, p.subtotal, p.discount, p.total, p.status
      ORDER BY p.purchase_date ASC, p.purchase_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getBestSuppliers(branchId: number, fromDate: string, toDate: string): Promise<BestSupplierRow[]> {
    return queryMany<BestSupplierRow>(
      `WITH scoped_purchases AS (
         SELECT
           p.purchase_id,
           p.supplier_id,
           COALESCE(p.total, 0)::double precision AS total_amount
         FROM ims.purchases p
        WHERE p.branch_id = $1
          AND p.purchase_date::date BETWEEN $2::date AND $3::date
          AND LOWER(COALESCE(p.status::text, '')) <> 'void'
       ),
       payments AS (
         SELECT
           sp.purchase_id,
           COALESCE(SUM(sp.amount_paid), 0)::double precision AS paid_amount
         FROM ims.supplier_payments sp
         GROUP BY sp.purchase_id
       )
       SELECT
         s.supplier_id,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COUNT(sp.purchase_id)::int AS purchases_count,
         COALESCE(SUM(sp.total_amount), 0)::double precision AS total_amount,
         COALESCE(SUM(pay.paid_amount), 0)::double precision AS total_paid,
         COALESCE(SUM(GREATEST(sp.total_amount - COALESCE(pay.paid_amount, 0), 0)), 0)::double precision AS outstanding_amount,
         COALESCE(AVG(sp.total_amount), 0)::double precision AS avg_purchase_value
       FROM scoped_purchases sp
       LEFT JOIN payments pay ON pay.purchase_id = sp.purchase_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = sp.supplier_id
      GROUP BY s.supplier_id, s.name
      ORDER BY total_amount DESC, purchases_count DESC
      LIMIT 200`,
      [branchId, fromDate, toDate]
    );
  },

  async getPurchasePriceVariance(
    branchId: number,
    fromDate: string,
    toDate: string,
    productId?: number
  ): Promise<PurchasePriceVarianceRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';
    if (productId) {
      params.push(productId);
      filter = `AND scoped.item_id = $${params.length}`;
    }

    return queryMany<PurchasePriceVarianceRow>(
      `WITH scoped AS (
         SELECT
           pi.item_id,
           COALESCE(pi.unit_cost, 0)::double precision AS unit_cost,
           p.purchase_date,
           pi.purchase_item_id
         FROM ims.purchase_items pi
         JOIN ims.purchases p ON p.purchase_id = pi.purchase_id
        WHERE p.branch_id = $1
          AND p.purchase_date::date BETWEEN $2::date AND $3::date
          AND LOWER(COALESCE(p.status::text, '')) <> 'void'
       )
       SELECT
         i.item_id,
         i.name AS item_name,
         COALESCE(MIN(scoped.unit_cost), 0)::double precision AS min_unit_cost,
         COALESCE(MAX(scoped.unit_cost), 0)::double precision AS max_unit_cost,
         COALESCE(AVG(scoped.unit_cost), 0)::double precision AS avg_unit_cost,
         COALESCE((ARRAY_AGG(scoped.unit_cost ORDER BY scoped.purchase_date DESC, scoped.purchase_item_id DESC))[1], 0)::double precision AS last_unit_cost,
         (COALESCE(MAX(scoped.unit_cost), 0) - COALESCE(MIN(scoped.unit_cost), 0))::double precision AS variance_amount,
         CASE
           WHEN COALESCE(MIN(scoped.unit_cost), 0) > 0
             THEN ((COALESCE(MAX(scoped.unit_cost), 0) - COALESCE(MIN(scoped.unit_cost), 0)) / MIN(scoped.unit_cost) * 100)::double precision
           ELSE 0::double precision
         END AS variance_percent,
         COUNT(*)::int AS purchase_lines
       FROM scoped
       JOIN ims.items i ON i.item_id = scoped.item_id
      WHERE i.branch_id = $1
        ${filter}
      GROUP BY i.item_id, i.name
      ORDER BY variance_amount DESC, i.name
      LIMIT 500`,
      params
    );
  },
};
