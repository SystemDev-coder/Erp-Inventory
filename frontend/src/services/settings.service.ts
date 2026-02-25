import { apiClient, ApiResponse } from './api';

export interface CompanyInfo {
  company_id: number;
  company_name?: string;
  logo_img?: string | null;
  banner_img?: string | null;
  phone?: string | null;
  manager_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Branch {
  branch_id: number;
  branch_name: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
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

export const settingsService = {
  async getCompany(): Promise<ApiResponse<{ company: CompanyInfo }>> {
    return apiClient.get('/api/settings/company');
  },
  async updateCompany(input: Partial<CompanyInfo> & { system_name?: string; systemName?: string }): Promise<ApiResponse<{ company: CompanyInfo }>> {
    const payload: {
      companyName?: string;
      phone?: string | null;
      managerName?: string | null;
      logoImg?: string | null;
      bannerImg?: string | null;
    } = {
      companyName: input.company_name ?? input.systemName ?? input.system_name,
      phone: input.phone,
      managerName: input.manager_name,
      logoImg: input.logo_img,
      bannerImg: input.banner_img,
    };
    return apiClient.put('/api/settings/company', payload);
  },
  async deleteCompany(): Promise<ApiResponse> {
    return apiClient.delete('/api/settings/company');
  },

  async listBranches(): Promise<ApiResponse<{ branches: Branch[] }>> {
    return apiClient.get('/api/settings/branches');
  },
  async createBranch(input: { branchName: string; location?: string; isActive?: boolean }): Promise<ApiResponse<{ branch: Branch }>> {
    return apiClient.post('/api/settings/branches', input);
  },
  async updateBranch(id: number, input: { branchName?: string; location?: string; isActive?: boolean }): Promise<ApiResponse<{ branch: Branch }>> {
    return apiClient.put(`/api/settings/branches/${id}`, input);
  },
  async deleteBranch(id: number): Promise<ApiResponse> {
    return apiClient.delete(`/api/settings/branches/${id}`);
  },

  async listAudit(page = 1, limit = 50): Promise<ApiResponse<{ logs: AuditLog[]; total: number; page: number; limit: number }>> {
    return apiClient.get(`/api/settings/audit?page=${page}&limit=${limit}`);
  },
};
