import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { AuthRequest } from '../../middlewares/requireAuth';
import { sessionService } from '../session/session.service';
import { authService } from '../auth/auth.service';
import { dashboardService } from './dashboard.service';
import { resolveActiveBranchIds } from '../../utils/branchScope';

const DASHBOARD_CACHE_TTL_MS = 45_000;
const dashboardPayloadCache = new Map<string, { payload: unknown; expiresAt: number }>();

const dashboardCacheKey = (userId: number, branchIds: number[]) =>
  `${userId}:${[...branchIds].sort((a, b) => a - b).join(',')}`;

export class DashboardController {
  /**
   * GET /api/dashboard - Role-based dashboard widgets
   */
  getDashboard = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    let permissions: string[];
    let roleName = 'User';

    const cached = await sessionService.getCachedPermissions(req.user.userId);
    if (cached) {
      permissions = cached;
    } else {
      const data = await authService.getUserWithPermissions(req.user.userId);
      permissions = data?.permissions ?? [];
      roleName = data?.role?.role_name ?? roleName;
      await sessionService.cachePermissions(req.user.userId, permissions);
    }

    if (roleName === 'User') {
      const profile = await authService.getUserProfileById(req.user.userId);
      roleName = profile?.role_name ?? roleName;
    }

    const branchIds = await resolveActiveBranchIds(req);
    const cacheKey = dashboardCacheKey(req.user.userId, branchIds);
    const cachedPayload = dashboardPayloadCache.get(cacheKey);
    if (cachedPayload && Date.now() <= cachedPayload.expiresAt) {
      return ApiResponse.success(res, cachedPayload.payload);
    }

    const widgets = dashboardService.getDashboardWidgets(permissions);
    const [cards, charts, lowStockItems, recent] = await Promise.all([
      dashboardService.getDashboardCards(branchIds, permissions),
      dashboardService.getDashboardCharts(branchIds, permissions),
      dashboardService.getLowStockItems(branchIds, permissions),
      dashboardService.getRecentActivity(branchIds, permissions),
    ]);

    const payload = {
      widgets,
      cards,
      charts,
      low_stock_items: lowStockItems,
      recent,
      summary: {
        modules: cards.length,
        sections: charts.length,
      },
      permissions,
      role: {
        role_id: req.user.roleId,
        role_name: roleName,
      },
    };

    dashboardPayloadCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    });

    return ApiResponse.success(res, payload);
  });

  /**
   * GET /api/dashboard/cards/:cardId - Drilldown rows for a dashboard card
   */
  getDashboardCardDrilldown = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    let permissions: string[];
    const cached = await sessionService.getCachedPermissions(req.user.userId);
    if (cached) {
      permissions = cached;
    } else {
      const data = await authService.getUserWithPermissions(req.user.userId);
      permissions = data?.permissions ?? [];
      await sessionService.cachePermissions(req.user.userId, permissions);
    }

    const cardId = String(req.params.cardId || '').trim();
    const branchIds = await resolveActiveBranchIds(req);
    const payload = await dashboardService.getDashboardCardDrilldown(branchIds, permissions, cardId);
    return ApiResponse.success(res, payload);
  });
}

export const dashboardController = new DashboardController();
