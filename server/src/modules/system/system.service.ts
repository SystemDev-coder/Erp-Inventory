import { queryOne, queryMany, query } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import {
  Permission,
  PermissionGroup,
  Role,
  RoleWithPermissions,
  UserWithRole,
  UserPermissionOverride,
  AuditLog,
} from './system.types';
import {
  CreateRoleInput,
  UpdateRoleInput,
  UpdateRolePermissionsInput,
  UpdateUserAccessInput,
  UpdateUserPermissionsInput,
  UpdateUserOverridesInput,
} from './system.schemas';

export class SystemService {
  /**
   * Get all permissions grouped by module
   */
  async getPermissions(): Promise<PermissionGroup[]> {
    const perms = await queryMany<Permission>(
      `SELECT perm_id, perm_key, perm_name, module, description
       FROM ims.permissions
       ORDER BY module, perm_key`
    );

    // Group by module
    const grouped = perms.reduce((acc, perm) => {
      if (!acc[perm.module]) {
        acc[perm.module] = [];
      }
      acc[perm.module].push(perm);
      return acc;
    }, {} as Record<string, Permission[]>);

    return Object.entries(grouped).map(([module, items]) => ({
      module,
      items,
      count: items.length,
    }));
  }

  /**
   * Get all roles
   */
  async getRoles(): Promise<Role[]> {
    return queryMany<Role>(
      `SELECT role_id, role_name, created_at
       FROM ims.roles
       ORDER BY role_name`
    );
  }

  /**
   * Create new role
   */
  async createRole(input: CreateRoleInput, actorId: number): Promise<Role> {
    return withTransaction(async (client) => {
      // Create role
      const result = await client.query<Role>(
        `INSERT INTO ims.roles (role_name)
         VALUES ($1)
         RETURNING role_id, role_name, created_at`,
        [input.role_name]
      );

      const role = result.rows[0];

      // Audit log
      await client.query(
        `INSERT INTO ims.audit_logs (user_id, action_type, table_name, record_id, new_values)
         VALUES ($1, $2, $3, $4, $5)`,
        [actorId, 'CREATE', 'roles', role.role_id, JSON.stringify(role)]
      );

      return role;
    });
  }

  /**
   * Update role
   */
  async updateRole(
    roleId: number,
    input: UpdateRoleInput,
    actorId: number
  ): Promise<Role> {
    return withTransaction(async (client) => {
      // Get old values
      const oldRole = await queryOne<Role>(
        'SELECT * FROM ims.roles WHERE role_id = $1',
        [roleId]
      );

      if (!oldRole) {
        throw ApiError.notFound('Role not found');
      }

      // Update role
      const result = await client.query<Role>(
        `UPDATE ims.roles
         SET role_name = $1
         WHERE role_id = $2
         RETURNING role_id, role_name, created_at`,
        [input.role_name, roleId]
      );

      const role = result.rows[0];

      // Audit log
      await client.query(
        `INSERT INTO ims.audit_logs (user_id, action_type, table_name, record_id, old_values, new_values)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actorId, 'UPDATE', 'roles', roleId, JSON.stringify(oldRole), JSON.stringify(role)]
      );

      return role;
    });
  }

  /**
   * Get role permissions
   */
  async getRolePermissions(roleId: number): Promise<string[]> {
    const perms = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
       FROM ims.role_permissions rp
       JOIN ims.permissions p ON rp.perm_id = p.perm_id
       WHERE rp.role_id = $1
       ORDER BY p.perm_key`,
      [roleId]
    );

    return perms.map((p) => p.perm_key);
  }

  /**
   * Update role permissions (replace all)
   */
  async updateRolePermissions(
    roleId: number,
    input: UpdateRolePermissionsInput,
    actorId: number
  ): Promise<void> {
    return withTransaction(async (client) => {
      // Get old permissions for audit
      const oldPerms = await this.getRolePermissions(roleId);

      // Delete existing permissions
      await client.query(
        'DELETE FROM ims.role_permissions WHERE role_id = $1',
        [roleId]
      );

      // Insert new permissions
      if (input.perm_keys.length > 0) {
        const permIds = await queryMany<{ perm_id: number }>(
          'SELECT perm_id FROM ims.permissions WHERE perm_key = ANY($1)',
          [input.perm_keys]
        );

        for (const { perm_id } of permIds) {
          await client.query(
            'INSERT INTO ims.role_permissions (role_id, perm_id) VALUES ($1, $2)',
            [roleId, perm_id]
          );
        }
      }

      // Audit log
      await client.query(
        `INSERT INTO ims.audit_logs (user_id, action_type, table_name, record_id, old_values, new_values)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          actorId,
          'UPDATE_PERMISSIONS',
          'role_permissions',
          roleId,
          JSON.stringify(oldPerms),
          JSON.stringify(input.perm_keys),
        ]
      );
    });
  }

  /**
   * Get all users with their roles
   */
  async getUsers(): Promise<UserWithRole[]> {
    return queryMany<UserWithRole>(
      `SELECT 
        u.user_id,
        u.name,
        u.username,
        u.phone,
        u.role_id,
        r.role_name,
        u.branch_id,
        b.branch_name,
        u.is_active,
        u.last_login_at,
        u.created_at
       FROM ims.users u
       JOIN ims.roles r ON u.role_id = r.role_id
       JOIN ims.branches b ON u.branch_id = b.branch_id
       ORDER BY u.created_at DESC`
    );
  }

  /**
   * Update user access (role, active status)
   */
  async updateUserAccess(
    userId: number,
    input: UpdateUserAccessInput,
    actorId: number
  ): Promise<void> {
    return withTransaction(async (client) => {
      // Get old values
      const oldUser = await queryOne(
        'SELECT user_id, role_id, is_active FROM ims.users WHERE user_id = $1',
        [userId]
      );

      if (!oldUser) {
        throw ApiError.notFound('User not found');
      }

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (input.role_id !== undefined) {
        updates.push(`role_id = $${paramCount++}`);
        values.push(input.role_id);
      }

      if (input.is_active !== undefined) {
        updates.push(`is_active = $${paramCount++}`);
        values.push(input.is_active);
      }

      if (updates.length === 0) {
        return;
      }

      values.push(userId);

      await client.query(
        `UPDATE ims.users SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
        values
      );

      // Audit log
      await client.query(
        `INSERT INTO ims.audit_logs (user_id, action_type, table_name, record_id, old_values, new_values)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [actorId, 'UPDATE', 'users', userId, JSON.stringify(oldUser), JSON.stringify(input)]
      );
    });
  }

  /**
   * Get user permission overrides (legacy - allow only)
   */
  async getUserPermissions(userId: number): Promise<string[]> {
    const perms = await queryMany<{ perm_key: string }>(
      `SELECT DISTINCT p.perm_key
       FROM ims.user_permissions up
       JOIN ims.permissions p ON up.perm_id = p.perm_id
       WHERE up.user_id = $1
       ORDER BY p.perm_key`,
      [userId]
    );

    return perms.map((p) => p.perm_key);
  }

  /**
   * Get user permission overrides with allow/deny
   */
  async getUserOverrides(userId: number): Promise<UserPermissionOverride[]> {
    return queryMany<UserPermissionOverride>(
      `SELECT 
        upo.user_id,
        upo.perm_id,
        p.perm_key,
        upo.effect
       FROM ims.user_permission_overrides upo
       JOIN ims.permissions p ON upo.perm_id = p.perm_id
       WHERE upo.user_id = $1
       ORDER BY p.perm_key`,
      [userId]
    );
  }

  /**
   * Update user permission overrides (replace all)
   */
  async updateUserPermissions(
    userId: number,
    input: UpdateUserPermissionsInput,
    actorId: number
  ): Promise<void> {
    return withTransaction(async (client) => {
      // Get old permissions for audit
      const oldPerms = await this.getUserPermissions(userId);

      // Delete existing overrides
      await client.query(
        'DELETE FROM ims.user_permissions WHERE user_id = $1',
        [userId]
      );

      // Insert new overrides
      if (input.perm_keys.length > 0) {
        const permIds = await queryMany<{ perm_id: number }>(
          'SELECT perm_id FROM ims.permissions WHERE perm_key = ANY($1)',
          [input.perm_keys]
        );

        for (const { perm_id } of permIds) {
          await client.query(
            'INSERT INTO ims.user_permissions (user_id, perm_id) VALUES ($1, $2)',
            [userId, perm_id]
          );
        }
      }

      // Audit log
      await client.query(
        `INSERT INTO ims.audit_logs (user_id, action_type, table_name, record_id, old_values, new_values)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          actorId,
          'UPDATE_PERMISSIONS',
          'user_permissions',
          userId,
          JSON.stringify(oldPerms),
          JSON.stringify(input.perm_keys),
        ]
      );
    });
  }

  /**
   * Update user permission overrides with allow/deny
   */
  async updateUserOverrides(
    userId: number,
    input: UpdateUserOverridesInput,
    actorId: number
  ): Promise<void> {
    return withTransaction(async (client) => {
      // Get old overrides for audit
      const oldOverrides = await this.getUserOverrides(userId);

      // Delete existing overrides
      await client.query(
        'DELETE FROM ims.user_permission_overrides WHERE user_id = $1',
        [userId]
      );

      // Insert new overrides
      if (input.overrides.length > 0) {
        for (const override of input.overrides) {
          const perm = await queryOne<{ perm_id: number }>(
            'SELECT perm_id FROM ims.permissions WHERE perm_key = $1',
            [override.perm_key]
          );

          if (perm) {
            await client.query(
              'INSERT INTO ims.user_permission_overrides (user_id, perm_id, effect) VALUES ($1, $2, $3)',
              [userId, perm.perm_id, override.effect]
            );
          }
        }
      }

      // Audit log
      await client.query(
        `INSERT INTO ims.audit_logs (user_id, action_type, table_name, record_id, old_values, new_values)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          actorId,
          'UPDATE_OVERRIDES',
          'user_permission_overrides',
          userId,
          JSON.stringify(oldOverrides),
          JSON.stringify(input.overrides),
        ]
      );
    });
  }

  /**
   * Get audit logs for a user
   */
  async getUserAuditLogs(userId: number, limit: number = 50): Promise<AuditLog[]> {
    return queryMany<AuditLog>(
      `SELECT 
        log_id,
        user_id,
        action_type,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent,
        created_at
       FROM ims.audit_logs
       WHERE user_id = $1 OR record_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
  }
}

export const systemService = new SystemService();
