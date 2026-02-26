import { queryMany } from '../../../db/query';

export interface InventoryReportOption {
  id: number;
  label: string;
}

export interface CurrentStockRow {
  item_id: number;
  item_name: string;
  barcode: string;
  total_qty: number;
  min_stock_threshold: number;
  low_stock: boolean;
  cost_price: number;
  sale_price: number;
  stock_value: number;
}

export interface StockMovementRow {
  transaction_id: number;
  transaction_date: string;
  transaction_type: string;
  direction: string;
  item_id: number | null;
  item_name: string;
  store_id: number | null;
  store_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  reference_no: string;
  status: string;
  notes: string;
}

export interface InventoryValuationRow {
  item_id: number;
  item_name: string;
  total_qty: number;
  cost_price: number;
  sell_price: number;
  cost_value: number;
  retail_value: number;
}

export interface ExpiryTrackingRow {
  purchase_id: number;
  purchase_date: string;
  supplier_name: string;
  item_id: number;
  item_name: string;
  batch_no: string;
  expiry_date: string;
  days_to_expiry: number;
  quantity: number;
  unit_cost: number;
}

export interface StockAdjustmentLogRow {
  adjustment_id: number;
  adjustment_date: string;
  item_id: number;
  item_name: string;
  adjustment_type: string;
  quantity: number;
  reason: string;
  status: string;
  created_by: string;
}

export interface StoreStockSummaryRow {
  store_id: number;
  store_name: string;
  item_count: number;
  total_qty: number;
  stock_value: number;
}

export interface StoreWiseStockRow {
  store_id: number;
  store_name: string;
  item_id: number;
  item_name: string;
  barcode: string;
  quantity: number;
  cost_price: number;
  sell_price: number;
  stock_value: number;
}

const stockTotalsCte = `
  WITH stock_totals AS (
    SELECT
      s.branch_id,
      si.product_id AS item_id,
      COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS total_qty
    FROM ims.store_items si
    JOIN ims.stores s ON s.store_id = si.store_id
    GROUP BY s.branch_id, si.product_id
  )
`;

export const inventoryReportsService = {
  async getInventoryReportOptions(branchId: number): Promise<{ stores: InventoryReportOption[]; products: InventoryReportOption[] }> {
    const [stores, products] = await Promise.all([
      queryMany<InventoryReportOption>(
        `SELECT store_id AS id, store_name AS label
           FROM ims.stores
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY store_name`,
        [branchId]
      ),
      queryMany<InventoryReportOption>(
        `SELECT item_id AS id, name AS label
           FROM ims.items
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY name`,
        [branchId]
      ),
    ]);

    return { stores, products };
  },

  async getCurrentStockLevels(branchId: number): Promise<CurrentStockRow[]> {
    return queryMany<CurrentStockRow>(
      `${stockTotalsCte}
       SELECT
         i.item_id,
         i.name AS item_name,
         COALESCE(i.barcode, '') AS barcode,
         COALESCE(st.total_qty, 0)::double precision AS total_qty,
         GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)::double precision AS min_stock_threshold,
         (COALESCE(st.total_qty, 0) <= GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)) AS low_stock,
         COALESCE(i.cost_price, 0)::double precision AS cost_price,
         COALESCE(i.sell_price, i.cost_price, 0)::double precision AS sale_price,
         (COALESCE(st.total_qty, 0) * COALESCE(i.cost_price, 0))::double precision AS stock_value
       FROM ims.items i
       LEFT JOIN stock_totals st
         ON st.item_id = i.item_id
        AND st.branch_id = i.branch_id
      WHERE i.branch_id = $1
        AND i.is_active = TRUE
      ORDER BY i.name`,
      [branchId]
    );
  },

  async getLowStockAlert(branchId: number): Promise<CurrentStockRow[]> {
    return queryMany<CurrentStockRow>(
      `${stockTotalsCte}
       SELECT
         i.item_id,
         i.name AS item_name,
         COALESCE(i.barcode, '') AS barcode,
         COALESCE(st.total_qty, 0)::double precision AS total_qty,
         GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)::double precision AS min_stock_threshold,
         (COALESCE(st.total_qty, 0) <= GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)) AS low_stock,
         COALESCE(i.cost_price, 0)::double precision AS cost_price,
         COALESCE(i.sell_price, i.cost_price, 0)::double precision AS sale_price,
         (COALESCE(st.total_qty, 0) * COALESCE(i.cost_price, 0))::double precision AS stock_value
       FROM ims.items i
       LEFT JOIN stock_totals st
         ON st.item_id = i.item_id
        AND st.branch_id = i.branch_id
      WHERE i.branch_id = $1
        AND i.is_active = TRUE
        AND COALESCE(st.total_qty, 0) <= GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)
      ORDER BY COALESCE(st.total_qty, 0) ASC, i.name`,
      [branchId]
    );
  },

  async getStockMovementHistory(branchId: number, fromDate: string, toDate: string): Promise<StockMovementRow[]> {
    return queryMany<StockMovementRow>(
      `WITH tx AS (
         SELECT
           t.transaction_id,
           t.transaction_date,
           UPPER(COALESCE(to_jsonb(t) ->> 'transaction_type', 'UNKNOWN')) AS transaction_type,
           UPPER(
             COALESCE(
               to_jsonb(t) ->> 'direction',
               CASE
                 WHEN UPPER(COALESCE(to_jsonb(t) ->> 'transaction_type', '')) IN ('IN', 'PAID') THEN 'IN'
                 WHEN UPPER(COALESCE(to_jsonb(t) ->> 'transaction_type', '')) = 'ADJUSTMENT'
                   THEN CASE WHEN COALESCE((to_jsonb(t) ->> 'quantity')::numeric, 0) >= 0 THEN 'IN' ELSE 'OUT' END
                 ELSE 'OUT'
               END
             )
           ) AS direction,
           COALESCE((to_jsonb(t) ->> 'item_id')::bigint, (to_jsonb(t) ->> 'product_id')::bigint) AS item_id,
           (to_jsonb(t) ->> 'store_id')::bigint AS store_id,
           COALESCE((to_jsonb(t) ->> 'quantity')::numeric, 0) AS quantity,
           COALESCE((to_jsonb(t) ->> 'unit_cost')::numeric, 0) AS unit_cost,
           COALESCE(to_jsonb(t) ->> 'reference_no', '') AS reference_no,
           UPPER(COALESCE(to_jsonb(t) ->> 'status', 'POSTED')) AS status,
           COALESCE(to_jsonb(t) ->> 'notes', '') AS notes
         FROM ims.inventory_transaction t
        WHERE t.branch_id = $1
          AND t.transaction_date::date BETWEEN $2::date AND $3::date
       )
       SELECT
         tx.transaction_id,
         tx.transaction_date::text,
         tx.transaction_type,
         tx.direction,
         tx.item_id,
         COALESCE(i.name, 'Unknown Item') AS item_name,
         tx.store_id,
         COALESCE(s.store_name, 'N/A') AS store_name,
         tx.quantity::double precision AS quantity,
         tx.unit_cost::double precision AS unit_cost,
         (tx.quantity * tx.unit_cost)::double precision AS total_cost,
         tx.reference_no,
         tx.status,
         tx.notes
       FROM tx
       LEFT JOIN ims.items i ON i.item_id = tx.item_id
       LEFT JOIN ims.stores s ON s.store_id = tx.store_id
      ORDER BY tx.transaction_date DESC, tx.transaction_id DESC
      LIMIT 3000`,
      [branchId, fromDate, toDate]
    );
  },

  async getInventoryValuation(branchId: number): Promise<InventoryValuationRow[]> {
    return queryMany<InventoryValuationRow>(
      `${stockTotalsCte}
       SELECT
         i.item_id,
         i.name AS item_name,
         COALESCE(st.total_qty, 0)::double precision AS total_qty,
         COALESCE(i.cost_price, 0)::double precision AS cost_price,
         COALESCE(i.sell_price, i.cost_price, 0)::double precision AS sell_price,
         (COALESCE(st.total_qty, 0) * COALESCE(i.cost_price, 0))::double precision AS cost_value,
         (COALESCE(st.total_qty, 0) * COALESCE(i.sell_price, i.cost_price, 0))::double precision AS retail_value
       FROM ims.items i
       LEFT JOIN stock_totals st
         ON st.item_id = i.item_id
        AND st.branch_id = i.branch_id
      WHERE i.branch_id = $1
        AND i.is_active = TRUE
      ORDER BY cost_value DESC, i.name`,
      [branchId]
    );
  },

  async getExpiryTracking(branchId: number, fromDate: string, toDate: string): Promise<ExpiryTrackingRow[]> {
    return queryMany<ExpiryTrackingRow>(
      `SELECT
         p.purchase_id,
         p.purchase_date::text AS purchase_date,
         COALESCE(sp.full_name, 'Unknown Supplier') AS supplier_name,
         i.item_id,
         i.name AS item_name,
         COALESCE(pi.batch_no, '') AS batch_no,
         pi.expiry_date::text AS expiry_date,
         (pi.expiry_date - CURRENT_DATE)::int AS days_to_expiry,
         COALESCE(pi.quantity, 0)::double precision AS quantity,
         COALESCE(pi.unit_cost, 0)::double precision AS unit_cost
       FROM ims.purchase_items pi
       JOIN ims.purchases p ON p.purchase_id = pi.purchase_id
       JOIN ims.items i ON i.item_id = pi.item_id
       LEFT JOIN ims.suppliers sp ON sp.supplier_id = p.supplier_id
      WHERE p.branch_id = $1
        AND pi.expiry_date IS NOT NULL
        AND pi.expiry_date BETWEEN $2::date AND $3::date
      ORDER BY pi.expiry_date ASC, i.name`,
      [branchId, fromDate, toDate]
    );
  },

  async getStockAdjustmentLog(branchId: number, fromDate: string, toDate: string): Promise<StockAdjustmentLogRow[]> {
    return queryMany<StockAdjustmentLogRow>(
      `SELECT
         sa.adjustment_id,
         sa.adjustment_date::text AS adjustment_date,
         sa.item_id,
         i.name AS item_name,
         UPPER(COALESCE(sa.adjustment_type, 'ADJUSTMENT')) AS adjustment_type,
         COALESCE(sa.quantity, 0)::double precision AS quantity,
         COALESCE(sa.reason, '') AS reason,
         UPPER(COALESCE(sa.status, 'POSTED')) AS status,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS created_by
       FROM ims.stock_adjustment sa
       JOIN ims.items i ON i.item_id = sa.item_id
       LEFT JOIN ims.users u ON u.user_id = sa.created_by
      WHERE i.branch_id = $1
        AND sa.adjustment_date::date BETWEEN $2::date AND $3::date
      ORDER BY sa.adjustment_date DESC, sa.adjustment_id DESC`,
      [branchId, fromDate, toDate]
    );
  },

  async getStoreStockReport(branchId: number, storeId?: number): Promise<StoreStockSummaryRow[]> {
    const params: Array<number> = [branchId];
    let filter = '';
    if (storeId) {
      params.push(storeId);
      filter = `AND s.store_id = $${params.length}`;
    }

    return queryMany<StoreStockSummaryRow>(
      `SELECT
         s.store_id,
         s.store_name,
         COUNT(DISTINCT si.product_id)::int AS item_count,
         COALESCE(SUM(si.quantity), 0)::double precision AS total_qty,
         COALESCE(SUM(si.quantity * COALESCE(i.cost_price, 0)), 0)::double precision AS stock_value
       FROM ims.stores s
       LEFT JOIN ims.store_items si ON si.store_id = s.store_id
       LEFT JOIN ims.items i ON i.item_id = si.product_id
      WHERE s.branch_id = $1
        AND s.is_active = TRUE
        ${filter}
      GROUP BY s.store_id, s.store_name
      ORDER BY s.store_name`,
      params
    );
  },

  async getStoreWiseStock(branchId: number, storeId?: number): Promise<StoreWiseStockRow[]> {
    const params: Array<number> = [branchId];
    let filter = '';
    if (storeId) {
      params.push(storeId);
      filter = `AND s.store_id = $${params.length}`;
    }

    return queryMany<StoreWiseStockRow>(
      `SELECT
         s.store_id,
         s.store_name,
         i.item_id,
         i.name AS item_name,
         COALESCE(i.barcode, '') AS barcode,
         COALESCE(si.quantity, 0)::double precision AS quantity,
         COALESCE(i.cost_price, 0)::double precision AS cost_price,
         COALESCE(i.sell_price, i.cost_price, 0)::double precision AS sell_price,
         (COALESCE(si.quantity, 0) * COALESCE(i.cost_price, 0))::double precision AS stock_value
       FROM ims.store_items si
       JOIN ims.stores s ON s.store_id = si.store_id
       JOIN ims.items i ON i.item_id = si.product_id
      WHERE s.branch_id = $1
        ${filter}
      ORDER BY s.store_name, i.name
      LIMIT 4000`,
      params
    );
  },
};
