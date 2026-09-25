import { apiClient } from './api';
import { API, env } from '../config/env';
import { getAccessToken } from './authStore';

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
  // Phase 9: Dynamic Product Attributes catalog keys that apply to items in
  // this category - see frontend/src/config/productAttributes.ts.
  attribute_keys?: string[];
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
  category_id?: number | null;
  category_name?: string | null;
  unit_id?: number | null;
  unit_name?: string | null;
  unit_symbol?: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  brand?: string | null;
  size?: string | null;
  color?: string | null;
  generic_name?: string | null;
  strength?: string | null;
  serial_number?: string | null;
  // Phase 9: any Dynamic Product Attributes catalog key with no dedicated
  // column (model, storage, ram, processor, screen_size, imei, ...).
  attributes?: Record<string, string | number>;
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
  image_url?: string | null;
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
  fromDate?: string;
  toDate?: string;
  stockStatus?: 'in_stock' | 'low_stock' | 'no_stock';
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
      fromDate: options.fromDate,
      toDate: options.toDate,
      stockStatus: options.stockStatus,
    });
    return apiClient.get<{ products: Product[]; pagination?: PaginationMeta }>(`${API.PRODUCTS.LIST}${qs}`);
  },

  async get(id: number) {
    return apiClient.get<{ product: Product }>(API.PRODUCTS.ITEM(id));
  },

  // Exact-match lookup for scanner/barcode entry - never substring/ILIKE, see
  // the backend route for why (a scan must never resolve to the wrong item
  // just because it's a substring of another item's barcode). Shared by every
  // screen that needs to resolve a scanned code to a product (POS already has
  // its own client-side exact match against an already-loaded catalog; this
  // is for screens, like Sales/Invoice, that don't preload the full catalog
  // with barcode data attached).
  async getByBarcode(barcode: string, branchId?: number) {
    const qs = buildQuery({ branchId });
    return apiClient.get<{ product: Product }>(`${API.PRODUCTS.BARCODE(barcode)}${qs}`);
  },

  // Phase 9: same-pattern Excel export as purchaseService.exportXlsx -
  // columns automatically match the active Business Profile/Product
  // Category via the Dynamic Product Attributes catalog (see the backend
  // export handler).
  async exportXlsx(options: ListOptions = {}) {
    const qs = buildQuery({
      search: options.search,
      categoryId: options.categoryId,
      unitId: options.unitId,
      storeId: options.storeId,
      branchId: options.branchId,
      includeInactive: options.includeInactive,
      stockStatus: options.stockStatus,
    });
    const token = getAccessToken();
    const res = await fetch(`${env.API_URL}${API.PRODUCTS.EXPORT}${qs}`, {
      method: 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
    });

    if (!res.ok) {
      let message = res.statusText || 'Export failed';
      try {
        const data = await res.clone().json();
        message = data?.error || data?.message || message;
      } catch {
        try {
          const text = await res.text();
          if (text) message = text;
        } catch {
          // ignore
        }
      }
      return { success: false as const, error: message };
    }

    const blob = await res.blob();
    let filename: string | undefined;
    const contentDisposition = res.headers.get('content-disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
    const rawName = match?.[1] || match?.[2];
    if (rawName) filename = decodeURIComponent(rawName);

    return { success: true as const, blob, filename };
  },

  // Phase 9: seeds the active Business Profile's starter categories (e.g.
  // Electronics -> Mobile Phones/Laptops/TVs/...). Additive/idempotent.
  async seedDefaultCategories(branchId?: number) {
    return apiClient.post<{ categories: Category[]; message?: string }>(
      API.PRODUCTS.CATEGORIES_SEED_DEFAULTS,
      branchId ? { branchId } : {}
    );
  },

  async getSummary(branchId?: number) {
    const qs = buildQuery({ branchId });
    return apiClient.get<{ summary: { total: number; inStock: number; lowStock: number; noStock: number } }>(
      `${API.PRODUCTS.SUMMARY}${qs}`
    );
  },

  async create(data: Partial<Product>) {
    return apiClient.post<{ product: Product }>(API.PRODUCTS.LIST, data);
  },

  async update(id: number, data: Partial<Product>) {
    return apiClient.put<{ product: Product }>(API.PRODUCTS.ITEM(id), data);
  },

  async remove(id: number, reason: string) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.ITEM(id), reason);
  },

  // Phase 6: consolidates fromId's history/stock into toId, then archives fromId.
  async merge(fromId: number, toId: number) {
    return apiClient.post<{ message: string }>(`/api/products/${fromId}/merge-into/${toId}`, {});
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

  async removeCategory(id: number, reason: string) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.CATEGORY(id), reason);
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

  async removeUnit(id: number, reason: string) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.UNIT(id), reason);
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

  async removeTax(id: number, reason: string) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.TAX(id), reason);
  },
};
