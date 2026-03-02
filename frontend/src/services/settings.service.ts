import { apiClient, ApiResponse } from './api';

export interface CompanyInfo {
  company_id: number;
  company_name?: string;
  logo_img?: string | null;
  banner_img?: string | null;
  phone?: string | null;
  manager_name?: string | null;
  capital_amount?: number;
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

export interface CapitalContribution {
  capital_id: number;
  branch_id: number;
  owner_name: string;
  amount: number;
  date: string;
  account_id: number;
  account_name: string;
  note?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapitalReport {
  total_capital: number;
  by_owner: Array<{ owner_name: string; total_amount: number }>;
  by_account: Array<{ account_id: number; account_name: string; total_amount: number }>;
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
      capitalAmount?: number;
    } = {
      companyName: input.company_name ?? input.systemName ?? input.system_name,
      phone: input.phone,
      managerName: input.manager_name,
      logoImg: input.logo_img,
      bannerImg: input.banner_img,
      capitalAmount: typeof input.capital_amount === 'number' ? input.capital_amount : undefined,
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

  async listAudit(
    page = 1,
    limit = 50,
    startDate?: string,
    endDate?: string
  ): Promise<ApiResponse<{ logs: AuditLog[]; total: number; page: number; limit: number }>> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (startDate && endDate) {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    return apiClient.get(`/api/settings/audit?${params.toString()}`);
  },

  async listCapital(input?: {
    page?: number;
    limit?: number;
    search?: string;
    owner?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ApiResponse<{ rows: CapitalContribution[]; total: number; page: number; limit: number }>> {
    const params = new URLSearchParams();
    if (input?.page) params.set('page', String(input.page));
    if (input?.limit) params.set('limit', String(input.limit));
    if (input?.search) params.set('search', input.search);
    if (input?.owner) params.set('owner', input.owner);
    if (input?.fromDate && input?.toDate) {
      params.set('fromDate', input.fromDate);
      params.set('toDate', input.toDate);
    }
    const qs = params.toString();
    return apiClient.get(`/api/settings/capital${qs ? `?${qs}` : ''}`);
  },

  async createCapital(input: {
    ownerName: string;
    amount: number;
    date: string;
    accountId?: number;
    note?: string;
  }): Promise<ApiResponse<{ capital: CapitalContribution }>> {
    return apiClient.post('/api/settings/capital', input);
  },

  async updateCapital(
    id: number,
    input: Partial<{
      ownerName: string;
      amount: number;
      date: string;
      accountId: number;
      note: string;
    }>
  ): Promise<ApiResponse<{ capital: CapitalContribution }>> {
    return apiClient.put(`/api/settings/capital/${id}`, input);
  },

  async deleteCapital(id: number): Promise<ApiResponse> {
    return apiClient.delete(`/api/settings/capital/${id}`);
  },

  async getCapitalReport(input?: { owner?: string; fromDate?: string; toDate?: string }): Promise<ApiResponse<{ report: CapitalReport }>> {
    const params = new URLSearchParams();
    if (input?.owner) params.set('owner', input.owner);
    if (input?.fromDate && input?.toDate) {
      params.set('fromDate', input.fromDate);
      params.set('toDate', input.toDate);
    }
    const qs = params.toString();
    return apiClient.get(`/api/settings/capital/report${qs ? `?${qs}` : ''}`);
  },
};
