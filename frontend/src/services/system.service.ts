import { apiClient, ApiResponse } from './api';
import { API } from '../config/env';

export interface SystemPermission {
  perm_id: number;
  perm_key: string;
  perm_name: string;
  module: string;
  sub_module: string | null;
  action_type: string | null;
  description: string | null;
}

export interface SystemRole {
  role_id: number;
  role_code: string;
  role_name: string;
  description: string | null;
  is_system: boolean;
  permission_count: number;
}

export interface SystemUser {
  user_id: number;
  name: string;
  username: string;
  role_id: number;
  role_name?: string | null;
  branch_id: number;
  branch_name?: string | null;
  is_active: boolean;
  created_at?: string;
  emp_id?: number | null;
  emp_name?: string | null;
}

export interface SystemBranch {
  branch_id: number;
  branch_name: string;
  location: string | null;
  is_active: boolean;
}

export interface RolePermission extends SystemPermission {
  has_permission: boolean;
}

export interface SystemAuditLog {
  audit_id: number;
  user_id: number | null;
  username?: string | null;
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

export const systemService = {
  async getBranches(): Promise<ApiResponse<{ branches: SystemBranch[] }>> {
    return apiClient.get<{ branches: SystemBranch[] }>(API.SYSTEM.BRANCHES);
  },

  async getUsers(): Promise<ApiResponse<{ users: SystemUser[] }>> {
    return apiClient.get<{ users: SystemUser[] }>(API.SYSTEM.USERS);
  },

  async createUser(data: {
    branchId: number;
    roleId: number;
    name: string;
    username: string;
    password: string;
    isActive?: boolean;
  }): Promise<ApiResponse<{ user: SystemUser }>> {
    return apiClient.post<{ user: SystemUser }>(API.SYSTEM.USERS, data);
  },

  async updateUser(
    id: number,
    data: {
      branchId?: number;
      roleId?: number;
      name?: string;
      username?: string;
      password?: string;
      isActive?: boolean;
    }
  ): Promise<ApiResponse<{ user: SystemUser }>> {
    return apiClient.put<{ user: SystemUser }>(API.SYSTEM.USER(id), data);
  },

  async deleteUser(id: number): Promise<ApiResponse> {
    return apiClient.delete(API.SYSTEM.USER(id));
  },

  async getRoles(): Promise<ApiResponse<{ roles: SystemRole[] }>> {
    return apiClient.get<{ roles: SystemRole[] }>(API.SYSTEM.ROLES);
  },

  async createRole(data: {
    roleName: string;
    roleCode?: string;
    description?: string;
  }): Promise<ApiResponse<{ role: SystemRole }>> {
    return apiClient.post<{ role: SystemRole }>(API.SYSTEM.ROLES, data);
  },

  async updateRole(
    id: number,
    data: {
      roleName?: string;
      roleCode?: string;
      description?: string;
    }
  ): Promise<ApiResponse<{ role: SystemRole }>> {
    return apiClient.put<{ role: SystemRole }>(API.SYSTEM.ROLE(id), data);
  },

  async deleteRole(id: number): Promise<ApiResponse> {
    return apiClient.delete(API.SYSTEM.ROLE(id));
  },

  async getRolePermissions(id: number): Promise<ApiResponse<{ permissions: RolePermission[] }>> {
    return apiClient.get<{ permissions: RolePermission[] }>(API.SYSTEM.ROLE_PERMISSIONS(id));
  },

  async updateRolePermissions(id: number, permIds: number[]): Promise<ApiResponse> {
    return apiClient.put(API.SYSTEM.ROLE_PERMISSIONS(id), { permIds });
  },

  async getPermissions(): Promise<ApiResponse<{ permissions: SystemPermission[] }>> {
    return apiClient.get<{ permissions: SystemPermission[] }>(API.SYSTEM.PERMISSIONS);
  },

  async createPermission(data: {
    permKey: string;
    permName: string;
    module: string;
    subModule?: string;
    actionType?: string;
    description?: string;
  }): Promise<ApiResponse<{ permission: SystemPermission }>> {
    return apiClient.post<{ permission: SystemPermission }>(API.SYSTEM.PERMISSIONS, data);
  },

  async updatePermission(
    id: number,
    data: {
      permKey?: string;
      permName?: string;
      module?: string;
      subModule?: string;
      actionType?: string;
      description?: string;
    }
  ): Promise<ApiResponse<{ permission: SystemPermission }>> {
    return apiClient.put<{ permission: SystemPermission }>(API.SYSTEM.PERMISSION(id), data);
  },

  async deletePermission(id: number): Promise<ApiResponse> {
    return apiClient.delete(API.SYSTEM.PERMISSION(id));
  },

  async getLogs(
    page = 1,
    limit = 20,
    startDate?: string,
    endDate?: string
  ): Promise<ApiResponse<{ logs: SystemAuditLog[]; total: number; page: number; limit: number }>> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (startDate && endDate) {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    return apiClient.get(`${API.SYSTEM.LOGS}?${params.toString()}`);
  },

  async deleteLog(id: number): Promise<ApiResponse> {
    return apiClient.delete(API.SYSTEM.LOG(id));
  },

  async clearLogs(): Promise<ApiResponse<{ deleted: number }>> {
    return apiClient.delete(API.SYSTEM.LOGS);
  },
};
