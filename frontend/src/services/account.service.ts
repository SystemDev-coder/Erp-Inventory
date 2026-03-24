import { apiClient } from './api';

export interface Account {
  acc_id: number;
  name: string;
  institution?: string | null;
  currency_code: string;
  balance: number;
  is_active: boolean;
  account_type?: 'asset' | 'equity' | string;
  can_delete?: boolean;
}

// Payload uses the API's request casing (camelCase), not the DB response casing (snake_case).
export type AccountPayload = {
  branchId?: number;
  name?: string;
  institution?: string | null;
  currencyCode?: string;
  balance?: number;
  isActive?: boolean;
  accountType?: 'asset' | 'equity' | string;
};

export const accountService = {
  async list() {
    return apiClient.get<{ accounts: Account[] }>('/api/accounts');
  },
  async create(data: AccountPayload) {
    return apiClient.post<{ account: Account }>('/api/accounts', data);
  },
  async update(id: number, data: AccountPayload) {
    return apiClient.put<{ account: Account }>(`/api/accounts/${id}`, data);
  },
  async remove(id: number) {
    return apiClient.delete<{ message: string }>(`/api/accounts/${id}`);
  },
};
