import { apiClient } from './api';
import { API } from '../config/env';

export interface Store {
  store_id: number;
  branch_id: number;
  store_name: string;
  store_code?: string | null;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface StoreItem {
  store_item_id: number;
  store_id: number;
  product_id: number;
  quantity: number;
  product_name?: string | null;
  created_at: string;
}

export const storeService = {
  async list(branchId?: number) {
    const qs = branchId != null ? `?branchId=${branchId}` : '';
    return apiClient.get<{ stores: Store[] }>(`${API.STORES.LIST}${qs}`);
  },

  async get(id: number) {
    return apiClient.get<{ store: Store }>(API.STORES.ITEM(id));
  },

  async create(data: { storeName: string; storeCode?: string; address?: string; phone?: string; branchId?: number }) {
    return apiClient.post<{ store: Store }>(API.STORES.LIST, data);
  },

  async update(id: number, data: Partial<{ storeName: string; storeCode?: string; address?: string; phone?: string }>) {
    return apiClient.put<{ store: Store }>(API.STORES.ITEM(id), data);
  },

  async remove(id: number) {
    return apiClient.delete<{ message: string }>(API.STORES.ITEM(id));
  },

  async listItems(storeId: number) {
    return apiClient.get<{ items: StoreItem[] }>(API.STORES.ITEMS(storeId));
  },

  async addItem(storeId: number, data: { productId: number; quantity: number }) {
    return apiClient.post<{ item: StoreItem }>(API.STORES.ADD_ITEM(storeId), data);
  },

  async updateItem(storeId: number, itemId: number, quantity: number) {
    return apiClient.put<{ item: StoreItem }>(API.STORES.UPDATE_ITEM(storeId, itemId), { quantity });
  },

  async removeItem(storeId: number, itemId: number) {
    return apiClient.delete<{ message: string }>(API.STORES.REMOVE_ITEM(storeId, itemId));
  },
};
