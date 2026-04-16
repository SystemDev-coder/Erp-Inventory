import { API, apiClient, type ReportOption, type ReportSelectionMode, type RowsResponse, toQuery } from './shared';

export interface InventoryStoreOption {
  id: number;
  label: string;
}

export interface CurrentStockLevelRow {
  item_id: number;
  item_name: string;
  total_qty: number;
  min_stock_threshold: number;
  low_stock: boolean;
  cost_price: number;
  sale_price: number;
  amount: number;
  stock_value: number;
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

export interface InventoryLossRow {
  loss_id: number;
  loss_date: string;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_cost: number;
  total_loss: number;
  reason: string;
  status: string;
  created_by: string;
}

export interface InventoryFoundRow {
  found_id: number;
  found_date: string;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_cost: number;
  total_found: number;
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

export interface StoreMovementSummaryRow {
  store_id: number;
  store_name: string;
  begin_qty: number;
  purchase_qty: number;
  sales_qty: number;
  sales_return_qty: number;
  purchase_return_qty: number;
  adjustment_in_qty: number;
  adjustment_out_qty: number;
  net_movement_qty: number;
  item_count: number;
  ending_qty: number;
}

export interface StoreMovementDetailRow {
  txn_id: number;
  txn_date: string;
  store_id: number;
  store_name: string;
  item_id: number;
  item_name: string;
  txn_type: string;
  ref_table: string;
  ref_id: number | null;
  txn_number: string;
  party_name: string;
  memo: string;
  split_account: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface InventoryTransactionLedgerRow {
  txn_id: number;
  txn_date: string;
  account_id: number;
  account_name: string;
  txn_type: string;
  ref_table: string;
  ref_id: number | null;
  txn_number: string;
  party_name: string;
  memo: string;
  split_account: string;
  debit: number;
  credit: number;
  running_balance: number;
  note: string;
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

  async getInventoryLoss(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<InventoryLossRow>>(`${API.REPORTS.INVENTORY_LOSS}${query}`);
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

  async getStoreMovementSummary(input: { mode: ReportSelectionMode; fromDate: string; toDate: string; storeId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      fromDate: input.fromDate,
      toDate: input.toDate,
      storeId: input.mode === 'show' ? input.storeId : undefined,
    });
    return apiClient.get<RowsResponse<StoreMovementSummaryRow>>(`${API.REPORTS.INVENTORY_STORE_MOVEMENT_SUMMARY}${query}`);
  },

  async getStoreMovementDetail(input: { mode: ReportSelectionMode; fromDate: string; toDate: string; storeId?: number; itemId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      fromDate: input.fromDate,
      toDate: input.toDate,
      storeId: input.mode === 'show' ? input.storeId : undefined,
      itemId: input.itemId,
    });
    return apiClient.get<RowsResponse<StoreMovementDetailRow>>(`${API.REPORTS.INVENTORY_STORE_MOVEMENT_DETAIL}${query}`);
  },

  async getInventoryFound(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<InventoryFoundRow>>(`${API.REPORTS.INVENTORY_FOUND}${query}`);
  },
};

export type { ReportOption, ReportSelectionMode, RowsResponse };
