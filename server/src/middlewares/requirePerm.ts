import { Response, NextFunction } from 'express';
import { AuthRequest } from './requireAuth';
import { ApiError } from '../utils/ApiError';
import {
  getUserPermissionSet,
  isAdminRole,
  userHasAnyPermission,
  userHasPermission,
} from '../utils/userPermissions';

export { isAdminRole } from '../utils/userPermissions';

/**
 * Middleware to check if authenticated user has specific permission.
 * Admin roles bypass all checks.
 * Uses in-memory permission cache (5 min TTL) to avoid repeated DB lookups.
 */
export const requirePerm = (permKey: string) => {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      if (await isAdminRole(req.user.roleId)) {
        return next();
      }

      const permissions = await getUserPermissionSet(req.user.userId, req.user.roleId);
      if (!userHasPermission(permissions, permKey)) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user has ANY of the listed permissions.
 * Admin roles bypass all checks.
 */
export const requireAnyPerm = (permKeys: string[]) => {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      if (await isAdminRole(req.user.roleId)) {
        return next();
      }

      const permissions = await getUserPermissionSet(req.user.userId, req.user.roleId);
      if (!userHasAnyPermission(permissions, permKeys)) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
