import { apiClient } from './api';

export interface Supplier {
  supplier_id: number;
  supplier_name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
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
      contactPerson: data.contact_person,
      phone: data.phone,
      email: data.email,
      address: data.address,
      logoUrl: data.logo_url,
      isActive: data.is_active,
    });
  },

  async update(id: number, data: Partial<Supplier>) {
    return apiClient.put<{ supplier: Supplier }>(`/api/suppliers/${id}`, {
      supplierName: data.supplier_name,
      contactPerson: data.contact_person,
      phone: data.phone,
      email: data.email,
      address: data.address,
      logoUrl: data.logo_url,
      isActive: data.is_active,
    });
  },

  async remove(id: number) {
    return apiClient.delete<{ message: string }>(`/api/suppliers/${id}`);
  },
};
