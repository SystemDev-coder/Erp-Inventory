import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn } from '../../../components/reports/ReportModal';
import { hrReportsService } from '../../../services/reports/hrReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, toRecordRows, defaultReportRange } from '../reportUtils';

type HrCardId =
  | 'employee-list'
  | 'payroll-summary'
  | 'salary-payments'
  | 'payroll-by-month';

const hrCards: Array<{ id: HrCardId; title: string; hint: string }> = [
  { id: 'employee-list', title: 'Employee List', hint: 'Dropdown + Show / All' },
  { id: 'payroll-summary', title: 'Payroll Summary', hint: 'Between two dates' },
  { id: 'salary-payments', title: 'Salary Payments', hint: 'Date range + Show / All' },
  { id: 'payroll-by-month', title: 'Payroll by Month', hint: 'Between two dates' },
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

const payrollByMonthColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'period_year', header: 'Year', align: 'right' },
  { key: 'period_month', header: 'Month', align: 'right' },
  { key: 'payroll_runs', header: 'Runs', align: 'right' },
  { key: 'employees_count', header: 'Employees', align: 'right' },
  { key: 'total_net', header: 'Total Net', align: 'right', render: (row) => formatCurrency(row.total_net) },
  { key: 'total_paid', header: 'Total Paid', align: 'right', render: (row) => formatCurrency(row.total_paid) },
  { key: 'outstanding_amount', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_amount) },
];

type Props = {
  onOpenModal: (report: ModalReportState) => void;
};

export function HrReportsTab({ onOpenModal }: Props) {
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<HrCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [employees, setEmployees] = useState<Array<{ id: number; label: string }>>([]);

  const [selectedEmployeeListId, setSelectedEmployeeListId] = useState('');
  const [selectedSalaryEmployeeId, setSelectedSalaryEmployeeId] = useState('');

  const [payrollSummaryRange, setPayrollSummaryRange] = useState<DateRange>(defaultReportRange());
  const [salaryPaymentsRange, setSalaryPaymentsRange] = useState<DateRange>(defaultReportRange());
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

  const renderDateRange = (range: DateRange, onChange: (next: DateRange) => void) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-semibold text-slate-600">
        <span>From Date</span>
        <input
          type="date"
          value={range.fromDate}
          onChange={(event) => onChange({ ...range, fromDate: event.target.value })}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
        />
      </label>
      <label className="space-y-1 text-xs font-semibold text-slate-600">
        <span>To Date</span>
        <input
          type="date"
          value={range.toDate}
          onChange={(event) => onChange({ ...range, toDate: event.target.value })}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
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
      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
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
        className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        Show
      </button>
      <button
        onClick={onAll}
        disabled={loadingCardId === cardId}
        className="rounded-md border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-70"
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
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
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

    if (cardId === 'payroll-by-month') {
      return (
        <div className="space-y-3">
          {renderDateRange(payrollByMonthRange, setPayrollByMonthRange)}
          <button
            onClick={handlePayrollByMonth}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    return null;
  };

  const renderCard = (card: { id: HrCardId; title: string; hint: string }, index: number) => {
    const cardKey = `${card.id}::${index}`;
    const isOpen = expandedCardKey === cardKey;
    return (
      <div key={cardKey} className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
        <button
          onClick={() => {
            setCardErrors((prev) => ({ ...prev, [card.id]: '' }));
            setExpandedCardKey((prev) => (prev === cardKey ? null : cardKey));
          }}
          className="flex w-full items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-left text-white"
        >
          <div>
            <p className="text-xl font-semibold leading-tight">{card.title}</p>
            <p className="mt-1 text-xs font-medium text-white/85">{card.hint}</p>
          </div>
          <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="space-y-3 bg-slate-50 px-5 py-4">
            {renderCardBody(card.id)}
            {cardErrors[card.id] && <p className="text-sm font-semibold text-red-600">{cardErrors[card.id]}</p>}
          </div>
        )}
      </div>
    );
  };

  const indexedCards = hrCards.map((card, index) => ({ card, index }));
  const leftColumnCards = indexedCards.filter(({ index }) => index % 2 === 0);
  const rightColumnCards = indexedCards.filter(({ index }) => index % 2 === 1);

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && (
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading employee options...
        </div>
      )}
      <div className="space-y-3 lg:hidden">
        {indexedCards.map(({ card, index }) => renderCard(card, index))}
      </div>
      <div className="hidden items-start gap-3 lg:grid lg:grid-cols-2">
        <div className="space-y-3">
          {leftColumnCards.map(({ card, index }) => renderCard(card, index))}
        </div>
        <div className="space-y-3">
          {rightColumnCards.map(({ card, index }) => renderCard(card, index))}
        </div>
      </div>
    </div>
  );
}


