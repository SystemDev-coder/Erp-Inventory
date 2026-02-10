import { apiClient, ApiResponse } from './api';
import { API } from '../config/env';

export interface Category {
  category_id: number;
  name: string;
  description?: string | null;
  parent_id?: number | null;
  is_active: boolean;
}

export interface Product {
  product_id: number;
  name: string;
  sku?: string | null;
  category_id?: number | null;
  category_name?: string | null;
  price: number;
  cost: number;
  stock: number;
  is_active: boolean;
  status: string;
  reorder_level: number;
  description?: string | null;
  product_image_url?: string | null;
}

export const productService = {
  async list(search?: string) {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiClient.get<{ products: Product[] }>(`${API.PRODUCTS.LIST}${qs}`);
  },

  async get(id: number) {
    return apiClient.get<{ product: Product }>(API.PRODUCTS.ITEM(id));
  },

  async create(data: Partial<Product>) {
    return apiClient.post<{ product: Product }>(API.PRODUCTS.LIST, data);
  },

  async update(id: number, data: Partial<Product>) {
    return apiClient.put<{ product: Product }>(API.PRODUCTS.ITEM(id), data);
  },

  async remove(id: number) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.ITEM(id));
  },

  async listCategories() {
    return apiClient.get<{ categories: Category[] }>(API.PRODUCTS.CATEGORIES);
  },

  async createCategory(data: Partial<Category>) {
    return apiClient.post<{ category: Category }>(API.PRODUCTS.CATEGORIES, data);
  },

  async updateCategory(id: number, data: Partial<Category>) {
    return apiClient.put<{ category: Category }>(API.PRODUCTS.CATEGORY(id), data);
  },

  async removeCategory(id: number) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.CATEGORY(id));
  },
};
