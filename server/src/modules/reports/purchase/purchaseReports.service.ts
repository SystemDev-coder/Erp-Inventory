import { queryMany } from '../../../db/query';
import { supplierPaymentsCteSql } from '../reports.helpers';

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

export interface CreditOverduePurchaseRow {
  purchase_id: number;
  invoice_number: string;
  supplier_id: number | null;
  supplier_name: string;
  purchase_date: string;
  appointment_date: string;
  days_overdue: number;
  total: number;
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
      `WITH ${supplierPaymentsCteSql('$1')},
       returns AS (
         SELECT
           pr.purchase_id,
           COALESCE(SUM(pr.total), 0)::double precision AS returned_amount
         FROM ims.purchase_returns pr
         WHERE pr.purchase_id IS NOT NULL
           AND COALESCE(pr.is_deleted, 0) = 0
         GROUP BY pr.purchase_id
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
         GREATEST(COALESCE(p.total, 0) - COALESCE(ret.returned_amount, 0) - COALESCE(pay.paid_amount, 0), 0)::double precision AS outstanding_amount,
         CASE
           WHEN COALESCE(pay.paid_amount, 0) >= COALESCE(p.total, 0) - COALESCE(ret.returned_amount, 0) THEN 'PAID'
           WHEN COALESCE(pay.paid_amount, 0) > 0 THEN 'PARTIAL'
           ELSE 'UNPAID'
         END AS payment_status,
         COALESCE(p.status::text, 'unpaid') AS status
       FROM ims.purchases p
       LEFT JOIN payments pay ON pay.purchase_id = p.purchase_id
       LEFT JOIN returns ret ON ret.purchase_id = p.purchase_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
       LEFT JOIN ims.users u ON u.user_id = p.user_id
       LEFT JOIN ims.stores st ON st.store_id = p.store_id
      WHERE p.branch_id = $1
        AND p.purchase_date::date BETWEEN $2::date AND $3::date
        AND LOWER(COALESCE(p.status::text, '')) <> 'void'
      ORDER BY p.purchase_date ASC, p.purchase_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getSupplierWisePurchases(branchId: number, supplierId?: number): Promise<SupplierWisePurchaseRow[]> {
    const params: Array<number> = [branchId];
    const filters: string[] = ['p.branch_id = $1', "LOWER(COALESCE(p.status::text, '')) <> 'void'"];

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
      `WITH ${supplierPaymentsCteSql('$1')},
       returns AS (
         SELECT
           pr.purchase_id,
           COALESCE(SUM(pr.total), 0)::double precision AS returned_amount
         FROM ims.purchase_returns pr
         WHERE pr.purchase_id IS NOT NULL
           AND COALESCE(pr.is_deleted, 0) = 0
         GROUP BY pr.purchase_id
       )
       SELECT
         p.purchase_id,
         p.purchase_date::text AS purchase_date,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COALESCE(p.total, 0)::double precision AS total,
         COALESCE(pay.paid_amount, 0)::double precision AS paid_amount,
         GREATEST(COALESCE(p.total, 0) - COALESCE(ret.returned_amount, 0) - COALESCE(pay.paid_amount, 0), 0)::double precision AS outstanding_amount,
         CASE
           WHEN COALESCE(pay.paid_amount, 0) >= COALESCE(p.total, 0) - COALESCE(ret.returned_amount, 0) THEN 'PAID'
           WHEN COALESCE(pay.paid_amount, 0) > 0 THEN 'PARTIAL'
           ELSE 'UNPAID'
         END AS payment_status,
         COALESCE(p.status::text, 'unpaid') AS status
       FROM ims.purchases p
       LEFT JOIN payments pay ON pay.purchase_id = p.purchase_id
       LEFT JOIN returns ret ON ret.purchase_id = p.purchase_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
      WHERE p.branch_id = $1
        AND p.purchase_date::date BETWEEN $2::date AND $3::date
        AND LOWER(COALESCE(p.status::text, '')) <> 'void'
      ORDER BY p.purchase_date ASC, p.purchase_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getSupplierLedger(
    branchId: number,
    fromDate: string,
    toDate: string,
    supplierId?: number
  ): Promise<SupplierLedgerRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';

    if (supplierId) {
      params.push(supplierId);
      filter = `AND l.supplier_id = $${params.length}`;
    }

    return queryMany<SupplierLedgerRow>(
      `WITH opening AS (
         SELECT
           l.supplier_id,
           COALESCE(SUM(l.credit - l.debit), 0)::double precision AS opening_balance
         FROM ims.supplier_ledger l
        WHERE l.branch_id = $1
          AND l.entry_date::date < $2::date
        GROUP BY l.supplier_id
       ),
       scoped AS (
         SELECT
           l.sup_ledger_id,
           l.entry_date,
           l.supplier_id,
           COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
           COALESCE(l.entry_type::text, 'purchase') AS entry_type,
           COALESCE(l.ref_table, '') AS ref_table,
           l.ref_id,
           COALESCE(l.debit, 0)::double precision AS debit,
           COALESCE(l.credit, 0)::double precision AS credit,
           COALESCE(l.note, '') AS note
         FROM ims.supplier_ledger l
         LEFT JOIN ims.suppliers s ON s.supplier_id = l.supplier_id
        WHERE l.branch_id = $1
          AND l.entry_date::date BETWEEN $2::date AND $3::date
          ${filter}
       )
       SELECT
         scoped.sup_ledger_id,
         scoped.entry_date::text AS entry_date,
         scoped.supplier_id,
         scoped.supplier_name,
         scoped.entry_type,
         scoped.ref_table,
         scoped.ref_id,
         scoped.debit,
         scoped.credit,
         (
           COALESCE(opening.opening_balance, 0)
           + SUM(scoped.credit - scoped.debit)
             OVER (
               PARTITION BY scoped.supplier_id
               ORDER BY scoped.entry_date, scoped.sup_ledger_id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             )
         )::double precision AS running_balance,
         scoped.note
       FROM scoped
       LEFT JOIN opening ON opening.supplier_id = scoped.supplier_id
       ORDER BY scoped.entry_date ASC, scoped.sup_ledger_id ASC
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
        AND LOWER(COALESCE(p.status::text, '')) <> 'void'
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
       ${supplierPaymentsCteSql('$1')},
       returns AS (
         SELECT
           pr.purchase_id,
           COALESCE(SUM(pr.total), 0)::double precision AS returned_amount
         FROM ims.purchase_returns pr
         WHERE pr.purchase_id IS NOT NULL
           AND COALESCE(pr.is_deleted, 0) = 0
         GROUP BY pr.purchase_id
       )
       SELECT
         s.supplier_id,
         COALESCE(s.name, 'Unknown Supplier') AS supplier_name,
         COUNT(sp.purchase_id)::int AS purchases_count,
         COALESCE(SUM(sp.total_amount), 0)::double precision AS total_amount,
         COALESCE(SUM(pay.paid_amount), 0)::double precision AS total_paid,
         COALESCE(SUM(GREATEST(sp.total_amount - COALESCE(ret.returned_amount, 0) - COALESCE(pay.paid_amount, 0), 0)), 0)::double precision AS outstanding_amount,
         COALESCE(AVG(sp.total_amount), 0)::double precision AS avg_purchase_value
       FROM scoped_purchases sp
       LEFT JOIN payments pay ON pay.purchase_id = sp.purchase_id
       LEFT JOIN returns ret ON ret.purchase_id = sp.purchase_id
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

  async getCreditOverduePurchases(branchId: number, supplierId?: number): Promise<CreditOverduePurchaseRow[]> {
    const params: Array<number> = [branchId];
    let filter = '';

    if (supplierId) {
      params.push(supplierId);
      filter = `AND p.supplier_id = $${params.length}`;
    }

    return queryMany<CreditOverduePurchaseRow>(
      `WITH ${supplierPaymentsCteSql('$1')},
       returns AS (
         SELECT pr.purchase_id, COALESCE(SUM(pr.total), 0)::double precision AS returned_amount
           FROM ims.purchase_returns pr
          WHERE pr.purchase_id IS NOT NULL AND COALESCE(pr.is_deleted, 0) = 0
          GROUP BY pr.purchase_id
       )
       SELECT
         p.purchase_id,
         ('#' || p.purchase_id::text) AS invoice_number,
         p.supplier_id,
         COALESCE(s.name, s.supplier_name, 'Supplier') AS supplier_name,
         p.purchase_date::date::text AS purchase_date,
         p.due_date::date::text AS appointment_date,
         GREATEST((CURRENT_DATE - p.due_date)::int, 0) AS days_overdue,
         GREATEST(
           COALESCE(p.total, 0) - COALESCE(ret.returned_amount, 0) - COALESCE(pay.paid_amount, 0),
           0
         )::double precision AS total
       FROM ims.purchases p
       LEFT JOIN payments pay ON pay.purchase_id = p.purchase_id
       LEFT JOIN returns ret ON ret.purchase_id = p.purchase_id
       LEFT JOIN ims.suppliers s ON s.supplier_id = p.supplier_id
      WHERE p.branch_id = $1
        AND COALESCE(p.purchase_type::text, '') = 'credit'
        AND p.due_date IS NOT NULL
        AND p.due_date <= CURRENT_DATE
        AND LOWER(COALESCE(p.status::text, '')) <> 'void'
        AND COALESCE(p.doc_type::text, 'purchase') = 'purchase'
        AND COALESCE(p.is_deleted, 0)::int = 0
        AND GREATEST(
          COALESCE(p.total, 0) - COALESCE(ret.returned_amount, 0) - COALESCE(pay.paid_amount, 0),
          0
        ) > 0.009
        ${filter}
      ORDER BY days_overdue DESC, p.due_date ASC, p.purchase_id ASC
      LIMIT 2000`,
      params
    );
  },
};
