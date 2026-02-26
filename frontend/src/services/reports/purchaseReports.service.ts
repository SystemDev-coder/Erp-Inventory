import { API, apiClient, type ReportOption, type ReportSelectionMode, type RowsResponse, toQuery } from './shared';

export interface PurchaseOrderSummaryRow {
  purchase_id: number;
  purchase_date: string;
  supplier_name: string;
  buyer_name: string;
  store_name: string;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  status: string;
}

export interface SupplierWisePurchaseRow {
  purchase_id: number;
  purchase_date: string;
  supplier_id: number;
  supplier_name: string;
  buyer_name: string;
  store_name: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
}

export interface PurchaseReturnRow {
  return_id: number;
  return_date: string;
  purchase_id: number | null;
  supplier_name: string;
  buyer_name: string;
  subtotal: number;
  total: number;
  note: string;
}

export interface PurchasePaymentStatusRow {
  purchase_id: number;
  purchase_date: string;
  supplier_name: string;
  total: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_status: string;
  status: string;
}

export interface SupplierLedgerRow {
  sup_ledger_id: number;
  entry_date: string;
  supplier_id: number;
  supplier_name: string;
  entry_type: string;
  ref_table: string;
  ref_id: number | null;
  debit: number;
  credit: number;
  running_balance: number;
  note: string;
}

export interface PurchaseByDateRangeRow {
  purchase_id: number;
  purchase_date: string;
  supplier_name: string;
  item_lines: number;
  total_quantity: number;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
}

export interface BestSupplierRow {
  supplier_id: number;
  supplier_name: string;
  purchases_count: number;
  total_amount: number;
  total_paid: number;
  outstanding_amount: number;
  avg_purchase_value: number;
}

export interface PurchasePriceVarianceRow {
  item_id: number;
  item_name: string;
  min_unit_cost: number;
  max_unit_cost: number;
  avg_unit_cost: number;
  last_unit_cost: number;
  variance_amount: number;
  variance_percent: number;
  purchase_lines: number;
}

interface PurchaseOptionsResponse {
  branchId: number;
  suppliers: ReportOption[];
  products: ReportOption[];
}

export const purchaseReportsService = {
  async getPurchaseOptions(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<PurchaseOptionsResponse>(`${API.REPORTS.PURCHASE_OPTIONS}${query}`);
  },

  async getPurchaseOrdersSummary(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<PurchaseOrderSummaryRow>>(`${API.REPORTS.PURCHASE_ORDERS_SUMMARY}${query}`);
  },

  async getSupplierWisePurchases(input: { mode: ReportSelectionMode; supplierId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      supplierId: input.mode === 'show' ? input.supplierId : undefined,
    });
    return apiClient.get<RowsResponse<SupplierWisePurchaseRow>>(`${API.REPORTS.PURCHASE_SUPPLIER_WISE}${query}`);
  },

  async getPurchaseReturns(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<PurchaseReturnRow>>(`${API.REPORTS.PURCHASE_RETURNS}${query}`);
  },

  async getPurchasePaymentStatus(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<PurchasePaymentStatusRow>>(`${API.REPORTS.PURCHASE_PAYMENT_STATUS}${query}`);
  },

  async getSupplierLedger(input: { mode: ReportSelectionMode; supplierId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      supplierId: input.mode === 'show' ? input.supplierId : undefined,
    });
    return apiClient.get<RowsResponse<SupplierLedgerRow>>(`${API.REPORTS.PURCHASE_SUPPLIER_LEDGER}${query}`);
  },

  async getPurchaseByDateRange(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<PurchaseByDateRangeRow>>(`${API.REPORTS.PURCHASE_BY_DATE_RANGE}${query}`);
  },

  async getBestSuppliers(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<BestSupplierRow>>(`${API.REPORTS.PURCHASE_BEST_SUPPLIERS}${query}`);
  },

  async getPurchasePriceVariance(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    productId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      productId: input.mode === 'show' ? input.productId : undefined,
    });
    return apiClient.get<RowsResponse<PurchasePriceVarianceRow>>(`${API.REPORTS.PURCHASE_PRICE_VARIANCE}${query}`);
  },
};

export type { ReportOption, ReportSelectionMode, RowsResponse };
