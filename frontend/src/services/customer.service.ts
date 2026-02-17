import { apiClient } from './api';
import { API } from '../config/env';

export interface Customer {
  customer_id: number;
  full_name: string;
  phone?: string | null;
  customer_type: 'regular' | 'one-time' | string;
  address?: string | null;
  sex?: string | null;
  is_active: boolean;
  balance: number;
  remaining_balance?: number;
  registered_date?: string;
}

export const customerService = {
  async list(search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiClient.get<{ customers: Customer[] }>(`${API.CUSTOMERS.LIST}${qs}`);
  },

  async get(id: number) {
    return apiClient.get<{ customer: Customer }>(API.CUSTOMERS.ITEM(id));
  },

  async create(data: Partial<Customer>) {
    return apiClient.post<{ customer: Customer }>(API.CUSTOMERS.LIST, {
      fullName: data.full_name,
      phone: data.phone,
      customerType: data.customer_type,
      address: data.address,
      sex: data.sex,
      isActive: data.is_active,
      remainingBalance: data.remaining_balance,
    });
  },

  async update(id: number, data: Partial<Customer>) {
    return apiClient.put<{ customer: Customer }>(API.CUSTOMERS.ITEM(id), {
      fullName: data.full_name,
      phone: data.phone,
      customerType: data.customer_type,
      address: data.address,
      sex: data.sex,
      isActive: data.is_active,
      remainingBalance: data.remaining_balance,
    });
  },

  async remove(id: number) {
    return apiClient.delete<{ message: string }>(API.CUSTOMERS.ITEM(id));
  },
};
