import { apiClient } from './api';

export interface Supplier {
  supplier_id: number;
  supplier_name: string;
  company_name?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  phone?: string | null;
  address?: string | null;
  location?: string | null;
  remaining_balance?: number | null;
  is_active?: boolean;
}

export const supplierService = {
  async list(search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiClient.get<{ suppliers: Supplier[] }>(`/api/suppliers${qs}`);
  },

  async create(data: Partial<Supplier>) {
    return apiClient.post<{ supplier: Supplier }>(`/api/suppliers`, {
      supplierName: data.supplier_name,
      companyName: data.company_name,
      contactPerson: data.contact_person,
      contactPhone: data.contact_phone,
      phone: data.phone,
      address: data.address,
      location: data.location,
      remainingBalance: data.remaining_balance,
      isActive: data.is_active,
    });
  },

  async update(id: number, data: Partial<Supplier>) {
    return apiClient.put<{ supplier: Supplier }>(`/api/suppliers/${id}`, {
      supplierName: data.supplier_name,
      companyName: data.company_name,
      contactPerson: data.contact_person,
      contactPhone: data.contact_phone,
      phone: data.phone,
      address: data.address,
      location: data.location,
      remainingBalance: data.remaining_balance,
      isActive: data.is_active,
    });
  },

  async remove(id: number) {
    return apiClient.delete<{ message: string }>(`/api/suppliers/${id}`);
  },
};
