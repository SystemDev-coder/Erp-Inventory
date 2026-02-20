import { apiClient } from './api';
import { API } from '../config/env';

export interface AccountTransfer {
  acc_transfer_id: number;
  branch_id: number;
  from_acc_id: number;
  to_acc_id: number;
  amount: number;
  transfer_date: string;
  status: string;
  reference_no?: string | null;
  note?: string | null;
  from_account?: string;
  to_account?: string;
}

export interface Receipt {
  receipt_id: number;
  branch_id: number;
  acc_id: number;
  amount: number;
  receipt_date: string;
  payment_method?: string | null;
  reference_no?: string | null;
  note?: string | null;
  customer_id?: number | null;
  supplier_id?: number | null;
  sale_id?: number | null;
  purchase_id?: number | null;
  customer_name?: string | null;
  supplier_name?: string | null;
  account_name?: string | null;
}

export interface UnpaidCustomer {
  branch_id: number;
  customer_id: number;
  customer_name: string;
  total: number;
  paid: number;
  balance: number;
}

export interface UnpaidSupplier {
  branch_id: number;
  supplier_id: number;
  supplier_name: string;
  total: number;
  paid: number;
  balance: number;
}

export interface SupplierOutstandingPurchase {
  purchase_id: number;
  purchase_date: string;
  total: number;
  paid: number;
  outstanding: number;
  supplier_name: string;
  status: string;
}

export interface ExpenseCharge {
  charge_id: number;
  branch_id: number;
  exp_id?: number | null;
  exp_type_id?: number | null;
  acc_id: number;
  charge_date: string;
  amount: number;
  note?: string | null;
  expense_type?: string | null;
  account_name?: string | null;
}

export interface ExpenseBudget {
  budget_id: number;
  branch_id: number;
  exp_type_id: number;
  period_year: number;
  period_month: number;
  amount_limit: number;
  note?: string | null;
  expense_type?: string | null;
}

export interface Expense {
  exp_id: number;
  branch_id: number;
  exp_type_id?: number | null;
  amount: number;
  exp_date: string;
  note?: string | null;
  expense_type?: string | null;
  account_name?: string | null;
  created_by?: string | null;
}

export const financeService = {
  // Transfers
  async listTransfers(branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ transfers: AccountTransfer[] }>(`${API.FINANCE.TRANSFERS}${qs}`);
  },
  async createTransfer(payload: Partial<AccountTransfer> & { from_acc_id: number; to_acc_id: number; amount: number; postNow?: boolean; branch_id?: number }) {
    return apiClient.post<{ transfer: AccountTransfer }>(API.FINANCE.TRANSFERS, {
      branchId: payload.branch_id,
      fromAccId: payload.from_acc_id,
      toAccId: payload.to_acc_id,
      amount: payload.amount,
      transferDate: payload.transfer_date,
      referenceNo: payload.reference_no,
      note: payload.note,
      postNow: payload.status === 'posted' ? true : payload.postNow,
    });
  },
  async updateTransfer(id: number, payload: Partial<AccountTransfer>) {
    return apiClient.put<{ transfer: AccountTransfer }>(`${API.FINANCE.TRANSFERS}/${id}`, {
      fromAccId: payload.from_acc_id,
      toAccId: payload.to_acc_id,
      amount: payload.amount,
      referenceNo: (payload as any).reference_no,
      note: payload.note,
    });
  },

  async listCustomerReceipts(branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ receipts: Receipt[] }>(`${API.FINANCE.CUSTOMER_RECEIPTS}${qs}`);
  },
  async listCustomerUnpaid(month?: string, branchId?: number) {
    const qsParts = [];
    if (branchId) qsParts.push(`branchId=${branchId}`);
    if (month) qsParts.push(`month=${month}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ unpaid: UnpaidCustomer[] }>(`${API.FINANCE.CUSTOMER_RECEIPTS_UNPAID}${qs}`);
  },
  async createCustomerReceipt(payload: { branch_id?: number; customer_id?: number; sale_id?: number; acc_id: number; amount: number; payment_method?: string; reference_no?: string; note?: string }) {
    return apiClient.post<{ receipt: Receipt }>(API.FINANCE.CUSTOMER_RECEIPTS, {
      branchId: payload.branch_id,
      customerId: payload.customer_id,
      saleId: payload.sale_id,
      accId: payload.acc_id,
      amount: payload.amount,
      paymentMethod: payload.payment_method,
      referenceNo: payload.reference_no,
      note: payload.note,
    });
  },
  async updateCustomerReceipt(id: number, payload: { acc_id?: number; customer_id?: number; amount?: number; payment_method?: string; reference_no?: string; note?: string }) {
    return apiClient.put<{ receipt: Receipt }>(`${API.FINANCE.CUSTOMER_RECEIPTS}/${id}`, {
      accId: payload.acc_id,
      customerId: payload.customer_id,
      amount: payload.amount,
      paymentMethod: payload.payment_method,
      referenceNo: payload.reference_no,
      note: payload.note,
    });
  },
  async deleteCustomerReceipt(id: number) {
    return apiClient.delete<{ message: string }>(`${API.FINANCE.CUSTOMER_RECEIPTS}/${id}`);
  },

  async listSupplierReceipts(branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ receipts: Receipt[] }>(`${API.FINANCE.SUPPLIER_RECEIPTS}${qs}`);
  },
  async listSupplierUnpaid(month?: string, branchId?: number) {
    const qsParts = [];
    if (branchId) qsParts.push(`branchId=${branchId}`);
    if (month) qsParts.push(`month=${month}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ unpaid: UnpaidSupplier[] }>(`${API.FINANCE.SUPPLIER_RECEIPTS_UNPAID}${qs}`);
  },
  async listSupplierOutstandingPurchases(supplierId?: number) {
    const qs = supplierId ? `?supplierId=${supplierId}` : '';
    return apiClient.get<{ purchases: SupplierOutstandingPurchase[] }>(`${API.FINANCE.SUPPLIER_OUTSTANDING}${qs}`);
  },
  async createSupplierReceipt(payload: { branch_id?: number; supplier_id?: number; purchase_id?: number; acc_id: number; amount: number; payment_method?: string; reference_no?: string; note?: string }) {
    return apiClient.post<{ receipt: Receipt }>(API.FINANCE.SUPPLIER_RECEIPTS, {
      branchId: payload.branch_id,
      supplierId: payload.supplier_id,
      purchaseId: payload.purchase_id,
      accId: payload.acc_id,
      amount: payload.amount,
      paymentMethod: payload.payment_method,
      referenceNo: payload.reference_no,
      note: payload.note,
    });
  },
  async updateSupplierReceipt(id: number, payload: { acc_id?: number; supplier_id?: number; purchase_id?: number; amount?: number; payment_method?: string; reference_no?: string; note?: string }) {
    return apiClient.put<{ receipt: Receipt }>(`${API.FINANCE.SUPPLIER_RECEIPTS}/${id}`, {
      accId: payload.acc_id,
      supplierId: payload.supplier_id,
      purchaseId: payload.purchase_id,
      amount: payload.amount,
      paymentMethod: payload.payment_method,
      referenceNo: payload.reference_no,
      note: payload.note,
    });
  },
  async deleteSupplierReceipt(id: number) {
    return apiClient.delete<{ message: string }>(`${API.FINANCE.SUPPLIER_RECEIPTS}/${id}`);
  },

  // Expense charges
  async listExpenseCharges(branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ charges: ExpenseCharge[] }>(`${API.FINANCE.EXPENSE_CHARGES}${qs}`);
  },
  async createExpenseCharge(payload: { branch_id?: number; exp_id?: number; exp_type_id?: number; acc_id: number; amount: number; note?: string }) {
    return apiClient.post<{ charge: ExpenseCharge }>(API.FINANCE.EXPENSE_CHARGES, {
      branchId: payload.branch_id,
      expId: payload.exp_id,
      expTypeId: payload.exp_type_id,
      accId: payload.acc_id,
      amount: payload.amount,
      note: payload.note,
    });
  },

  // Expense budgets
  async listExpenseBudgets(branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ budgets: ExpenseBudget[] }>(`${API.FINANCE.EXPENSE_BUDGETS}${qs}`);
  },
  async createExpenseBudget(payload: { branch_id?: number; exp_type_id: number; period_year: number; period_month: number; amount_limit: number; note?: string }) {
    return apiClient.post<{ budget: ExpenseBudget }>(API.FINANCE.EXPENSE_BUDGETS, {
      branchId: payload.branch_id,
      expTypeId: payload.exp_type_id,
      periodYear: payload.period_year,
      periodMonth: payload.period_month,
      amountLimit: payload.amount_limit,
      note: payload.note,
    });
  },

  // Expenses
  async listExpenses(branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ expenses: Expense[] }>(`${API.FINANCE.EXPENSES}${qs}`);
  },
};
