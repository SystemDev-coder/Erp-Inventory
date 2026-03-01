import { PoolClient } from 'pg';

interface SyncLowStockInput {
  branchId: number;
  productIds: number[];
  actorUserId?: number | null;
}

const uniqueProductIds = (values: number[]) =>
  Array.from(new Set(values.filter((value) => Number.isFinite(value) && value > 0)));

export const syncLowStockNotifications = async (
  client: PoolClient,
  input: SyncLowStockInput
) => {
  const branchId = Number(input.branchId);
  const productIds = uniqueProductIds(input.productIds);
  if (!branchId || !productIds.length) return;

  for (const productId of productIds) {
    const stockResult = await client.query<{
      product_id: number;
      item_name: string;
      qty: string;
      threshold: string;
    }>(
      `SELECT
          i.item_id AS product_id,
          i.name AS item_name,
          CASE
            WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
            ELSE COALESCE(st.qty, 0)
          END::text AS qty,
          GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)::text AS threshold
       FROM ims.items i
       LEFT JOIN (
         SELECT
           s.branch_id,
           si.product_id AS item_id,
           COALESCE(SUM(si.quantity), 0)::numeric(14,3) AS qty,
           COUNT(*)::int AS row_count
         FROM ims.store_items si
         JOIN ims.stores s ON s.store_id = si.store_id
         GROUP BY s.branch_id, si.product_id
       ) st
         ON st.item_id = i.item_id
        AND st.branch_id = i.branch_id
      WHERE i.item_id = $2
        AND i.branch_id = $1
        AND i.is_active = TRUE
      LIMIT 1`,
      [branchId, productId]
    );

    const current = stockResult.rows[0];
    if (!current) continue;

    const currentQty = Number(current.qty || '0');
    const threshold = Number(current.threshold || '5');

    if (currentQty <= threshold) {
      const title = `Low Stock: ${current.item_name}`;
      const message = `${current.item_name} is low in stock (${currentQty} left, threshold ${threshold}).`;

      await client.query(
        `WITH recipients AS (
           SELECT DISTINCT u.user_id
             FROM ims.users u
             LEFT JOIN ims.roles r ON r.role_id = u.role_id
             LEFT JOIN ims.user_branches ub
               ON ub.user_id = u.user_id
               AND ub.branch_id = $1
            WHERE u.is_active = TRUE
              AND (
                LOWER(COALESCE(r.role_name, '')) = 'admin'
                OR ub.user_id IS NOT NULL
              )
         )
         INSERT INTO ims.notifications (
           branch_id,
           user_id,
           created_by,
           title,
           message,
           category,
           link,
           meta
         )
         SELECT
           $1,
           recipients.user_id,
           $2,
           $3,
           $4,
           'inventory',
           '/stock-management/items',
           jsonb_build_object(
             'type', 'low_stock',
             'product_id', $5::bigint,
             'branch_id', $1,
             'current_qty', $6::numeric,
             'threshold', $7::numeric
           )
         FROM recipients
         WHERE NOT EXISTS (
           SELECT 1
               FROM ims.notifications n
              WHERE n.user_id = recipients.user_id
                AND COALESCE(n.is_deleted, FALSE) = FALSE
                AND COALESCE(n.meta->>'type', '') = 'low_stock'
                AND COALESCE(n.meta->>'product_id', '') = ($5::bigint)::text
                AND COALESCE(n.meta->>'branch_id', '') = ($1::bigint)::text
         )`,
        [
          branchId,
          input.actorUserId ?? null,
          title,
          message,
          productId,
          currentQty,
          threshold,
        ]
      );
    } else {
      await client.query(
        `UPDATE ims.notifications
            SET is_deleted = TRUE,
                deleted_at = NOW()
          WHERE branch_id = $1
            AND COALESCE(is_deleted, FALSE) = FALSE
            AND COALESCE(meta->>'type', '') = 'low_stock'
            AND COALESCE(meta->>'product_id', '') = $2::text`,
        [branchId, productId]
      );
    }
  }
};
