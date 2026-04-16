import { queryMany, queryOne } from '../../../db/query';

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

export interface InventoryFoundRow {
  found_id: number;
  found_date: string;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_cost: number;
  total_found: number;
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

export interface StoreMovementSummaryRow {
  store_id: number;
  store_name: string;
  begin_qty: number;
  purchase_qty: number;
  sales_qty: number;
  sales_return_qty: number;
  purchase_return_qty: number;
  adjustment_in_qty: number;
  adjustment_out_qty: number;
  net_movement_qty: number;
  item_count: number;
  ending_qty: number;
}

export interface StoreMovementDetailRow {
  store_id: number;
  store_name: string;
  item_id: number;
  item_name: string;
  begin_qty: number;
  purchase_qty: number;
  sales_qty: number;
  sales_return_qty: number;
  purchase_return_qty: number;
  adjustment_in_qty: number;
  adjustment_out_qty: number;
  net_movement_qty: number;
  ending_qty: number;
}

export interface StoreMovementLedgerRow {
  txn_id: number;
  txn_date: string;
  store_id: number;
  store_name: string;
  item_id: number;
  item_name: string;
  txn_type: string;
  ref_table: string;
  ref_id: number | null;
  txn_number: string;
  party_name: string;
  memo: string;
  split_account: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface InventoryTransactionLedgerRow {
  txn_id: number;
  txn_date: string;
  account_id: number;
  account_name: string;
  txn_type: string;
  ref_table: string;
  ref_id: number | null;
  txn_number: string;
  party_name: string;
  memo: string;
  split_account: string;
  debit: number;
  credit: number;
  running_balance: number;
  note: string;
}

const normalizeName = (value: unknown) => String(value || '').trim().toLowerCase();
const isInventoryAssetAccountName = (value: string) => {
  const n = normalizeName(value);
  if (!n.includes('inventory')) return false;
  if (n.includes('loss') || n.includes('shrink') || n.includes('damage') || n.includes('write')) return false;
  return true;
};

const legacyAdjustmentsCte = `
  legacy_adjustments AS (
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
  )
`;

const stockTotalsCte = `
  WITH ${legacyAdjustmentsCte},
  stock_totals AS (
    SELECT
      i.branch_id,
      i.item_id,
      (
        COALESCE(i.opening_balance, 0)
        + COALESCE(SUM(COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)), 0)
        + COALESCE(la.qty_delta, 0)
      )::numeric(14,3) AS total_qty
    FROM ims.items i
    LEFT JOIN ims.inventory_movements m
      ON m.branch_id = i.branch_id
     AND m.item_id = i.item_id
     AND COALESCE(LOWER(to_jsonb(m) ->> 'is_deleted'), '0') NOT IN ('1', 'true', 't', 'yes')
    LEFT JOIN legacy_adjustments la
      ON la.branch_id = i.branch_id
     AND la.item_id = i.item_id
    GROUP BY i.branch_id, i.item_id, i.opening_balance, la.qty_delta
  )
`;

const getStoreMovementDetailRows = async (
  branchId: number,
  fromDate: string,
  toDate: string,
  storeId?: number,
  itemId?: number
): Promise<StoreMovementDetailRow[]> =>
  queryMany<StoreMovementDetailRow>(
    `WITH item_scope AS (
       SELECT
         i.branch_id,
         i.item_id::bigint AS item_id,
         COALESCE(i.name, 'Unknown Item')::text AS item_name,
         COALESCE(i.store_id, 0)::bigint AS store_id,
         COALESCE(st.store_name, 'Unassigned Store')::text AS store_name,
         COALESCE(i.opening_balance, 0)::double precision AS opening_qty
       FROM ims.items i
       LEFT JOIN ims.stores st ON st.store_id = i.store_id
       WHERE i.branch_id = $1
         AND i.is_active = TRUE
         AND ($4::bigint IS NULL OR COALESCE(i.store_id, 0) = $4::bigint)
         AND ($5::bigint IS NULL OR i.item_id = $5::bigint)
     ),
     movement_rollup AS (
       SELECT
         s.item_id,
         COALESCE(
           SUM(
             CASE
               WHEN m.move_date::date < $2::date
                 THEN COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)
               ELSE 0
             END
           ),
           0
         )::double precision AS delta_before,
         COALESCE(
           SUM(
             CASE
               WHEN m.move_date::date BETWEEN $2::date AND $3::date
                 AND LOWER(COALESCE(m.move_type::text, '')) = 'purchase'
                 THEN COALESCE(m.qty_in, 0)
               ELSE 0
             END
           ),
           0
         )::double precision AS purchase_qty,
         COALESCE(
           SUM(
             CASE
               WHEN m.move_date::date BETWEEN $2::date AND $3::date
                 AND LOWER(COALESCE(m.move_type::text, '')) = 'sale'
                 THEN COALESCE(m.qty_out, 0)
               ELSE 0
             END
           ),
           0
         )::double precision AS sales_qty,
         COALESCE(
           SUM(
             CASE
               WHEN m.move_date::date BETWEEN $2::date AND $3::date
                 AND LOWER(COALESCE(m.move_type::text, '')) = 'sales_return'
                 THEN COALESCE(m.qty_in, 0)
               ELSE 0
             END
           ),
           0
         )::double precision AS sales_return_qty,
         COALESCE(
           SUM(
             CASE
               WHEN m.move_date::date BETWEEN $2::date AND $3::date
                 AND LOWER(COALESCE(m.move_type::text, '')) = 'purchase_return'
                 THEN COALESCE(m.qty_out, 0)
               ELSE 0
             END
           ),
           0
         )::double precision AS purchase_return_qty,
         COALESCE(
           SUM(
             CASE
               WHEN m.move_date::date BETWEEN $2::date AND $3::date
                 AND LOWER(COALESCE(m.move_type::text, '')) = 'adjustment'
                 THEN COALESCE(m.qty_in, 0)
               ELSE 0
             END
           ),
           0
         )::double precision AS adjustment_in_qty,
         COALESCE(
           SUM(
             CASE
               WHEN m.move_date::date BETWEEN $2::date AND $3::date
                 AND LOWER(COALESCE(m.move_type::text, '')) = 'adjustment'
                 THEN COALESCE(m.qty_out, 0)
               ELSE 0
             END
           ),
           0
         )::double precision AS adjustment_out_qty,
         COALESCE(
           SUM(
             CASE
               WHEN m.move_date::date BETWEEN $2::date AND $3::date
                 THEN COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)
               ELSE 0
             END
           ),
           0
         )::double precision AS net_movement_qty
       FROM item_scope s
      LEFT JOIN ims.inventory_movements m
         ON m.branch_id = s.branch_id
        AND m.item_id = s.item_id
        AND m.move_date::date <= $3::date
        AND COALESCE(LOWER(to_jsonb(m) ->> 'is_deleted'), '0') NOT IN ('1', 'true', 't', 'yes')
       GROUP BY s.item_id
     )
     SELECT
       s.store_id,
       s.store_name,
       s.item_id,
       s.item_name,
       (s.opening_qty + COALESCE(mr.delta_before, 0))::double precision AS begin_qty,
       COALESCE(mr.purchase_qty, 0)::double precision AS purchase_qty,
       COALESCE(mr.sales_qty, 0)::double precision AS sales_qty,
       COALESCE(mr.sales_return_qty, 0)::double precision AS sales_return_qty,
       COALESCE(mr.purchase_return_qty, 0)::double precision AS purchase_return_qty,
       COALESCE(mr.adjustment_in_qty, 0)::double precision AS adjustment_in_qty,
       COALESCE(mr.adjustment_out_qty, 0)::double precision AS adjustment_out_qty,
       COALESCE(mr.net_movement_qty, 0)::double precision AS net_movement_qty,
       (s.opening_qty + COALESCE(mr.delta_before, 0) + COALESCE(mr.net_movement_qty, 0))::double precision AS ending_qty
     FROM item_scope s
     LEFT JOIN movement_rollup mr ON mr.item_id = s.item_id
     WHERE
       ABS(s.opening_qty + COALESCE(mr.delta_before, 0)) > 0.000001
       OR ABS(COALESCE(mr.net_movement_qty, 0)) > 0.000001
       OR ABS(s.opening_qty + COALESCE(mr.delta_before, 0) + COALESCE(mr.net_movement_qty, 0)) > 0.000001
     ORDER BY
       CASE WHEN s.store_id = 0 THEN 2147483647 ELSE s.store_id END ASC,
       s.store_name ASC,
       s.item_name ASC`,
    [branchId, fromDate, toDate, storeId ?? null, itemId ?? null]
  );

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
        AND COALESCE(sa.is_deleted, 0)::int = 0
        AND sa.adjustment_date::date BETWEEN $2::date AND $3::date
      ORDER BY sa.adjustment_date ASC, sa.adjustment_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getInventoryLoss(branchId: number, fromDate: string, toDate: string): Promise<InventoryLossRow[]> {
    // Prefer accounting-based reporting (stable over time even if item cost_price changes):
    // Inventory Loss report comes from the Inventory Loss/Shrinkage expense account GL postings.
    const lossAcc = await queryOne<{ acc_id: number }>(
      `SELECT acc_id
         FROM ims.accounts
        WHERE branch_id = $1
          AND LOWER(TRIM(name)) IN ('inventory loss', 'inventory shrinkage')
        ORDER BY acc_id
        LIMIT 1`,
      [branchId]
    );

    if (lossAcc?.acc_id) {
      const accId = Number(lossAcc.acc_id);
      const glRows = await queryMany<InventoryLossRow>(
        `SELECT
           COALESCE(sa.adjustment_id, at.ref_id)::bigint AS loss_id,
           at.txn_date::text AS loss_date,
           sa.item_id::bigint AS item_id,
           COALESCE(i.name, 'Unknown')::text AS item_name,
           COALESCE(sa.quantity, 0)::double precision AS quantity,
           CASE
             WHEN COALESCE(sa.quantity, 0) > 0 THEN (COALESCE(at.debit, 0) / NULLIF(sa.quantity, 0))::double precision
             ELSE 0::double precision
           END AS unit_cost,
           COALESCE(at.debit, 0)::double precision AS total_loss,
           COALESCE(sa.reason, '') AS reason,
           UPPER(COALESCE(sa.status, 'POSTED')) AS status,
           COALESCE(u.full_name, u.name, u.username, 'Unknown') AS created_by
         FROM ims.account_transactions at
         LEFT JOIN ims.stock_adjustment sa
           ON sa.adjustment_id = at.ref_id
          AND COALESCE(sa.is_deleted, 0)::int = 0
         LEFT JOIN ims.items i ON i.item_id = sa.item_id
         LEFT JOIN ims.users u ON u.user_id = sa.created_by
        WHERE at.branch_id = $1
          AND COALESCE(at.is_deleted, 0)::int = 0
          AND at.acc_id = $2
          AND at.debit > 0
          AND at.txn_date::date BETWEEN $3::date AND $4::date
          AND COALESCE(at.ref_table, '') = 'stock_adjustment'
          AND UPPER(COALESCE(sa.adjustment_type, 'DECREASE')) = 'DECREASE'
          AND UPPER(COALESCE(sa.status, 'POSTED')) = 'POSTED'
        ORDER BY at.txn_date ASC, COALESCE(sa.adjustment_id, at.ref_id) ASC`,
        [branchId, accId, fromDate, toDate]
      );

      if (glRows.length) return glRows;
    }

    // Fallback for older databases/rows without GL postings (uses current item cost_price).
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
        AND COALESCE(sa.is_deleted, 0)::int = 0
        AND sa.adjustment_date::date BETWEEN $2::date AND $3::date
        AND UPPER(COALESCE(sa.adjustment_type, 'INCREASE')) = 'DECREASE'
        AND UPPER(COALESCE(sa.status, 'POSTED')) = 'POSTED'
      ORDER BY sa.adjustment_date ASC, sa.adjustment_id ASC`,
      [branchId, fromDate, toDate]
    );
  },

  async getInventoryFound(branchId: number, fromDate: string, toDate: string): Promise<InventoryFoundRow[]> {
    const inventoryAccounts = await queryMany<{ acc_id: number; name: string; account_type: string }>(
      `SELECT
         a.acc_id,
         COALESCE(NULLIF(BTRIM(a.name), ''), 'Account #' || a.acc_id::text) AS name,
         COALESCE(a.account_type::text, 'asset') AS account_type
       FROM ims.accounts a
      WHERE a.branch_id = $1
        AND COALESCE(a.is_active, TRUE) = TRUE
      ORDER BY a.acc_id ASC`,
      [branchId]
    );

    const inventoryAccountIds = inventoryAccounts
      .filter((row) => normalizeName(row.account_type) === 'asset' && isInventoryAssetAccountName(String(row.name || '')))
      .map((row) => Number(row.acc_id));

    if (inventoryAccountIds.length) {
      const glRows = await queryMany<InventoryFoundRow>(
        `SELECT
           COALESCE(sa.adjustment_id, at.ref_id)::bigint AS found_id,
           at.txn_date::text AS found_date,
           sa.item_id::bigint AS item_id,
           COALESCE(i.name, 'Unknown')::text AS item_name,
           COALESCE(sa.quantity, 0)::double precision AS quantity,
           CASE
             WHEN COALESCE(sa.quantity, 0) > 0 THEN (COALESCE(at.debit, 0) / NULLIF(sa.quantity, 0))::double precision
             ELSE 0::double precision
           END AS unit_cost,
           COALESCE(at.debit, 0)::double precision AS total_found,
           COALESCE(sa.reason, '') AS reason,
           UPPER(COALESCE(sa.status, 'POSTED')) AS status,
           COALESCE(u.full_name, u.name, u.username, 'Unknown') AS created_by
         FROM ims.account_transactions at
         LEFT JOIN ims.stock_adjustment sa
           ON sa.adjustment_id = at.ref_id
          AND COALESCE(sa.is_deleted, 0)::int = 0
         LEFT JOIN ims.items i ON i.item_id = sa.item_id
         LEFT JOIN ims.users u ON u.user_id = sa.created_by
        WHERE at.branch_id = $1
          AND COALESCE(at.is_deleted, 0)::int = 0
          AND at.acc_id = ANY($4::bigint[])
          AND at.debit > 0
          AND at.txn_date::date BETWEEN $2::date AND $3::date
          AND COALESCE(at.ref_table, '') = 'stock_adjustment'
          AND UPPER(COALESCE(sa.adjustment_type, 'INCREASE')) = 'INCREASE'
          AND UPPER(COALESCE(sa.status, 'POSTED')) = 'POSTED'
        ORDER BY at.txn_date ASC, COALESCE(sa.adjustment_id, at.ref_id) ASC`,
        [branchId, fromDate, toDate, inventoryAccountIds]
      );
      if (glRows.length) return glRows;
    }

    return queryMany<InventoryFoundRow>(
      `SELECT
         sa.adjustment_id AS found_id,
         sa.adjustment_date::text AS found_date,
         sa.item_id,
         i.name AS item_name,
         COALESCE(sa.quantity, 0)::double precision AS quantity,
         COALESCE(i.cost_price, 0)::double precision AS unit_cost,
         (COALESCE(sa.quantity, 0) * COALESCE(i.cost_price, 0))::double precision AS total_found,
         COALESCE(sa.reason, '') AS reason,
         UPPER(COALESCE(sa.status, 'POSTED')) AS status,
         COALESCE(u.full_name, u.name, u.username, 'Unknown') AS created_by
       FROM ims.stock_adjustment sa
       JOIN ims.items i ON i.item_id = sa.item_id
       LEFT JOIN ims.users u ON u.user_id = sa.created_by
      WHERE i.branch_id = $1
        AND COALESCE(sa.is_deleted, 0)::int = 0
        AND sa.adjustment_date::date BETWEEN $2::date AND $3::date
        AND UPPER(COALESCE(sa.adjustment_type, 'INCREASE')) = 'INCREASE'
        AND UPPER(COALESCE(sa.status, 'POSTED')) = 'POSTED'
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
      `WITH ${legacyAdjustmentsCte},
       movement_totals AS (
         SELECT
           i.store_id,
           i.item_id,
           (
             COALESCE(i.opening_balance, 0)
             + COALESCE(SUM(COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)), 0)
             + COALESCE(la.qty_delta, 0)
           )::double precision AS quantity,
           COALESCE(i.cost_price, 0)::double precision AS cost_price
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
         GROUP BY i.store_id, i.item_id, i.opening_balance, i.cost_price, la.qty_delta
       )
       SELECT
         s.store_id,
         s.store_name,
         COUNT(DISTINCT mt.item_id)::int AS item_count,
         COALESCE(SUM(mt.quantity), 0)::double precision AS total_qty,
         COALESCE(SUM(mt.quantity * mt.cost_price), 0)::double precision AS stock_value
       FROM ims.stores s
       LEFT JOIN movement_totals mt ON mt.store_id = s.store_id
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
      `WITH ${legacyAdjustmentsCte},
       movement_totals AS (
         SELECT
           i.store_id,
           i.item_id,
           (
             COALESCE(i.opening_balance, 0)
             + COALESCE(SUM(COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)), 0)
             + COALESCE(la.qty_delta, 0)
           )::double precision AS quantity
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
         GROUP BY i.store_id, i.item_id, i.opening_balance, la.qty_delta
       )
       SELECT
         s.store_id,
         s.store_name,
         i.item_id,
         i.name AS item_name,
         COALESCE(i.barcode, '') AS barcode,
         COALESCE(mt.quantity, 0)::double precision AS quantity,
         COALESCE(i.cost_price, 0)::double precision AS cost_price,
         COALESCE(i.sell_price, i.cost_price, 0)::double precision AS sell_price,
         (COALESCE(mt.quantity, 0) * COALESCE(i.cost_price, 0))::double precision AS stock_value
       FROM ims.stores s
       JOIN ims.items i ON i.branch_id = s.branch_id AND COALESCE(i.store_id, 0) = s.store_id
       LEFT JOIN movement_totals mt ON mt.item_id = i.item_id AND mt.store_id = s.store_id
      WHERE s.branch_id = $1
        ${filter}
      ORDER BY s.store_id ASC, i.item_id ASC
      LIMIT 4000`,
      params
    );
  },

  async getStoreMovementSummary(
    branchId: number,
    fromDate: string,
    toDate: string,
    storeId?: number
  ): Promise<StoreMovementSummaryRow[]> {
    const detailRows = await getStoreMovementDetailRows(branchId, fromDate, toDate, storeId);
    const map = new Map<number, StoreMovementSummaryRow>();

    for (const row of detailRows) {
      const key = Number(row.store_id || 0);
      if (!map.has(key)) {
        map.set(key, {
          store_id: key,
          store_name: String(row.store_name || 'Store'),
          begin_qty: 0,
          purchase_qty: 0,
          sales_qty: 0,
          sales_return_qty: 0,
          purchase_return_qty: 0,
          adjustment_in_qty: 0,
          adjustment_out_qty: 0,
          net_movement_qty: 0,
          item_count: 0,
          ending_qty: 0,
        });
      }
      const acc = map.get(key)!;
      acc.begin_qty += Number(row.begin_qty || 0);
      acc.purchase_qty += Number(row.purchase_qty || 0);
      acc.sales_qty += Number(row.sales_qty || 0);
      acc.sales_return_qty += Number(row.sales_return_qty || 0);
      acc.purchase_return_qty += Number(row.purchase_return_qty || 0);
      acc.adjustment_in_qty += Number(row.adjustment_in_qty || 0);
      acc.adjustment_out_qty += Number(row.adjustment_out_qty || 0);
      acc.net_movement_qty += Number(row.net_movement_qty || 0);
      acc.ending_qty += Number(row.ending_qty || 0);
      acc.item_count += 1;
    }

    return Array.from(map.values()).sort((a, b) => {
      const left = Number(a.store_id || 0) === 0 ? 2147483647 : Number(a.store_id || 0);
      const right = Number(b.store_id || 0) === 0 ? 2147483647 : Number(b.store_id || 0);
      if (left !== right) return left - right;
      return String(a.store_name || '').localeCompare(String(b.store_name || ''));
    });
  },

  async getStoreMovementDetails(
    branchId: number,
    fromDate: string,
    toDate: string,
    storeId?: number,
    itemId?: number
  ): Promise<StoreMovementLedgerRow[]> {
    return queryMany<StoreMovementLedgerRow>(
      `WITH item_scope AS (
         SELECT
           i.branch_id,
           i.item_id::bigint AS item_id,
           COALESCE(i.name, 'Unknown Item')::text AS item_name,
           COALESCE(i.store_id, 0)::bigint AS store_id,
           COALESCE(st.store_name, 'Unassigned Store')::text AS store_name,
           COALESCE(i.opening_balance, 0)::double precision AS opening_qty,
           COALESCE(i.cost_price, 0)::double precision AS cost_price
         FROM ims.items i
         LEFT JOIN ims.stores st ON st.store_id = i.store_id
         WHERE i.branch_id = $1
           AND i.is_active = TRUE
           AND ($4::bigint IS NULL OR COALESCE(i.store_id, 0) = $4::bigint)
           AND ($5::bigint IS NULL OR i.item_id = $5::bigint)
       ),
       movement_base AS (
         SELECT
           m.move_id::bigint AS txn_id,
           m.move_date AS txn_date,
           COALESCE(i.store_id, 0)::bigint AS store_id,
           COALESCE(st.store_name, 'Unassigned Store')::text AS store_name,
           m.item_id::bigint AS item_id,
           COALESCE(i.name, 'Unknown Item')::text AS item_name,
           COALESCE(LOWER(m.move_type::text), 'adjustment')::text AS txn_type,
           COALESCE(m.ref_table::text, '')::text AS ref_table,
           m.ref_id::bigint AS ref_id,
           COALESCE(m.qty_in, 0)::double precision AS qty_in,
           COALESCE(m.qty_out, 0)::double precision AS qty_out,
           COALESCE(m.unit_cost, i.cost_price, 0)::double precision AS unit_cost,
           COALESCE(m.note, '')::text AS memo,
           (COALESCE(m.qty_in, 0) * COALESCE(m.unit_cost, i.cost_price, 0))::double precision AS debit,
           (COALESCE(m.qty_out, 0) * COALESCE(m.unit_cost, i.cost_price, 0))::double precision AS credit
         FROM ims.inventory_movements m
         LEFT JOIN ims.items i ON i.item_id = m.item_id
         LEFT JOIN ims.stores st ON st.store_id = i.store_id
         WHERE m.branch_id = $1
           AND m.move_date::date <= $3::date
           AND COALESCE(LOWER(to_jsonb(m) ->> 'is_deleted'), '0') NOT IN ('1', 'true', 't', 'yes')
           AND ($4::bigint IS NULL OR COALESCE(i.store_id, 0) = $4::bigint)
           AND ($5::bigint IS NULL OR m.item_id = $5::bigint)
       ),
       opening_items AS (
         SELECT
           s.store_id,
           COALESCE(SUM(s.opening_qty * s.cost_price), 0)::double precision AS opening_value
         FROM item_scope s
         GROUP BY s.store_id
       ),
       opening_moves AS (
         SELECT
           mb.store_id,
           COALESCE(SUM(COALESCE(mb.debit, 0) - COALESCE(mb.credit, 0)), 0)::double precision AS move_value
         FROM movement_base mb
         WHERE mb.txn_date::date < $2::date
         GROUP BY mb.store_id
       ),
       opening AS (
         SELECT
           COALESCE(oi.store_id, om.store_id) AS store_id,
           (COALESCE(oi.opening_value, 0) + COALESCE(om.move_value, 0))::double precision AS opening_balance
         FROM opening_items oi
         FULL OUTER JOIN opening_moves om ON om.store_id = oi.store_id
       ),
       opening_rows AS (
         SELECT
           0::bigint AS txn_id,
           $2::date::timestamptz AS txn_date,
           o.store_id,
           COALESCE(st.store_name, 'Unassigned Store')::text AS store_name,
           0::bigint AS item_id,
           ''::text AS item_name,
           'opening'::text AS txn_type,
           ''::text AS ref_table,
           NULL::bigint AS ref_id,
           'OB'::text AS txn_number,
           ''::text AS party_name,
           'Opening Balance'::text AS memo,
           'Opening Balance Equity'::text AS split_account,
           0::double precision AS debit,
           0::double precision AS credit,
           o.opening_balance::double precision AS running_balance
         FROM opening o
         LEFT JOIN ims.stores st ON st.store_id = o.store_id
         WHERE ABS(COALESCE(o.opening_balance, 0)) > 0.000001
       ),
       filtered AS (
         SELECT *
         FROM movement_base mb
         WHERE mb.txn_date::date BETWEEN $2::date AND $3::date
       ),
       running AS (
         SELECT
           f.txn_id,
           f.txn_date,
           f.store_id,
           f.store_name,
           f.item_id,
           f.item_name,
           f.txn_type,
           f.ref_table,
           f.ref_id,
           COALESCE(f.ref_id::text, '') AS txn_number,
           COALESCE(
             NULLIF(BTRIM(COALESCE(c_sale.full_name, c_sr.full_name, s_purchase.name, s_pr.name)), ''),
             ''
           ) AS party_name,
           f.memo,
           CASE
             WHEN f.txn_type = 'purchase' THEN 'Accounts Payable'
             WHEN f.txn_type = 'sale' THEN 'Accounts Receivable'
             WHEN f.txn_type = 'sales_return' THEN 'Accounts Receivable'
             WHEN f.txn_type = 'purchase_return' THEN 'Accounts Payable'
             WHEN f.txn_type = 'adjustment' THEN 'Inventory Gain/Loss'
             ELSE '-SPLIT-'
           END::text AS split_account,
           f.debit,
           f.credit,
           (
             COALESCE(o.opening_balance, 0)
             + SUM(COALESCE(f.debit, 0) - COALESCE(f.credit, 0))
               OVER (
                 PARTITION BY f.store_id
                 ORDER BY f.txn_date, f.txn_id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               )
           )::double precision AS running_balance
         FROM filtered f
         LEFT JOIN opening o ON o.store_id = f.store_id
         LEFT JOIN ims.sales sale
           ON COALESCE(f.ref_table, '') = 'sales'
          AND sale.branch_id = $1
          AND sale.sale_id = f.ref_id
         LEFT JOIN ims.customers c_sale ON c_sale.customer_id = sale.customer_id
         LEFT JOIN ims.sales_returns sr
           ON COALESCE(f.ref_table, '') = 'sales_returns'
          AND sr.branch_id = $1
          AND sr.sr_id = f.ref_id
         LEFT JOIN ims.customers c_sr ON c_sr.customer_id = sr.customer_id
         LEFT JOIN ims.purchases purchase
           ON COALESCE(f.ref_table, '') = 'purchases'
          AND purchase.branch_id = $1
          AND purchase.purchase_id = f.ref_id
         LEFT JOIN ims.suppliers s_purchase ON s_purchase.supplier_id = purchase.supplier_id
         LEFT JOIN ims.purchase_returns pr
           ON COALESCE(f.ref_table, '') = 'purchase_returns'
          AND pr.branch_id = $1
          AND pr.pr_id = f.ref_id
         LEFT JOIN ims.suppliers s_pr ON s_pr.supplier_id = pr.supplier_id
       )
       SELECT
         x.txn_id,
         x.txn_date::text AS txn_date,
         x.store_id,
         x.store_name,
         x.item_id,
         x.item_name,
         x.txn_type,
         x.ref_table,
         x.ref_id,
         x.txn_number,
         x.party_name,
         x.memo,
         x.split_account,
         x.debit,
         x.credit,
         x.running_balance
       FROM (
         SELECT * FROM opening_rows
         UNION ALL
         SELECT * FROM running
       ) x
       ORDER BY
         CASE WHEN x.store_id = 0 THEN 2147483647 ELSE x.store_id END ASC,
         x.store_name ASC,
         x.txn_date ASC,
         x.txn_id ASC
       LIMIT 8000`,
      [branchId, fromDate, toDate, storeId ?? null, itemId ?? null]
    );
  },
};
