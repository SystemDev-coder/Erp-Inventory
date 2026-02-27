import { API, apiClient, type ReportOption, type ReportSelectionMode, type RowsResponse, toQuery } from './shared';

export interface EmployeeListRow {
  emp_id: number;
  full_name: string;
  role_name: string;
  phone: string;
  hire_date: string;
  salary_type: string;
  salary_amount: number;
  shift_type: string;
  status: string;
}

export interface PayrollSummaryRow {
  payroll_id: number;
  period_year: number;
  period_month: number;
  period_from: string;
  period_to: string;
  status: string;
  employees_count: number;
  total_basic: number;
  total_allowances: number;
  total_deductions: number;
  total_net: number;
  total_paid: number;
  outstanding_amount: number;
}

export interface SalaryPaymentRow {
  emp_payment_id: number;
  pay_date: string;
  employee_id: number;
  employee_name: string;
  payroll_id: number | null;
  period_label: string;
  account_name: string;
  amount_paid: number;
  reference_no: string;
  note: string;
}

export interface EmployeeAttendanceRow {
  assignment_id: number;
  effective_date: string;
  employee_id: number;
  employee_name: string;
  role_name: string;
  shift_type: string;
  is_active: boolean;
  employee_status: string;
}

export interface LoanBalanceRow {
  loan_id: number;
  loan_date: string;
  employee_id: number;
  employee_name: string;
  amount: number;
  paid_amount: number;
  outstanding_amount: number;
  loan_status: string;
  note: string;
}

export interface EmployeeLedgerRow {
  entry_no: number;
  entry_date: string;
  employee_id: number;
  employee_name: string;
  entry_type: string;
  ref_table: string;
  ref_id: number | null;
  amount_in: number;
  amount_out: number;
  net_amount: number;
  running_balance: number;
  note: string;
}

export interface PayrollByMonthRow {
  period_year: number;
  period_month: number;
  payroll_runs: number;
  employees_count: number;
  total_net: number;
  total_paid: number;
  outstanding_amount: number;
}

export interface EmployeeCountByDepartmentRow {
  department: string;
  total_employees: number;
  active_employees: number;
  inactive_employees: number;
  total_salary_amount: number;
}

interface HrOptionsResponse {
  branchId: number;
  employees: ReportOption[];
}

export const hrReportsService = {
  async getHrOptions(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<HrOptionsResponse>(`${API.REPORTS.HR_OPTIONS}${query}`);
  },

  async getEmployeeList(input: { mode: ReportSelectionMode; employeeId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      employeeId: input.mode === 'show' ? input.employeeId : undefined,
    });
    return apiClient.get<RowsResponse<EmployeeListRow>>(`${API.REPORTS.HR_EMPLOYEE_LIST}${query}`);
  },

  async getPayrollSummary(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<PayrollSummaryRow>>(`${API.REPORTS.HR_PAYROLL_SUMMARY}${query}`);
  },

  async getSalaryPayments(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    employeeId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      employeeId: input.mode === 'show' ? input.employeeId : undefined,
    });
    return apiClient.get<RowsResponse<SalaryPaymentRow>>(`${API.REPORTS.HR_SALARY_PAYMENTS}${query}`);
  },

  async getEmployeeAttendance(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    employeeId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      employeeId: input.mode === 'show' ? input.employeeId : undefined,
    });
    return apiClient.get<RowsResponse<EmployeeAttendanceRow>>(`${API.REPORTS.HR_EMPLOYEE_ATTENDANCE}${query}`);
  },

  async getLoanBalances(input: { mode: ReportSelectionMode; employeeId?: number; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      mode: input.mode,
      employeeId: input.mode === 'show' ? input.employeeId : undefined,
    });
    return apiClient.get<RowsResponse<LoanBalanceRow>>(`${API.REPORTS.HR_LOAN_BALANCES}${query}`);
  },

  async getEmployeeLedger(input: {
    fromDate: string;
    toDate: string;
    mode: ReportSelectionMode;
    employeeId?: number;
    branchId?: number;
  }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      mode: input.mode,
      employeeId: input.mode === 'show' ? input.employeeId : undefined,
    });
    return apiClient.get<RowsResponse<EmployeeLedgerRow>>(`${API.REPORTS.HR_EMPLOYEE_LEDGER}${query}`);
  },

  async getPayrollByMonth(input: { fromDate: string; toDate: string; branchId?: number }) {
    const query = toQuery({
      branchId: input.branchId,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
    return apiClient.get<RowsResponse<PayrollByMonthRow>>(`${API.REPORTS.HR_PAYROLL_BY_MONTH}${query}`);
  },

  async getEmployeeCountByDepartment(branchId?: number) {
    const query = toQuery({ branchId });
    return apiClient.get<RowsResponse<EmployeeCountByDepartmentRow>>(
      `${API.REPORTS.HR_EMPLOYEE_COUNT_BY_DEPARTMENT}${query}`
    );
  },
};

export type { ReportOption, ReportSelectionMode, RowsResponse };
