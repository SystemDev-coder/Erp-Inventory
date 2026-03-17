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

export interface CustomerCombinedBalance {
  customer_id: number;
  customer_name: string;
  opening_balance: number;
  credit_balance: number;
  total_balance: number;
}

export interface UnpaidSupplier {
  branch_id: number;
  supplier_id: number;
  supplier_name: string;
  total: number;
  paid: number;
  balance: number;
}

export interface SupplierCombinedBalance {
  supplier_id: number;
  supplier_name: string;
  opening_balance: number;
  credit_balance: number;
  total_balance: number;
}

export interface SupplierOutstandingPurchase {
  purchase_id: number;
  supplier_id: number | null;
  purchase_date: string;
  total: number;
  paid: number;
  outstanding: number;
  supplier_name: string;
  status: string;
}

export interface OtherIncomeRow {
  other_income_id: number;
  branch_id: number;
  income_name: string;
  income_date: string;
  acc_id: number;
  amount: number;
  note?: string | null;
  account_name?: string | null;
  created_by_name?: string | null;
  created_at?: string;
}

export interface ExpenseCharge {
  exp_ch_id: number;
  branch_id: number;
  exp_id: number;
  amount: number;
  exp_date: string;
  reg_date?: string | null;
  note?: string | null;
  exp_budget?: number | null;
  is_opening_paid?: boolean;
  expense_name?: string | null;
  created_by?: string | null;
  payment_count?: number;
  paid_sum?: number;
  open_balance?: number;
  payment_status?: 'unpaid' | 'partial' | 'paid';
  is_budget?: number;
}

export interface ExpensePayment {
  exp_payment_id: number;
  exp_ch_id?: number;
  exp_id?: number;
  branch_id: number;
  acc_id: number;
  pay_date: string;
  amount_paid: number;
  reference_no?: string | null;
  note?: string | null;
  account_name?: string | null;
}

export interface ExpenseBudget {
  budget_id: number;
  exp_id: number;
  fixed_amount: number;
  note?: string | null;
  expense_name?: string | null;
  amount_limit?: number; // alias for UI
  created_by?: string | null;
}

export interface PayrollRow {
  payroll_id: number | null;
  payroll_line_id: number | null;
  period_year: number | null;
  period_month: number | null;
  emp_id: number | null;
  full_name: string;
  net_salary: number | null;
  paid_sum: number | null;
  branch_id?: number | null;
}

export interface Expense {
  exp_id: number;
  branch_id: number;
  name: string;
  created_at: string;
  user_id: number;
  created_by?: string | null;
}

export type ClosingMode = 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type ClosingStatus = 'draft' | 'closed' | 'reopened';
export type ProfitAllocationType = 'partner' | 'retained' | 'reinvestment' | 'reserve';

export interface ProfitSharePartner {
  partnerName: string;
  sharePct: number;
  accId?: number | null;
}

export interface ProfitShareRule {
  ruleId?: number | null;
  branchId?: number;
  ruleName: string;
  sourceAccId?: number | null;
  retainedPct: number;
  retainedAccId?: number | null;
  reinvestmentPct: number;
  reinvestmentAccId?: number | null;
  reservePct: number;
  reserveAccId?: number | null;
  partners: ProfitSharePartner[];
  isDefault?: boolean;
}

export interface FinanceClosingPeriod {
  closing_id: number;
  branch_id: number;
  close_mode: ClosingMode;
  period_from: string;
  period_to: string;
  operational_from?: string | null;
  operational_to?: string | null;
  status: ClosingStatus;
  is_locked: boolean;
  scheduled_at?: string | null;
  note?: string | null;
  summary_json?: any;
  profit_json?: any;
  closed_at?: string | null;
  journal_id?: number | null;
  closing_journal_id?: number | null;
  closing_reversal_journal_id?: number | null;
  created_at: string;
}

export interface ClosingSnapshot {
  salesRevenue: number;
  salesReturns: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  expenseCharges: number;
  payrollExpense: number;
  netIncome: number;
  stockValuation: number;
  cashBalance: number;
  capitalBalance: number;
}

export interface ProfitAllocation {
  allocationType: ProfitAllocationType;
  label: string;
  sharePct: number;
  amount: number;
  accId: number | null;
}

export const financeService = {
  // Transfers
  async listTransfers(params?: { branchId?: number; fromDate?: string; toDate?: string }) {
    const qsParts: string[] = [];
    if (params?.branchId) qsParts.push(`branchId=${params.branchId}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
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

  async listCustomerReceipts(params?: { branchId?: number; fromDate?: string; toDate?: string }) {
    const qsParts: string[] = [];
    if (params?.branchId) qsParts.push(`branchId=${params.branchId}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
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
  async getCustomerCombinedBalance(customerId: number, branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ balance: CustomerCombinedBalance }>(`${API.FINANCE.CUSTOMER_BALANCE(customerId)}${qs}`);
  },

  async listSupplierReceipts(params?: { branchId?: number; fromDate?: string; toDate?: string }) {
    const qsParts: string[] = [];
    if (params?.branchId) qsParts.push(`branchId=${params.branchId}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
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
  async getSupplierCombinedBalance(supplierId: number, branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ balance: SupplierCombinedBalance }>(`${API.FINANCE.SUPPLIER_BALANCE(supplierId)}${qs}`);
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
  async listExpenseCharges(params?: { branchId?: number; fromDate?: string; toDate?: string }) {
    const qsParts: string[] = [];
    if (params?.branchId) qsParts.push(`branchId=${params.branchId}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ charges: ExpenseCharge[] }>(`${API.FINANCE.EXPENSE_CHARGES}${qs}`);
  },
  async createExpenseCharge(payload: { branch_id?: number; exp_id?: number; exp_type_id?: number; amount: number; note?: string; exp_date?: string; reg_date?: string; is_opening_paid?: boolean }) {
    return apiClient.post<{ charge: ExpenseCharge }>(API.FINANCE.EXPENSE_CHARGES, {
      branchId: payload.branch_id,
      expId: payload.exp_id,
      expBudgetId: undefined,
      amount: payload.amount,
      note: payload.note,
      expDate: payload.exp_date,
      regDate: payload.reg_date,
      isOpeningPaid: payload.is_opening_paid,
    });
  },
  async updateExpenseCharge(id: number, payload: { branch_id?: number; exp_id?: number; amount?: number; exp_date?: string; note?: string; is_opening_paid?: boolean }) {
    return apiClient.put<{ charge: ExpenseCharge }>(`${API.FINANCE.EXPENSE_CHARGES}/${id}`, {
      branchId: payload.branch_id,
      expId: payload.exp_id,
      amount: payload.amount,
      expDate: payload.exp_date,
      regDate: payload.exp_date,
      note: payload.note,
      isOpeningPaid: payload.is_opening_paid,
    });
  },
  async deleteExpenseCharge(id: number) {
    return apiClient.delete<{ message: string }>(`${API.FINANCE.EXPENSE_CHARGES}/${id}`);
  },

  async createExpensePayment(payload: { branch_id?: number; exp_ch_id: number; acc_id: number; amount?: number; pay_date?: string; reference_no?: string; note?: string }) {
    return apiClient.post<{ payment: ExpensePayment }>(API.FINANCE.EXPENSE_PAYMENTS, {
      branchId: payload.branch_id,
      expChargeId: payload.exp_ch_id,
      accId: payload.acc_id,
      amount: payload.amount,
      payDate: payload.pay_date,
      referenceNo: payload.reference_no,
      note: payload.note,
    });
  },
  async listExpensePayments(payload: { chargeId?: number; expenseId?: number }) {
    const qsParts: string[] = [];
    if (payload.chargeId) qsParts.push(`chargeId=${payload.chargeId}`);
    if (payload.expenseId) qsParts.push(`expenseId=${payload.expenseId}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ payments: ExpensePayment[] }>(`${API.FINANCE.EXPENSE_PAYMENTS}${qs}`);
  },

  // Expense budgets
  async listExpenseBudgets(params?: { branchId?: number; fromDate?: string; toDate?: string }) {
    const qsParts: string[] = [];
    if (params?.branchId) qsParts.push(`branchId=${params.branchId}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ budgets: ExpenseBudget[] }>(`${API.FINANCE.EXPENSE_BUDGETS}${qs}`);
  },
  async createExpenseBudget(payload: { branch_id?: number; exp_id: number; fixed_amount?: number; amount_limit?: number; note?: string }) {
    return apiClient.post<{ budget: ExpenseBudget }>(API.FINANCE.EXPENSE_BUDGETS, {
      branchId: payload.branch_id,
      expId: payload.exp_id,
      fixedAmount: payload.fixed_amount ?? payload.amount_limit,
      note: payload.note,
    });
  },
  async updateExpenseBudget(id: number, payload: { branch_id?: number; exp_id?: number; fixed_amount?: number; amount_limit?: number; note?: string }) {
    return apiClient.put<{ budget: ExpenseBudget }>(`${API.FINANCE.EXPENSE_BUDGETS}/${id}`, {
      branchId: payload.branch_id,
      expId: payload.exp_id,
      fixedAmount: payload.fixed_amount ?? payload.amount_limit,
      note: payload.note,
    });
  },
  async deleteExpenseBudget(id: number) {
    return apiClient.delete<{ message: string }>(`${API.FINANCE.EXPENSE_BUDGETS}/${id}`);
  },

  async chargeExpenseBudget(payload: { budget_id: number; branch_id?: number; pay_date?: string; note?: string }) {
    return apiClient.post<{ result: { exp_ch_id: number } }>(`${API.FINANCE.EXPENSE_BUDGETS}/charge`, {
      budgetId: payload.budget_id,
      branchId: payload.branch_id,
      payDate: payload.pay_date,
      note: payload.note,
    });
  },
  async manageExpenseBudgetCharges(payload: { reg_date: string; oper?: string; branch_id?: number }) {
    return apiClient.post<{ result: { status: string } }>(`${API.FINANCE.EXPENSE_BUDGETS}/manage`, {
      regDate: payload.reg_date,
      oper: payload.oper,
      branchId: payload.branch_id,
    });
  },

  // Payroll
  async listPayroll(params?: { period?: string; fromDate?: string; toDate?: string }) {
    const qsParts: string[] = [];
    if (params?.period) qsParts.push(`period=${encodeURIComponent(params.period)}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ payroll: PayrollRow[] }>(`${API.FINANCE.PAYROLL}${qs}`);
  },
  async chargeSalaries(payload: { periodDate: string }) {
    return apiClient.post<{ result: { created: number } }>(`${API.FINANCE.PAYROLL}/charge`, payload);
  },
  async paySalary(payload: { payroll_line_id: number; acc_id: number; amount?: number; pay_date?: string; note?: string }) {
    return apiClient.post<{ payment: { emp_payment_id: number } }>(`${API.FINANCE.PAYROLL}/pay`, {
      payrollLineId: payload.payroll_line_id,
      accId: payload.acc_id,
      amount: payload.amount,
      payDate: payload.pay_date,
      note: payload.note,
    });
  },
  async deletePayroll(payload: { mode: 'line' | 'period'; payroll_line_id?: number; period?: string }) {
    return apiClient.post<{ result: { deleted: number } }>(`${API.FINANCE.PAYROLL}/delete`, {
      mode: payload.mode,
      payrollLineId: payload.payroll_line_id,
      period: payload.period,
    });
  },

  // Other income
  async listOtherIncome(params?: { branchId?: number; fromDate?: string; toDate?: string }) {
    const qsParts: string[] = [];
    if (params?.branchId) qsParts.push(`branchId=${encodeURIComponent(String(params.branchId))}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ otherIncomes: OtherIncomeRow[] }>(`${API.FINANCE.OTHER_INCOME}${qs}`);
  },
  async createOtherIncome(payload: { branch_id?: number; income_name: string; income_date: string; acc_id: number; amount: number; note?: string }) {
    return apiClient.post<{ otherIncome: OtherIncomeRow }>(API.FINANCE.OTHER_INCOME, {
      branchId: payload.branch_id,
      incomeName: payload.income_name,
      incomeDate: payload.income_date,
      accId: payload.acc_id,
      amount: payload.amount,
      note: payload.note || '',
    });
  },
  async updateOtherIncome(
    id: number,
    payload: Partial<{ income_name: string; income_date: string; acc_id: number; amount: number; note?: string }>
  ) {
    return apiClient.put<{ otherIncome: OtherIncomeRow }>(`${API.FINANCE.OTHER_INCOME}/${id}`, {
      incomeName: payload.income_name,
      incomeDate: payload.income_date,
      accId: payload.acc_id,
      amount: payload.amount,
      note: payload.note || '',
    });
  },
  async deleteOtherIncome(id: number) {
    return apiClient.delete<{ message: string }>(`${API.FINANCE.OTHER_INCOME}/${id}`);
  },

  // Expenses
  async listExpenses(params?: { branchId?: number; fromDate?: string; toDate?: string }) {
    const qsParts: string[] = [];
    if (params?.branchId) qsParts.push(`branchId=${params.branchId}`);
    if (params?.fromDate) qsParts.push(`fromDate=${encodeURIComponent(params.fromDate)}`);
    if (params?.toDate) qsParts.push(`toDate=${encodeURIComponent(params.toDate)}`);
    const qs = qsParts.length ? `?${qsParts.join('&')}` : '';
    return apiClient.get<{ expenses: Expense[] }>(`${API.FINANCE.EXPENSES}${qs}`);
  },
  async createExpense(payload: { branch_id?: number; name: string }) {
    return apiClient.post<{ expense: Expense }>(API.FINANCE.EXPENSES, {
      branchId: payload.branch_id,
      name: payload.name,
    });
  },
  async updateExpense(id: number, payload: { branch_id?: number; name?: string }) {
    return apiClient.put<{ expense: Expense }>(`${API.FINANCE.EXPENSES}/${id}`, {
      branchId: payload.branch_id,
      name: payload.name,
    });
  },
  async deleteExpense(id: number) {
    return apiClient.delete<{ message: string }>(`${API.FINANCE.EXPENSES}/${id}`);
  },

  // Closing finance & profit sharing
  async listClosingPeriods(payload?: {
    branchId?: number;
    status?: ClosingStatus;
    fromDate?: string;
    toDate?: string;
  }) {
    const params = new URLSearchParams();
    if (payload?.branchId) params.set('branchId', String(payload.branchId));
    if (payload?.status) params.set('status', payload.status);
    if (payload?.fromDate) params.set('fromDate', payload.fromDate);
    if (payload?.toDate) params.set('toDate', payload.toDate);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<{ periods: FinanceClosingPeriod[] }>(`${API.FINANCE.CLOSING_PERIODS}${qs}`);
  },
  async createClosingPeriod(payload: {
    branchId?: number;
    closeMode: ClosingMode;
    periodFrom: string;
    periodTo: string;
    operationalFrom?: string;
    operationalTo?: string;
    scheduledAt?: string;
    note?: string;
  }) {
    return apiClient.post<{ period: FinanceClosingPeriod }>(API.FINANCE.CLOSING_PERIODS, payload);
  },
  async updateClosingPeriod(
    closingId: number,
    payload: {
      closeMode?: ClosingMode;
      periodFrom?: string;
      periodTo?: string;
      operationalFrom?: string;
      operationalTo?: string;
      scheduledAt?: string;
      note?: string;
    }
  ) {
    return apiClient.put<{ period: FinanceClosingPeriod }>(API.FINANCE.CLOSING_PERIOD(closingId), payload);
  },
  async previewClosingPeriod(
    closingId: number,
    payload: {
      ruleId?: number;
      rule?: ProfitShareRule;
      autoTransfer?: boolean;
      force?: boolean;
      saveRuleAsDefault?: boolean;
    }
  ) {
    return apiClient.post<{
      preview: {
        period: FinanceClosingPeriod;
        summary: ClosingSnapshot;
        rule: ProfitShareRule;
        allocations: ProfitAllocation[];
        warnings: string[];
      };
    }>(API.FINANCE.CLOSING_PREVIEW(closingId), payload);
  },
  async closeClosingPeriod(
    closingId: number,
    payload: {
      ruleId?: number;
      rule?: ProfitShareRule;
      autoTransfer?: boolean;
      force?: boolean;
      saveRuleAsDefault?: boolean;
    }
  ) {
    return apiClient.post<{
      result: {
        period: FinanceClosingPeriod;
        summary: ClosingSnapshot;
        rule: ProfitShareRule;
        allocations: ProfitAllocation[];
        journalId: number | null;
        closingJournalId: number | null;
        warnings: string[];
      };
    }>(API.FINANCE.CLOSING_CLOSE(closingId), payload);
  },
  async reopenClosingPeriod(closingId: number, payload?: { reason?: string; reverseClosingEntries?: boolean }) {
    return apiClient.post<{ period: FinanceClosingPeriod }>(API.FINANCE.CLOSING_REOPEN(closingId), payload || {});
  },
  async getClosingSummary(closingId: number) {
    return apiClient.get<{
      summary: {
        period: FinanceClosingPeriod;
        summary: ClosingSnapshot | null;
        profit: {
          rule?: ProfitShareRule;
          allocations?: ProfitAllocation[];
          warnings?: string[];
          transferPosted?: boolean;
        };
      };
    }>(API.FINANCE.CLOSING_SUMMARY(closingId));
  },
  async postClosingProfitDistribution(closingId: number) {
    return apiClient.post<{
      result: {
        period: FinanceClosingPeriod;
        summary: ClosingSnapshot;
        profit: {
          rule?: ProfitShareRule;
          allocations?: ProfitAllocation[];
          warnings?: string[];
          transferPosted?: boolean;
        };
        journalId: number | null;
      };
    }>(API.FINANCE.CLOSING_TRANSFER(closingId), {});
  },
  async listProfitShareRules(branchId?: number) {
    const qs = branchId ? `?branchId=${branchId}` : '';
    return apiClient.get<{ rules: ProfitShareRule[] }>(`${API.FINANCE.CLOSING_RULES}${qs}`);
  },
  async saveProfitShareRule(payload: ProfitShareRule) {
    return apiClient.post<{ rule: ProfitShareRule }>(API.FINANCE.CLOSING_RULES, payload);
  },
  async runScheduledClosings() {
    return apiClient.post<{ result: { due: number; closed: number; failed: Array<{ closingId: number; reason: string }> } }>(
      API.FINANCE.CLOSING_RUN_SCHEDULED,
      {}
    );
  },
};
