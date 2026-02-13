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
  limit: number;
  offset: number;
  unreadOnly?: boolean;
}

export const notificationsService = {
  async list(input: NotificationListInput) {
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
