import { API, apiClient, type ReportOption, type ReportSelectionMode, type RowsResponse, toQuery } from './shared';

export interface CustomerListRow {
  customer_id: number;
  full_name: string;
  phone: string;
  customer_type: string;
  registered_date: string;
  balance: number;
  status: string;
}

export interface CustomerLedgerRow {
  cust_ledger_id: number;
  entry_date: string;
  customer_id: number;
  customer_name: string;
  entry_type: string;
  ref_table: string;
  ref_id: number | null;
  debit: number;
  credit: number;
  running_balance: number;
  note: string;
}

export interface OutstandingBalanceRow {
  customer_id: number;
  customer_name: string;
  phone: string;
  total_debit: number;
  total_credit: number;
  outstanding_balance: number;
}

export interface TopCustomerRow {
  customer_id: number;
  customer_name: string;
  sales_count: number;
  net_sales: number;
  total_receipts: number;
  outstanding_balance: number;
}

export interface CustomerPaymentHistoryRow {
  receipt_id: number;
  receipt_date: string;
  customer_id: number | null;
  customer_name: string;
  sale_id: number | null;
  account_name: string;
  amount: number;
  payment_method: string;
  reference_no: string;
  note: string;
}

export interface CreditCustomerRow {
  customer_id: number;
  customer_name: string;
  phone: string;
  customer_type: string;
  current_credit: number;
  status: string;
}

export interface NewCustomerRow {
  customer_id: number;
  full_name: string;
  phone: string;
  customer_type: string;
  registered_date: string;
  opening_balance: number;
  current_balance: number;
}

export interface CustomerActivityRow {
  customer_id: number;
  customer_name: string;
  sales_count: number;
  returns_count: number;
  receipts_count: number;
  gross_sales: number;
  sales_returns: number;
  total_receipts: number;
  net_exposure: number;
}

interface CustomerOptionsResponse {
  branchId: number;
  customers: ReportOption[];
}

export const customerReportsService = {
  async getCustomerOptions(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<CustomerOptionsResponse>(`${API.REPORTS.CUSTOMER_OPTIONS}${query}`);
  },

  async getCustomerList(input: { mode: ReportSelectionMode; customerId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      customerId: input.mode === 'show' ? input.customerId : undefined,
    });
    return apiClient.get<RowsResponse<CustomerListRow>>(`${API.REPORTS.CUSTOMER_LIST}${query}`);
  },

  async getCustomerLedger(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    customerId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      customerId: input.mode === 'show' ? input.customerId : undefined,
    });
    return apiClient.get<RowsResponse<CustomerLedgerRow>>(`${API.REPORTS.CUSTOMER_LEDGER}${query}`);
  },

  async getOutstandingBalances(input: { mode: ReportSelectionMode; customerId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      customerId: input.mode === 'show' ? input.customerId : undefined,
    });
    return apiClient.get<RowsResponse<OutstandingBalanceRow>>(`${API.REPORTS.CUSTOMER_OUTSTANDING_BALANCES}${query}`);
  },

  async getTopCustomers(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<TopCustomerRow>>(`${API.REPORTS.CUSTOMER_TOP_CUSTOMERS}${query}`);
  },

  async getPaymentHistory(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    customerId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      customerId: input.mode === 'show' ? input.customerId : undefined,
    });
    return apiClient.get<RowsResponse<CustomerPaymentHistoryRow>>(`${API.REPORTS.CUSTOMER_PAYMENT_HISTORY}${query}`);
  },

  async getCreditCustomers(input: { mode: ReportSelectionMode; customerId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      customerId: input.mode === 'show' ? input.customerId : undefined,
    });
    return apiClient.get<RowsResponse<CreditCustomerRow>>(`${API.REPORTS.CUSTOMER_CREDIT_CUSTOMERS}${query}`);
  },

  async getNewCustomers(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<NewCustomerRow>>(`${API.REPORTS.CUSTOMER_NEW_CUSTOMERS}${query}`);
  },

  async getCustomerActivity(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    customerId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      customerId: input.mode === 'show' ? input.customerId : undefined,
    });
    return apiClient.get<RowsResponse<CustomerActivityRow>>(`${API.REPORTS.CUSTOMER_ACTIVITY}${query}`);
  },
};

export type { ReportOption, ReportSelectionMode, RowsResponse };

