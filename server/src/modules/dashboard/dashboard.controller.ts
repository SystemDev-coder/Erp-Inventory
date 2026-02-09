import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/ApiResponse';
import { AuthRequest } from '../../middlewares/requireAuth';
import { sessionService } from '../session/session.service';
import { authService } from '../auth/auth.service';
import { dashboardService } from './dashboard.service';

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

    const widgets = dashboardService.getDashboardWidgets(permissions);
    const cards = await dashboardService.getDashboardCards(req.user.branchId, permissions);
    const charts = await dashboardService.getDashboardCharts(req.user.branchId, permissions);
    const recent = await dashboardService.getRecentActivity(req.user.branchId, permissions);

    return ApiResponse.success(res, {
      widgets,
      cards,
      charts,
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
    });
  });
}

export const dashboardController = new DashboardController();
