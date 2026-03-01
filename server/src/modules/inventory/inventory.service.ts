import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { PoolClient } from 'pg';

type AuthContext = { userId?: number | null } | undefined;

const ensureItemBranchWarehouse = async (
  client: PoolClient,
  productId: number,
  branchId: number,
  whId?: number | null
) => {
  const product = await client.query(
    `SELECT item_id
       FROM ims.items
      WHERE item_id = $1
        AND branch_id = $2
        AND is_active = TRUE`,
    [productId, branchId]
  );
  if (!product.rows[0]) {
    throw ApiError.badRequest('Item not found or inactive');
  }

  const branch = await client.query(
    `SELECT branch_id
       FROM ims.branches
      WHERE branch_id = $1
        AND is_active = TRUE`,
    [branchId]
  );
  if (!branch.rows[0]) {
    throw ApiError.badRequest('Branch not found or inactive');
  }

  if (whId) {
    const warehouse = await client.query(
      `SELECT wh_id
         FROM ims.warehouses
        WHERE wh_id = $1
          AND branch_id = $2
          AND is_active = TRUE`,
      [whId, branchId]
    );
    if (!warehouse.rows[0]) {
      throw ApiError.badRequest('Warehouse does not belong to branch');
    }
  }
};

let cachedInventoryMovementSoftDelete: boolean | null = null;
let cachedInventoryTransactionColumns:
  | { hasStoreId: boolean; hasDirection: boolean; hasItemId: boolean }
  | null = null;
let cachedItemsHasStockAlert: boolean | null = null;
let cachedStockAdjustmentTable: boolean | null = null;
let cachedStockAdjustmentColumns: { hasBranchId: boolean; hasNote: boolean } | null = null;
let cachedSalesHasPaidAmount: boolean | null = null;
let cachedSalesHasDocType: boolean | null = null;
let cachedSalesHasStatus: boolean | null = null;
let cachedSalePaymentsTable: boolean | null = null;

const hasInventoryMovementSoftDelete = async (): Promise<boolean> => {
  if (cachedInventoryMovementSoftDelete !== null) {
    return cachedInventoryMovementSoftDelete;
  }

  const result = await queryOne<{ has_column: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'inventory_movements'
          AND column_name = 'is_deleted'
     ) AS has_column`
  );

  cachedInventoryMovementSoftDelete = Boolean(result?.has_column);
  return cachedInventoryMovementSoftDelete;
};

const hasItemsStockAlertColumn = async (): Promise<boolean> => {
  if (cachedItemsHasStockAlert !== null) return cachedItemsHasStockAlert;
  const row = await queryOne<{ has_column: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'items'
          AND column_name = 'stock_alert'
     ) AS has_column`
  );
  cachedItemsHasStockAlert = Boolean(row?.has_column);
  return cachedItemsHasStockAlert;
};

const hasStockAdjustmentTable = async (): Promise<boolean> => {
  if (cachedStockAdjustmentTable !== null) return cachedStockAdjustmentTable;
  const row = await queryOne<{ has_table: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'ims'
          AND table_name = 'stock_adjustment'
     ) AS has_table`
  );
  cachedStockAdjustmentTable = Boolean(row?.has_table);
  return cachedStockAdjustmentTable;
};

const getStockAdjustmentColumns = async (): Promise<{ hasBranchId: boolean; hasNote: boolean }> => {
  if (cachedStockAdjustmentColumns) return cachedStockAdjustmentColumns;
  const row = await queryOne<{ has_branch_id: boolean; has_note: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'stock_adjustment'
            AND column_name = 'branch_id'
       ) AS has_branch_id,
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'stock_adjustment'
            AND column_name = 'note'
       ) AS has_note`
  );
  cachedStockAdjustmentColumns = {
    hasBranchId: Boolean(row?.has_branch_id),
    hasNote: Boolean(row?.has_note),
  };
  return cachedStockAdjustmentColumns;
};

const hasSalesPaidAmountColumn = async (): Promise<boolean> => {
  if (cachedSalesHasPaidAmount !== null) return cachedSalesHasPaidAmount;
  const row = await queryOne<{ has_column: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'sales'
          AND column_name = 'paid_amount'
     ) AS has_column`
  );
  cachedSalesHasPaidAmount = Boolean(row?.has_column);
  return cachedSalesHasPaidAmount;
};

const hasSalesDocTypeColumn = async (): Promise<boolean> => {
  if (cachedSalesHasDocType !== null) return cachedSalesHasDocType;
  const row = await queryOne<{ has_column: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'sales'
          AND column_name = 'doc_type'
     ) AS has_column`
  );
  cachedSalesHasDocType = Boolean(row?.has_column);
  return cachedSalesHasDocType;
};

const hasSalesStatusColumn = async (): Promise<boolean> => {
  if (cachedSalesHasStatus !== null) return cachedSalesHasStatus;
  const row = await queryOne<{ has_column: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'ims'
          AND table_name = 'sales'
          AND column_name = 'status'
     ) AS has_column`
  );
  cachedSalesHasStatus = Boolean(row?.has_column);
  return cachedSalesHasStatus;
};

const hasSalePaymentsTable = async (): Promise<boolean> => {
  if (cachedSalePaymentsTable !== null) return cachedSalePaymentsTable;
  const row = await queryOne<{ has_table: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'ims'
          AND table_name = 'sale_payments'
     ) AS has_table`
  );
  cachedSalePaymentsTable = Boolean(row?.has_table);
  return cachedSalePaymentsTable;
};

const getInventoryTransactionColumns = async (): Promise<{
  hasStoreId: boolean;
  hasDirection: boolean;
  hasItemId: boolean;
}> => {
  if (cachedInventoryTransactionColumns) {
    return cachedInventoryTransactionColumns;
  }
  const row = await queryOne<{ has_store_id: boolean; has_direction: boolean; has_item_id: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'inventory_transaction'
            AND column_name = 'store_id'
       ) AS has_store_id,
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'inventory_transaction'
            AND column_name = 'direction'
       ) AS has_direction,
       EXISTS (
         SELECT 1
           FROM information_schema.columns
          WHERE table_schema = 'ims'
            AND table_name = 'inventory_transaction'
            AND column_name = 'item_id'
       ) AS has_item_id`
  );
  cachedInventoryTransactionColumns = {
    hasStoreId: Boolean(row?.has_store_id),
    hasDirection: Boolean(row?.has_direction),
    hasItemId: Boolean(row?.has_item_id),
  };
  return cachedInventoryTransactionColumns;
};

const resolveTransactionDirection = (
  type: 'ADJUSTMENT' | 'PAID' | 'SALES' | 'DAMAGE',
  direction?: 'IN' | 'OUT'
): 'IN' | 'OUT' => {
  if (type === 'ADJUSTMENT') return direction || 'IN';
  if (type === 'SALES' || type === 'DAMAGE') return 'OUT';
  return direction || 'IN';
};

const getScopedAdjustmentRow = async (
  client: PoolClient,
  adjustmentId: number,
  scope?: BranchScope
) => {
  if (!scope || scope.isAdmin) {
    const result = await client.query<{
      adjustment_id: number;
      item_id: number;
      branch_id: number;
    }>(
      `SELECT a.adjustment_id, a.item_id, i.branch_id
         FROM ims.stock_adjustment a
         JOIN ims.items i ON i.item_id = a.item_id
        WHERE a.adjustment_id = $1
        LIMIT 1`,
      [adjustmentId]
    );
    return result.rows[0] || null;
  }

  const result = await client.query<{
    adjustment_id: number;
    item_id: number;
    branch_id: number;
  }>(
    `SELECT a.adjustment_id, a.item_id, i.branch_id
       FROM ims.stock_adjustment a
       JOIN ims.items i ON i.item_id = a.item_id
      WHERE a.adjustment_id = $1
        AND i.branch_id = ANY($2)
      LIMIT 1`,
    [adjustmentId, scope.branchIds]
  );
  return result.rows[0] || null;
};

const createAdjustmentEntry = async (
  client: PoolClient,
  payload: {
    branchId: number;
    whId?: number | null;
    productId: number;
    qty: number;
    unitCost?: number;
    note?: string;
    reason: string;
    status?: 'POSTED' | 'CANCELLED';
    userId?: number | null;
  }
) => {
  if (payload.qty === 0) {
    throw ApiError.badRequest('Quantity difference cannot be zero');
  }
  if (!payload.userId) {
    throw ApiError.unauthorized('Authentication required');
  }

  await ensureItemBranchWarehouse(client, payload.productId, payload.branchId, payload.whId);

  if (payload.whId) {
    if (payload.qty > 0) {
      await client.query(`SELECT ims.fn_stock_add($1, $2, $3, $4)`, [
        payload.branchId,
        payload.whId,
        payload.productId,
        payload.qty,
      ]);
    } else {
      await client.query(`SELECT ims.fn_stock_sub($1, $2, $3, $4)`, [
        payload.branchId,
        payload.whId,
        payload.productId,
        Math.abs(payload.qty),
      ]);
    }
  }

  const stockAdjustmentTableExists = await hasStockAdjustmentTable();
  if (!stockAdjustmentTableExists) {
    const qtyIn = payload.qty > 0 ? payload.qty : 0;
    const qtyOut = payload.qty < 0 ? Math.abs(payload.qty) : 0;
    const movement = await client.query<{
      move_id: number;
      branch_id: number;
      wh_id: number | null;
      move_date: string;
      note: string | null;
    }>(
      `INSERT INTO ims.inventory_movements
         (branch_id, wh_id, item_id, move_type, ref_table, ref_id, qty_in, qty_out, unit_cost, note)
       VALUES ($1, $2, $3, 'adjustment', 'inventory_adjustments', NULL, $4, $5, $6, NULLIF($7, ''))
       RETURNING move_id, branch_id, wh_id, move_date, note`,
      [
        payload.branchId,
        payload.whId ?? null,
        payload.productId,
        qtyIn,
        qtyOut,
        payload.unitCost ?? 0,
        payload.note || payload.reason || '',
      ]
    );
    return {
      adj_id: movement.rows[0].move_id,
      branch_id: movement.rows[0].branch_id,
      wh_id: movement.rows[0].wh_id,
      user_id: payload.userId ?? null,
      reason: payload.reason,
      note: movement.rows[0].note,
      adj_date: movement.rows[0].move_date,
      item_id: payload.productId,
      qty_delta: payload.qty,
      unit_cost: payload.unitCost ?? 0,
    };
  }

  const stockAdjustmentCols = await getStockAdjustmentColumns();
  const columns: string[] = [];
  const values: unknown[] = [];

  if (stockAdjustmentCols.hasBranchId) {
    columns.push('branch_id');
    values.push(payload.branchId);
  }
  columns.push('item_id', 'adjustment_type', 'quantity', 'reason', 'created_by', 'status');
  values.push(
    payload.productId,
    payload.qty >= 0 ? 'INCREASE' : 'DECREASE',
    Math.abs(payload.qty),
    payload.reason,
    payload.userId,
    payload.status || 'POSTED'
  );
  if (stockAdjustmentCols.hasNote) {
    columns.push('note');
    values.push(payload.note || null);
  }

  const adjustment = await client.query<{
    adjustment_id: number;
    branch_id?: number;
    item_id: number;
    adjustment_date: string;
    reason: string;
    created_by: number | null;
  }>(
    `INSERT INTO ims.stock_adjustment
       (${columns.join(', ')})
     VALUES
       (${values.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING adjustment_id, ${stockAdjustmentCols.hasBranchId ? 'branch_id,' : ''} item_id, adjustment_date, reason, created_by`,
    values
  );

  return {
    adj_id: adjustment.rows[0].adjustment_id,
    branch_id: Number(adjustment.rows[0].branch_id ?? payload.branchId),
    wh_id: payload.whId ?? null,
    user_id: adjustment.rows[0].created_by,
    reason: adjustment.rows[0].reason,
    note: payload.note || null,
    adj_date: adjustment.rows[0].adjustment_date,
    item_id: adjustment.rows[0].item_id,
    qty_delta: payload.qty,
    unit_cost: payload.unitCost ?? 0,
  };
};

export const inventoryService = {
  async listPurchasedItems(filters: any) {
    const { branchId, branchIds, search } = filters;
    const params: any[] = [];
    const where: string[] = ['i.is_active = TRUE'];

    if (branchId) {
      params.push(branchId);
      where.push(`i.branch_id = $${params.length}`);
    } else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`i.branch_id = ANY($${params.length})`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`i.name ILIKE $${params.length}`);
    }

    const hasAlert = await hasItemsStockAlertColumn();
    const alertExpr = hasAlert ? 'i.stock_alert' : '5';

    return queryMany(
      `WITH purchase_cost AS (
         SELECT
          pi.item_id,
          MAX(pu.purchase_date) AS last_purchase_date,
          (ARRAY_AGG(COALESCE(NULLIF(pi.unit_cost, 0), 0) ORDER BY pu.purchase_date DESC, pi.purchase_item_id DESC))[1] AS latest_cost
         FROM ims.purchase_items pi
         JOIN ims.purchases pu ON pu.purchase_id = pi.purchase_id
         WHERE pi.item_id IS NOT NULL
           AND COALESCE(pu.status::text, 'received') <> 'void'
           AND COALESCE(pi.quantity, 0) > 0
         GROUP BY pi.item_id
       )
       SELECT
          i.item_id,
          i.item_id AS product_id,
          i.branch_id,
          i.name AS item_name,
          COALESCE(pc.latest_cost, i.cost_price, 0)::numeric(14,2) AS cost_price,
          COALESCE(i.sell_price, i.cost_price, 0)::numeric(14,2) AS sale_price,
          COALESCE(pc.latest_cost, i.cost_price, 0)::numeric(14,2) AS last_unit_cost,
          COALESCE(
            pc.latest_cost,
            i.cost_price,
            0
          )::numeric(14,2) AS weighted_unit_cost,
          COALESCE(${alertExpr}, 0)::numeric(14,3) AS min_stock_threshold,
          pc.last_purchase_date
       FROM ims.items i
       LEFT JOIN purchase_cost pc ON pc.item_id = i.item_id
      WHERE ${where.join(' AND ')}
      ORDER BY i.name`,
      params
    );
  },

  async listStock(filters: any) {
    const { branchId, branchIds, whId, productId, search, page, limit } = filters;
    const params: any[] = [];
    const where: string[] = ['i.is_active = TRUE'];

    if (branchId) { params.push(branchId); where.push(`i.branch_id = $${params.length}`); }
    else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`i.branch_id = ANY($${params.length})`);
    }
    if (whId) {
      params.push(whId);
      where.push(
        `EXISTS (
           SELECT 1
             FROM ims.store_items sis
            WHERE sis.product_id = i.item_id
              AND sis.store_id = $${params.length}
         )`
      );
    }
    if (productId) { params.push(productId); where.push(`i.item_id = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`i.name ILIKE $${params.length}`); }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const hasAlert = await hasItemsStockAlertColumn();
    const alertExpr = hasAlert ? 'i.stock_alert' : '5';

    return queryMany(
      `WITH store_totals AS (
         SELECT
           i.branch_id,
           i.item_id,
           CASE
             WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
             ELSE COALESCE(st.store_qty, 0)
           END::numeric(14,3) AS store_qty,
           COALESCE(st.store_breakdown, '[]'::json) AS store_breakdown
         FROM ims.items i
         LEFT JOIN (
           SELECT
             s.branch_id,
             si.product_id AS item_id,
             COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS store_qty,
             COUNT(*)::int AS row_count,
             json_agg(
               json_build_object(
                 'wh_id', s.store_id,
                 'wh_name', s.store_name,
                 'quantity', si.quantity
               )
               ORDER BY s.store_name
             ) AS store_breakdown
           FROM ims.store_items si
           JOIN ims.stores s ON s.store_id = si.store_id
           GROUP BY s.branch_id, si.product_id
         ) st
           ON st.item_id = i.item_id
          AND st.branch_id = i.branch_id
       )
       SELECT
             i.item_id AS product_id,
             i.item_id AS item_id,
             i.name,
             i.name AS item_name,
             i.barcode,
             b.branch_id,
             b.branch_name,
             COALESCE(st.store_qty, 0)::numeric(14,3) AS warehouse_qty,
             0::numeric(14,3) AS branch_qty,
             COALESCE(st.store_qty, 0)::numeric(14,3) AS total_qty,
             COALESCE(i.cost_price, 0)::numeric(14,2) AS cost_price,
             COALESCE(i.sell_price, i.cost_price, 0)::numeric(14,2) AS sale_price,
             (COALESCE(st.store_qty, 0) * COALESCE(i.cost_price, 0))::numeric(14,2) AS stock_value,
             GREATEST(COALESCE(NULLIF(${alertExpr}, 0), 5), 1)::numeric(14,3) AS min_stock_threshold,
             (COALESCE(st.store_qty, 0) <= GREATEST(COALESCE(NULLIF(${alertExpr}, 0), 5), 1)) AS low_stock,
             FALSE AS qty_mismatch,
            st.store_breakdown AS warehouse_breakdown
        FROM ims.items i
        JOIN ims.branches b ON b.branch_id = i.branch_id
         LEFT JOIN store_totals st
          ON st.item_id = i.item_id
         AND st.branch_id = i.branch_id
       WHERE ${where.join(' AND ')}
       ORDER BY i.name, b.branch_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
  },

  async listMovements(filters: any) {
    const { branchId, branchIds, whId, productId, search, page, limit } = filters;
    const movementHasSoftDelete = await hasInventoryMovementSoftDelete();
    const params: any[] = [];
    const where: string[] = ['1=1'];
    if (movementHasSoftDelete) {
      where.unshift('(m.is_deleted IS NULL OR m.is_deleted = FALSE)');
    }
    if (branchId) { params.push(branchId); where.push(`m.branch_id = $${params.length}`); }
    else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`m.branch_id = ANY($${params.length})`);
    }
    if (whId) { params.push(whId); where.push(`m.wh_id = $${params.length}`); }
    if (productId) { params.push(productId); where.push(`m.item_id = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`p.name ILIKE $${params.length}`); }
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    return queryMany(
      `SELECT m.*, p.name AS product_name, p.name AS item_name, w.wh_name, b.branch_name
         FROM ims.inventory_movements m
         JOIN ims.items p ON p.item_id = m.item_id
         LEFT JOIN ims.warehouses w ON w.wh_id = m.wh_id
         LEFT JOIN ims.branches b ON b.branch_id = m.branch_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.move_date DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
  },

  async listAdjustments(filters: any) {
    if (!(await hasStockAdjustmentTable())) {
      const movementHasSoftDelete = await hasInventoryMovementSoftDelete();
      const { branchId, branchIds, productId, search, page, limit } = filters;
      const params: any[] = [];
      const where: string[] = [`m.move_type = 'adjustment'`];
      if (movementHasSoftDelete) where.push('(m.is_deleted IS NULL OR m.is_deleted = FALSE)');
      if (branchId) {
        params.push(branchId);
        where.push(`m.branch_id = $${params.length}`);
      } else if (Array.isArray(branchIds) && branchIds.length) {
        params.push(branchIds);
        where.push(`m.branch_id = ANY($${params.length})`);
      }
      if (productId) {
        params.push(productId);
        where.push(`m.item_id = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(
          p.name ILIKE $${params.length}
          OR COALESCE(m.note,'') ILIKE $${params.length}
          OR b.branch_name ILIKE $${params.length}
        )`);
      }
      const offset = (page - 1) * limit;
      params.push(limit, offset);
      return queryMany(
        `SELECT
            m.move_id AS adj_id,
            m.move_date AS adj_date,
            m.branch_id,
            b.branch_name,
            m.wh_id,
            w.wh_name,
            m.item_id,
            CASE WHEN COALESCE(m.qty_out, 0) > 0 THEN 'DECREASE' ELSE 'INCREASE' END::text AS adjustment_type,
            GREATEST(COALESCE(m.qty_in, 0), COALESCE(m.qty_out, 0))::numeric(14,3) AS quantity,
            'POSTED'::text AS status,
            'Manual Adjustment'::text AS reason,
            m.note,
            COALESCE(u.name, u.username, 'System') AS created_by,
            COALESCE(p.name, '-') AS item_names,
            (COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0))::numeric(14,3) AS qty_delta,
            ((COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)) * COALESCE(m.unit_cost, 0))::numeric(14,2) AS value_delta,
            1::bigint AS line_count
         FROM ims.inventory_movements m
         LEFT JOIN ims.items p ON p.item_id = m.item_id
         LEFT JOIN ims.branches b ON b.branch_id = m.branch_id
         LEFT JOIN ims.warehouses w ON w.wh_id = m.wh_id
         LEFT JOIN ims.users u ON u.user_id = m.ref_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.move_date DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
    }

    const { branchId, branchIds, productId, search, page, limit } = filters;
    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (branchId) {
      params.push(branchId);
      where.push(`p.branch_id = $${params.length}`);
    } else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`p.branch_id = ANY($${params.length})`);
    }
    if (productId) {
      params.push(productId);
      where.push(`a.item_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        p.name ILIKE $${params.length}
        OR a.reason ILIKE $${params.length}
        OR b.branch_name ILIKE $${params.length}
      )`);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    return queryMany(
      `SELECT
          a.adjustment_id AS adj_id,
          a.adjustment_date AS adj_date,
          p.branch_id,
          b.branch_name,
          NULL::bigint AS wh_id,
          NULL::text AS wh_name,
          a.item_id,
          UPPER(COALESCE(a.adjustment_type::text, 'INCREASE')) AS adjustment_type,
          COALESCE(a.quantity, 0)::numeric(14,3) AS quantity,
          UPPER(COALESCE(a.status::text, 'POSTED')) AS status,
          a.reason,
          NULL::text AS note,
          COALESCE(u.name, u.username, 'System') AS created_by,
          COALESCE(p.name, '-') AS item_names,
          CASE WHEN LOWER(a.adjustment_type::text) = 'increase' THEN a.quantity ELSE -a.quantity END::numeric(14,3) AS qty_delta,
          (a.quantity * COALESCE(p.cost_price, 0))::numeric(14,2) AS value_delta,
          1::bigint AS line_count
       FROM ims.stock_adjustment a
       LEFT JOIN ims.items p ON p.item_id = a.item_id
       LEFT JOIN ims.branches b ON b.branch_id = p.branch_id
       LEFT JOIN ims.users u ON u.user_id = a.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY a.adjustment_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
  },

  async listRecounts(filters: any) {
    if (!(await hasStockAdjustmentTable())) {
      const movementHasSoftDelete = await hasInventoryMovementSoftDelete();
      const { branchId, branchIds, productId, search, page, limit } = filters;
      const params: any[] = [];
      const where: string[] = [
        `m.move_type = 'adjustment'`,
        `LOWER(COALESCE(m.note, '')) LIKE 'recount current %'`,
      ];
      if (movementHasSoftDelete) where.push('(m.is_deleted IS NULL OR m.is_deleted = FALSE)');
      if (branchId) {
        params.push(branchId);
        where.push(`m.branch_id = $${params.length}`);
      } else if (Array.isArray(branchIds) && branchIds.length) {
        params.push(branchIds);
        where.push(`m.branch_id = ANY($${params.length})`);
      }
      if (productId) {
        params.push(productId);
        where.push(`m.item_id = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(
          p.name ILIKE $${params.length}
          OR COALESCE(m.note,'') ILIKE $${params.length}
          OR b.branch_name ILIKE $${params.length}
        )`);
      }
      const offset = (page - 1) * limit;
      params.push(limit, offset);
      return queryMany(
        `SELECT
            m.move_id AS adj_id,
            m.move_date AS adj_date,
            m.branch_id,
            b.branch_name,
            m.wh_id,
            w.wh_name,
            m.item_id,
            CASE WHEN COALESCE(m.qty_out, 0) > 0 THEN 'DECREASE' ELSE 'INCREASE' END::text AS adjustment_type,
            GREATEST(COALESCE(m.qty_in, 0), COALESCE(m.qty_out, 0))::numeric(14,3) AS quantity,
            'POSTED'::text AS status,
            'Stock Recount'::text AS reason,
            m.note,
            COALESCE(u.name, u.username, 'System') AS created_by,
            COALESCE(p.name, '-') AS item_names,
            (COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0))::numeric(14,3) AS qty_delta,
            ((COALESCE(m.qty_in, 0) - COALESCE(m.qty_out, 0)) * COALESCE(m.unit_cost, 0))::numeric(14,2) AS value_delta,
            1::bigint AS line_count
         FROM ims.inventory_movements m
         LEFT JOIN ims.items p ON p.item_id = m.item_id
         LEFT JOIN ims.branches b ON b.branch_id = m.branch_id
         LEFT JOIN ims.warehouses w ON w.wh_id = m.wh_id
         LEFT JOIN ims.users u ON u.user_id = m.ref_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.move_date DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
    }

    const { branchId, branchIds, productId, search, page, limit } = filters;
    const params: any[] = [];
    const where: string[] = [`LOWER(a.reason) LIKE 'stock recount%'`];

    if (branchId) {
      params.push(branchId);
      where.push(`p.branch_id = $${params.length}`);
    } else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`p.branch_id = ANY($${params.length})`);
    }
    if (productId) {
      params.push(productId);
      where.push(`a.item_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        p.name ILIKE $${params.length}
        OR b.branch_name ILIKE $${params.length}
      )`);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    return queryMany(
      `SELECT
          a.adjustment_id AS adj_id,
          a.adjustment_date AS adj_date,
          p.branch_id,
          b.branch_name,
          NULL::bigint AS wh_id,
          NULL::text AS wh_name,
          a.item_id,
          UPPER(COALESCE(a.adjustment_type::text, 'INCREASE')) AS adjustment_type,
          COALESCE(a.quantity, 0)::numeric(14,3) AS quantity,
          UPPER(COALESCE(a.status::text, 'POSTED')) AS status,
          a.reason,
          NULL::text AS note,
          COALESCE(u.name, u.username, 'System') AS created_by,
          COALESCE(p.name, '-') AS item_names,
          CASE WHEN LOWER(a.adjustment_type::text) = 'increase' THEN a.quantity ELSE -a.quantity END::numeric(14,3) AS qty_delta,
          (a.quantity * COALESCE(p.cost_price, 0))::numeric(14,2) AS value_delta,
          1::bigint AS line_count
       FROM ims.stock_adjustment a
       LEFT JOIN ims.items p ON p.item_id = a.item_id
       LEFT JOIN ims.branches b ON b.branch_id = p.branch_id
       LEFT JOIN ims.users u ON u.user_id = a.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY a.adjustment_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
  },

  async listBranches(filters: any) {
    const { includeInactive, branchIds } = filters;
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`branch_id = ANY($${params.length})`);
    }
    if (!includeInactive) {
      where.push('is_active = TRUE');
    }

    return queryMany(
      `SELECT branch_id, branch_name, address AS location, phone, is_active, created_at
         FROM ims.branches
        WHERE ${where.join(' AND ')}
        ORDER BY branch_name`,
      params
    );
  },

  async createBranch(input: any) {
    const duplicate = await queryOne(
      `SELECT branch_id
         FROM ims.branches
        WHERE LOWER(branch_name) = LOWER($1)`,
      [input.branchName]
    );
    if (duplicate) {
      throw ApiError.conflict('Branch name already exists');
    }

    return queryOne(
      `INSERT INTO ims.branches (branch_name, address, phone, is_active)
       VALUES ($1, NULLIF($2,''), NULLIF($3,''), COALESCE($4, TRUE))
       RETURNING branch_id, branch_name, address AS location, phone, is_active, created_at`,
      [input.branchName, input.location || '', input.phone || '', input.isActive]
    );
  },

  async updateBranch(id: number, input: any) {
    if (input.branchName !== undefined) {
      const duplicate = await queryOne(
        `SELECT branch_id
           FROM ims.branches
          WHERE LOWER(branch_name) = LOWER($1)
            AND branch_id <> $2`,
        [input.branchName, id]
      );
      if (duplicate) {
        throw ApiError.conflict('Branch name already exists');
      }
    }

    const updates: string[] = [];
    const params: any[] = [id];
    let p = 2;

    if (input.branchName !== undefined) {
      updates.push(`branch_name = $${p++}`);
      params.push(input.branchName);
    }
    if (input.location !== undefined) {
      updates.push(`address = NULLIF($${p},'')`);
      params.push(input.location || '');
      p += 1;
    }
    if (input.phone !== undefined) {
      updates.push(`phone = NULLIF($${p++},'')`);
      params.push(input.phone || '');
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${p++}`);
      params.push(input.isActive);
    }

    if (!updates.length) {
      return queryOne(
        `SELECT branch_id, branch_name, address AS location, phone, is_active, created_at
           FROM ims.branches
          WHERE branch_id = $1`,
        [id]
      );
    }

    return queryOne(
      `UPDATE ims.branches
          SET ${updates.join(', ')}
        WHERE branch_id = $1
        RETURNING branch_id, branch_name, address AS location, phone, is_active, created_at`,
      params
    );
  },

  async deleteBranch(id: number) {
    const hasWarehouses = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM ims.warehouses
        WHERE branch_id = $1`,
      [id]
    );
    if (Number(hasWarehouses?.total || '0') > 0) {
      throw ApiError.badRequest('Delete or move warehouses first');
    }

    const deleted = await queryOne(`DELETE FROM ims.branches WHERE branch_id = $1 RETURNING branch_id`, [id]);
    if (!deleted) {
      throw ApiError.notFound('Branch not found');
    }
  },

  async listWarehouses(filters: any) {
    const { branchId, branchIds, includeInactive } = filters;
    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (branchId) {
      params.push(branchId);
      where.push(`w.branch_id = $${params.length}`);
    } else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`w.branch_id = ANY($${params.length})`);
    }
    if (!includeInactive) {
      where.push('w.is_active = TRUE');
    }

    return queryMany(
      `SELECT w.wh_id, w.branch_id, b.branch_name, w.wh_name, w.location, w.is_active, w.created_at
         FROM ims.warehouses w
         JOIN ims.branches b ON b.branch_id = w.branch_id
        WHERE ${where.join(' AND ')}
        ORDER BY b.branch_name, w.wh_name`,
      params
    );
  },

  async createWarehouse(input: any) {
    const branch = await queryOne(
      `SELECT branch_id
         FROM ims.branches
        WHERE branch_id = $1`,
      [input.branchId]
    );
    if (!branch) {
      throw ApiError.badRequest('Branch not found');
    }

    const duplicate = await queryOne(
      `SELECT wh_id
         FROM ims.warehouses
        WHERE branch_id = $1
          AND LOWER(wh_name) = LOWER($2)`,
      [input.branchId, input.whName]
    );
    if (duplicate) {
      throw ApiError.conflict('Warehouse name already exists in this branch');
    }

    return queryOne(
      `INSERT INTO ims.warehouses (branch_id, wh_name, location, is_active)
       VALUES ($1, $2, NULLIF($3,''), COALESCE($4, TRUE))
       RETURNING wh_id, branch_id, wh_name, location, is_active, created_at`,
      [input.branchId, input.whName, input.location || '', input.isActive]
    );
  },

  async updateWarehouse(id: number, input: any, scope?: BranchScope) {
    const current = await queryOne<{ wh_id: number; branch_id: number }>(
      `SELECT wh_id, branch_id
         FROM ims.warehouses
        WHERE wh_id = $1`,
      [id]
    );
    if (!current) {
      throw ApiError.notFound('Warehouse not found');
    }
    if (scope && !scope.isAdmin && !scope.branchIds.includes(Number(current.branch_id))) {
      throw ApiError.forbidden('You can only update warehouses in your branch');
    }

    const targetBranchId = input.branchId ?? current.branch_id;
    if (input.branchId !== undefined) {
      const branch = await queryOne(
        `SELECT branch_id
           FROM ims.branches
          WHERE branch_id = $1`,
        [input.branchId]
      );
      if (!branch) {
        throw ApiError.badRequest('Branch not found');
      }
    }

    if (input.whName !== undefined) {
      const duplicate = await queryOne(
        `SELECT wh_id
           FROM ims.warehouses
          WHERE branch_id = $1
            AND LOWER(wh_name) = LOWER($2)
            AND wh_id <> $3`,
        [targetBranchId, input.whName, id]
      );
      if (duplicate) {
        throw ApiError.conflict('Warehouse name already exists in this branch');
      }
    }

    const updates: string[] = [];
    const params: any[] = [id];
    let p = 2;

    if (input.branchId !== undefined) {
      updates.push(`branch_id = $${p++}`);
      params.push(input.branchId);
    }
    if (input.whName !== undefined) {
      updates.push(`wh_name = $${p++}`);
      params.push(input.whName);
    }
    if (input.location !== undefined) {
      updates.push(`location = NULLIF($${p++},'')`);
      params.push(input.location || '');
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${p++}`);
      params.push(input.isActive);
    }

    if (!updates.length) {
      return queryOne(
        `SELECT wh_id, branch_id, wh_name, location, is_active, created_at
           FROM ims.warehouses
          WHERE wh_id = $1`,
        [id]
      );
    }

    return queryOne(
      `UPDATE ims.warehouses
          SET ${updates.join(', ')}
        WHERE wh_id = $1
        RETURNING wh_id, branch_id, wh_name, location, is_active, created_at`,
      params
    );
  },

  async deleteWarehouse(id: number, scope?: BranchScope) {
    const current = await queryOne<{ wh_id: number; branch_id: number }>(
      `SELECT wh_id, branch_id
         FROM ims.warehouses
        WHERE wh_id = $1`,
      [id]
    );
    if (!current) {
      throw ApiError.notFound('Warehouse not found');
    }
    if (scope && !scope.isAdmin && !scope.branchIds.includes(Number(current.branch_id))) {
      throw ApiError.forbidden('You can only delete warehouses in your branch');
    }

    const deleted = await queryOne(`DELETE FROM ims.warehouses WHERE wh_id = $1 RETURNING wh_id`, [id]);
    if (!deleted) {
      throw ApiError.notFound('Warehouse not found');
    }
  },

  async listInventoryTransactions(filters: any) {
    const { storeId, itemId, transactionType, status, page, limit, branchIds } = filters;
    const movementHasSoftDelete = await hasInventoryMovementSoftDelete();
    const stockAdjustmentTableExists = await hasStockAdjustmentTable();
    const salesHasPaidAmount = await hasSalesPaidAmountColumn();
    const salesHasDocType = await hasSalesDocTypeColumn();
    const salesHasStatus = await hasSalesStatusColumn();
    const salePaymentsTableExists = await hasSalePaymentsTable();
    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`t.branch_id = ANY($${params.length})`);
    }
    if (storeId) {
      params.push(storeId);
      where.push(`t.store_id = $${params.length}`);
    }
    if (itemId) {
      params.push(itemId);
      where.push(`t.item_id = $${params.length}`);
    }
    if (transactionType) {
      params.push(String(transactionType).toUpperCase());
      where.push(`UPPER(t.transaction_type) = $${params.length}`);
    }
    if (status) {
      params.push(String(status).toUpperCase());
      where.push(`UPPER(t.status) = $${params.length}`);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const movementSoftDeleteWhere = movementHasSoftDelete
      ? 'AND (m.is_deleted IS NULL OR m.is_deleted = FALSE)'
      : '';

    const adjustmentQuery = stockAdjustmentTableExists
      ? `
        SELECT
          (-1000000000::bigint - a.adjustment_id)::bigint AS transaction_id,
          i.branch_id,
          b.branch_name,
          i.store_id,
          st.store_name,
          a.item_id::bigint AS item_id,
          i.name AS item_name,
          'ADJUSTMENT'::text AS transaction_type,
          CASE WHEN LOWER(a.adjustment_type::text) = 'increase' THEN 'IN' ELSE 'OUT' END AS direction,
          COALESCE(a.quantity, 0)::numeric(14,3) AS quantity,
          COALESCE(i.cost_price, 0)::numeric(14,2) AS unit_cost,
          NULL::text AS reference_no,
          a.adjustment_date AS transaction_date,
          CASE
            WHEN UPPER(COALESCE(a.status::text, 'POSTED')) = 'CANCELLED' THEN 'CANCELLED'
            ELSE 'POSTED'
          END AS status,
          COALESCE(NULLIF(a.reason, ''), 'Stock adjustment') AS notes
        FROM ims.stock_adjustment a
        LEFT JOIN ims.items i ON i.item_id = a.item_id
        LEFT JOIN ims.stores st ON st.store_id = i.store_id
        LEFT JOIN ims.branches b ON b.branch_id = i.branch_id
        WHERE LOWER(COALESCE(a.reason, '')) NOT LIKE '%damage%'
      `
      : `
        SELECT
          (-1000000000::bigint - m.move_id)::bigint AS transaction_id,
          m.branch_id,
          b.branch_name,
          i.store_id,
          st.store_name,
          m.item_id::bigint AS item_id,
          i.name AS item_name,
          'ADJUSTMENT'::text AS transaction_type,
          CASE WHEN COALESCE(m.qty_out, 0) > 0 THEN 'OUT' ELSE 'IN' END AS direction,
          GREATEST(COALESCE(m.qty_in, 0), COALESCE(m.qty_out, 0))::numeric(14,3) AS quantity,
          COALESCE(m.unit_cost, i.cost_price, 0)::numeric(14,2) AS unit_cost,
          NULL::text AS reference_no,
          m.move_date AS transaction_date,
          'POSTED'::text AS status,
          COALESCE(NULLIF(m.note, ''), 'Stock adjustment') AS notes
        FROM ims.inventory_movements m
        LEFT JOIN ims.items i ON i.item_id = m.item_id
        LEFT JOIN ims.stores st ON st.store_id = i.store_id
        LEFT JOIN ims.branches b ON b.branch_id = m.branch_id
        WHERE LOWER(COALESCE(m.move_type::text, '')) = 'adjustment'
          AND LOWER(COALESCE(m.note, '')) NOT LIKE '%damage%'
          ${movementSoftDeleteWhere}
      `;

    const damageQuery = stockAdjustmentTableExists
      ? `
        SELECT
          (-2000000000::bigint - a.adjustment_id)::bigint AS transaction_id,
          i.branch_id,
          b.branch_name,
          i.store_id,
          st.store_name,
          a.item_id::bigint AS item_id,
          i.name AS item_name,
          'DAMAGE'::text AS transaction_type,
          CASE WHEN LOWER(a.adjustment_type::text) = 'increase' THEN 'IN' ELSE 'OUT' END AS direction,
          COALESCE(a.quantity, 0)::numeric(14,3) AS quantity,
          COALESCE(i.cost_price, 0)::numeric(14,2) AS unit_cost,
          NULL::text AS reference_no,
          a.adjustment_date AS transaction_date,
          CASE
            WHEN UPPER(COALESCE(a.status::text, 'POSTED')) = 'CANCELLED' THEN 'CANCELLED'
            ELSE 'POSTED'
          END AS status,
          COALESCE(NULLIF(a.reason, ''), 'Stock damage') AS notes
        FROM ims.stock_adjustment a
        LEFT JOIN ims.items i ON i.item_id = a.item_id
        LEFT JOIN ims.stores st ON st.store_id = i.store_id
        LEFT JOIN ims.branches b ON b.branch_id = i.branch_id
        WHERE LOWER(COALESCE(a.reason, '')) LIKE '%damage%'
      `
      : `
        SELECT
          (-2000000000::bigint - m.move_id)::bigint AS transaction_id,
          m.branch_id,
          b.branch_name,
          i.store_id,
          st.store_name,
          m.item_id::bigint AS item_id,
          i.name AS item_name,
          'DAMAGE'::text AS transaction_type,
          CASE WHEN COALESCE(m.qty_out, 0) > 0 THEN 'OUT' ELSE 'IN' END AS direction,
          GREATEST(COALESCE(m.qty_in, 0), COALESCE(m.qty_out, 0))::numeric(14,3) AS quantity,
          COALESCE(m.unit_cost, i.cost_price, 0)::numeric(14,2) AS unit_cost,
          NULL::text AS reference_no,
          m.move_date AS transaction_date,
          'POSTED'::text AS status,
          COALESCE(NULLIF(m.note, ''), 'Stock damage') AS notes
        FROM ims.inventory_movements m
        LEFT JOIN ims.items i ON i.item_id = m.item_id
        LEFT JOIN ims.stores st ON st.store_id = i.store_id
        LEFT JOIN ims.branches b ON b.branch_id = m.branch_id
        WHERE LOWER(COALESCE(m.move_type::text, '')) = 'adjustment'
          AND LOWER(COALESCE(m.note, '')) LIKE '%damage%'
          ${movementSoftDeleteWhere}
      `;

    const nonQuotationWhere = salesHasDocType
      ? `AND LOWER(COALESCE(s.doc_type::text, 'sale')) <> 'quotation'`
      : '';
    const paidStatusExpr = salesHasStatus
      ? `CASE WHEN LOWER(COALESCE(s.status::text, 'paid')) = 'void' THEN 'CANCELLED' ELSE 'POSTED' END`
      : `'POSTED'::text`;
    const paidQuery = salesHasPaidAmount
      ? `
        SELECT
          (-4000000000::bigint - s.sale_id)::bigint AS transaction_id,
          s.branch_id,
          b.branch_name,
          NULL::bigint AS store_id,
          NULL::text AS store_name,
          NULL::bigint AS item_id,
          NULL::text AS item_name,
          'PAID'::text AS transaction_type,
          'IN'::text AS direction,
          COALESCE(s.paid_amount, 0)::numeric(14,3) AS quantity,
          0::numeric(14,2) AS unit_cost,
          'SALE-' || s.sale_id::text AS reference_no,
          s.sale_date AS transaction_date,
          ${paidStatusExpr} AS status,
          COALESCE(NULLIF(s.note, ''), 'Sale payment') AS notes
        FROM ims.sales s
        LEFT JOIN ims.branches b ON b.branch_id = s.branch_id
        WHERE COALESCE(s.paid_amount, 0) > 0
          ${nonQuotationWhere}
      `
      : salePaymentsTableExists
        ? `
        SELECT
          (-4000000000::bigint - s.sale_id)::bigint AS transaction_id,
          s.branch_id,
          b.branch_name,
          NULL::bigint AS store_id,
          NULL::text AS store_name,
          NULL::bigint AS item_id,
          NULL::text AS item_name,
          'PAID'::text AS transaction_type,
          'IN'::text AS direction,
          COALESCE(sp.total_paid, 0)::numeric(14,3) AS quantity,
          0::numeric(14,2) AS unit_cost,
          'SALE-' || s.sale_id::text AS reference_no,
          COALESCE(sp.last_pay_date, s.sale_date) AS transaction_date,
          ${paidStatusExpr} AS status,
          COALESCE(NULLIF(s.note, ''), 'Sale payment') AS notes
        FROM ims.sales s
        JOIN (
          SELECT
            sale_id,
            SUM(COALESCE(amount_paid, 0))::numeric(14,3) AS total_paid,
            MAX(pay_date) AS last_pay_date
          FROM ims.sale_payments
          GROUP BY sale_id
        ) sp ON sp.sale_id = s.sale_id
        LEFT JOIN ims.branches b ON b.branch_id = s.branch_id
        WHERE COALESCE(sp.total_paid, 0) > 0
          ${nonQuotationWhere}
      `
        : `
        SELECT
          NULL::bigint AS transaction_id,
          NULL::bigint AS branch_id,
          NULL::text AS branch_name,
          NULL::bigint AS store_id,
          NULL::text AS store_name,
          NULL::bigint AS item_id,
          NULL::text AS item_name,
          'PAID'::text AS transaction_type,
          'IN'::text AS direction,
          0::numeric(14,3) AS quantity,
          0::numeric(14,2) AS unit_cost,
          NULL::text AS reference_no,
          NOW() AS transaction_date,
          'POSTED'::text AS status,
          NULL::text AS notes
        WHERE FALSE
      `;

    return queryMany(
      `WITH auto_tx AS (
         ${adjustmentQuery}
         UNION ALL
         ${damageQuery}
         UNION ALL
         SELECT
           (-3000000000::bigint - m.move_id)::bigint AS transaction_id,
           m.branch_id,
           b.branch_name,
           i.store_id,
           st.store_name,
           m.item_id::bigint AS item_id,
           i.name AS item_name,
           'SALES'::text AS transaction_type,
           'OUT'::text AS direction,
           GREATEST(COALESCE(m.qty_out, 0), COALESCE(m.qty_in, 0))::numeric(14,3) AS quantity,
           COALESCE(m.unit_cost, i.cost_price, 0)::numeric(14,2) AS unit_cost,
           CASE WHEN m.ref_id IS NULL THEN NULL ELSE 'SALE-' || m.ref_id::text END AS reference_no,
           m.move_date AS transaction_date,
           'POSTED'::text AS status,
           COALESCE(NULLIF(m.note, ''), 'Sale issue') AS notes
         FROM ims.inventory_movements m
         LEFT JOIN ims.items i ON i.item_id = m.item_id
         LEFT JOIN ims.stores st ON st.store_id = i.store_id
         LEFT JOIN ims.branches b ON b.branch_id = m.branch_id
         WHERE LOWER(COALESCE(m.move_type::text, '')) = 'sale'
           ${movementSoftDeleteWhere}

         UNION ALL

         ${paidQuery}
       )
       SELECT
         t.transaction_id,
         t.branch_id,
         t.branch_name,
         t.store_id,
         t.store_name,
         t.item_id,
         t.item_name,
         UPPER(t.transaction_type) AS transaction_type,
         UPPER(t.direction) AS direction,
         t.quantity::numeric(14,3) AS quantity,
         t.unit_cost::numeric(14,2) AS unit_cost,
         t.reference_no,
         t.transaction_date,
         UPPER(t.status) AS status,
         t.notes,
         t.transaction_date AS created_at
       FROM auto_tx t
      WHERE ${where.join(' AND ')}
      ORDER BY t.transaction_date DESC, t.transaction_id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
  },

  async createInventoryTransaction(
    input: {
      storeId: number;
      itemId: number;
      transactionType: 'ADJUSTMENT' | 'PAID' | 'SALES' | 'DAMAGE';
      direction?: 'IN' | 'OUT';
      quantity: number;
      unitCost?: number;
      referenceNo?: string;
      transactionDate?: string;
      notes?: string;
      status?: 'POSTED' | 'PENDING' | 'CANCELLED';
    },
    user: AuthContext,
    scope: BranchScope
  ) {
    return withTransaction(async (client) => {
      const store = await client.query<{ store_id: number; branch_id: number }>(
        `SELECT store_id, branch_id
           FROM ims.stores
          WHERE store_id = $1`,
        [input.storeId]
      );
      const storeRow = store.rows[0];
      if (!storeRow) throw ApiError.badRequest('Store not found');
      if (!scope.isAdmin && !scope.branchIds.includes(Number(storeRow.branch_id))) {
        throw ApiError.forbidden('Store is outside your assigned branches');
      }

      const item = await client.query<{ item_id: number }>(
        `SELECT item_id
           FROM ims.items
          WHERE item_id = $1
            AND branch_id = $2`,
        [input.itemId, storeRow.branch_id]
      );
      if (!item.rows[0]) throw ApiError.badRequest('Item not found in selected store branch');

      const txCols = await getInventoryTransactionColumns();
      const direction = resolveTransactionDirection(input.transactionType, input.direction);
      const status = (input.status || 'POSTED').toUpperCase() as 'POSTED' | 'PENDING' | 'CANCELLED';

      const insertColumns = ['branch_id'];
      const insertValues: unknown[] = [storeRow.branch_id];
      const valueTokens = ['$1'];
      let idx = 2;

      if (txCols.hasStoreId) {
        insertColumns.push('store_id');
        insertValues.push(input.storeId);
        valueTokens.push(`$${idx++}`);
      }
      insertColumns.push('product_id');
      insertValues.push(input.itemId);
      valueTokens.push(`$${idx++}`);
      if (txCols.hasItemId) {
        insertColumns.push('item_id');
        insertValues.push(input.itemId);
        valueTokens.push(`$${idx++}`);
      }
      insertColumns.push('transaction_type');
      insertValues.push(input.transactionType);
      valueTokens.push(`$${idx++}`);
      if (txCols.hasDirection) {
        insertColumns.push('direction');
        insertValues.push(direction);
        valueTokens.push(`$${idx++}`);
      }
      insertColumns.push('quantity');
      insertValues.push(input.quantity);
      valueTokens.push(`$${idx++}`);
      insertColumns.push('unit_cost');
      insertValues.push(input.unitCost ?? 0);
      valueTokens.push(`$${idx++}`);
      insertColumns.push('reference_no');
      insertValues.push(input.referenceNo || null);
      valueTokens.push(`$${idx++}`);
      insertColumns.push('transaction_date');
      insertValues.push(input.transactionDate || new Date().toISOString());
      valueTokens.push(`$${idx++}`);
      insertColumns.push('created_by');
      insertValues.push(user?.userId ?? null);
      valueTokens.push(`$${idx++}`);
      insertColumns.push('notes');
      insertValues.push(input.notes || null);
      valueTokens.push(`$${idx++}`);
      insertColumns.push('status');
      insertValues.push(status);
      valueTokens.push(`$${idx++}`);

      const created = await client.query(
        `INSERT INTO ims.inventory_transaction (${insertColumns.join(', ')})
         VALUES (${valueTokens.join(', ')})
         RETURNING transaction_id, branch_id, product_id, transaction_type, quantity, reference_no, transaction_date, status`
        ,
        insertValues
      );

      if (status === 'POSTED' && input.transactionType !== 'PAID') {
        const existingStock = await client.query<{ quantity: string }>(
          `SELECT quantity::text AS quantity
             FROM ims.store_items
            WHERE store_id = $1
              AND product_id = $2
            FOR UPDATE`,
          [input.storeId, input.itemId]
        );
        let currentQty = Number(existingStock.rows[0]?.quantity || '0');
        if (!existingStock.rows[0]) {
          const itemStock = await client.query<{ opening_balance: string }>(
            `SELECT COALESCE(opening_balance, 0)::text AS opening_balance
               FROM ims.items
              WHERE item_id = $1
                AND branch_id = $2
              LIMIT 1`,
            [input.itemId, Number(storeRow.branch_id)]
          );
          currentQty = Number(itemStock.rows[0]?.opening_balance || '0');
        }

        const stockDelta =
          input.transactionType === 'ADJUSTMENT'
            ? (direction === 'IN' ? Number(input.quantity) : -Number(input.quantity))
            : -Number(input.quantity);

        if (currentQty + stockDelta < 0) {
          throw ApiError.badRequest('Insufficient store quantity for this transaction');
        }

        await client.query(
          `INSERT INTO ims.store_items (store_id, product_id, quantity)
           VALUES ($1, $2, GREATEST(0, $3))
           ON CONFLICT (store_id, product_id)
           DO UPDATE
                 SET quantity = GREATEST(0, ims.store_items.quantity + $4),
                     updated_at = NOW()`,
          [input.storeId, input.itemId, currentQty + stockDelta, stockDelta]
        );
      }

      return created.rows[0];
    });
  },

  async adjust(input: any, user: AuthContext) {
    return withTransaction(async (client) => {
      return createAdjustmentEntry(client, {
        branchId: input.branchId,
        whId: input.whId || null,
        productId: input.productId,
        qty: input.qty,
        unitCost: input.unitCost || 0,
        note: input.note,
        reason: input.reason || 'Manual Adjustment',
        status: input.status || 'POSTED',
        userId: user?.userId ?? null,
      });
    });
  },

  async updateAdjustment(id: number, input: any, scope: BranchScope) {
    if (!(await hasStockAdjustmentTable())) {
      throw ApiError.badRequest('Stock adjustment table is not available');
    }
    return withTransaction(async (client) => {
      const current = await getScopedAdjustmentRow(client, id, scope);
      if (!current) return null;

      const updates: string[] = [];
      const params: any[] = [];
      let p = 1;

      if (input.itemId) {
        const item = scope.isAdmin
          ? await client.query<{ item_id: number; branch_id: number }>(
            `SELECT item_id, branch_id
               FROM ims.items
              WHERE item_id = $1`,
            [input.itemId]
          )
          : await client.query<{ item_id: number; branch_id: number }>(
            `SELECT item_id, branch_id
               FROM ims.items
              WHERE item_id = $1
                AND branch_id = ANY($2)`,
            [input.itemId, scope.branchIds]
          );
        if (!item.rows[0]) {
          throw ApiError.badRequest('Item not found in your branch scope');
        }
        updates.push(`item_id = $${p++}`);
        params.push(input.itemId);
      }

      if (input.qty !== undefined) {
        const qty = Number(input.qty);
        if (!Number.isFinite(qty) || qty === 0) {
          throw ApiError.badRequest('Quantity difference cannot be zero');
        }
        updates.push(`adjustment_type = $${p++}`);
        params.push(qty >= 0 ? 'INCREASE' : 'DECREASE');
        updates.push(`quantity = $${p++}`);
        params.push(Math.abs(qty));
      }

      if (input.reason !== undefined) {
        updates.push(`reason = $${p++}`);
        params.push(input.reason);
      }
      if (input.status !== undefined) {
        updates.push(`status = $${p++}`);
        params.push(String(input.status).toUpperCase());
      }

      if (!updates.length) {
        return {
          adj_id: current.adjustment_id,
          branch_id: current.branch_id,
        };
      }

      params.push(id);
      const updated = await client.query<{
        adjustment_id: number;
        item_id: number;
        adjustment_type: string;
        quantity: string;
        reason: string;
        status: string;
        adjustment_date: string;
        created_by: number | null;
      }>(
        `UPDATE ims.stock_adjustment
            SET ${updates.join(', ')}
          WHERE adjustment_id = $${p}
          RETURNING adjustment_id, item_id, adjustment_type, quantity, reason, status, adjustment_date, created_by`,
        params
      );
      const row = updated.rows[0];
      if (!row) return null;

      const itemMeta = await client.query<{ branch_id: number; cost_price: string }>(
        `SELECT branch_id, COALESCE(cost_price, 0)::text AS cost_price
           FROM ims.items
          WHERE item_id = $1`,
        [row.item_id]
      );
      const branchId = Number(itemMeta.rows[0]?.branch_id || current.branch_id);
      const unitCost = Number(itemMeta.rows[0]?.cost_price || '0');
      const sign = String(row.adjustment_type || '').toUpperCase() === 'DECREASE' ? -1 : 1;
      const qtyDelta = sign * Number(row.quantity || '0');

      return {
        adj_id: row.adjustment_id,
        branch_id: branchId,
        wh_id: null,
        user_id: row.created_by,
        reason: row.reason,
        note: null,
        adj_date: row.adjustment_date,
        item_id: row.item_id,
        qty_delta: qtyDelta,
        unit_cost: unitCost,
        status: String(row.status || 'POSTED').toUpperCase(),
      };
    });
  },

  async deleteAdjustment(id: number, scope: BranchScope) {
    if (!(await hasStockAdjustmentTable())) {
      throw ApiError.badRequest('Stock adjustment table is not available');
    }
    return withTransaction(async (client) => {
      const current = await getScopedAdjustmentRow(client, id, scope);
      if (!current) return false;
      const deleted = await client.query(
        `DELETE FROM ims.stock_adjustment WHERE adjustment_id = $1 RETURNING adjustment_id`,
        [id]
      );
      return Boolean(deleted.rows[0]);
    });
  },

  async recount(input: any, user: AuthContext) {
    return withTransaction(async (client) => {
      await ensureItemBranchWarehouse(client, input.productId, input.branchId, input.whId || null);

      const stockRow = input.whId
        ? await client.query<{ qty: string }>(
          `SELECT COALESCE(quantity, 0)::text AS qty
               FROM ims.warehouse_stock
              WHERE wh_id = $1
                AND item_id = $2
              LIMIT 1`,
          [input.whId, input.productId]
        )
        : await client.query<{ qty: string }>(
          `SELECT COALESCE(SUM(ws.quantity), 0)::text AS qty
               FROM ims.warehouse_stock ws
               JOIN ims.warehouses w ON w.wh_id = ws.wh_id
              WHERE w.branch_id = $1
                AND ws.item_id = $2`,
          [input.branchId, input.productId]
        );

      const currentQty = Number(stockRow.rows[0]?.qty || '0');
      const countedQty = Number(input.countedQty);
      const delta = Number((countedQty - currentQty).toFixed(3));

      if (delta === 0) {
        return {
          changed: false,
          currentQty,
          countedQty,
          qtyDelta: 0,
          adjustment: null,
        };
      }

      const baseNote = `Recount current ${currentQty} -> counted ${countedQty}`;
      const finalNote = input.note ? `${baseNote}. ${input.note}` : baseNote;

      const adjustment = await createAdjustmentEntry(client, {
        branchId: input.branchId,
        whId: input.whId || null,
        productId: input.productId,
        qty: delta,
        unitCost: input.unitCost || 0,
        note: finalNote,
        reason: 'Stock Recount',
        userId: user?.userId ?? null,
      });

      return {
        changed: true,
        currentQty,
        countedQty,
        qtyDelta: delta,
        adjustment,
      };
    });
  },

  async transfer(input: any, _user: any, scope?: BranchScope) {
    return withTransaction(async (client) => {
      const qty = Number(input.qty || 0);
      if (qty <= 0) {
        throw ApiError.badRequest('Quantity must be greater than zero');
      }

      const productResult = await client.query<{ item_id: number }>(
        `SELECT item_id
           FROM ims.items
          WHERE item_id = $1
            AND is_active = TRUE`,
        [input.productId]
      );
      if (!productResult.rows[0]) {
        throw ApiError.badRequest('Item not found or inactive');
      }

      const resolveLocation = async (
        kind: 'warehouse' | 'branch',
        locationId?: number,
        overrideWarehouseId?: number
      ) => {
        if (!locationId) {
          throw ApiError.badRequest(
            kind === 'warehouse' ? 'Warehouse is required for transfer' : 'Branch is required for transfer'
          );
        }

        if (kind === 'warehouse') {
          const warehouse = await client.query<{ branch_id: number; wh_id: number }>(
            `SELECT wh_id, branch_id
               FROM ims.warehouses
              WHERE wh_id = $1
                AND is_active = TRUE`,
            [locationId]
          );
          const row = warehouse.rows[0];
          if (!row) {
            throw ApiError.badRequest('Warehouse missing or inactive');
          }
          return { branchId: Number(row.branch_id), whId: Number(row.wh_id) };
        }

        const branch = await client.query<{ branch_id: number }>(
          `SELECT branch_id
             FROM ims.branches
            WHERE branch_id = $1
              AND is_active = TRUE`,
          [locationId]
        );
        const row = branch.rows[0];
        if (!row) {
          throw ApiError.badRequest('Branch missing or inactive');
        }
        if (overrideWarehouseId) {
          const branchWarehouse = await client.query<{ wh_id: number; branch_id: number }>(
            `SELECT wh_id, branch_id
               FROM ims.warehouses
              WHERE wh_id = $1
                AND branch_id = $2
                AND is_active = TRUE`,
            [overrideWarehouseId, locationId]
          );
          const branchWarehouseRow = branchWarehouse.rows[0];
          if (!branchWarehouseRow) {
            throw ApiError.badRequest('Selected warehouse does not belong to source branch');
          }
          return {
            branchId: Number(branchWarehouseRow.branch_id),
            whId: Number(branchWarehouseRow.wh_id),
          };
        }
        return { branchId: Number(row.branch_id), whId: null };
      };

      const fromLocation = await resolveLocation(
        input.fromType,
        input.fromType === 'warehouse' ? input.fromWhId : input.fromBranchId,
        input.fromType === 'branch' ? input.fromWhId : undefined
      );
      const toLocation = await resolveLocation(
        input.toType,
        input.toType === 'warehouse' ? input.toWhId : input.toBranchId,
        input.toType === 'branch' ? input.toWhId : undefined
      );

      if (
        input.fromType === input.toType
        && fromLocation.branchId === toLocation.branchId
        && Number(fromLocation.whId || 0) === Number(toLocation.whId || 0)
      ) {
        throw ApiError.badRequest('Source and destination locations must differ');
      }

      if (scope && !scope.isAdmin) {
        if (!scope.branchIds.includes(fromLocation.branchId) || !scope.branchIds.includes(toLocation.branchId)) {
          throw ApiError.forbidden('You can only transfer stock within your assigned branches');
        }
      }

      const fromMoveType = input.fromType === 'warehouse' ? 'wh_transfer_out' : 'transfer_out';
      const toMoveType = input.toType === 'warehouse' ? 'wh_transfer_in' : 'transfer_in';

      await client.query(
        `SELECT ims.fn_apply_stock_move($1, $2, $3, $4, $5::ims.movement_type_enum, 'manual_transfer', NULL, $6, TRUE)`,
        [
          fromLocation.branchId,
          fromLocation.whId,
          input.productId,
          -qty,
          fromMoveType,
          input.unitCost || 0,
        ]
      );
      await client.query(
        `SELECT ims.fn_apply_stock_move($1, $2, $3, $4, $5::ims.movement_type_enum, 'manual_transfer', NULL, $6, FALSE)`,
        [
          toLocation.branchId,
          toLocation.whId,
          input.productId,
          qty,
          toMoveType,
          input.unitCost || 0,
        ]
      );

      return {
        ok: true,
        from: fromLocation,
        to: toLocation,
      };
    });
  },
};
