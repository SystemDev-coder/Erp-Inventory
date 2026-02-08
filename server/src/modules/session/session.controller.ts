import { Response } from 'express';
import { sessionService } from './session.service';
import { sidebarService } from './sidebar.service';
import { authService } from '../auth/auth.service';
import { ApiResponse } from '../../utils/ApiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middlewares/requireAuth';
import {
  updatePreferencesSchema,
  logoutSessionSchema,
  updateSessionLimitSchema,
} from './session.schemas';

export class SessionController {
  /**
   * GET /api/user/permissions - Get all permissions for current user
   */
  getPermissions = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    // Check cache first
    const cached = await sessionService.getCachedPermissions(req.user.userId);
    if (cached) {
      return ApiResponse.success(res, {
        permissions: cached,
        cached: true,
      });
    }

    // Get fresh permissions
    const data = await authService.getUserWithPermissions(req.user.userId);

    // Cache for future requests
    await sessionService.cachePermissions(req.user.userId, data.permissions);

    return ApiResponse.success(res, {
      permissions: data.permissions,
      cached: false,
    });
  });

  /**
   * GET /api/user/sidebar - Get personalized sidebar menu
   */
  getSidebar = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    // Get user permissions
    let permissions: string[];
    const cached = await sessionService.getCachedPermissions(req.user.userId);

    if (cached) {
      permissions = cached;
    } else {
      const data = await authService.getUserWithPermissions(req.user.userId);
      permissions = data.permissions;
      await sessionService.cachePermissions(req.user.userId, permissions);
    }

    // Generate sidebar menu
    const sidebar = await sidebarService.generateSidebar(req.user.userId, permissions);

    return ApiResponse.success(res, sidebar);
  });

  /**
   * GET /api/user/preferences - Get user preferences
   */
  getPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    const preferences = await sessionService.getUserPreferences(req.user.userId);
    return ApiResponse.success(res, preferences);
  });

  /**
   * PUT /api/user/preferences - Update user preferences
   */
  updatePreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    const input = updatePreferencesSchema.parse(req.body);
    const preferences = await sessionService.updateUserPreferences(
      req.user.userId,
      input
    );

    return ApiResponse.success(res, preferences, 'Preferences updated successfully');
  });

  /**
   * GET /api/user/sessions - List active sessions
   */
  getSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    const sessions = await sessionService.getUserSessions(
      req.user.userId,
      req.user.sessionId
    );

    return ApiResponse.success(res, sessions);
  });

  /**
   * POST /api/user/logout-other-sessions - Logout from other devices
   */
  logoutOtherSessions = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    const count = await sessionService.logoutOtherSessions(
      req.user.userId,
      req.user.sessionId!
    );

    return ApiResponse.success(
      res,
      { loggedOut: count },
      `Logged out from ${count} other session(s)`
    );
  });

  /**
   * DELETE /api/user/sessions/:sessionId - Logout specific session
   */
  logoutSession = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    const sessionId = req.params.sessionId;

    await sessionService.logoutSession(req.user.userId, sessionId);

    return ApiResponse.success(res, null, 'Session terminated successfully');
  });

  /**
   * GET /api/check-permission/:permKey - Check specific permission
   */
  checkPermission = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    const permKey = req.params.permKey;

    // Get user permissions
    let permissions: string[];
    const cached = await sessionService.getCachedPermissions(req.user.userId);

    if (cached) {
      permissions = cached;
    } else {
      const data = await authService.getUserWithPermissions(req.user.userId);
      permissions = data.permissions;
      await sessionService.cachePermissions(req.user.userId, permissions);
    }

    const hasPermission = permissions.includes(permKey);

    return ApiResponse.success(res, {
      permission: permKey,
      granted: hasPermission,
    });
  });

  /**
   * PUT /api/user/session-limit - Update concurrent session limit (admin only)
   */
  updateSessionLimit = asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }

    const input = updateSessionLimitSchema.parse(req.body);
    const targetUserId = parseInt(req.params.userId, 10) || req.user.userId;

    await sessionService.updateSessionLimit(targetUserId, input);

    return ApiResponse.success(res, null, 'Session limit updated successfully');
  });
}

export const sessionController = new SessionController();
