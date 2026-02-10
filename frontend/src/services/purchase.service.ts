import { apiClient } from './api';
import { API } from '../config/env';

export interface Purchase {
  purchase_id: number;
  supplier_id: number;
  supplier_name?: string | null;
  purchase_date: string;
  purchase_type: 'cash' | 'credit';
  subtotal: number;
  discount: number;
  total: number;
  status: 'received' | 'partial' | 'unpaid' | 'void';
  currency_code: string;
  fx_rate: number;
  note?: string | null;
}

export const purchaseService = {
  async list(search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiClient.get<{ purchases: Purchase[] }>(`${API.PURCHASES.LIST}${qs}`);
  },

  async get(id: number) {
    return apiClient.get<{ purchase: Purchase }>(API.PURCHASES.ITEM(id));
  },

  async create(data: Partial<Purchase>) {
    return apiClient.post<{ purchase: Purchase }>(API.PURCHASES.LIST, data);
  },

  async update(id: number, data: Partial<Purchase>) {
    return apiClient.put<{ purchase: Purchase }>(API.PURCHASES.ITEM(id), data);
  },

  async remove(id: number) {
    return apiClient.delete<{ message: string }>(API.PURCHASES.ITEM(id));
  },
};
