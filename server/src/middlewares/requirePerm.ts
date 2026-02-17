import { Response, NextFunction } from 'express';
import { AuthRequest } from './requireAuth';
import { ApiError } from '../utils/ApiError';
import { queryMany } from '../db/query';

const expandPermissionKeys = (permKey: string): string[] => {
  if (permKey.startsWith('items.')) {
    return [permKey, permKey.replace('items.', 'products.')];
  }
  if (permKey.startsWith('products.')) {
    return [permKey, permKey.replace('products.', 'items.')];
  }
  return [permKey];
};

/**
 * Middleware to check if authenticated user has specific permission
 * Formula: effective = (role_permissions ∪ user_permissions ∪ overrides_allow) - overrides_deny
 */
export const requirePerm = (permKey: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const userId = req.user.userId;
      const roleId = req.user.roleId;
      const effectivePermKeys = expandPermissionKeys(permKey);

      // Check for explicit deny first
      const denyCheck = await queryMany<{ perm_key: string }>(
        `SELECT DISTINCT p.perm_key
         FROM ims.user_permission_overrides upo
         JOIN ims.permissions p ON upo.perm_id = p.perm_id
         WHERE upo.user_id = $1 AND p.perm_key = ANY($2) AND upo.effect = 'deny'`,
        [userId, effectivePermKeys]
      );

      if (denyCheck.length > 0) {
        throw ApiError.forbidden('Permission explicitly denied');
      }

      // Check if user has permission from role, legacy overrides, or allow overrides
      const rolePerms = await queryMany<{ perm_key: string }>(
        `SELECT DISTINCT p.perm_key
         FROM ims.role_permissions rp
         JOIN ims.permissions p ON rp.perm_id = p.perm_id
         WHERE rp.role_id = $1 AND p.perm_key = ANY($2)`,
        [roleId, effectivePermKeys]
      );

      const userPerms = await queryMany<{ perm_key: string }>(
        `SELECT DISTINCT p.perm_key
         FROM ims.user_permissions up
         JOIN ims.permissions p ON up.perm_id = p.perm_id
         WHERE up.user_id = $1 AND p.perm_key = ANY($2)`,
        [userId, effectivePermKeys]
      );

      const allowOverrides = await queryMany<{ perm_key: string }>(
        `SELECT DISTINCT p.perm_key
         FROM ims.user_permission_overrides upo
         JOIN ims.permissions p ON upo.perm_id = p.perm_id
         WHERE upo.user_id = $1 AND p.perm_key = ANY($2) AND upo.effect = 'allow'`,
        [userId, effectivePermKeys]
      );

      // Check if user has permission from any source
      if (rolePerms.length === 0 && userPerms.length === 0 && allowOverrides.length === 0) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user has ANY of the listed permissions
 * Formula: effective = (role_permissions ∪ user_permissions ∪ overrides_allow) - overrides_deny
 */
export const requireAnyPerm = (permKeys: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const userId = req.user.userId;
      const roleId = req.user.roleId;
      const effectivePermKeys = Array.from(
        new Set(permKeys.flatMap((permKey) => expandPermissionKeys(permKey)))
      );

      // Get denied permissions
      const deniedPerms = await queryMany<{ perm_key: string }>(
        `SELECT DISTINCT p.perm_key
         FROM ims.user_permission_overrides upo
         JOIN ims.permissions p ON upo.perm_id = p.perm_id
         WHERE upo.user_id = $1 AND p.perm_key = ANY($2) AND upo.effect = 'deny'`,
        [userId, effectivePermKeys]
      );

      const deniedSet = new Set(deniedPerms.map((p) => p.perm_key));

      // Get role permissions
      const rolePerms = await queryMany<{ perm_key: string }>(
        `SELECT DISTINCT p.perm_key
         FROM ims.role_permissions rp
         JOIN ims.permissions p ON rp.perm_id = p.perm_id
         WHERE rp.role_id = $1 AND p.perm_key = ANY($2)`,
        [roleId, effectivePermKeys]
      );

      // Get legacy user permissions
      const userPerms = await queryMany<{ perm_key: string }>(
        `SELECT DISTINCT p.perm_key
         FROM ims.user_permissions up
         JOIN ims.permissions p ON up.perm_id = p.perm_id
         WHERE up.user_id = $1 AND p.perm_key = ANY($2)`,
        [userId, effectivePermKeys]
      );

      // Get allow overrides
      const allowOverrides = await queryMany<{ perm_key: string }>(
        `SELECT DISTINCT p.perm_key
         FROM ims.user_permission_overrides upo
         JOIN ims.permissions p ON upo.perm_id = p.perm_id
         WHERE upo.user_id = $1 AND p.perm_key = ANY($2) AND upo.effect = 'allow'`,
        [userId, effectivePermKeys]
      );

      // Combine all allowed permissions
      const allowed = [
        ...rolePerms.map((p) => p.perm_key),
        ...userPerms.map((p) => p.perm_key),
        ...allowOverrides.map((p) => p.perm_key),
      ].filter((perm) => !deniedSet.has(perm));

      // Check if user has ANY permission
      if (allowed.length === 0) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
