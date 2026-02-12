import { apiClient } from './api';
import { API } from '../config/env';

export interface UserRow {
  user_id: number;
  branch_id: number;
  role_id: number;
  name: string;
  username: string;
  is_active: boolean;
  role_name?: string | null;
  created_at?: string;
}

export interface RoleRow {
  role_id: number;
  role_name: string;
}

export const userService = {
  async getSidebar() {
    return apiClient.get<{ modules: any[] }>(API.USER.SIDEBAR);
  },
  async list() {
    return apiClient.get<{ users: UserRow[] }>('/api/users');
  },
  async listRoles() {
    return apiClient.get<{ roles: RoleRow[] }>('/api/users/roles');
  },
  async create(data: Partial<UserRow> & { password: string }) {
    return apiClient.post<{ user: UserRow }>('/api/users', {
      branchId: data.branch_id,
      roleId: data.role_id,
      name: data.name,
      username: data.username,
      password: data.password,
      isActive: data.is_active,
    });
  },
  async update(id: number, data: Partial<UserRow> & { password?: string }) {
    return apiClient.put<{ user: UserRow }>(`/api/users/${id}`, {
      branchId: data.branch_id,
      roleId: data.role_id,
      name: data.name,
      username: data.username,
      password: data.password,
      isActive: data.is_active,
    });
  },
  async remove(id: number) {
    return apiClient.delete<{ message: string }>(`/api/users/${id}`);
  },
};
