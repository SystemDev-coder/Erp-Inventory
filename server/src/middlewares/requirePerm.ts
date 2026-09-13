import { Response, NextFunction } from 'express';
import { AuthRequest } from './requireAuth';
import { ApiError } from '../utils/ApiError';
import { queryOne } from '../db/query';
import {
  getUserPermissionSet,
  isAdminRole,
  userHasAnyPermission,
  userHasPermission,
} from '../utils/userPermissions';

export { isAdminRole } from '../utils/userPermissions';

export const requireRoleName = (roleNames: string | string[]) => {
  const allowed = Array.isArray(roleNames) ? roleNames : [roleNames];
  const normalized = allowed.map((name) => name.toLowerCase());
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const row = await queryOne<{ role_name: string | null }>(
        `SELECT role_name FROM ims.roles WHERE role_id = $1 LIMIT 1`,
        [req.user.roleId]
      );
      const roleName = (row?.role_name || '').toLowerCase();
      if (!normalized.includes(roleName)) {
        throw ApiError.forbidden('Insufficient role access');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

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
