import { queryMany } from '../../../db/query';

export interface InventoryReportOption {
  id: number;
  label: string;
}

export interface CurrentStockRow {
  item_id: number;
  item_name: string;
  total_qty: number;
  min_stock_threshold: number;
  low_stock: boolean;
  cost_price: number;
  sale_price: number;
  amount: number;
  stock_value: number;
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

export interface InventoryLossRow {
  loss_id: number;
  loss_date: string;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_cost: number;
  total_loss: number;
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
      i.branch_id,
      i.item_id,
      CASE
        WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
        ELSE COALESCE(st.store_qty, 0)
      END::numeric(14,3) AS total_qty
    FROM ims.items i
    LEFT JOIN (
      SELECT
        s.branch_id,
        si.product_id AS item_id,
        COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS store_qty,
        COUNT(*)::int AS row_count
      FROM ims.store_items si
      JOIN ims.stores s ON s.store_id = si.store_id
      GROUP BY s.branch_id, si.product_id
    ) st
      ON st.item_id = i.item_id
     AND st.branch_id = i.branch_id
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
          ORDER BY store_id ASC`,
        [branchId]
      ),
      queryMany<InventoryReportOption>(
        `SELECT item_id AS id, name AS label
           FROM ims.items
          WHERE branch_id = $1
            AND is_active = TRUE
          ORDER BY item_id ASC`,
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
         COALESCE(st.total_qty, 0)::double precision AS total_qty,
         GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)::double precision AS min_stock_threshold,
         (COALESCE(st.total_qty, 0) <= GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)) AS low_stock,
         COALESCE(i.cost_price, 0)::double precision AS cost_price,
         COALESCE(i.sell_price, i.cost_price, 0)::double precision AS sale_price,
         (COALESCE(st.total_qty, 0) * COALESCE(i.cost_price, 0))::double precision AS amount,
         (COALESCE(st.total_qty, 0) * COALESCE(i.cost_price, 0))::double precision AS stock_value
       FROM ims.items i
       LEFT JOIN stock_totals st
         ON st.item_id = i.item_id
        AND st.branch_id = i.branch_id
      WHERE i.branch_id = $1
        AND i.is_active = TRUE
      ORDER BY i.item_id ASC`,
      [branchId]
    );
  },

  async getLowStockAlert(branchId: number): Promise<CurrentStockRow[]> {
    return queryMany<CurrentStockRow>(
      `${stockTotalsCte}
       SELECT
         i.item_id,
         i.name AS item_name,
         COALESCE(st.total_qty, 0)::double precision AS total_qty,
         GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)::double precision AS min_stock_threshold,
         (COALESCE(st.total_qty, 0) <= GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)) AS low_stock,
         COALESCE(i.cost_price, 0)::double precision AS cost_price,
         COALESCE(i.sell_price, i.cost_price, 0)::double precision AS sale_price,
         (COALESCE(st.total_qty, 0) * COALESCE(i.cost_price, 0))::double precision AS amount,
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
      ORDER BY pi.expiry_date ASC, i.item_id ASC`,
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
      ORDER BY sa.adjustment_date ASC, sa.adjustment_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getInventoryLoss(branchId: number, fromDate: string, toDate: string): Promise<InventoryLossRow[]> {
    return queryMany<InventoryLossRow>(
      `SELECT
         sa.adjustment_id AS loss_id,
         sa.adjustment_date::text AS loss_date,
         sa.item_id,
         i.name AS item_name,
         COALESCE(sa.quantity, 0)::double precision AS quantity,
         COALESCE(i.cost_price, 0)::double precision AS unit_cost,
         (COALESCE(sa.quantity, 0) * COALESCE(i.cost_price, 0))::double precision AS total_loss,
         COALESCE(sa.reason, '') AS reason,
         UPPER(COALESCE(sa.status, 'POSTED')) AS status,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS created_by
       FROM ims.stock_adjustment sa
       JOIN ims.items i ON i.item_id = sa.item_id
       LEFT JOIN ims.users u ON u.user_id = sa.created_by
      WHERE i.branch_id = $1
        AND sa.adjustment_date::date BETWEEN $2::date AND $3::date
        AND UPPER(COALESCE(sa.adjustment_type, 'INCREASE')) = 'DECREASE'
        AND UPPER(COALESCE(sa.status, 'POSTED')) <> 'CANCELLED'
      ORDER BY sa.adjustment_date ASC, sa.adjustment_id ASC`,
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
      ORDER BY s.store_id ASC`,
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
      ORDER BY s.store_id ASC, i.item_id ASC
      LIMIT 4000`,
      params
    );
  },
};
