import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { ApiResponse } from '../../utils/ApiResponse';
import { AuthRequest } from '../../middlewares/requireAuth';
import { logAudit } from '../../utils/audit';
import { resolveActiveBranchIds } from '../../utils/branchScope';
import { notificationIdParamSchema, notificationsQuerySchema } from './notifications.schemas';
import { notificationsService } from './notifications.service';

export const listNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  const query = notificationsQuerySchema.parse(req.query);
  // H11 fix: resolve against the caller's currently active/authorized
  // branch(es) via the same mechanism every other branch-scoped list uses,
  // instead of the static branch_id baked into the JWT at login - this is
  // what makes switching the active branch actually change which
  // notifications are returned. Non-admins get exactly their authorized
  // branch(es); an Administrator with no explicit ?branchId= gets every
  // active branch (their existing "All Branches" behavior), and an explicit
  // ?branchId= for an unauthorized branch is rejected the same way it is
  // everywhere else (assertBranchAccess, inside resolveActiveBranchIds).
  const branchIds = await resolveActiveBranchIds(req);
  const data = await notificationsService.list({
    userId: req.user.userId,
    branchId: branchIds.length === 1 ? branchIds[0] : undefined,
    branchIds,
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
    newValue: { updated },
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
