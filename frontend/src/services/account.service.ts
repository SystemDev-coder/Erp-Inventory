import { apiClient } from './api';
import { API } from '../config/env';

export interface Account {
  acc_id: number;
  name: string;
  institution?: string | null;
  currency_code: string;
  balance: number;
  is_active: boolean;
}

export const accountService = {
  async list() {
    return apiClient.get<{ accounts: Account[] }>('/api/accounts');
  },
  async create(data: Partial<Account>) {
    return apiClient.post<{ account: Account }>('/api/accounts', data);
  },
  async update(id: number, data: Partial<Account>) {
    return apiClient.put<{ account: Account }>(`/api/accounts/${id}`, data);
  },
  async remove(id: number) {
    return apiClient.delete<{ message: string }>(`/api/accounts/${id}`);
  },
};
