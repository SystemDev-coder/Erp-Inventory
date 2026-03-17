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

export interface SalesSummaryRow {
  metric: string;
  kind: 'money' | 'count';
  value: number;
}

export interface InvoiceStatusRow {
  sale_id: number;
  sale_date: string;
  customer_name: string;
  cashier_name: string;
  sale_type: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
}

export interface SalesByStoreRow {
  store_id: number | null;
  store_name: string;
  quantity_sold: number;
  sales_amount: number;
  sales_count: number;
}

export interface PaymentByAccountRow {
  acc_id: number;
  account_name: string;
  sales_count: number;
  payment_count: number;
  amount_paid: number;
}

export interface QuotationRow {
  quotation_id: number;
  quotation_date: string;
  valid_until: string | null;
  customer_name: string;
  cashier_name: string;
  total: number;
  status: string;
  note: string;
}

export interface SalesTopCustomerRow {
  customer_id: number | null;
  customer_name: string;
  invoice_count: number;
  quantity: number;
  sales_total: number;
  returns_total: number;
  net_sales: number;
}

interface SalesOptionsResponse {
  branchId: number;
  customers: ReportOption[];
  products: ReportOption[];
  stores: ReportOption[];
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

  async getSalesSummary(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<SalesSummaryRow>>(`${API.REPORTS.SALES_SUMMARY}${query}`);
  },

  async getInvoiceStatus(input: { fromDate: string; toDate: string; status: 'all' | 'paid' | 'partial' | 'unpaid'; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      status: input.status,
    });
    return apiClient.get<RowsResponse<InvoiceStatusRow>>(`${API.REPORTS.SALES_INVOICE_STATUS}${query}`);
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

  async getSalesByStore(input: { fromDate: string; toDate: string; mode: ReportSelectionMode; storeId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      storeId: input.mode === 'show' ? input.storeId : undefined,
    });
    return apiClient.get<RowsResponse<SalesByStoreRow>>(`${API.REPORTS.SALES_BY_STORE}${query}`);
  },

  async getTopSellingItems(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<TopSellingItemRow>>(`${API.REPORTS.SALES_TOP_ITEMS}${query}`);
  },

  async getTopCustomers(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<SalesTopCustomerRow>>(`${API.REPORTS.SALES_TOP_CUSTOMERS}${query}`);
  },

  async getSalesReturns(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<SalesReturnRow>>(`${API.REPORTS.SALES_RETURNS}${query}`);
  },

  async getPaymentsByAccount(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<PaymentByAccountRow>>(`${API.REPORTS.SALES_PAYMENTS_BY_ACCOUNT}${query}`);
  },

  async getQuotations(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<QuotationRow>>(`${API.REPORTS.SALES_QUOTATIONS}${query}`);
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
