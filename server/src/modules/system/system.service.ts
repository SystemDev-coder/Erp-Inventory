import { queryMany, queryOne } from '../../db/query';
import { withTransaction } from '../../db/withTx';
import { ApiError } from '../../utils/ApiError';
import { usersService, UserRow } from '../users/users.service';
import {
  CreatePermissionInput,
  CreateRoleInput,
  CreateUserInput,
  UpdatePermissionInput,
  UpdateRoleInput,
  UpdateUserInput,
} from './system.schemas';

export interface SystemInfo {
  system_id: number;
  system_name: string;
  logo_url: string | null;
  banner_image_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemInfoInput {
  systemName?: string;
  logoUrl?: string;
  bannerImageUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface BranchRow {
  branch_id: number;
  branch_name: string;
  location: string | null;
  is_active: boolean;
}

export interface RoleRow {
  role_id: number;
  role_code: string;
  role_name: string;
  description: string | null;
  is_system: boolean;
  permission_count: number;
}

export interface PermissionRow {
  perm_id: number;
  perm_key: string;
  perm_name: string;
  module: string;
  sub_module: string | null;
  action_type: string | null;
  description: string | null;
}

export interface RolePermissionRow extends PermissionRow {
  has_permission: boolean;
}

export interface AuditLogRow {
  audit_id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity: string | null;
  entity_id: number | null;
  old_value?: unknown;
  new_value?: unknown;
  meta?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

type AuditLogColumns = {
  idColumn: 'log_id' | 'audit_id';
  actionColumn: 'action_type' | 'action';
  entityColumn: 'table_name' | 'entity';
  entityIdColumn: 'record_id' | 'entity_id';
  oldColumn: 'old_values' | 'old_value';
  newColumn: 'new_values' | 'new_value';
  hasMeta: boolean;
};

let auditLogColumnsCache: AuditLogColumns | null = null;

const normalizeRoleCode = (value: string): string =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

const detectAuditLogColumns = async (): Promise<AuditLogColumns> => {
  if (auditLogColumnsCache) return auditLogColumnsCache;

  const columns = await queryMany<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'ims'
        AND table_name = 'audit_logs'`
  );

  const names = new Set(columns.map((row) => row.column_name));
  auditLogColumnsCache = {
    idColumn: names.has('log_id') ? 'log_id' : 'audit_id',
    actionColumn: names.has('action_type') ? 'action_type' : 'action',
    entityColumn: names.has('table_name') ? 'table_name' : 'entity',
    entityIdColumn: names.has('record_id') ? 'record_id' : 'entity_id',
    oldColumn: names.has('old_values') ? 'old_values' : 'old_value',
    newColumn: names.has('new_values') ? 'new_values' : 'new_value',
    hasMeta: names.has('meta'),
  };

  return auditLogColumnsCache;
};

const ensureUniqueRoleCode = async (
  baseCode: string,
  excludeRoleId?: number
): Promise<string> => {
  const fallback = baseCode || 'ROLE';
  let candidate = fallback;
  let suffix = 2;

  while (true) {
    const existing = await queryOne<{ role_id: number }>(
      `SELECT role_id
         FROM ims.roles
        WHERE role_code = $1
          AND ($2::bigint IS NULL OR role_id <> $2)
        LIMIT 1`,
      [candidate, excludeRoleId ?? null]
    );

    if (!existing) {
      return candidate;
    }

    candidate = `${fallback}_${suffix++}`.slice(0, 40);
  }
};

export const systemService = {
  async getSystemInfo(): Promise<SystemInfo | null> {
    return queryOne<SystemInfo>(
      `SELECT * FROM ims.system_information WHERE system_id = 1`
    );
  },

  async updateSystemInfo(input: SystemInfoInput): Promise<SystemInfo> {
    const existing = await this.getSystemInfo();

    if (existing) {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 1;

      if (input.systemName !== undefined) {
        updates.push(`system_name = $${paramCount++}`);
        values.push(input.systemName);
      }
      if (input.logoUrl !== undefined) {
        updates.push(`logo_url = $${paramCount++}`);
        values.push(input.logoUrl);
      }
      if (input.bannerImageUrl !== undefined) {
        updates.push(`banner_image_url = $${paramCount++}`);
        values.push(input.bannerImageUrl);
      }
      if (input.address !== undefined) {
        updates.push(`address = $${paramCount++}`);
        values.push(input.address);
      }
      if (input.phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(input.phone);
      }
      if (input.email !== undefined) {
        updates.push(`email = $${paramCount++}`);
        values.push(input.email);
      }
      if (input.website !== undefined) {
        updates.push(`website = $${paramCount++}`);
        values.push(input.website);
      }

      if (!updates.length) {
        return existing;
      }

      const updated = await queryOne<SystemInfo>(
        `UPDATE ims.system_information
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE system_id = 1
          RETURNING *`,
        values
      );

      if (!updated) {
        throw ApiError.internal('Failed to update system information');
      }
      return updated;
    }

    const created = await queryOne<SystemInfo>(
      `INSERT INTO ims.system_information (
        system_name, logo_url, banner_image_url, address, phone, email, website
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.systemName || 'My ERP System',
        input.logoUrl || null,
        input.bannerImageUrl || null,
        input.address || null,
        input.phone || null,
        input.email || null,
        input.website || null,
      ]
    );

    if (!created) {
      throw ApiError.internal('Failed to create system information');
    }
    return created;
  },

  async listBranches(): Promise<BranchRow[]> {
    return queryMany<BranchRow>(
      `SELECT
          branch_id,
          branch_name,
          address AS location,
          is_active
       FROM ims.branches
       ORDER BY branch_name`
    );
  },

  async listRoles(): Promise<RoleRow[]> {
    return queryMany<RoleRow>(
      `SELECT
          r.role_id,
          r.role_code,
          r.role_name,
          r.description,
          r.is_system,
          COUNT(rp.perm_id)::int AS permission_count
       FROM ims.roles r
       LEFT JOIN ims.role_permissions rp ON rp.role_id = r.role_id
       GROUP BY r.role_id
       ORDER BY r.role_name`
    );
  },

  async createRole(input: CreateRoleInput): Promise<RoleRow> {
    const preparedCode = normalizeRoleCode(input.roleCode || input.roleName);
    const roleCode = await ensureUniqueRoleCode(preparedCode);

    const created = await queryOne<RoleRow>(
      `INSERT INTO ims.roles (role_code, role_name, description, is_system)
       VALUES ($1, $2, $3, FALSE)
       RETURNING role_id, role_code, role_name, description, is_system, 0::int AS permission_count`,
      [roleCode, input.roleName, input.description ?? null]
    );

    if (!created) {
      throw ApiError.internal('Failed to create role');
    }
    return created;
  },

  async updateRole(id: number, input: UpdateRoleInput): Promise<RoleRow | null> {
    const current = await queryOne<{ role_id: number; role_code: string }>(
      `SELECT role_id, role_code
         FROM ims.roles
        WHERE role_id = $1`,
      [id]
    );
    if (!current) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.roleName !== undefined) {
      updates.push(`role_name = $${parameter++}`);
      values.push(input.roleName);
    }

    if (input.roleCode !== undefined) {
      const preparedCode = normalizeRoleCode(input.roleCode);
      const nextCode = await ensureUniqueRoleCode(preparedCode, id);
      updates.push(`role_code = $${parameter++}`);
      values.push(nextCode);
    }

    if (input.description !== undefined) {
      updates.push(`description = $${parameter++}`);
      values.push(input.description || null);
    }

    if (!updates.length) {
      return queryOne<RoleRow>(
        `SELECT
            r.role_id,
            r.role_code,
            r.role_name,
            r.description,
            r.is_system,
            COUNT(rp.perm_id)::int AS permission_count
         FROM ims.roles r
         LEFT JOIN ims.role_permissions rp ON rp.role_id = r.role_id
         WHERE r.role_id = $1
         GROUP BY r.role_id`,
        [id]
      );
    }

    values.push(id);

    return queryOne<RoleRow>(
      `WITH updated AS (
          UPDATE ims.roles
             SET ${updates.join(', ')}
           WHERE role_id = $${parameter}
           RETURNING role_id, role_code, role_name, description, is_system
       )
       SELECT
          u.role_id,
          u.role_code,
          u.role_name,
          u.description,
          u.is_system,
          COUNT(rp.perm_id)::int AS permission_count
       FROM updated u
       LEFT JOIN ims.role_permissions rp ON rp.role_id = u.role_id
       GROUP BY u.role_id, u.role_code, u.role_name, u.description, u.is_system`,
      values
    );
  },

  async deleteRole(id: number): Promise<void> {
    const role = await queryOne<{ role_id: number; is_system: boolean }>(
      `SELECT role_id, is_system
         FROM ims.roles
        WHERE role_id = $1`,
      [id]
    );
    if (!role) {
      throw ApiError.notFound('Role not found');
    }
    if (role.is_system) {
      throw ApiError.badRequest('System roles cannot be deleted');
    }

    try {
      await queryOne(`DELETE FROM ims.roles WHERE role_id = $1`, [id]);
    } catch (error: any) {
      if (error?.code === '23503') {
        throw ApiError.conflict('Role is assigned to users and cannot be deleted');
      }
      throw error;
    }
  },

  async listRolePermissions(roleId: number): Promise<RolePermissionRow[]> {
    const role = await queryOne<{ role_id: number }>(
      `SELECT role_id FROM ims.roles WHERE role_id = $1`,
      [roleId]
    );
    if (!role) {
      throw ApiError.notFound('Role not found');
    }

    return queryMany<RolePermissionRow>(
      `SELECT
          p.perm_id,
          p.perm_key,
          p.perm_name,
          p.module,
          p.sub_module,
          p.action_type,
          p.description,
          (rp.role_id IS NOT NULL) AS has_permission
       FROM ims.permissions p
       LEFT JOIN ims.role_permissions rp
         ON rp.perm_id = p.perm_id
        AND rp.role_id = $1
       ORDER BY p.module, p.sub_module NULLS FIRST, p.action_type NULLS FIRST, p.perm_key`,
      [roleId]
    );
  },

  async replaceRolePermissions(roleId: number, permIds: number[]): Promise<void> {
    const role = await queryOne<{ role_id: number }>(
      `SELECT role_id FROM ims.roles WHERE role_id = $1`,
      [roleId]
    );
    if (!role) {
      throw ApiError.notFound('Role not found');
    }

    await withTransaction(async (client) => {
      await client.query(`DELETE FROM ims.role_permissions WHERE role_id = $1`, [roleId]);
      if (!permIds.length) {
        return;
      }
      await client.query(
        `INSERT INTO ims.role_permissions (role_id, perm_id)
         SELECT $1, x.perm_id
           FROM UNNEST($2::int[]) AS x(perm_id)
         ON CONFLICT (role_id, perm_id) DO NOTHING`,
        [roleId, permIds]
      );
    });
  },

  async listPermissions(): Promise<PermissionRow[]> {
    return queryMany<PermissionRow>(
      `SELECT
          perm_id,
          perm_key,
          perm_name,
          module,
          sub_module,
          action_type,
          description
       FROM ims.permissions
       ORDER BY module, sub_module NULLS FIRST, action_type NULLS FIRST, perm_key`
    );
  },

  async createPermission(input: CreatePermissionInput): Promise<PermissionRow> {
    const created = await queryOne<PermissionRow>(
      `INSERT INTO ims.permissions (
          perm_key, perm_name, module, sub_module, action_type, description
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING perm_id, perm_key, perm_name, module, sub_module, action_type, description`,
      [
        input.permKey.trim(),
        input.permName.trim(),
        input.module.trim(),
        input.subModule?.trim() || null,
        input.actionType?.trim() || null,
        input.description?.trim() || null,
      ]
    );

    if (!created) {
      throw ApiError.internal('Failed to create permission');
    }
    return created;
  },

  async updatePermission(
    id: number,
    input: UpdatePermissionInput
  ): Promise<PermissionRow | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    if (input.permKey !== undefined) {
      updates.push(`perm_key = $${parameter++}`);
      values.push(input.permKey.trim());
    }
    if (input.permName !== undefined) {
      updates.push(`perm_name = $${parameter++}`);
      values.push(input.permName.trim());
    }
    if (input.module !== undefined) {
      updates.push(`module = $${parameter++}`);
      values.push(input.module.trim());
    }
    if (input.subModule !== undefined) {
      updates.push(`sub_module = $${parameter++}`);
      values.push(input.subModule.trim() || null);
    }
    if (input.actionType !== undefined) {
      updates.push(`action_type = $${parameter++}`);
      values.push(input.actionType.trim() || null);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${parameter++}`);
      values.push(input.description.trim() || null);
    }

    values.push(id);

    return queryOne<PermissionRow>(
      `UPDATE ims.permissions
          SET ${updates.join(', ')}
        WHERE perm_id = $${parameter}
        RETURNING perm_id, perm_key, perm_name, module, sub_module, action_type, description`,
      values
    );
  },

  async deletePermission(id: number): Promise<void> {
    const deleted = await queryOne<{ perm_id: number }>(
      `DELETE FROM ims.permissions
        WHERE perm_id = $1
        RETURNING perm_id`,
      [id]
    );
    if (!deleted) {
      throw ApiError.notFound('Permission not found');
    }
  },

  async listUsers(): Promise<UserRow[]> {
    return usersService.list();
  },

  async getUser(id: number): Promise<UserRow | null> {
    return usersService.get(id);
  },

  async createUser(input: CreateUserInput): Promise<UserRow> {
    return usersService.create(input);
  },

  async updateUser(id: number, input: UpdateUserInput): Promise<UserRow | null> {
    return usersService.update(id, input);
  },

  async deleteUser(id: number): Promise<void> {
    await usersService.remove(id);
  },

  async listLogs(page = 1, limit = 50): Promise<{ rows: AuditLogRow[]; total: number }> {
    const offset = (page - 1) * limit;
    const columns = await detectAuditLogColumns();

    const rows = await queryMany<AuditLogRow>(
      `SELECT
          al.${columns.idColumn} AS audit_id,
          al.user_id,
          u.username,
          al.${columns.actionColumn} AS action,
          al.${columns.entityColumn} AS entity,
          al.${columns.entityIdColumn} AS entity_id,
          al.${columns.oldColumn} AS old_value,
          al.${columns.newColumn} AS new_value,
          ${columns.hasMeta ? 'al.meta' : 'NULL::jsonb'} AS meta,
          al.ip_address,
          al.user_agent,
          al.created_at::text AS created_at
       FROM ims.audit_logs al
       LEFT JOIN ims.users u ON u.user_id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const totalRow = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM ims.audit_logs`
    );

    return {
      rows,
      total: Number(totalRow?.count || 0),
    };
  },

  async deleteLog(id: number): Promise<boolean> {
    const columns = await detectAuditLogColumns();
    const deleted = await queryOne<{ id: number }>(
      `DELETE FROM ims.audit_logs
        WHERE ${columns.idColumn} = $1
        RETURNING ${columns.idColumn} AS id`,
      [id]
    );
    return Boolean(deleted);
  },

  async clearLogs(): Promise<number> {
    const result = await queryOne<{ count: string }>(
      `WITH deleted AS (
          DELETE FROM ims.audit_logs
          RETURNING 1
       )
       SELECT COUNT(*)::text AS count
         FROM deleted`
    );
    return Number(result?.count || 0);
  },
};
