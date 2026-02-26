import { API, apiClient, type ReportOption, type ReportSelectionMode, type RowsResponse, toQuery } from './shared';

export interface InventoryStoreOption {
  id: number;
  label: string;
}

export interface CurrentStockLevelRow {
  item_id: number;
  item_name: string;
  barcode: string;
  total_qty: number;
  min_stock_threshold: number;
  low_stock: boolean;
  cost_price: number;
  sale_price: number;
  stock_value: number;
}

export interface StockMovementHistoryRow {
  transaction_id: number;
  transaction_date: string;
  transaction_type: string;
  direction: string;
  item_id: number | null;
  item_name: string;
  store_id: number | null;
  store_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  reference_no: string;
  status: string;
  notes: string;
}

export interface InventoryValuationRow {
  item_id: number;
  item_name: string;
  total_qty: number;
  cost_price: number;
  sell_price: number;
  cost_value: number;
  retail_value: number;
}

export interface ExpiryTrackingRow {
  purchase_id: number;
  purchase_date: string;
  supplier_name: string;
  item_id: number;
  item_name: string;
  batch_no: string;
  expiry_date: string;
  days_to_expiry: number;
  quantity: number;
  unit_cost: number;
}

export interface StockAdjustmentLogRow {
  adjustment_id: number;
  adjustment_date: string;
  item_id: number;
  item_name: string;
  adjustment_type: string;
  quantity: number;
  reason: string;
  status: string;
  created_by: string;
}

export interface StoreStockSummaryRow {
  store_id: number;
  store_name: string;
  item_count: number;
  total_qty: number;
  stock_value: number;
}

export interface StoreWiseStockRow {
  store_id: number;
  store_name: string;
  item_id: number;
  item_name: string;
  barcode: string;
  quantity: number;
  cost_price: number;
  sell_price: number;
  stock_value: number;
}

interface InventoryOptionsResponse {
  branchId: number;
  stores: InventoryStoreOption[];
  products: ReportOption[];
}

export const inventoryReportsService = {
  async getInventoryOptions(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<InventoryOptionsResponse>(`${API.REPORTS.INVENTORY_OPTIONS}${query}`);
  },

  async getCurrentStockLevels(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<RowsResponse<CurrentStockLevelRow>>(`${API.REPORTS.INVENTORY_CURRENT_STOCK}${query}`);
  },

  async getLowStockAlert(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<RowsResponse<CurrentStockLevelRow>>(`${API.REPORTS.INVENTORY_LOW_STOCK}${query}`);
  },

  async getStockMovementHistory(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<StockMovementHistoryRow>>(`${API.REPORTS.INVENTORY_MOVEMENT_HISTORY}${query}`);
  },

  async getInventoryValuation(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<RowsResponse<InventoryValuationRow>>(`${API.REPORTS.INVENTORY_VALUATION}${query}`);
  },

  async getExpiryTracking(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<ExpiryTrackingRow>>(`${API.REPORTS.INVENTORY_EXPIRY_TRACKING}${query}`);
  },

  async getStockAdjustmentLog(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<StockAdjustmentLogRow>>(`${API.REPORTS.INVENTORY_ADJUSTMENT_LOG}${query}`);
  },

  async getStoreStockReport(input: { mode: ReportSelectionMode; storeId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      storeId: input.mode === 'show' ? input.storeId : undefined,
    });
    return apiClient.get<RowsResponse<StoreStockSummaryRow>>(`${API.REPORTS.INVENTORY_STORE_STOCK}${query}`);
  },

  async getStoreWiseStock(input: { mode: ReportSelectionMode; storeId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      storeId: input.mode === 'show' ? input.storeId : undefined,
    });
    return apiClient.get<RowsResponse<StoreWiseStockRow>>(`${API.REPORTS.INVENTORY_STORE_WISE}${query}`);
  },
};

export type { ReportOption, ReportSelectionMode, RowsResponse };
