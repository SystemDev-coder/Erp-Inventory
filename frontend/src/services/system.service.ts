/**
 * System Service
 * Handles system administration API calls (roles, users, permissions)
 */

import { apiClient, ApiResponse } from './api';
import { API } from '../config/env';
import { Permission } from './user.service';

export interface Role {
  role_id: number;
  role_name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface User {
  user_id: number;
  name: string;
  username: string;
  phone: string | null;
  role_id: number;
  role_name: string;
  branch_id: number;
  branch_name: string;
  is_active: boolean;
}

export interface RolePermission {
  perm_id: number;
  perm_key: string;
  perm_name: string;
  has_permission: boolean;
}

export interface UserPermission extends RolePermission {
  source: 'role' | 'user' | 'override';
}

export interface PermissionOverride {
  perm_id: number;
  perm_key: string;
  perm_name: string;
  override_type: 'allow' | 'deny' | null;
}

export interface AuditLog {
  log_id: number;
  user_id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  ip_address: string;
  created_at: string;
}

class SystemService {
  /**
   * Get all permissions
   */
  async getPermissions(): Promise<ApiResponse<{ permissions: Permission[] }>> {
    return apiClient.get<{ permissions: Permission[] }>(API.SYSTEM.PERMISSIONS);
  }

  /**
   * Get all roles
   */
  async getRoles(): Promise<ApiResponse<{ roles: Role[] }>> {
    return apiClient.get<{ roles: Role[] }>(API.SYSTEM.ROLES);
  }

  /**
   * Create a new role
   */
  async createRole(data: { role_name: string; description?: string }): Promise<ApiResponse<{ role: Role }>> {
    return apiClient.post<{ role: Role }>(API.SYSTEM.ROLES, data);
  }

  /**
   * Update a role
   */
  async updateRole(id: number, data: { role_name: string; description?: string }): Promise<ApiResponse<{ role: Role }>> {
    return apiClient.put<{ role: Role }>(API.SYSTEM.ROLE(id), data);
  }

  /**
   * Get role permissions
   */
  async getRolePermissions(id: number): Promise<ApiResponse<{ permissions: RolePermission[] }>> {
    return apiClient.get<{ permissions: RolePermission[] }>(API.SYSTEM.ROLE_PERMISSIONS(id));
  }

  /**
   * Update role permissions
   */
  async updateRolePermissions(id: number, permissionIds: number[]): Promise<ApiResponse<{ message: string }>> {
    return apiClient.put<{ message: string }>(API.SYSTEM.ROLE_PERMISSIONS(id), { permissionIds });
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<ApiResponse<{ users: User[] }>> {
    return apiClient.get<{ users: User[] }>(API.SYSTEM.USERS);
  }

  /**
   * Update user access (role, active status)
   */
  async updateUserAccess(id: number, data: { role_id?: number; is_active?: boolean }): Promise<ApiResponse<{ user: User }>> {
    return apiClient.put<{ user: User }>(API.SYSTEM.USER(id), data);
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(id: number): Promise<ApiResponse<{ permissions: UserPermission[] }>> {
    return apiClient.get<{ permissions: UserPermission[] }>(API.SYSTEM.USER_PERMISSIONS(id));
  }

  /**
   * Update user permissions (individual grants)
   */
  async updateUserPermissions(id: number, permissionIds: number[]): Promise<ApiResponse<{ message: string }>> {
    return apiClient.put<{ message: string }>(API.SYSTEM.USER_PERMISSIONS(id), { permissionIds });
  }

  /**
   * Get user permission overrides
   */
  async getUserOverrides(id: number): Promise<ApiResponse<{ overrides: PermissionOverride[] }>> {
    return apiClient.get<{ overrides: PermissionOverride[] }>(API.SYSTEM.USER_OVERRIDES(id));
  }

  /**
   * Update user permission overrides
   */
  async updateUserOverrides(id: number, overrides: { perm_id: number; override_type: 'allow' | 'deny' | null }[]): Promise<ApiResponse<{ message: string }>> {
    return apiClient.put<{ message: string }>(API.SYSTEM.USER_OVERRIDES(id), { overrides });
  }

  /**
   * Get user audit logs
   */
  async getUserAuditLogs(id: number): Promise<ApiResponse<{ logs: AuditLog[] }>> {
    return apiClient.get<{ logs: AuditLog[] }>(API.SYSTEM.USER_AUDIT(id));
  }
}

// Export singleton instance
export const systemService = new SystemService();
