import { API, apiClient, type ReportOption, type ReportSelectionMode, type RowsResponse, toQuery } from './shared';

export interface DailySalesRow {
  sale_id: number;
  sale_date: string;
  customer_name: string;
  cashier_name: string;
  total: number;
  status: string;
}

export interface SalesByCustomerRow {
  sale_id: number;
  sale_date: string;
  customer_name: string;
  cashier_name: string;
  total: number;
  status: string;
}

export interface SalesByProductRow {
  sale_id: number;
  sale_date: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  customer_name: string;
  cashier_name: string;
}

export interface TopSellingItemRow {
  product_id: number;
  product_name: string;
  quantity_sold: number;
  sales_amount: number;
  sales_count: number;
}

export interface SalesReturnRow {
  return_id: number;
  return_date: string;
  sale_id: number | null;
  customer_name: string;
  cashier_name: string;
  subtotal: number;
  total: number;
  note: string;
}

export interface CashierPerformanceRow {
  user_id: number;
  cashier_name: string;
  sales_count: number;
  gross_sales: number;
  returns_count: number;
  returns_total: number;
  net_sales: number;
}

interface SalesOptionsResponse {
  branchId: number;
  customers: ReportOption[];
  products: ReportOption[];
}

export const salesReportsService = {
  async getSalesOptions(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<SalesOptionsResponse>(`${API.REPORTS.SALES_OPTIONS}${query}`);
  },

  async getDailySales(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<RowsResponse<DailySalesRow>>(`${API.REPORTS.SALES_DAILY}${query}`);
  },

  async getSalesByCustomer(input: { mode: ReportSelectionMode; customerId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      customerId: input.mode === 'show' ? input.customerId : undefined,
    });
    return apiClient.get<RowsResponse<SalesByCustomerRow>>(`${API.REPORTS.SALES_BY_CUSTOMER}${query}`);
  },

  async getSalesByProduct(input: { mode: ReportSelectionMode; productId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      productId: input.mode === 'show' ? input.productId : undefined,
    });
    return apiClient.get<RowsResponse<SalesByProductRow>>(`${API.REPORTS.SALES_BY_PRODUCT}${query}`);
  },

  async getTopSellingItems(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<TopSellingItemRow>>(`${API.REPORTS.SALES_TOP_ITEMS}${query}`);
  },

  async getSalesReturns(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<SalesReturnRow>>(`${API.REPORTS.SALES_RETURNS}${query}`);
  },

  async getCashierPerformance(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<CashierPerformanceRow>>(`${API.REPORTS.SALES_CASHIER_PERFORMANCE}${query}`);
  },
};

export type { ReportOption, ReportSelectionMode, RowsResponse };
