import { query, queryMany, queryOne } from '../../db/query';

export interface NotificationRow {
  notification_id: number;
  branch_id: number | null;
  user_id: number;
  created_by: number | null;
  created_by_name: string | null;
  title: string;
  message: string;
  category: string;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface NotificationListInput {
  userId: number;
  branchId?: number;
  limit: number;
  offset: number;
  unreadOnly?: boolean;
}

const lowStockRowsSql = `
  SELECT
    i.item_id AS product_id,
    i.name AS item_name,
    CASE
      WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
      ELSE COALESCE(st.qty, 0)
    END::double precision AS qty,
    GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)::double precision AS threshold
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
  WHERE i.branch_id = $1
    AND i.is_active = TRUE
    AND (
      CASE
        WHEN COALESCE(st.row_count, 0) = 0 THEN COALESCE(i.opening_balance, 0)
        ELSE COALESCE(st.qty, 0)
      END
    ) <= GREATEST(COALESCE(NULLIF(i.stock_alert, 0), 5), 1)
`;

const ensureLowStockNotifications = async (branchId: number, userId: number) => {
  if (!branchId || !userId) return;

  await query(
    `WITH low_stock AS (${lowStockRowsSql})
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
       $2,
       NULL,
       'Low Stock: ' || ls.item_name,
       ls.item_name || ' is low in stock (' || ls.qty::text || ' left, threshold ' || ls.threshold::text || ').',
       'inventory',
       '/stock-management/items',
       jsonb_build_object(
         'type', 'low_stock',
         'product_id', ls.product_id,
         'branch_id', $1,
         'current_qty', ls.qty,
         'threshold', ls.threshold
       )
     FROM low_stock ls
     WHERE NOT EXISTS (
       SELECT 1
       FROM ims.notifications n
       WHERE n.user_id = $2
         AND COALESCE(n.is_deleted, FALSE) = FALSE
         AND COALESCE(n.meta->>'type', '') = 'low_stock'
         AND COALESCE(n.meta->>'product_id', '') = ls.product_id::text
         AND COALESCE(n.meta->>'branch_id', '') = $1::text
     )`,
    [branchId, userId]
  );

  await query(
    `WITH low_stock AS (${lowStockRowsSql})
     UPDATE ims.notifications n
        SET is_deleted = TRUE,
            deleted_at = NOW()
      WHERE n.user_id = $2
        AND n.branch_id = $1
        AND COALESCE(n.is_deleted, FALSE) = FALSE
        AND COALESCE(n.meta->>'type', '') = 'low_stock'
        AND NOT EXISTS (
          SELECT 1
          FROM low_stock ls
          WHERE ls.product_id::text = COALESCE(n.meta->>'product_id', '')
        )`,
    [branchId, userId]
  );
};

export const notificationsService = {
  async list(input: NotificationListInput) {
    if (input.branchId) {
      await ensureLowStockNotifications(input.branchId, input.userId);
    }

    const whereClauses = ['n.user_id = $1', 'COALESCE(n.is_deleted, FALSE) = FALSE'];
    if (input.unreadOnly) {
      whereClauses.push('n.is_read = FALSE');
    }

    const whereSql = whereClauses.join(' AND ');

    const notifications = await queryMany<NotificationRow>(
      `SELECT
          n.notification_id,
          n.branch_id,
          n.user_id,
          n.created_by,
          cb.name AS created_by_name,
          n.title,
          n.message,
          n.category,
          n.link,
          n.is_read,
          n.read_at,
          n.meta,
          n.created_at
       FROM ims.notifications n
       LEFT JOIN ims.users cb ON cb.user_id = n.created_by
       WHERE ${whereSql}
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [input.userId, input.limit, input.offset]
    );

    const filteredCountRow = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM ims.notifications n
       WHERE ${whereSql}`,
      [input.userId]
    );

    const unreadCountRow = await queryOne<{ unread_count: string }>(
      `SELECT COUNT(*)::text AS unread_count
       FROM ims.notifications n
       WHERE n.user_id = $1
         AND COALESCE(n.is_deleted, FALSE) = FALSE
         AND n.is_read = FALSE`,
      [input.userId]
    );

    return {
      notifications,
      total: Number(filteredCountRow?.total ?? 0),
      unreadCount: Number(unreadCountRow?.unread_count ?? 0),
    };
  },

  async markRead(userId: number, notificationId: number): Promise<NotificationRow | null> {
    return queryOne<NotificationRow>(
      `UPDATE ims.notifications
          SET is_read = TRUE,
              read_at = COALESCE(read_at, NOW())
        WHERE notification_id = $1
          AND user_id = $2
          AND COALESCE(is_deleted, FALSE) = FALSE
      RETURNING
        notification_id,
        branch_id,
        user_id,
        created_by,
        NULL::text AS created_by_name,
        title,
        message,
        category,
        link,
        is_read,
        read_at,
        meta,
        created_at`,
      [notificationId, userId]
    );
  },

  async markAllRead(userId: number): Promise<number> {
    const result = await query(
      `UPDATE ims.notifications
          SET is_read = TRUE,
              read_at = COALESCE(read_at, NOW())
        WHERE user_id = $1
          AND COALESCE(is_deleted, FALSE) = FALSE
          AND is_read = FALSE`,
      [userId]
    );

    return result.rowCount ?? 0;
  },

  async softDelete(userId: number, notificationId: number): Promise<boolean> {
    const deleted = await queryOne<{ notification_id: number }>(
      `UPDATE ims.notifications
          SET is_deleted = TRUE,
              deleted_at = NOW()
        WHERE notification_id = $1
          AND user_id = $2
          AND COALESCE(is_deleted, FALSE) = FALSE
      RETURNING notification_id`,
      [notificationId, userId]
    );

    return Boolean(deleted);
  },
};
