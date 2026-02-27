import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn } from '../../../components/reports/ReportModal';
import { hrReportsService } from '../../../services/reports/hrReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, toRecordRows, todayDate, defaultReportRange } from '../reportUtils';

type HrCardId =
  | 'employee-list'
  | 'payroll-summary'
  | 'salary-payments'
  | 'employee-attendance'
  | 'loan-balances'
  | 'employee-ledger'
  | 'payroll-by-month'
  | 'employee-count-by-department';

const hrCards: Array<{ id: HrCardId; title: string; hint: string }> = [
  { id: 'employee-list', title: 'Employee List', hint: 'Dropdown + Show / All' },
  { id: 'payroll-summary', title: 'Payroll Summary', hint: 'Between two dates' },
  { id: 'salary-payments', title: 'Salary Payments', hint: 'Date range + Show / All' },
  { id: 'employee-attendance', title: 'Employee Attendance', hint: 'Date range + Show / All' },
  { id: 'loan-balances', title: 'Loan Balances', hint: 'Dropdown + Show / All' },
  { id: 'employee-ledger', title: 'Employee Ledger', hint: 'Date range + Show / All' },
  { id: 'payroll-by-month', title: 'Payroll by Month', hint: 'Between two dates' },
  { id: 'employee-count-by-department', title: 'Employee Count by Department', hint: 'Single action report' },
];

const employeeListColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'emp_id', header: 'Emp #' },
  { key: 'full_name', header: 'Employee' },
  { key: 'role_name', header: 'Role / Department' },
  { key: 'phone', header: 'Phone' },
  { key: 'hire_date', header: 'Hire Date' },
  { key: 'salary_type', header: 'Salary Type' },
  { key: 'salary_amount', header: 'Salary Amount', align: 'right', render: (row) => formatCurrency(row.salary_amount) },
  { key: 'shift_type', header: 'Shift' },
  { key: 'status', header: 'Status' },
];

const payrollSummaryColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'payroll_id', header: 'Payroll #' },
  { key: 'period_year', header: 'Year', align: 'right' },
  { key: 'period_month', header: 'Month', align: 'right' },
  { key: 'period_from', header: 'From' },
  { key: 'period_to', header: 'To' },
  { key: 'status', header: 'Status' },
  { key: 'employees_count', header: 'Employees', align: 'right' },
  { key: 'total_basic', header: 'Basic', align: 'right', render: (row) => formatCurrency(row.total_basic) },
  { key: 'total_allowances', header: 'Allowances', align: 'right', render: (row) => formatCurrency(row.total_allowances) },
  { key: 'total_deductions', header: 'Deductions', align: 'right', render: (row) => formatCurrency(row.total_deductions) },
  { key: 'total_net', header: 'Net', align: 'right', render: (row) => formatCurrency(row.total_net) },
  { key: 'total_paid', header: 'Paid', align: 'right', render: (row) => formatCurrency(row.total_paid) },
  { key: 'outstanding_amount', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_amount) },
];

const salaryPaymentsColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'emp_payment_id', header: 'Payment #' },
  { key: 'pay_date', header: 'Pay Date', render: (row) => formatDateTime(row.pay_date) },
  { key: 'employee_name', header: 'Employee' },
  { key: 'payroll_id', header: 'Payroll #' },
  { key: 'period_label', header: 'Period' },
  { key: 'account_name', header: 'Account' },
  { key: 'amount_paid', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount_paid) },
  { key: 'reference_no', header: 'Reference' },
  { key: 'note', header: 'Note' },
];

const attendanceColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'assignment_id', header: 'Assignment #' },
  { key: 'effective_date', header: 'Date' },
  { key: 'employee_name', header: 'Employee' },
  { key: 'role_name', header: 'Role / Department' },
  { key: 'shift_type', header: 'Shift' },
  { key: 'is_active', header: 'Active', render: (row) => (row.is_active ? 'Yes' : 'No') },
  { key: 'employee_status', header: 'Employee Status' },
];

const loanBalancesColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'loan_id', header: 'Loan #' },
  { key: 'loan_date', header: 'Loan Date' },
  { key: 'employee_name', header: 'Employee' },
  { key: 'amount', header: 'Loan Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
  { key: 'paid_amount', header: 'Paid Amount', align: 'right', render: (row) => formatCurrency(row.paid_amount) },
  { key: 'outstanding_amount', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_amount) },
  { key: 'loan_status', header: 'Status' },
  { key: 'note', header: 'Note' },
];

const employeeLedgerColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'entry_no', header: 'Entry #' },
  { key: 'entry_date', header: 'Date', render: (row) => formatDateTime(row.entry_date) },
  { key: 'employee_name', header: 'Employee' },
  { key: 'entry_type', header: 'Type' },
  { key: 'ref_table', header: 'Ref Table' },
  { key: 'ref_id', header: 'Ref Id' },
  { key: 'amount_in', header: 'In', align: 'right', render: (row) => formatCurrency(row.amount_in) },
  { key: 'amount_out', header: 'Out', align: 'right', render: (row) => formatCurrency(row.amount_out) },
  { key: 'net_amount', header: 'Net', align: 'right', render: (row) => formatCurrency(row.net_amount) },
  { key: 'running_balance', header: 'Running', align: 'right', render: (row) => formatCurrency(row.running_balance) },
  { key: 'note', header: 'Note' },
];

const payrollByMonthColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'period_year', header: 'Year', align: 'right' },
  { key: 'period_month', header: 'Month', align: 'right' },
  { key: 'payroll_runs', header: 'Runs', align: 'right' },
  { key: 'employees_count', header: 'Employees', align: 'right' },
  { key: 'total_net', header: 'Total Net', align: 'right', render: (row) => formatCurrency(row.total_net) },
  { key: 'total_paid', header: 'Total Paid', align: 'right', render: (row) => formatCurrency(row.total_paid) },
  { key: 'outstanding_amount', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_amount) },
];

const employeeCountByDepartmentColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'department', header: 'Department' },
  { key: 'total_employees', header: 'Total Employees', align: 'right' },
  { key: 'active_employees', header: 'Active', align: 'right' },
  { key: 'inactive_employees', header: 'Inactive', align: 'right' },
  { key: 'total_salary_amount', header: 'Total Salary Amount', align: 'right', render: (row) => formatCurrency(row.total_salary_amount) },
];

type Props = {
  onOpenModal: (report: ModalReportState) => void;
};

export function HrReportsTab({ onOpenModal }: Props) {
  const [expandedCardId, setExpandedCardId] = useState<HrCardId | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<HrCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [employees, setEmployees] = useState<Array<{ id: number; label: string }>>([]);

  const [selectedEmployeeListId, setSelectedEmployeeListId] = useState('');
  const [selectedSalaryEmployeeId, setSelectedSalaryEmployeeId] = useState('');
  const [selectedAttendanceEmployeeId, setSelectedAttendanceEmployeeId] = useState('');
  const [selectedLoanEmployeeId, setSelectedLoanEmployeeId] = useState('');
  const [selectedLedgerEmployeeId, setSelectedLedgerEmployeeId] = useState('');

  const [payrollSummaryRange, setPayrollSummaryRange] = useState<DateRange>(defaultReportRange());
  const [salaryPaymentsRange, setSalaryPaymentsRange] = useState<DateRange>(defaultReportRange());
  const [attendanceRange, setAttendanceRange] = useState<DateRange>(defaultReportRange());
  const [ledgerRange, setLedgerRange] = useState<DateRange>(defaultReportRange());
  const [payrollByMonthRange, setPayrollByMonthRange] = useState<DateRange>(defaultReportRange());

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');

    hrReportsService
      .getHrOptions()
      .then((response) => {
        if (!alive) return;
        if (!response.success || !response.data) {
          setOptionsError(response.error || response.message || 'Failed to load HR options');
          return;
        }
        setEmployees(response.data.employees || []);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load HR options');
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const selectedEmployeeListLabel = useMemo(
    () => employees.find((option) => String(option.id) === selectedEmployeeListId)?.label || '',
    [employees, selectedEmployeeListId]
  );
  const selectedSalaryEmployeeLabel = useMemo(
    () => employees.find((option) => String(option.id) === selectedSalaryEmployeeId)?.label || '',
    [employees, selectedSalaryEmployeeId]
  );
  const selectedAttendanceEmployeeLabel = useMemo(
    () => employees.find((option) => String(option.id) === selectedAttendanceEmployeeId)?.label || '',
    [employees, selectedAttendanceEmployeeId]
  );
  const selectedLoanEmployeeLabel = useMemo(
    () => employees.find((option) => String(option.id) === selectedLoanEmployeeId)?.label || '',
    [employees, selectedLoanEmployeeId]
  );
  const selectedLedgerEmployeeLabel = useMemo(
    () => employees.find((option) => String(option.id) === selectedLedgerEmployeeId)?.label || '',
    [employees, selectedLedgerEmployeeId]
  );

  const runCardAction = async (cardId: HrCardId, action: () => Promise<void>) => {
    setCardErrors((prev) => ({ ...prev, [cardId]: '' }));
    setLoadingCardId(cardId);
    try {
      await action();
    } catch (error) {
      setCardErrors((prev) => ({ ...prev, [cardId]: error instanceof Error ? error.message : 'Failed to load report' }));
    } finally {
      setLoadingCardId(null);
    }
  };

  const ensureRangeValid = (range: DateRange, label: string) => {
    if (!range.fromDate || !range.toDate) throw new Error(`${label}: both start and end date are required`);
    if (range.fromDate > range.toDate) throw new Error(`${label}: start date cannot be after end date`);
  };

  const sumNumericField = (rows: Record<string, unknown>[], field: string) =>
    rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);

  const handleEmployeeList = (mode: 'show' | 'all') =>
    runCardAction('employee-list', async () => {
      const employeeId = mode === 'show' ? Number(selectedEmployeeListId || 0) : undefined;
      if (mode === 'show' && !employeeId) throw new Error('Select an employee first');
      const response = await hrReportsService.getEmployeeList({ mode, employeeId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load employee list');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Employee List',
        subtitle: mode === 'show' ? selectedEmployeeListLabel || 'Selected Employee' : 'All Employees',
        fileName: 'employee-list',
        data: rows,
        columns: employeeListColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Employee: mode === 'show' ? selectedEmployeeListLabel || 'Selected Employee' : 'All Employees',
        },
        tableTotals: {
          label: 'Total',
          values: {
            salary_amount: formatCurrency(sumNumericField(rows, 'salary_amount')),
          },
        },
      });
    });

  const handlePayrollSummary = () =>
    runCardAction('payroll-summary', async () => {
      ensureRangeValid(payrollSummaryRange, 'Payroll Summary');
      const response = await hrReportsService.getPayrollSummary(payrollSummaryRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load payroll summary');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Payroll Summary',
        subtitle: `${formatDateOnly(payrollSummaryRange.fromDate)} - ${formatDateOnly(payrollSummaryRange.toDate)}`,
        fileName: 'payroll-summary',
        data: rows,
        columns: payrollSummaryColumns,
        filters: { 'From Date': payrollSummaryRange.fromDate, 'To Date': payrollSummaryRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            employees_count: sumNumericField(rows, 'employees_count').toLocaleString(),
            total_basic: formatCurrency(sumNumericField(rows, 'total_basic')),
            total_allowances: formatCurrency(sumNumericField(rows, 'total_allowances')),
            total_deductions: formatCurrency(sumNumericField(rows, 'total_deductions')),
            total_net: formatCurrency(sumNumericField(rows, 'total_net')),
            total_paid: formatCurrency(sumNumericField(rows, 'total_paid')),
            outstanding_amount: formatCurrency(sumNumericField(rows, 'outstanding_amount')),
          },
        },
      });
    });

  const handleSalaryPayments = (mode: 'show' | 'all') =>
    runCardAction('salary-payments', async () => {
      ensureRangeValid(salaryPaymentsRange, 'Salary Payments');
      const employeeId = mode === 'show' ? Number(selectedSalaryEmployeeId || 0) : undefined;
      if (mode === 'show' && !employeeId) throw new Error('Select an employee first');
      const response = await hrReportsService.getSalaryPayments({
        fromDate: salaryPaymentsRange.fromDate,
        toDate: salaryPaymentsRange.toDate,
        mode,
        employeeId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load salary payments');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Salary Payments',
        subtitle: `${formatDateOnly(salaryPaymentsRange.fromDate)} - ${formatDateOnly(salaryPaymentsRange.toDate)}`,
        fileName: 'salary-payments',
        data: rows,
        columns: salaryPaymentsColumns,
        filters: {
          'From Date': salaryPaymentsRange.fromDate,
          'To Date': salaryPaymentsRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Employee: mode === 'show' ? selectedSalaryEmployeeLabel || 'Selected Employee' : 'All Employees',
        },
        tableTotals: {
          label: 'Total',
          values: {
            amount_paid: formatCurrency(sumNumericField(rows, 'amount_paid')),
          },
        },
      });
    });

  const handleAttendance = (mode: 'show' | 'all') =>
    runCardAction('employee-attendance', async () => {
      ensureRangeValid(attendanceRange, 'Employee Attendance');
      const employeeId = mode === 'show' ? Number(selectedAttendanceEmployeeId || 0) : undefined;
      if (mode === 'show' && !employeeId) throw new Error('Select an employee first');
      const response = await hrReportsService.getEmployeeAttendance({
        fromDate: attendanceRange.fromDate,
        toDate: attendanceRange.toDate,
        mode,
        employeeId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load employee attendance');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Employee Attendance',
        subtitle: `${formatDateOnly(attendanceRange.fromDate)} - ${formatDateOnly(attendanceRange.toDate)}`,
        fileName: 'employee-attendance',
        data: rows,
        columns: attendanceColumns,
        filters: {
          'From Date': attendanceRange.fromDate,
          'To Date': attendanceRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Employee: mode === 'show' ? selectedAttendanceEmployeeLabel || 'Selected Employee' : 'All Employees',
        },
        tableTotals: {
          label: 'Total',
          values: {
            assignment_id: rows.length.toLocaleString(),
          },
        },
      });
    });

  const handleLoanBalances = (mode: 'show' | 'all') =>
    runCardAction('loan-balances', async () => {
      const employeeId = mode === 'show' ? Number(selectedLoanEmployeeId || 0) : undefined;
      if (mode === 'show' && !employeeId) throw new Error('Select an employee first');
      const response = await hrReportsService.getLoanBalances({ mode, employeeId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load loan balances');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Loan Balances',
        subtitle: mode === 'show' ? selectedLoanEmployeeLabel || 'Selected Employee' : 'All Employees',
        fileName: 'loan-balances',
        data: rows,
        columns: loanBalancesColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Employee: mode === 'show' ? selectedLoanEmployeeLabel || 'Selected Employee' : 'All Employees',
        },
        tableTotals: {
          label: 'Total',
          values: {
            amount: formatCurrency(sumNumericField(rows, 'amount')),
            paid_amount: formatCurrency(sumNumericField(rows, 'paid_amount')),
            outstanding_amount: formatCurrency(sumNumericField(rows, 'outstanding_amount')),
          },
        },
      });
    });

  const handleEmployeeLedger = (mode: 'show' | 'all') =>
    runCardAction('employee-ledger', async () => {
      ensureRangeValid(ledgerRange, 'Employee Ledger');
      const employeeId = mode === 'show' ? Number(selectedLedgerEmployeeId || 0) : undefined;
      if (mode === 'show' && !employeeId) throw new Error('Select an employee first');
      const response = await hrReportsService.getEmployeeLedger({
        fromDate: ledgerRange.fromDate,
        toDate: ledgerRange.toDate,
        mode,
        employeeId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load employee ledger');
      const rows = toRecordRows(response.data.rows || []);
      const closingBalance = rows.length > 0 ? Number(rows[rows.length - 1].running_balance || 0) : 0;
      onOpenModal({
        title: 'Employee Ledger',
        subtitle: `${formatDateOnly(ledgerRange.fromDate)} - ${formatDateOnly(ledgerRange.toDate)}`,
        fileName: 'employee-ledger',
        data: rows,
        columns: employeeLedgerColumns,
        filters: {
          'From Date': ledgerRange.fromDate,
          'To Date': ledgerRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Employee: mode === 'show' ? selectedLedgerEmployeeLabel || 'Selected Employee' : 'All Employees',
        },
        tableTotals: {
          label: 'Total',
          values: {
            amount_in: formatCurrency(sumNumericField(rows, 'amount_in')),
            amount_out: formatCurrency(sumNumericField(rows, 'amount_out')),
            net_amount: formatCurrency(sumNumericField(rows, 'net_amount')),
            running_balance: formatCurrency(closingBalance),
          },
        },
      });
    });

  const handlePayrollByMonth = () =>
    runCardAction('payroll-by-month', async () => {
      ensureRangeValid(payrollByMonthRange, 'Payroll by Month');
      const response = await hrReportsService.getPayrollByMonth(payrollByMonthRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load payroll by month');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Payroll by Month',
        subtitle: `${formatDateOnly(payrollByMonthRange.fromDate)} - ${formatDateOnly(payrollByMonthRange.toDate)}`,
        fileName: 'payroll-by-month',
        data: rows,
        columns: payrollByMonthColumns,
        filters: { 'From Date': payrollByMonthRange.fromDate, 'To Date': payrollByMonthRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            payroll_runs: sumNumericField(rows, 'payroll_runs').toLocaleString(),
            employees_count: sumNumericField(rows, 'employees_count').toLocaleString(),
            total_net: formatCurrency(sumNumericField(rows, 'total_net')),
            total_paid: formatCurrency(sumNumericField(rows, 'total_paid')),
            outstanding_amount: formatCurrency(sumNumericField(rows, 'outstanding_amount')),
          },
        },
      });
    });

  const handleEmployeeCountByDepartment = () =>
    runCardAction('employee-count-by-department', async () => {
      const response = await hrReportsService.getEmployeeCountByDepartment();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load employee count by department');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Employee Count by Department',
        subtitle: 'Current distribution by role/department',
        fileName: 'employee-count-by-department',
        data: rows,
        columns: employeeCountByDepartmentColumns,
        filters: { Scope: 'All Employees' },
        tableTotals: {
          label: 'Total',
          values: {
            total_employees: sumNumericField(rows, 'total_employees').toLocaleString(),
            active_employees: sumNumericField(rows, 'active_employees').toLocaleString(),
            inactive_employees: sumNumericField(rows, 'inactive_employees').toLocaleString(),
            total_salary_amount: formatCurrency(sumNumericField(rows, 'total_salary_amount')),
          },
        },
      });
    });

  const renderDateRange = (range: DateRange, onChange: (next: DateRange) => void) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-semibold text-[#47657f]">
        <span>From Date</span>
        <input
          type="date"
          value={range.fromDate}
          onChange={(event) => onChange({ ...range, fromDate: event.target.value })}
          className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
        />
      </label>
      <label className="space-y-1 text-xs font-semibold text-[#47657f]">
        <span>To Date</span>
        <input
          type="date"
          value={range.toDate}
          onChange={(event) => onChange({ ...range, toDate: event.target.value })}
          className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
        />
      </label>
    </div>
  );

  const renderEmployeeSelector = (
    value: string,
    onChange: (value: string) => void,
    placeholder = 'Select Employee'
  ) => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {employees.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const renderShowAllButtons = (onShow: () => void, onAll: () => void, cardId: HrCardId) => (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={onShow}
        disabled={loadingCardId === cardId}
        className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
      >
        Show
      </button>
      <button
        onClick={onAll}
        disabled={loadingCardId === cardId}
        className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70"
      >
        All
      </button>
    </div>
  );

  const renderCardBody = (cardId: HrCardId) => {
    if (cardId === 'employee-list') {
      return (
        <div className="space-y-3">
          {renderEmployeeSelector(selectedEmployeeListId, setSelectedEmployeeListId)}
          {renderShowAllButtons(() => handleEmployeeList('show'), () => handleEmployeeList('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'payroll-summary') {
      return (
        <div className="space-y-3">
          {renderDateRange(payrollSummaryRange, setPayrollSummaryRange)}
          <button
            onClick={handlePayrollSummary}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    if (cardId === 'salary-payments') {
      return (
        <div className="space-y-3">
          {renderDateRange(salaryPaymentsRange, setSalaryPaymentsRange)}
          {renderEmployeeSelector(selectedSalaryEmployeeId, setSelectedSalaryEmployeeId)}
          {renderShowAllButtons(() => handleSalaryPayments('show'), () => handleSalaryPayments('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'employee-attendance') {
      return (
        <div className="space-y-3">
          {renderDateRange(attendanceRange, setAttendanceRange)}
          {renderEmployeeSelector(selectedAttendanceEmployeeId, setSelectedAttendanceEmployeeId)}
          {renderShowAllButtons(() => handleAttendance('show'), () => handleAttendance('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'loan-balances') {
      return (
        <div className="space-y-3">
          {renderEmployeeSelector(selectedLoanEmployeeId, setSelectedLoanEmployeeId)}
          {renderShowAllButtons(() => handleLoanBalances('show'), () => handleLoanBalances('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'employee-ledger') {
      return (
        <div className="space-y-3">
          {renderDateRange(ledgerRange, setLedgerRange)}
          {renderEmployeeSelector(selectedLedgerEmployeeId, setSelectedLedgerEmployeeId)}
          {renderShowAllButtons(() => handleEmployeeLedger('show'), () => handleEmployeeLedger('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'payroll-by-month') {
      return (
        <div className="space-y-3">
          {renderDateRange(payrollByMonthRange, setPayrollByMonthRange)}
          <button
            onClick={handlePayrollByMonth}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={handleEmployeeCountByDepartment}
        disabled={loadingCardId === cardId}
        className="inline-flex min-w-[220px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
      >
        Show Department Count
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && (
        <div className="inline-flex items-center gap-2 rounded-md border border-[#b8c8d7] bg-white px-3 py-2 text-sm text-[#38556d]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading employee options...
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {hrCards.map((card) => {
          const isOpen = expandedCardId === card.id;
          return (
            <div key={card.id} className="overflow-hidden rounded-md border border-[#aebfd0] bg-white shadow-sm">
              <button
                onClick={() => {
                  setCardErrors((prev) => ({ ...prev, [card.id]: '' }));
                  setExpandedCardId((prev) => (prev === card.id ? null : card.id));
                }}
                className="flex w-full items-center justify-between bg-[#0f4f76] px-5 py-4 text-left text-white"
              >
                <div>
                  <p className="text-xl font-semibold leading-tight">{card.title}</p>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-[#bfd0df] bg-[#f8fafc] px-5 py-4">
                  {renderCardBody(card.id)}
                  {cardErrors[card.id] && <p className="text-sm font-semibold text-red-600">{cardErrors[card.id]}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

