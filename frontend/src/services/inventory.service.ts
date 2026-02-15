import { apiClient } from './api';

export interface InventoryBranch {
  branch_id: number;
  branch_name: string;
  location?: string | null;
  phone?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface InventoryWarehouse {
  wh_id: number;
  branch_id: number;
  branch_name?: string;
  wh_name: string;
  location?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface InventoryItem {
  item_id: number;
  product_id: number;
  branch_id: number;
  item_name: string;
  cost_price: number;
  sale_price: number;
  last_unit_cost: number;
  weighted_unit_cost?: number;
  min_stock_threshold?: number;
  last_purchase_date?: string | null;
}

export interface WarehouseBreakdownRow {
  wh_id: number;
  wh_name: string;
  quantity: number;
}

export interface StockLevelRow {
  product_id: number;
  item_id: number;
  name: string;
  item_name: string;
  barcode?: string | null;
  branch_id: number;
  branch_name: string;
  warehouse_qty: number;
  branch_qty: number;
  total_qty: number;
  cost_price: number;
  sale_price: number;
  stock_value: number;
  min_stock_threshold: number;
  low_stock: boolean;
  qty_mismatch: boolean;
  warehouse_breakdown: WarehouseBreakdownRow[];
}

export interface StockAdjustmentRow {
  adj_id: number;
  adj_date: string;
  branch_id: number;
  branch_name: string;
  wh_id: number | null;
  wh_name: string | null;
  reason: string;
  note: string | null;
  created_by: string;
  item_names: string;
  qty_delta: number;
  value_delta: number;
  line_count: number;
}

const buildQueryString = (params: Record<string, any> = {}) => {
  const clean: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    clean[key] = String(value);
  });
  return new URLSearchParams(clean).toString();
};

export const inventoryService = {
  listItems(params: Record<string, any>) {
    const qs = buildQueryString(params);
    return apiClient.get<{ items: InventoryItem[] }>(`/api/inventory/items?${qs}`);
  },
  listStock(params: Record<string, any>) {
    const qs = buildQueryString(params);
    return apiClient.get<{ rows: StockLevelRow[] }>(`/api/inventory/stock?${qs}`);
  },
  listMovements(params: Record<string, any>) {
    const qs = buildQueryString(params);
    return apiClient.get<{ rows: any[] }>(`/api/inventory/movements?${qs}`);
  },
  listAdjustments(params: Record<string, any>) {
    const qs = buildQueryString(params);
    return apiClient.get<{ rows: StockAdjustmentRow[] }>(`/api/inventory/adjustments?${qs}`);
  },
  listRecounts(params: Record<string, any>) {
    const qs = buildQueryString(params);
    return apiClient.get<{ rows: StockAdjustmentRow[] }>(`/api/inventory/recounts?${qs}`);
  },
  adjust(payload: any) {
    return apiClient.post(`/api/inventory/adjustments`, {
      ...payload,
      itemId: payload.itemId ?? payload.productId,
    });
  },
  recount(payload: any) {
    return apiClient.post(`/api/inventory/recounts`, {
      ...payload,
      itemId: payload.itemId ?? payload.productId,
    });
  },
  transfer(payload: any) {
    return apiClient.post(`/api/inventory/transfers`, {
      ...payload,
      itemId: payload.itemId ?? payload.productId,
    });
  },
  listBranches(params?: { includeInactive?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.includeInactive !== undefined) {
      qs.set('includeInactive', String(params.includeInactive));
    }
    return apiClient.get<{ branches: InventoryBranch[] }>(`/api/inventory/branches?${qs.toString()}`);
  },
  createBranch(payload: { branchName: string; location?: string; phone?: string; isActive?: boolean }) {
    return apiClient.post<{ branch: InventoryBranch }>(`/api/inventory/branches`, payload);
  },
  updateBranch(id: number, payload: { branchName?: string; location?: string; phone?: string; isActive?: boolean }) {
    return apiClient.put<{ branch: InventoryBranch }>(`/api/inventory/branches/${id}`, payload);
  },
  deleteBranch(id: number) {
    return apiClient.delete(`/api/inventory/branches/${id}`);
  },
  listWarehouses(params?: { branchId?: number; includeInactive?: boolean }) {
    const qs = new URLSearchParams();
    if (params?.branchId) qs.set('branchId', String(params.branchId));
    if (params?.includeInactive !== undefined) qs.set('includeInactive', String(params.includeInactive));
    return apiClient.get<{ warehouses: InventoryWarehouse[] }>(`/api/inventory/warehouses?${qs.toString()}`);
  },
  createWarehouse(payload: { branchId: number; whName: string; location?: string; isActive?: boolean }) {
    return apiClient.post<{ warehouse: InventoryWarehouse }>(`/api/inventory/warehouses`, payload);
  },
  updateWarehouse(id: number, payload: { branchId?: number; whName?: string; location?: string; isActive?: boolean }) {
    return apiClient.put<{ warehouse: InventoryWarehouse }>(`/api/inventory/warehouses/${id}`, payload);
  },
  deleteWarehouse(id: number) {
    return apiClient.delete(`/api/inventory/warehouses/${id}`);
  },
};
