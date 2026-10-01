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
  // Category Configuration Engine: which ims.attribute_definitions keys
  // apply to items in this category - resolved server-side from
  // ims.category_attributes, not a hardcoded list.
  attribute_keys?: string[];
  parent_id?: number | null;
  parent_name?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export type AttributeDataType = 'text' | 'number' | 'select' | 'date';

// Category Configuration Engine: the attribute catalog itself, editable
// from the UI - creating one here needs no code change to show up in the
// Category modal's checklist, the New Product form, or Excel import/export.
export interface AttributeDefinition {
  attribute_id: number;
  branch_id?: number;
  key: string;
  label: string;
  data_type: AttributeDataType;
  options?: string[] | null;
  column_name?: string | null;
  is_active: boolean;
  in_use?: boolean;
  created_at?: string;
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
  // POS Sellability Rules: derived from the latest (max) expiry_date across
  // all ims.purchase_items batches ever recorded for this item - true only
  // when every known batch has already expired. Items with no recorded
  // batches at all are never flagged. See products.service.ts#getProductSql.
  latest_expiry_date?: string | null;
  is_expired?: boolean;
  // Product Variants: parent_item_id set means this row IS a variant (of a
  // different, top-level product); has_variants true means this row is the
  // "parent" template and can't be sold directly - sell one of its variants
  // instead (each variant is an ordinary product with its own barcode/
  // price/stock). See products.service.ts#getProductSql.
  parent_item_id?: number | null;
  has_variants?: boolean;
  variant_count?: number;
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
  // Category Configuration Engine: exact-match "Filter by Attribute".
  attributeKey?: string;
  attributeValue?: string;
  // Product Variants: hide parent-with-variants rows (POS/Sales/Purchases
  // pickers), or scope the list to one parent's variants.
  excludeVariantParents?: boolean;
  parentItemId?: number;
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
      attributeKey: options.attributeKey,
      attributeValue: options.attributeValue,
      excludeVariantParents: options.excludeVariantParents,
      parentItemId: options.parentItemId,
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

  async create(data: Partial<Product> & { parentId?: number }) {
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

  // Product Variants
  async listVariants(parentId: number) {
    return apiClient.get<{ variants: Product[] }>(API.PRODUCTS.VARIANTS(parentId));
  },

  async addVariant(parentId: number, data: Partial<Product>) {
    return apiClient.post<{ product: Product }>(API.PRODUCTS.VARIANTS(parentId), data);
  },

  async generateVariants(parentId: number, axisAttributeKeys: string[]) {
    return apiClient.post<{ variants: Product[] }>(API.PRODUCTS.GENERATE_VARIANTS(parentId), { axisAttributeKeys });
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

  async listAttributes(branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ attributes: AttributeDefinition[] }>(`${API.PRODUCTS.ATTRIBUTES}${qs}`);
  },

  async createAttribute(data: {
    key: string;
    label: string;
    dataType: AttributeDataType;
    options?: string[];
    branchId?: number;
  }) {
    return apiClient.post<{ attribute: AttributeDefinition }>(API.PRODUCTS.ATTRIBUTES, data);
  },

  async updateAttribute(
    id: number,
    data: Partial<{ label: string; dataType: AttributeDataType; options: string[]; isActive: boolean }>
  ) {
    return apiClient.put<{ attribute: AttributeDefinition }>(API.PRODUCTS.ATTRIBUTE(id), data);
  },

  async removeAttribute(id: number, reason: string) {
    return apiClient.delete<{ message: string }>(API.PRODUCTS.ATTRIBUTE(id), reason);
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
