import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { BranchScope } from '../../utils/branchScope';
import { syncLowStockNotifications } from '../../utils/stockAlerts';
import { PoolClient } from 'pg';

type AuthContext = { userId?: number | null } | undefined;

const ensureItemBranchWarehouse = async (
  client: PoolClient,
  productId: number,
  branchId: number,
  whId?: number | null
) => {
  const product = await client.query(
    `SELECT product_id
       FROM ims.products
      WHERE product_id = $1
        AND branch_id = $2
        AND is_active = TRUE
        AND (is_deleted IS NULL OR is_deleted = FALSE)`,
    [productId, branchId]
  );
  if (!product.rows[0]) {
    throw ApiError.badRequest('Item not found or inactive');
  }

  const branch = await client.query(
    `SELECT branch_id
       FROM ims.branches
      WHERE branch_id = $1
        AND is_active = TRUE
        AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
          AND is_active = TRUE
          AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [whId, branchId]
    );
    if (!warehouse.rows[0]) {
      throw ApiError.badRequest('Warehouse does not belong to branch');
    }
  }
};

const hasAdjustmentTrigger = async (client: PoolClient): Promise<boolean> => {
  const result = await client.query<{ has_trigger: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'ims'
          AND c.relname = 'stock_adjustment_items'
          AND t.tgname = 'trg_adjust_items_stock'
          AND NOT t.tgisinternal
     ) AS has_trigger`
  );
  return Boolean(result.rows[0]?.has_trigger);
};

let cachedInventoryMovementSoftDelete: boolean | null = null;

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
    userId?: number | null;
  }
) => {
  if (payload.qty === 0) {
    throw ApiError.badRequest('Quantity difference cannot be zero');
  }

  await ensureItemBranchWarehouse(client, payload.productId, payload.branchId, payload.whId);

  const adjustment = await client.query<{
    adj_id: number;
    branch_id: number;
    wh_id: number | null;
    user_id: number | null;
    reason: string;
    note: string | null;
    adj_date: string;
  }>(
    `INSERT INTO ims.stock_adjustments (branch_id, wh_id, user_id, reason, note)
     VALUES ($1, $2, $3, $4, NULLIF($5, ''))
     RETURNING adj_id, branch_id, wh_id, user_id, reason, note, adj_date`,
    [
      payload.branchId,
      payload.whId ?? null,
      payload.userId ?? null,
      payload.reason,
      payload.note || '',
    ]
  );

  const itemRow = await client.query<{ adj_item_id: number }>(
    `INSERT INTO ims.stock_adjustment_items (adj_id, product_id, qty_change, unit_cost)
     VALUES ($1, $2, $3, $4)
     RETURNING adj_item_id`,
    [
      adjustment.rows[0].adj_id,
      payload.productId,
      payload.qty,
      payload.unitCost ?? 0,
    ]
  );

  const triggerEnabled = await hasAdjustmentTrigger(client);
  if (!triggerEnabled) {
    await client.query(
      `SELECT ims.fn_apply_stock_move($1, $2, $3, $4, 'adjustment', 'stock_adjustment_items', $5, $6, TRUE)`,
      [
        payload.branchId,
        payload.whId ?? null,
        payload.productId,
        payload.qty,
        itemRow.rows[0].adj_item_id,
        payload.unitCost ?? 0,
      ]
    );
  }

  await syncLowStockNotifications(client, {
    branchId: payload.branchId,
    productIds: [payload.productId],
    actorUserId: payload.userId ?? null,
  });

  return {
    ...adjustment.rows[0],
    item_id: payload.productId,
    qty_delta: payload.qty,
    unit_cost: payload.unitCost ?? 0,
  };
};

export const inventoryService = {
  async listPurchasedItems(filters: any) {
    const { branchId, branchIds, search } = filters;
    const params: any[] = [];
    const where: string[] = [
      '(p.is_deleted IS NULL OR p.is_deleted = FALSE)',
      'p.is_active = TRUE',
    ];

    if (branchId) {
      params.push(branchId);
      where.push(`p.branch_id = $${params.length}`);
    } else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`p.branch_id = ANY($${params.length})`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`p.name ILIKE $${params.length}`);
    }

    return queryMany(
      `WITH purchase_cost AS (
         SELECT
           pi.product_id,
           MAX(pu.purchase_date) AS last_purchase_date,
           (ARRAY_AGG(COALESCE(NULLIF(pi.unit_cost, 0), 0) ORDER BY pu.purchase_date DESC, pi.purchase_item_id DESC))[1] AS latest_cost,
           (SUM(CASE WHEN pi.quantity > 0 THEN pi.quantity * COALESCE(pi.unit_cost, 0) ELSE 0 END)
             / NULLIF(SUM(CASE WHEN pi.quantity > 0 THEN pi.quantity ELSE 0 END), 0)) AS weighted_cost,
           (ARRAY_AGG(
              COALESCE(
                NULLIF(pi.sale_price, 0),
                NULLIF(p.sell_price, 0),
                NULLIF(p.price, 0),
                NULLIF(pi.unit_cost, 0),
                COALESCE(p.cost_price, p.cost, 0)
              )
              ORDER BY pu.purchase_date DESC, pi.purchase_item_id DESC
            ))[1] AS latest_sale_price
         FROM ims.purchase_items pi
         JOIN ims.purchases pu ON pu.purchase_id = pi.purchase_id
         JOIN ims.products p ON p.product_id = pi.product_id
         WHERE pi.product_id IS NOT NULL
           AND COALESCE(pu.status::text, 'received') <> 'void'
           AND COALESCE(pi.quantity, 0) > 0
         GROUP BY pi.product_id
       )
       SELECT
          p.product_id AS item_id,
          p.product_id,
          p.branch_id,
          p.name AS item_name,
          COALESCE(
            pc.weighted_cost,
            pc.latest_cost,
            NULLIF(p.cost_price, 0),
            NULLIF(p.cost, 0),
            0
          )::numeric(14,2) AS cost_price,
          COALESCE(
            pc.latest_sale_price,
            NULLIF(p.sell_price, 0),
            NULLIF(p.price, 0),
            COALESCE(pc.weighted_cost, pc.latest_cost, NULLIF(p.cost_price, 0), NULLIF(p.cost, 0), 0)
          )::numeric(14,2) AS sale_price,
          COALESCE(
            pc.latest_cost,
            pc.weighted_cost,
            NULLIF(p.cost_price, 0),
            NULLIF(p.cost, 0),
            0
          )::numeric(14,2) AS last_unit_cost,
          COALESCE(
            pc.weighted_cost,
            pc.latest_cost,
            NULLIF(p.cost_price, 0),
            NULLIF(p.cost, 0),
            0
          )::numeric(14,2) AS weighted_unit_cost,
          COALESCE(p.reorder_level, 0)::numeric(14,3) AS min_stock_threshold,
          pc.last_purchase_date
       FROM ims.products p
       JOIN purchase_cost pc ON pc.product_id = p.product_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.name`,
      params
    );
  },

  async listStock(filters: any) {
    const { branchId, branchIds, whId, productId, search, page, limit } = filters;
    const params: any[] = [];
    const where: string[] = [
      '(bs.is_deleted IS NULL OR bs.is_deleted = FALSE)',
      '(p.is_deleted IS NULL OR p.is_deleted = FALSE)',
      '(b.is_deleted IS NULL OR b.is_deleted = FALSE)',
      'p.is_active = TRUE',
    ];

    if (branchId) { params.push(branchId); where.push(`bs.branch_id = $${params.length}`); }
    else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`bs.branch_id = ANY($${params.length})`);
    }
    if (whId) {
      params.push(whId);
      where.push(
        `EXISTS (
           SELECT 1
             FROM ims.warehouse_stock wsf
             JOIN ims.warehouses wf ON wf.wh_id = wsf.wh_id
            WHERE wsf.product_id = p.product_id
              AND wf.branch_id = bs.branch_id
              AND wsf.wh_id = $${params.length}
              AND COALESCE(wsf.is_deleted, FALSE) = FALSE
              AND COALESCE(wf.is_deleted, FALSE) = FALSE
         )`
      );
    }
    if (productId) { params.push(productId); where.push(`p.product_id = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`p.name ILIKE $${params.length}`); }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    return queryMany(
      `WITH purchase_cost AS (
         SELECT
           pi.product_id,
           (ARRAY_AGG(COALESCE(NULLIF(pi.unit_cost, 0), 0) ORDER BY pu.purchase_date DESC, pi.purchase_item_id DESC))[1] AS latest_cost,
           (SUM(CASE WHEN pi.quantity > 0 THEN pi.quantity * COALESCE(pi.unit_cost, 0) ELSE 0 END)
            / NULLIF(SUM(CASE WHEN pi.quantity > 0 THEN pi.quantity ELSE 0 END), 0)) AS weighted_cost,
           (ARRAY_AGG(
              COALESCE(
                NULLIF(pi.sale_price, 0),
                NULLIF(p.sell_price, 0),
                NULLIF(p.price, 0),
                NULLIF(pi.unit_cost, 0),
                COALESCE(p.cost_price, p.cost, 0)
              )
              ORDER BY pu.purchase_date DESC, pi.purchase_item_id DESC
            ))[1] AS latest_sale_price
         FROM ims.purchase_items pi
         JOIN ims.purchases pu ON pu.purchase_id = pi.purchase_id
         JOIN ims.products p ON p.product_id = pi.product_id
         WHERE pi.product_id IS NOT NULL
           AND COALESCE(pu.status::text, 'received') <> 'void'
           AND COALESCE(pi.quantity, 0) > 0
         GROUP BY pi.product_id
       ),
       warehouse_totals AS (
         SELECT
           w.branch_id,
           ws.product_id,
           COALESCE(SUM(ws.quantity), 0)::numeric(14,3) AS warehouse_qty,
           json_agg(
             json_build_object(
               'wh_id', ws.wh_id,
               'wh_name', w.wh_name,
               'quantity', ws.quantity
             )
             ORDER BY w.wh_name
           ) AS warehouse_breakdown
         FROM ims.warehouse_stock ws
         JOIN ims.warehouses w ON w.wh_id = ws.wh_id
         WHERE COALESCE(ws.is_deleted, FALSE) = FALSE
           AND COALESCE(w.is_deleted, FALSE) = FALSE
         GROUP BY w.branch_id, ws.product_id
       )
       SELECT
              p.product_id,
              p.product_id AS item_id,
              p.name,
              p.name AS item_name,
              p.barcode,
              b.branch_id,
              b.branch_name,
              COALESCE(wt.warehouse_qty, 0)::numeric(14,3) AS warehouse_qty,
              GREATEST(COALESCE(bs.quantity, 0) - COALESCE(wt.warehouse_qty, 0), 0)::numeric(14,3) AS branch_qty,
              (
                COALESCE(wt.warehouse_qty, 0)
                + GREATEST(COALESCE(bs.quantity, 0) - COALESCE(wt.warehouse_qty, 0), 0)
              )::numeric(14,3) AS total_qty,
              COALESCE(
                pc.weighted_cost,
                pc.latest_cost,
                NULLIF(p.cost_price, 0),
                NULLIF(p.cost, 0),
                0
              )::numeric(14,2) AS cost_price,
              COALESCE(
                pc.latest_sale_price,
                NULLIF(p.sell_price, 0),
                NULLIF(p.price, 0),
                COALESCE(pc.weighted_cost, pc.latest_cost, NULLIF(p.cost_price, 0), NULLIF(p.cost, 0), 0)
              )::numeric(14,2) AS sale_price,
              (
                (
                  COALESCE(wt.warehouse_qty, 0)
                  + GREATEST(COALESCE(bs.quantity, 0) - COALESCE(wt.warehouse_qty, 0), 0)
                )
                * COALESCE(pc.weighted_cost, pc.latest_cost, NULLIF(p.cost_price, 0), NULLIF(p.cost, 0), 0)
              )::numeric(14,2) AS stock_value,
              GREATEST(COALESCE(NULLIF(p.reorder_level, 0), 5), 1)::numeric(14,3) AS min_stock_threshold,
              (
                (
                  COALESCE(wt.warehouse_qty, 0)
                  + GREATEST(COALESCE(bs.quantity, 0) - COALESCE(wt.warehouse_qty, 0), 0)
                )
                <= GREATEST(COALESCE(NULLIF(p.reorder_level, 0), 5), 1)
              ) AS low_stock,
              (
                COALESCE(bs.quantity, 0) + 0.0001 < COALESCE(wt.warehouse_qty, 0)
              ) AS qty_mismatch,
              COALESCE(wt.warehouse_breakdown, '[]'::json) AS warehouse_breakdown
         FROM ims.products p
         JOIN ims.branch_stock bs ON bs.product_id = p.product_id
         JOIN ims.branches b ON b.branch_id = bs.branch_id
         LEFT JOIN warehouse_totals wt
           ON wt.product_id = p.product_id
          AND wt.branch_id = bs.branch_id
         LEFT JOIN purchase_cost pc ON pc.product_id = p.product_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.name, b.branch_name
        LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
  },

  async listMovements(filters: any) {
    const { branchId, branchIds, whId, productId, search, page, limit } = filters;
    const movementHasSoftDelete = await hasInventoryMovementSoftDelete();
    const params: any[] = [];
    const where: string[] = [
      '(p.is_deleted IS NULL OR p.is_deleted = FALSE)',
      '(b.is_deleted IS NULL OR b.is_deleted = FALSE)',
      '(w.is_deleted IS NULL OR w.is_deleted = FALSE)',
    ];
    if (movementHasSoftDelete) {
      where.unshift('(m.is_deleted IS NULL OR m.is_deleted = FALSE)');
    }
    if (branchId) { params.push(branchId); where.push(`m.branch_id = $${params.length}`); }
    else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`m.branch_id = ANY($${params.length})`);
    }
    if (whId)    { params.push(whId);    where.push(`m.wh_id = $${params.length}`); }
    if (productId) { params.push(productId); where.push(`m.product_id = $${params.length}`); }
    if (search) { params.push(`%${search}%`); where.push(`p.name ILIKE $${params.length}`); }
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    return queryMany(
      `SELECT m.*, p.name AS product_name, p.name AS item_name, w.wh_name, b.branch_name
         FROM ims.inventory_movements m
         JOIN ims.products p ON p.product_id = m.product_id
         LEFT JOIN ims.warehouses w ON w.wh_id = m.wh_id
         LEFT JOIN ims.branches b ON b.branch_id = m.branch_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.move_date DESC
        LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
  },

  async listAdjustments(filters: any) {
    const { branchId, branchIds, whId, productId, search, page, limit } = filters;
    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (branchId) {
      params.push(branchId);
      where.push(`a.branch_id = $${params.length}`);
    } else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`a.branch_id = ANY($${params.length})`);
    }
    if (whId) {
      params.push(whId);
      where.push(`a.wh_id = $${params.length}`);
    }
    if (productId) {
      params.push(productId);
      where.push(`ai.product_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        p.name ILIKE $${params.length}
        OR a.reason ILIKE $${params.length}
        OR COALESCE(a.note,'') ILIKE $${params.length}
        OR b.branch_name ILIKE $${params.length}
        OR COALESCE(w.wh_name,'') ILIKE $${params.length}
      )`);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    return queryMany(
      `SELECT
          a.adj_id,
          a.adj_date,
          a.branch_id,
          b.branch_name,
          a.wh_id,
          w.wh_name,
          a.reason,
          a.note,
          COALESCE(u.name, 'System') AS created_by,
          COALESCE(STRING_AGG(DISTINCT p.name, ', '), '-') AS item_names,
          COALESCE(SUM(ai.qty_change), 0)::numeric(14,3) AS qty_delta,
          COALESCE(SUM(ai.qty_change * ai.unit_cost), 0)::numeric(14,2) AS value_delta,
          COUNT(ai.adj_item_id) AS line_count
       FROM ims.stock_adjustments a
       LEFT JOIN ims.stock_adjustment_items ai ON ai.adj_id = a.adj_id
       LEFT JOIN ims.products p ON p.product_id = ai.product_id
       LEFT JOIN ims.branches b ON b.branch_id = a.branch_id
       LEFT JOIN ims.warehouses w ON w.wh_id = a.wh_id
       LEFT JOIN ims.users u ON u.user_id = a.user_id
      WHERE ${where.join(' AND ')}
      GROUP BY
        a.adj_id, a.adj_date, a.branch_id, b.branch_name, a.wh_id, w.wh_name, a.reason, a.note, u.name
      ORDER BY a.adj_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
  },

  async listRecounts(filters: any) {
    const { branchId, branchIds, whId, productId, search, page, limit } = filters;
    const params: any[] = [];
    const where: string[] = [`LOWER(a.reason) LIKE 'stock recount%'`];

    if (branchId) {
      params.push(branchId);
      where.push(`a.branch_id = $${params.length}`);
    } else if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`a.branch_id = ANY($${params.length})`);
    }
    if (whId) {
      params.push(whId);
      where.push(`a.wh_id = $${params.length}`);
    }
    if (productId) {
      params.push(productId);
      where.push(`ai.product_id = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(
        p.name ILIKE $${params.length}
        OR COALESCE(a.note,'') ILIKE $${params.length}
        OR b.branch_name ILIKE $${params.length}
        OR COALESCE(w.wh_name,'') ILIKE $${params.length}
      )`);
    }

    const offset = (page - 1) * limit;
    params.push(limit, offset);

    return queryMany(
      `SELECT
          a.adj_id,
          a.adj_date,
          a.branch_id,
          b.branch_name,
          a.wh_id,
          w.wh_name,
          a.reason,
          a.note,
          COALESCE(u.name, 'System') AS created_by,
          COALESCE(STRING_AGG(DISTINCT p.name, ', '), '-') AS item_names,
          COALESCE(SUM(ai.qty_change), 0)::numeric(14,3) AS qty_delta,
          COALESCE(SUM(ai.qty_change * ai.unit_cost), 0)::numeric(14,2) AS value_delta,
          COUNT(ai.adj_item_id) AS line_count
       FROM ims.stock_adjustments a
       LEFT JOIN ims.stock_adjustment_items ai ON ai.adj_id = a.adj_id
       LEFT JOIN ims.products p ON p.product_id = ai.product_id
       LEFT JOIN ims.branches b ON b.branch_id = a.branch_id
       LEFT JOIN ims.warehouses w ON w.wh_id = a.wh_id
       LEFT JOIN ims.users u ON u.user_id = a.user_id
      WHERE ${where.join(' AND ')}
      GROUP BY
        a.adj_id, a.adj_date, a.branch_id, b.branch_name, a.wh_id, w.wh_name, a.reason, a.note, u.name
      ORDER BY a.adj_date DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
  },

  async listBranches(filters: any) {
    const { includeInactive, branchIds } = filters;
    const where: string[] = ['(is_deleted IS NULL OR is_deleted = FALSE)'];
    const params: any[] = [];
    if (Array.isArray(branchIds) && branchIds.length) {
      params.push(branchIds);
      where.push(`branch_id = ANY($${params.length})`);
    }
    if (!includeInactive) {
      where.push('is_active = TRUE');
    }

    return queryMany(
      `SELECT branch_id, branch_name, COALESCE(location, address) AS location, phone, is_active, created_at
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
        WHERE LOWER(branch_name) = LOWER($1)
          AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [input.branchName]
    );
    if (duplicate) {
      throw ApiError.conflict('Branch name already exists');
    }

    return queryOne(
      `INSERT INTO ims.branches (branch_name, location, address, phone, is_active)
       VALUES ($1, NULLIF($2,''), NULLIF($2,''), NULLIF($3,''), COALESCE($4, TRUE))
       RETURNING branch_id, branch_name, COALESCE(location, address) AS location, phone, is_active, created_at`,
      [input.branchName, input.location || '', input.phone || '', input.isActive]
    );
  },

  async updateBranch(id: number, input: any) {
    if (input.branchName !== undefined) {
      const duplicate = await queryOne(
        `SELECT branch_id
           FROM ims.branches
          WHERE LOWER(branch_name) = LOWER($1)
            AND branch_id <> $2
            AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
      updates.push(`location = NULLIF($${p},'')`);
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
        `SELECT branch_id, branch_name, COALESCE(location, address) AS location, phone, is_active, created_at
           FROM ims.branches
          WHERE branch_id = $1
            AND (is_deleted IS NULL OR is_deleted = FALSE)`,
        [id]
      );
    }

    updates.push('updated_at = NOW()');

    return queryOne(
      `UPDATE ims.branches
          SET ${updates.join(', ')}
        WHERE branch_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)
        RETURNING branch_id, branch_name, COALESCE(location, address) AS location, phone, is_active, created_at`,
      params
    );
  },

  async deleteBranch(id: number) {
    const hasWarehouses = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
         FROM ims.warehouses
        WHERE branch_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [id]
    );
    if (Number(hasWarehouses?.total || '0') > 0) {
      throw ApiError.badRequest('Delete or move warehouses first');
    }

    const deleted = await queryOne(
      `UPDATE ims.branches
          SET is_deleted = TRUE,
              deleted_at = NOW(),
              is_active = FALSE,
              updated_at = NOW()
        WHERE branch_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)
        RETURNING branch_id`,
      [id]
    );
    if (!deleted) {
      throw ApiError.notFound('Branch not found');
    }
  },

  async listWarehouses(filters: any) {
    const { branchId, branchIds, includeInactive } = filters;
    const params: any[] = [];
    const where: string[] = [
      '(w.is_deleted IS NULL OR w.is_deleted = FALSE)',
      '(b.is_deleted IS NULL OR b.is_deleted = FALSE)',
    ];

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
        WHERE branch_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [input.branchId]
    );
    if (!branch) {
      throw ApiError.badRequest('Branch not found');
    }

    const duplicate = await queryOne(
      `SELECT wh_id
         FROM ims.warehouses
        WHERE branch_id = $1
          AND LOWER(wh_name) = LOWER($2)
          AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
        WHERE wh_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
          WHERE branch_id = $1
            AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
            AND wh_id <> $3
            AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
          WHERE wh_id = $1
            AND (is_deleted IS NULL OR is_deleted = FALSE)`,
        [id]
      );
    }

    return queryOne(
      `UPDATE ims.warehouses
          SET ${updates.join(', ')}
        WHERE wh_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)
        RETURNING wh_id, branch_id, wh_name, location, is_active, created_at`,
      params
    );
  },

  async deleteWarehouse(id: number, scope?: BranchScope) {
    const current = await queryOne<{ wh_id: number; branch_id: number }>(
      `SELECT wh_id, branch_id
         FROM ims.warehouses
        WHERE wh_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [id]
    );
    if (!current) {
      throw ApiError.notFound('Warehouse not found');
    }
    if (scope && !scope.isAdmin && !scope.branchIds.includes(Number(current.branch_id))) {
      throw ApiError.forbidden('You can only delete warehouses in your branch');
    }

    const deleted = await queryOne(
      `UPDATE ims.warehouses
          SET is_deleted = TRUE,
              deleted_at = NOW(),
              is_active = FALSE
        WHERE wh_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)
        RETURNING wh_id`,
      [id]
    );
    if (!deleted) {
      throw ApiError.notFound('Warehouse not found');
    }

    await queryMany(
      `UPDATE ims.warehouse_stock
          SET is_deleted = TRUE, deleted_at = NOW()
        WHERE wh_id = $1
          AND (is_deleted IS NULL OR is_deleted = FALSE)
        RETURNING wh_id`,
      [id]
    );
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
        reason: 'Manual Adjustment',
        userId: user?.userId ?? null,
      });
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
                AND product_id = $2
                AND (is_deleted IS NULL OR is_deleted = FALSE)
              LIMIT 1`,
            [input.whId, input.productId]
          )
        : await client.query<{ qty: string }>(
            `SELECT COALESCE(quantity, 0)::text AS qty
               FROM ims.branch_stock
              WHERE branch_id = $1
                AND product_id = $2
                AND (is_deleted IS NULL OR is_deleted = FALSE)
              LIMIT 1`,
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

      const productResult = await client.query<{ product_id: number }>(
        `SELECT product_id
           FROM ims.products
          WHERE product_id = $1
            AND is_active = TRUE
            AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
                AND is_active = TRUE
                AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
              AND is_active = TRUE
              AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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
                AND is_active = TRUE
                AND (is_deleted IS NULL OR is_deleted = FALSE)`,
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

      await syncLowStockNotifications(client, {
        branchId: fromLocation.branchId,
        productIds: [input.productId],
        actorUserId: _user?.userId ?? null,
      });
      if (toLocation.branchId !== fromLocation.branchId) {
        await syncLowStockNotifications(client, {
          branchId: toLocation.branchId,
          productIds: [input.productId],
          actorUserId: _user?.userId ?? null,
        });
      }

      return {
        ok: true,
        from: fromLocation,
        to: toLocation,
      };
    });
  },
};
