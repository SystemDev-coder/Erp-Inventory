import { apiClient } from './api';
import { API } from '../config/env';

export interface NotificationItem {
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

export interface NotificationsListResponse {
  notifications: NotificationItem[];
  total: number;
  unreadCount: number;
}

export const notificationService = {
  async list(params?: { limit?: number; offset?: number; unreadOnly?: boolean }) {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    if (params?.unreadOnly !== undefined) query.set('unreadOnly', String(params.unreadOnly));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get<NotificationsListResponse>(`${API.NOTIFICATIONS.LIST}${suffix}`);
  },

  async markRead(id: number) {
    return apiClient.patch<{ notification: NotificationItem }>(API.NOTIFICATIONS.MARK_READ(id));
  },

  async markAllRead() {
    return apiClient.patch<{ updated: number }>(API.NOTIFICATIONS.MARK_ALL_READ);
  },

  async remove(id: number) {
    return apiClient.delete(API.NOTIFICATIONS.ITEM(id));
  },
};
