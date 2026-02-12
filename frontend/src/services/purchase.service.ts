import { apiClient } from './api';
import { API } from '../config/env';

export interface PurchaseItem {
  purchase_item_id?: number;
  product_id?: number;
  product_name?: string | null;
  quantity: number;
  unit_cost: number;
  discount?: number;
  line_total?: number;
  description?: string | null;
  batch_no?: string | null;
  expiry_date?: string | null;
}

export interface PurchaseItemView extends PurchaseItem {
  purchase_id: number;
  purchase_date: string;
  supplier_id: number;
  supplier_name?: string | null;
  purchase_type: 'cash' | 'credit';
}
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
  items?: PurchaseItem[];
}

export interface PurchaseCreateInput {
  supplierId: number;
  whId?: number | null;
  purchaseDate?: string;
  purchaseType?: 'cash' | 'credit';
  subtotal?: number;
  discount?: number;
  total?: number;
  status?: 'received' | 'partial' | 'unpaid' | 'void';
  note?: string | null;
  currencyCode?: string;
  fxRate?: number;
  items?: Array<{
    productId?: number;
    quantity: number;
    unitCost: number;
    discount?: number;
    description?: string;
    batchNo?: string;
    expiryDate?: string | null;
  }>;
}

export const purchaseService = {
  async list(search?: string, status?: string) {
    const params: string[] = [];
    if (search) params.push(`search=${encodeURIComponent(search)}`);
    if (status && status !== 'all') params.push(`status=${encodeURIComponent(status)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    return apiClient.get<{ purchases: Purchase[] }>(`${API.PURCHASES.LIST}${qs}`);
  },

  async get(id: number) {
    return apiClient.get<{ purchase: Purchase; items?: PurchaseItem[] }>(API.PURCHASES.ITEM(id));
  },

  async listItems(params?: { search?: string; supplierId?: number; productId?: number; from?: string; to?: string }) {
    const qs = params
      ? '?' +
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return apiClient.get<{ items: PurchaseItemView[] }>(`${API.PURCHASES.LIST}/items${qs}`);
  },

  async create(data: PurchaseCreateInput) {
    return apiClient.post<{ purchase: Purchase }>(API.PURCHASES.LIST, data);
  },

  async update(id: number, data: Partial<PurchaseCreateInput>) {
    return apiClient.put<{ purchase: Purchase }>(API.PURCHASES.ITEM(id), data);
  },

  async remove(id: number) {
    return apiClient.delete<{ message: string }>(API.PURCHASES.ITEM(id));
  },
};
