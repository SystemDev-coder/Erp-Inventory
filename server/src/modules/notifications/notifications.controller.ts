import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { ApiResponse } from '../../utils/ApiResponse';
import { AuthRequest } from '../../middlewares/requireAuth';
import { logAudit } from '../../utils/audit';
import { notificationIdParamSchema, notificationsQuerySchema } from './notifications.schemas';
import { notificationsService } from './notifications.service';

export const listNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const query = notificationsQuerySchema.parse(req.query);
  const data = await notificationsService.list({
    userId: req.user.userId,
    limit: query.limit,
    offset: query.offset,
    unreadOnly: query.unreadOnly,
  });

  return ApiResponse.success(res, data);
});

export const markNotificationRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const { id } = notificationIdParamSchema.parse(req.params);
  const notification = await notificationsService.markRead(req.user.userId, id);
  if (!notification) {
    throw ApiError.notFound('Notification not found');
  }

  await logAudit({
    userId: req.user.userId,
    action: 'notification.mark_read',
    entity: 'notifications',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  return ApiResponse.success(res, { notification }, 'Notification marked as read');
});

export const markAllNotificationsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const updated = await notificationsService.markAllRead(req.user.userId);

  await logAudit({
    userId: req.user.userId,
    action: 'notification.mark_all_read',
    entity: 'notifications',
    meta: { updated },
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  return ApiResponse.success(res, { updated }, 'Notifications updated');
});

export const deleteNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const { id } = notificationIdParamSchema.parse(req.params);
  const deleted = await notificationsService.softDelete(req.user.userId, id);
  if (!deleted) {
    throw ApiError.notFound('Notification not found');
  }

  await logAudit({
    userId: req.user.userId,
    action: 'notification.delete',
    entity: 'notifications',
    entityId: id,
    ip: req.ip,
    userAgent: req.get('user-agent') ?? null,
  });

  return ApiResponse.success(res, null, 'Notification deleted');
});
