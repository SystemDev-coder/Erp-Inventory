import { queryMany } from '../../../db/query';

export interface HrReportOption {
  id: number;
  label: string;
}

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

export const hrReportsService = {
  async getHrReportOptions(branchId: number): Promise<{ employees: HrReportOption[] }> {
    const employees = await queryMany<HrReportOption>(
      `SELECT e.emp_id AS id, e.full_name AS label
         FROM ims.employees e
        WHERE e.branch_id = $1
        ORDER BY e.full_name`,
      [branchId]
    );
    return { employees };
  },

  async getEmployeeList(branchId: number, employeeId?: number): Promise<EmployeeListRow[]> {
    const params: number[] = [branchId];
    let filter = '';
    if (employeeId) {
      params.push(employeeId);
      filter = `AND e.emp_id = $${params.length}`;
    }

    return queryMany<EmployeeListRow>(
      `SELECT
         e.emp_id,
         e.full_name,
         COALESCE(r.role_name, 'Unassigned') AS role_name,
         COALESCE(e.phone, '') AS phone,
         e.hire_date::text AS hire_date,
         COALESCE(e.salary_type, '') AS salary_type,
         COALESCE(e.salary_amount, 0)::double precision AS salary_amount,
         COALESCE(e.shift_type, '') AS shift_type,
         COALESCE(e.status::text, 'inactive') AS status
       FROM ims.employees e
       LEFT JOIN ims.roles r ON r.role_id = COALESCE(e.role_id, (SELECT u.role_id FROM ims.users u WHERE u.user_id = e.user_id))
      WHERE e.branch_id = $1
        ${filter}
      ORDER BY e.full_name`,
      params
    );
  },

  async getPayrollSummary(branchId: number, fromDate: string, toDate: string): Promise<PayrollSummaryRow[]> {
    return queryMany<PayrollSummaryRow>(
      `WITH paid AS (
         SELECT
           ep.payroll_id,
           COALESCE(SUM(ep.amount_paid), 0)::double precision AS total_paid
         FROM ims.employee_payments ep
         GROUP BY ep.payroll_id
       )
       SELECT
         pr.payroll_id,
         pr.period_year,
         pr.period_month,
         pr.period_from::text AS period_from,
         pr.period_to::text AS period_to,
         pr.status::text AS status,
         COUNT(pl.payroll_line_id)::int AS employees_count,
         COALESCE(SUM(pl.basic_salary), 0)::double precision AS total_basic,
         COALESCE(SUM(pl.allowances), 0)::double precision AS total_allowances,
         COALESCE(SUM(pl.deductions), 0)::double precision AS total_deductions,
         COALESCE(SUM(pl.net_salary), 0)::double precision AS total_net,
         COALESCE(p.total_paid, 0)::double precision AS total_paid,
         GREATEST(COALESCE(SUM(pl.net_salary), 0) - COALESCE(p.total_paid, 0), 0)::double precision AS outstanding_amount
       FROM ims.payroll_runs pr
       LEFT JOIN ims.payroll_lines pl ON pl.payroll_id = pr.payroll_id
       LEFT JOIN paid p ON p.payroll_id = pr.payroll_id
      WHERE pr.branch_id = $1
        AND pr.period_from::date BETWEEN $2::date AND $3::date
      GROUP BY pr.payroll_id, pr.period_year, pr.period_month, pr.period_from, pr.period_to, pr.status, p.total_paid
      ORDER BY pr.period_year DESC, pr.period_month DESC, pr.payroll_id DESC`,
      [branchId, fromDate, toDate]
    );
  },

  async getSalaryPayments(
    branchId: number,
    fromDate: string,
    toDate: string,
    employeeId?: number
  ): Promise<SalaryPaymentRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';
    if (employeeId) {
      params.push(employeeId);
      filter = `AND ep.emp_id = $${params.length}`;
    }

    return queryMany<SalaryPaymentRow>(
      `SELECT
         ep.emp_payment_id,
         ep.pay_date::text AS pay_date,
         ep.emp_id AS employee_id,
         e.full_name AS employee_name,
         ep.payroll_id,
         CASE
           WHEN pr.payroll_id IS NULL THEN 'Manual Payment'
           ELSE CONCAT(pr.period_year::text, '-', LPAD(pr.period_month::text, 2, '0'))
         END AS period_label,
         COALESCE(a.name, 'N/A') AS account_name,
         COALESCE(ep.amount_paid, 0)::double precision AS amount_paid,
         COALESCE(ep.reference_no, '') AS reference_no,
         COALESCE(ep.note, '') AS note
       FROM ims.employee_payments ep
       JOIN ims.employees e ON e.emp_id = ep.emp_id
       LEFT JOIN ims.payroll_runs pr ON pr.payroll_id = ep.payroll_id
       LEFT JOIN ims.accounts a ON a.acc_id = ep.acc_id
      WHERE ep.branch_id = $1
        AND ep.pay_date::date BETWEEN $2::date AND $3::date
        ${filter}
      ORDER BY ep.pay_date DESC, ep.emp_payment_id DESC`,
      params
    );
  },

  async getEmployeeAttendance(
    branchId: number,
    fromDate: string,
    toDate: string,
    employeeId?: number
  ): Promise<EmployeeAttendanceRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';
    if (employeeId) {
      params.push(employeeId);
      filter = `AND a.emp_id = $${params.length}`;
    }

    return queryMany<EmployeeAttendanceRow>(
      `SELECT
         a.assignment_id,
         a.effective_date::text AS effective_date,
         a.emp_id AS employee_id,
         e.full_name AS employee_name,
         COALESCE(r.role_name, 'Unassigned') AS role_name,
         a.shift_type,
         COALESCE(a.is_active, TRUE) AS is_active,
         COALESCE(e.status::text, 'inactive') AS employee_status
       FROM ims.employee_shift_assignments a
       JOIN ims.employees e ON e.emp_id = a.emp_id
       LEFT JOIN ims.roles r ON r.role_id = COALESCE(e.role_id, (SELECT u.role_id FROM ims.users u WHERE u.user_id = e.user_id))
      WHERE a.branch_id = $1
        AND a.effective_date BETWEEN $2::date AND $3::date
        ${filter}
      ORDER BY a.effective_date DESC, a.assignment_id DESC`,
      params
    );
  },

  async getLoanBalances(branchId: number, employeeId?: number): Promise<LoanBalanceRow[]> {
    const params: number[] = [branchId];
    let filter = '';
    if (employeeId) {
      params.push(employeeId);
      filter = `AND l.emp_id = $${params.length}`;
    }

    return queryMany<LoanBalanceRow>(
      `WITH paid AS (
         SELECT
           lp.loan_id,
           COALESCE(SUM(lp.amount_paid), 0)::double precision AS paid_amount
         FROM ims.loan_payments lp
         GROUP BY lp.loan_id
       )
       SELECT
         l.loan_id,
         l.loan_date::text AS loan_date,
         l.emp_id AS employee_id,
         e.full_name AS employee_name,
         COALESCE(l.amount, 0)::double precision AS amount,
         COALESCE(p.paid_amount, 0)::double precision AS paid_amount,
         GREATEST(COALESCE(l.amount, 0) - COALESCE(p.paid_amount, 0), 0)::double precision AS outstanding_amount,
         CASE
           WHEN COALESCE(p.paid_amount, 0) >= COALESCE(l.amount, 0) THEN 'Closed'
           WHEN COALESCE(p.paid_amount, 0) > 0 THEN 'Partial'
           ELSE 'Open'
         END AS loan_status,
         COALESCE(l.note, '') AS note
       FROM ims.employee_loans l
       JOIN ims.employees e ON e.emp_id = l.emp_id
       LEFT JOIN paid p ON p.loan_id = l.loan_id
      WHERE l.branch_id = $1
        ${filter}
      ORDER BY l.loan_date DESC, l.loan_id DESC`,
      params
    );
  },

  async getEmployeeLedger(
    branchId: number,
    fromDate: string,
    toDate: string,
    employeeId?: number
  ): Promise<EmployeeLedgerRow[]> {
    const params: Array<number | string> = [branchId, fromDate, toDate];
    let filter = '';
    if (employeeId) {
      params.push(employeeId);
      filter = `AND e.emp_id = $${params.length}`;
    }

    return queryMany<EmployeeLedgerRow>(
      `WITH ledger_rows AS (
         SELECT
           pr.period_from::timestamp AS entry_date,
           e.emp_id AS employee_id,
           e.full_name AS employee_name,
           'PAYROLL_CHARGE'::text AS entry_type,
           'payroll_lines'::text AS ref_table,
           pl.payroll_line_id AS ref_id,
           0::double precision AS amount_in,
           COALESCE(pl.net_salary, 0)::double precision AS amount_out,
           COALESCE(pl.note, '') AS note
         FROM ims.payroll_lines pl
         JOIN ims.payroll_runs pr ON pr.payroll_id = pl.payroll_id
         JOIN ims.employees e ON e.emp_id = pl.emp_id
        WHERE pr.branch_id = $1
          AND pr.period_from::date BETWEEN $2::date AND $3::date
          ${filter}

         UNION ALL

         SELECT
           ep.pay_date AS entry_date,
           e.emp_id AS employee_id,
           e.full_name AS employee_name,
           'SALARY_PAYMENT'::text AS entry_type,
           'employee_payments'::text AS ref_table,
           ep.emp_payment_id AS ref_id,
           0::double precision AS amount_in,
           COALESCE(ep.amount_paid, 0)::double precision AS amount_out,
           COALESCE(ep.note, '') AS note
         FROM ims.employee_payments ep
         JOIN ims.employees e ON e.emp_id = ep.emp_id
        WHERE ep.branch_id = $1
          AND ep.pay_date::date BETWEEN $2::date AND $3::date
          ${filter}

         UNION ALL

         SELECT
           l.loan_date::timestamp AS entry_date,
           e.emp_id AS employee_id,
           e.full_name AS employee_name,
           'LOAN_ISSUED'::text AS entry_type,
           'employee_loans'::text AS ref_table,
           l.loan_id AS ref_id,
           0::double precision AS amount_in,
           COALESCE(l.amount, 0)::double precision AS amount_out,
           COALESCE(l.note, '') AS note
         FROM ims.employee_loans l
         JOIN ims.employees e ON e.emp_id = l.emp_id
        WHERE l.branch_id = $1
          AND l.loan_date BETWEEN $2::date AND $3::date
          ${filter}

         UNION ALL

         SELECT
           lp.pay_date AS entry_date,
           e.emp_id AS employee_id,
           e.full_name AS employee_name,
           'LOAN_PAYMENT'::text AS entry_type,
           'loan_payments'::text AS ref_table,
           lp.loan_payment_id AS ref_id,
           COALESCE(lp.amount_paid, 0)::double precision AS amount_in,
           0::double precision AS amount_out,
           COALESCE(lp.note, '') AS note
         FROM ims.loan_payments lp
         JOIN ims.employee_loans l ON l.loan_id = lp.loan_id
         JOIN ims.employees e ON e.emp_id = l.emp_id
        WHERE lp.branch_id = $1
          AND lp.pay_date::date BETWEEN $2::date AND $3::date
          ${filter}
       )
       SELECT
         ROW_NUMBER() OVER (ORDER BY lr.entry_date DESC, lr.ref_id DESC)::bigint AS entry_no,
         lr.entry_date::text AS entry_date,
         lr.employee_id,
         lr.employee_name,
         lr.entry_type,
         lr.ref_table,
         lr.ref_id,
         COALESCE(lr.amount_in, 0)::double precision AS amount_in,
         COALESCE(lr.amount_out, 0)::double precision AS amount_out,
         (COALESCE(lr.amount_in, 0) - COALESCE(lr.amount_out, 0))::double precision AS net_amount,
         SUM(COALESCE(lr.amount_in, 0) - COALESCE(lr.amount_out, 0))
           OVER (
             PARTITION BY lr.employee_id
             ORDER BY lr.entry_date, lr.ref_id
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           )::double precision AS running_balance,
         COALESCE(lr.note, '') AS note
       FROM ledger_rows lr
      ORDER BY lr.entry_date DESC, lr.ref_id DESC
      LIMIT 5000`,
      params
    );
  },

  async getPayrollByMonth(branchId: number, fromDate: string, toDate: string): Promise<PayrollByMonthRow[]> {
    return queryMany<PayrollByMonthRow>(
      `WITH payroll_totals AS (
         SELECT
           pr.payroll_id,
           pr.period_year,
           pr.period_month,
           COUNT(pl.payroll_line_id)::int AS employees_count,
           COALESCE(SUM(pl.net_salary), 0)::double precision AS total_net
         FROM ims.payroll_runs pr
         LEFT JOIN ims.payroll_lines pl ON pl.payroll_id = pr.payroll_id
        WHERE pr.branch_id = $1
          AND pr.period_from::date BETWEEN $2::date AND $3::date
        GROUP BY pr.payroll_id, pr.period_year, pr.period_month
       ),
       paid AS (
         SELECT
           ep.payroll_id,
           COALESCE(SUM(ep.amount_paid), 0)::double precision AS total_paid
         FROM ims.employee_payments ep
         GROUP BY ep.payroll_id
       )
       SELECT
         pt.period_year,
         pt.period_month,
         COUNT(pt.payroll_id)::int AS payroll_runs,
         COALESCE(SUM(pt.employees_count), 0)::int AS employees_count,
         COALESCE(SUM(pt.total_net), 0)::double precision AS total_net,
         COALESCE(SUM(COALESCE(p.total_paid, 0)), 0)::double precision AS total_paid,
         GREATEST(
           COALESCE(SUM(pt.total_net), 0) - COALESCE(SUM(COALESCE(p.total_paid, 0)), 0),
           0
         )::double precision AS outstanding_amount
       FROM payroll_totals pt
       LEFT JOIN paid p ON p.payroll_id = pt.payroll_id
      GROUP BY pt.period_year, pt.period_month
      ORDER BY pt.period_year DESC, pt.period_month DESC`,
      [branchId, fromDate, toDate]
    );
  },

  async getEmployeeCountByDepartment(branchId: number): Promise<EmployeeCountByDepartmentRow[]> {
    return queryMany<EmployeeCountByDepartmentRow>(
      `SELECT
         COALESCE(r.role_name, 'Unassigned') AS department,
         COUNT(*)::int AS total_employees,
         COUNT(*) FILTER (WHERE e.status = 'active')::int AS active_employees,
         COUNT(*) FILTER (WHERE e.status <> 'active')::int AS inactive_employees,
         COALESCE(SUM(e.salary_amount), 0)::double precision AS total_salary_amount
       FROM ims.employees e
       LEFT JOIN ims.roles r ON r.role_id = COALESCE(e.role_id, (SELECT u.role_id FROM ims.users u WHERE u.user_id = e.user_id))
      WHERE e.branch_id = $1
      GROUP BY COALESCE(r.role_name, 'Unassigned')
      ORDER BY total_employees DESC, department`,
      [branchId]
    );
  },
};
