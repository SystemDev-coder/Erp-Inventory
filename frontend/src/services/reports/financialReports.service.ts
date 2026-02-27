import { API, apiClient, type ReportOption, type ReportSelectionMode, type RowsResponse, toQuery } from './shared';

export interface IncomeStatementRow {
  section: string;
  line_item: string;
  amount: number;
  row_type: 'detail' | 'total';
}

export interface BalanceSheetRow {
  section: string;
  line_item: string;
  amount: number;
  row_type: 'detail' | 'total';
}

export interface CashFlowRow {
  section: string;
  line_item: string;
  amount: number;
  row_type: 'detail' | 'total';
}

export interface AccountBalanceRow {
  account_id: number;
  account_name: string;
  institution: string;
  current_balance: number;
  last_transaction_date: string | null;
}

export interface ExpenseSummaryRow {
  exp_id: number;
  expense_name: string;
  charges_count: number;
  total_charged: number;
  total_paid: number;
  outstanding_amount: number;
  last_charge_date: string | null;
}

export interface CustomerReceiptRow {
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

export interface SupplierPaymentRow {
  sup_payment_id: number;
  pay_date: string;
  purchase_id: number;
  supplier_id: number | null;
  supplier_name: string;
  account_name: string;
  amount_paid: number;
  reference_no: string;
  note: string;
}

export interface AccountTransactionRow {
  txn_id: number;
  txn_date: string;
  account_id: number;
  account_name: string;
  txn_type: string;
  ref_table: string;
  ref_id: number | null;
  debit: number;
  credit: number;
  net_effect: number;
  note: string;
}

export interface AccountStatementRow {
  txn_id: number;
  txn_date: string;
  account_id: number;
  account_name: string;
  txn_type: string;
  ref_table: string;
  ref_id: number | null;
  debit: number;
  credit: number;
  running_balance: number;
  note: string;
}

export interface TrialBalanceRow {
  account_id: number;
  account_name: string;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

interface FinancialOptionsResponse {
  branchId: number;
  accounts: ReportOption[];
  customers: ReportOption[];
  suppliers: ReportOption[];
}

interface BalanceSheetResponse extends RowsResponse<BalanceSheetRow> {
  asOfDate?: string;
}

export const financialReportsService = {
  async getFinancialOptions(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<FinancialOptionsResponse>(`${API.REPORTS.FINANCIAL_OPTIONS}${query}`);
  },

  async getIncomeStatement(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<IncomeStatementRow>>(`${API.REPORTS.FINANCIAL_INCOME_STATEMENT}${query}`);
  },

  async getBalanceSheet(input: { asOfDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      asOfDate: input.asOfDate,
    });
    return apiClient.get<BalanceSheetResponse>(`${API.REPORTS.FINANCIAL_BALANCE_SHEET}${query}`);
  },

  async getCashFlowStatement(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<CashFlowRow>>(`${API.REPORTS.FINANCIAL_CASH_FLOW}${query}`);
  },

  async getAccountBalances(input: { mode: ReportSelectionMode; accountId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      accountId: input.mode === 'show' ? input.accountId : undefined,
    });
    return apiClient.get<RowsResponse<AccountBalanceRow>>(`${API.REPORTS.FINANCIAL_ACCOUNT_BALANCES}${query}`);
  },

  async getExpenseSummary(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<ExpenseSummaryRow>>(`${API.REPORTS.FINANCIAL_EXPENSE_SUMMARY}${query}`);
  },

  async getCustomerReceipts(input: {
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
    return apiClient.get<RowsResponse<CustomerReceiptRow>>(`${API.REPORTS.FINANCIAL_CUSTOMER_RECEIPTS}${query}`);
  },

  async getSupplierPayments(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    supplierId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      supplierId: input.mode === 'show' ? input.supplierId : undefined,
    });
    return apiClient.get<RowsResponse<SupplierPaymentRow>>(`${API.REPORTS.FINANCIAL_SUPPLIER_PAYMENTS}${query}`);
  },

  async getAccountTransactions(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    accountId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      accountId: input.mode === 'show' ? input.accountId : undefined,
    });
    return apiClient.get<RowsResponse<AccountTransactionRow>>(`${API.REPORTS.FINANCIAL_ACCOUNT_TRANSACTIONS}${query}`);
  },

  async getAccountStatement(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    accountId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      accountId: input.mode === 'show' ? input.accountId : undefined,
    });
    return apiClient.get<RowsResponse<AccountStatementRow>>(`${API.REPORTS.FINANCIAL_ACCOUNT_STATEMENT}${query}`);
  },

  async getTrialBalance(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<TrialBalanceRow>>(`${API.REPORTS.FINANCIAL_TRIAL_BALANCE}${query}`);
  },
};

export type { ReportOption, ReportSelectionMode, RowsResponse };
