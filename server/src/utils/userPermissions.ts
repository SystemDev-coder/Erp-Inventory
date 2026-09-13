import { queryMany, queryOne } from '../db/query';
import { sessionService } from '../modules/session/session.service';

const expandPermissionKeys = (permKey: string): string[] => {
  if (permKey.startsWith('items.')) {
    return [permKey, permKey.replace('items.', 'products.')];
  }
  if (permKey.startsWith('products.')) {
    return [permKey, permKey.replace('products.', 'items.')];
  }
  return [permKey];
};

const adminRoleCache = new Map<number, { isAdmin: boolean; expiresAt: number }>();
const ADMIN_ROLE_TTL_MS = 10 * 60 * 1000;

export const isAdminRole = async (roleId: number): Promise<boolean> => {
  const cached = adminRoleCache.get(roleId);
  if (cached && Date.now() <= cached.expiresAt) {
    return cached.isAdmin;
  }

  const row = await queryOne<{ role_name: string; is_system: boolean | null }>(
    `SELECT role_name, is_system FROM ims.roles WHERE role_id = $1 LIMIT 1`,
    [roleId]
  );
  const isAdmin = row
    ? (row.role_name || '').toLowerCase().includes('admin') || Boolean(row.is_system)
    : false;

  adminRoleCache.set(roleId, { isAdmin, expiresAt: Date.now() + ADMIN_ROLE_TTL_MS });
  return isAdmin;
};

const loadUserPermissions = async (userId: number, roleId: number): Promise<Set<string>> => {
  const [rolePerms, userPerms, overrides] = await Promise.all([
    queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
         FROM ims.role_permissions rp
         JOIN ims.permissions p ON rp.perm_id = p.perm_id
        WHERE rp.role_id = $1`,
      [roleId]
    ),
    queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
         FROM ims.user_permissions up
         JOIN ims.permissions p ON up.perm_id = p.perm_id
        WHERE up.user_id = $1`,
      [userId]
    ),
    queryMany<{ perm_key: string; effect: string }>(
      `SELECT DISTINCT p.perm_key, upo.effect
         FROM ims.user_permission_overrides upo
         JOIN ims.permissions p ON upo.perm_id = p.perm_id
        WHERE upo.user_id = $1`,
      [userId]
    ),
  ]);

  const permissionSet = new Set<string>([
    ...rolePerms.map((row) => row.perm_key),
    ...userPerms.map((row) => row.perm_key),
    ...overrides.filter((row) => row.effect === 'allow').map((row) => row.perm_key),
  ]);

  overrides
    .filter((row) => row.effect === 'deny')
    .forEach((row) => permissionSet.delete(row.perm_key));

  return permissionSet;
};

export const getUserPermissionSet = async (
  userId: number,
  roleId: number
): Promise<Set<string>> => {
  const cached = await sessionService.getCachedPermissions(userId);
  if (cached) return new Set(cached);

  const permissionSet = await loadUserPermissions(userId, roleId);
  await sessionService.cachePermissions(userId, Array.from(permissionSet));
  return permissionSet;
};

export const userHasPermission = (permissions: Set<string>, permKey: string): boolean => {
  return expandPermissionKeys(permKey).some((key) => permissions.has(key));
};

export const userHasAnyPermission = (permissions: Set<string>, permKeys: string[]): boolean => {
  const expanded = new Set(permKeys.flatMap((key) => expandPermissionKeys(key)));
  return Array.from(expanded).some((key) => permissions.has(key));
};
