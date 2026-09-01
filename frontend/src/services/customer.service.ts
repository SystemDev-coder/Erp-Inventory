import { apiClient } from './api';
import { API } from '../config/env';

export interface Customer {
  customer_id: number;
  full_name: string;
  phone?: string | null;
  customer_type: 'regular' | 'one-time' | string;
  address?: string | null;
  sex?: string | null;
  gender?: string | null;
  is_active: boolean;
  credit_allowed?: boolean;
  credit_days?: number;
  balance: number;
  open_balance?: number;
  remaining_balance?: number;
  registered_date?: string;
}

export const customerService = {
  async list(params?: { search?: string; fromDate?: string; toDate?: string; branchId?: number; page?: number; limit?: number }) {
    const qsParts: string[] = [];
    if (params?.search) qsParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    if (params?.branchId) qsParts.push(`branchId=${params.branchId}`);
    if (params?.page) qsParts.push(`page=${params.page}`);
    if (params?.limit) qsParts.push(`limit=${params.limit}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ customers: Customer[]; pagination?: { total: number; page: number; limit: number; totalPages: number } }>(
      `${API.CUSTOMERS.LIST}${qs}`
    );
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
      sex: data.sex ?? data.gender,
      gender: data.gender ?? data.sex,
      isActive: data.is_active,
      creditAllowed: data.credit_allowed,
      creditDays: data.credit_days,
      remainingBalance: data.remaining_balance,
    });
  },

  async update(id: number, data: Partial<Customer> & { edit_reason?: string }) {
    return apiClient.put<{ customer: Customer }>(API.CUSTOMERS.ITEM(id), {
      fullName: data.full_name,
      phone: data.phone,
      customerType: data.customer_type,
      address: data.address,
      sex: data.sex ?? data.gender,
      gender: data.gender ?? data.sex,
      isActive: data.is_active,
      creditAllowed: data.credit_allowed,
      creditDays: data.credit_days,
      remainingBalance: data.remaining_balance,
      editReason: data.edit_reason,
    });
  },

  async lookup(params?: { search?: string; limit?: number; branchId?: number }) {
    const qsParts: string[] = [];
    if (params?.search) qsParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params?.limit) qsParts.push(`limit=${encodeURIComponent(String(params.limit))}`);
    if (params?.branchId) qsParts.push(`branchId=${params.branchId}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ customers: Customer[] }>(`${API.CUSTOMERS.LIST}/lookup${qs}`);
  },

  async remove(id: number, reason: string) {
    return apiClient.delete<{ message: string }>(API.CUSTOMERS.ITEM(id), reason);
  },
};
