import { apiClient } from './api';
import { API } from '../config/env';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Category {
  category_id: number;
  branch_id?: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string | null;
}

export interface Unit {
  unit_id: number;
  branch_id?: number;
  unit_name: string;
  symbol?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface Tax {
  tax_id: number;
  branch_id?: number;
  tax_name: string;
  rate_percent: number;
  is_inclusive: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface Product {
  product_id: number;
  branch_id?: number;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  store_id?: number | null;
  store_name?: string | null;
  stock_alert?: number;
  cost_price: number;
  sell_price: number;
  price?: number;
  cost?: number;
  stock: number;
  quantity?: number;
  opening_balance?: number;
  is_active: boolean;
  status: string;
  description?: string | null;
}

type ListOptions = {
  search?: string;
  categoryId?: number;
  unitId?: number;
  taxId?: number;
  storeId?: number;
  branchId?: number;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
};

type MasterListOptions = {
  search?: string;
  branchId?: number;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
};

const buildQuery = (params: Record<string, string | number | boolean | undefined>) => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value));
    }
  });
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : '';
};

export const productService = {
  async list(searchOrOptions?: string | ListOptions, categoryIdArg?: number) {
    const options: ListOptions =
      typeof searchOrOptions === 'string' || searchOrOptions === undefined
        ? { search: searchOrOptions, categoryId: categoryIdArg }
        : searchOrOptions;
    const qs = buildQuery({
      search: options.search,
      categoryId: options.categoryId,
      unitId: options.unitId,
      taxId: options.taxId,
      storeId: options.storeId,
      branchId: options.branchId,
      includeInactive: options.includeInactive,
      page: options.page,
      limit: options.limit,
    });
    return apiClient.get<{ products: Product[]; pagination?: PaginationMeta }>(`${API.PRODUCTS.LIST}${qs}`);
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

  async listCategories(options: MasterListOptions = {}) {
    const qs = buildQuery(options);
    return apiClient.get<{ categories: Category[]; pagination?: PaginationMeta }>(`${API.PRODUCTS.CATEGORIES}${qs}`);
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

  async listUnits(options: MasterListOptions = {}) {
    const qs = buildQuery(options);
    return apiClient.get<{ units: Unit[]; pagination?: PaginationMeta }>(`${API.PRODUCTS.UNITS}${qs}`);
  },

  async createUnit(data: Partial<Unit>) {
    return apiClient.post<{ unit: Unit }>(API.PRODUCTS.UNITS, data);
  },

  async updateUnit(id: number, data: Partial<Unit>) {
    return apiClient.put<{ unit: Unit }>(API.PRODUCTS.UNIT(id), data);
  },

  async removeUnit(id: number) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.UNIT(id));
  },

  async listTaxes(options: MasterListOptions = {}) {
    const qs = buildQuery(options);
    return apiClient.get<{ taxes: Tax[]; pagination?: PaginationMeta }>(`${API.PRODUCTS.TAXES}${qs}`);
  },

  async createTax(data: Partial<Tax>) {
    return apiClient.post<{ tax: Tax }>(API.PRODUCTS.TAXES, data);
  },

  async updateTax(id: number, data: Partial<Tax>) {
    return apiClient.put<{ tax: Tax }>(API.PRODUCTS.TAX(id), data);
  },

  async removeTax(id: number) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.TAX(id));
  },
};
