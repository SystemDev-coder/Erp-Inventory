import { apiClient } from './api';
import { API } from '../config/env';

export interface SaleItem {
  sale_item_id?: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

export interface Sale {
  sale_id: number;
  branch_id: number;
  wh_id: number | null;
  user_id: number;
  customer_id: number | null;
  customer_name?: string | null;
  sale_date: string;
  sale_type: 'cash' | 'credit';
  subtotal: number;
  discount: number;
  total: number;
  status: 'paid' | 'partial' | 'unpaid' | 'void';
  currency_code: string;
  fx_rate: number;
  note?: string | null;
}

export interface SaleCreateInput {
  customerId?: number;
  whId?: number | null;
  saleDate?: string;
  subtotal?: number;
  discount?: number;
  total?: number;
  saleType?: 'cash' | 'credit';
  status?: 'paid' | 'partial' | 'unpaid' | 'void';
  note?: string | null;
  currencyCode?: string;
  fxRate?: number;
  items: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
  }>;
  payFromAccId?: number;
  paidAmount?: number;
}

export const salesService = {
  async list(search?: string, status?: string) {
    const params: string[] = [];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (status && status !== 'all') params.push(`status=${encodeURIComponent(status)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    return apiClient.get<{ sales: Sale[] }>(`${API.SALES.LIST}${qs}`);
  },

  async get(id: number) {
    return apiClient.get<{ sale: Sale; items: SaleItem[] }>(API.SALES.ITEM(id));
  },

  async create(data: SaleCreateInput) {
    return apiClient.post<{ sale: Sale }>(API.SALES.LIST, data);
  },
};

