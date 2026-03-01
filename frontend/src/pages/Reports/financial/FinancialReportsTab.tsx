import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn } from '../../../components/reports/ReportModal';
import { financialReportsService } from '../../../services/reports/financialReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, toRecordRows, defaultReportRange } from '../reportUtils';

type FinancialCardId =
  | 'income-statement'
  | 'balance-sheet'
  | 'cash-flow'
  | 'account-balances'
  | 'expense-summary'
  | 'customer-receipts'
  | 'supplier-payments'
  | 'accounts-receivable'
  | 'accounts-payable'
  | 'account-statement'
  | 'trial-balance';

const financialCards: Array<{ id: FinancialCardId; title: string; hint: string }> = [
  { id: 'income-statement', title: 'Income Statement', hint: 'Between two dates' },
  { id: 'balance-sheet', title: 'Balance Sheet', hint: 'As of selected date' },
  { id: 'cash-flow', title: 'Cash Flow Statement', hint: 'Between two dates' },
  { id: 'account-balances', title: 'Account Balances', hint: 'Dropdown + Show / All' },
  { id: 'expense-summary', title: 'Expense Summary', hint: 'Between two dates' },
  { id: 'customer-receipts', title: 'Customer Receipts', hint: 'Date range + Show / All' },
  { id: 'supplier-payments', title: 'Supplier Payments', hint: 'Date range + Show / All' },
  { id: 'accounts-receivable', title: 'Accounts Receivable', hint: 'Between two dates' },
  { id: 'accounts-payable', title: 'Accounts Payable', hint: 'Between two dates' },
  { id: 'account-statement', title: 'Account Statement', hint: 'Date range + Show / All' },
  { id: 'trial-balance', title: 'Trial Balance', hint: 'Between two dates' },
];

const statementColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'section', header: 'Section' },
  { key: 'line_item', header: 'Line Item' },
  { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
];

const accountBalanceColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'account_id', header: 'Account #' },
  { key: 'account_name', header: 'Account' },
  { key: 'institution', header: 'Institution' },
  { key: 'current_balance', header: 'Current Balance', align: 'right', render: (row) => formatCurrency(row.current_balance) },
  { key: 'last_transaction_date', header: 'Last Transaction', render: (row) => formatDateTime(row.last_transaction_date) },
];

const expenseSummaryColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'exp_id', header: 'Expense #' },
  { key: 'expense_name', header: 'Expense Name' },
  { key: 'charges_count', header: 'Charges', align: 'right' },
  { key: 'total_charged', header: 'Total Charged', align: 'right', render: (row) => formatCurrency(row.total_charged) },
  { key: 'total_paid', header: 'Total Paid', align: 'right', render: (row) => formatCurrency(row.total_paid) },
  { key: 'outstanding_amount', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_amount) },
  { key: 'last_charge_date', header: 'Last Charge', render: (row) => formatDateTime(row.last_charge_date) },
];

const customerReceiptsColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'receipt_id', header: 'Receipt #' },
  { key: 'receipt_date', header: 'Date', render: (row) => formatDateTime(row.receipt_date) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'sale_id', header: 'Sale #' },
  { key: 'account_name', header: 'Account' },
  { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
  { key: 'payment_method', header: 'Method' },
  { key: 'reference_no', header: 'Reference' },
  { key: 'note', header: 'Note' },
];

const supplierPaymentsColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sup_payment_id', header: 'Payment #' },
  { key: 'pay_date', header: 'Date', render: (row) => formatDateTime(row.pay_date) },
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'account_name', header: 'Account' },
  { key: 'amount_paid', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount_paid) },
  { key: 'reference_no', header: 'Reference' },
  { key: 'note', header: 'Note' },
];

const accountsReceivableColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_name', header: 'Customer' },
  { key: 'invoice_no', header: 'Invoice #' },
  { key: 'invoice_date', header: 'Invoice Date', render: (row) => formatDateOnly(row.invoice_date) },
  { key: 'due_date', header: 'Due Date', render: (row) => formatDateOnly(row.due_date) },
  { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
  { key: 'paid', header: 'Paid', align: 'right', render: (row) => formatCurrency(row.paid) },
  { key: 'balance', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.balance) },
  { key: 'status', header: 'Status' },
];

const accountsPayableColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'bill_no', header: 'Bill #' },
  { key: 'bill_date', header: 'Bill Date', render: (row) => formatDateOnly(row.bill_date) },
  { key: 'due_date', header: 'Due Date', render: (row) => formatDateOnly(row.due_date) },
  { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
  { key: 'paid', header: 'Paid', align: 'right', render: (row) => formatCurrency(row.paid) },
  { key: 'balance', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.balance) },
  { key: 'status', header: 'Status' },
];

const accountStatementColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'txn_id', header: 'Txn #' },
  { key: 'txn_date', header: 'Date', render: (row) => formatDateTime(row.txn_date) },
  { key: 'account_name', header: 'Account' },
  { key: 'txn_type', header: 'Type' },
  { key: 'ref_table', header: 'Ref Table' },
  { key: 'ref_id', header: 'Ref Id' },
  { key: 'debit', header: 'Debit', align: 'right', render: (row) => formatCurrency(row.debit) },
  { key: 'credit', header: 'Credit', align: 'right', render: (row) => formatCurrency(row.credit) },
  { key: 'running_balance', header: 'Running Balance', align: 'right', render: (row) => formatCurrency(row.running_balance) },
  { key: 'note', header: 'Note' },
];

const trialBalanceColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'account_name', header: 'Account' },
  { key: 'opening_debit', header: 'Opening DR', align: 'right', render: (row) => formatCurrency(row.opening_debit) },
  { key: 'opening_credit', header: 'Opening CR', align: 'right', render: (row) => formatCurrency(row.opening_credit) },
  { key: 'period_debit', header: 'Period DR', align: 'right', render: (row) => formatCurrency(row.period_debit) },
  { key: 'period_credit', header: 'Period CR', align: 'right', render: (row) => formatCurrency(row.period_credit) },
  { key: 'closing_debit', header: 'Closing DR', align: 'right', render: (row) => formatCurrency(row.closing_debit) },
  { key: 'closing_credit', header: 'Closing CR', align: 'right', render: (row) => formatCurrency(row.closing_credit) },
];

type Props = {
  onOpenModal: (report: ModalReportState) => void;
};

export function FinancialReportsTab({ onOpenModal }: Props) {
  const [expandedCardKey, setExpandedCardKey] = useState<string | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<FinancialCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [incomeRange, setIncomeRange] = useState<DateRange>(defaultReportRange());
  const [cashFlowRange, setCashFlowRange] = useState<DateRange>(defaultReportRange());
  const [balanceRange, setBalanceRange] = useState<DateRange>(defaultReportRange());
  const [expenseRange, setExpenseRange] = useState<DateRange>(defaultReportRange());
  const [customerRange, setCustomerRange] = useState<DateRange>(defaultReportRange());
  const [supplierRange, setSupplierRange] = useState<DateRange>(defaultReportRange());
  const [receivableRange, setReceivableRange] = useState<DateRange>(defaultReportRange());
  const [payableRange, setPayableRange] = useState<DateRange>(defaultReportRange());
  const [statementRange, setStatementRange] = useState<DateRange>(defaultReportRange());
  const [trialBalanceRange, setTrialBalanceRange] = useState<DateRange>(defaultReportRange());
  const [selectedAccountBalanceId, setSelectedAccountBalanceId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedAccountStatementId, setSelectedAccountStatementId] = useState('');

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [accounts, setAccounts] = useState<Array<{ id: number; label: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: number; label: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; label: string }>>([]);

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');

    financialReportsService
      .getFinancialOptions()
      .then((response) => {
        if (!alive) return;
        if (!response.success || !response.data) {
          setOptionsError(response.error || response.message || 'Failed to load financial options');
          return;
        }
        setAccounts(response.data.accounts || []);
        setCustomers(response.data.customers || []);
        setSuppliers(response.data.suppliers || []);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load financial options');
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const selectedAccountBalanceLabel = useMemo(
    () => accounts.find((option) => String(option.id) === selectedAccountBalanceId)?.label || '',
    [accounts, selectedAccountBalanceId]
  );
  const selectedCustomerLabel = useMemo(
    () => customers.find((option) => String(option.id) === selectedCustomerId)?.label || '',
    [customers, selectedCustomerId]
  );
  const selectedSupplierLabel = useMemo(
    () => suppliers.find((option) => String(option.id) === selectedSupplierId)?.label || '',
    [suppliers, selectedSupplierId]
  );
  const selectedAccountStatementLabel = useMemo(
    () => accounts.find((option) => String(option.id) === selectedAccountStatementId)?.label || '',
    [accounts, selectedAccountStatementId]
  );

  const runCardAction = async (cardId: FinancialCardId, action: () => Promise<void>) => {
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

  const handleIncomeStatement = () =>
    runCardAction('income-statement', async () => {
      ensureRangeValid(incomeRange, 'Income Statement');
      const response = await financialReportsService.getIncomeStatement(incomeRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load income statement');
      onOpenModal({
        title: 'Income Statement',
        subtitle: `${formatDateOnly(incomeRange.fromDate)} - ${formatDateOnly(incomeRange.toDate)}`,
        fileName: 'income-statement',
        data: toRecordRows(response.data.rows || []),
        columns: statementColumns,
        filters: { 'From Date': incomeRange.fromDate, 'To Date': incomeRange.toDate },
      });
    });

  const handleBalanceSheet = () =>
    runCardAction('balance-sheet', async () => {
      ensureRangeValid(balanceRange, 'Balance Sheet');
      const asOfDate = balanceRange.toDate;
      const response = await financialReportsService.getBalanceSheet({ asOfDate });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load balance sheet');
      onOpenModal({
        title: 'Balance Sheet',
        subtitle: `${formatDateOnly(balanceRange.fromDate)} - ${formatDateOnly(balanceRange.toDate)}`,
        fileName: 'balance-sheet',
        data: toRecordRows(response.data.rows || []),
        columns: statementColumns,
        filters: { 'From Date': balanceRange.fromDate, 'To Date': balanceRange.toDate, 'As Of Date': asOfDate },
      });
    });

  const handleCashFlow = () =>
    runCardAction('cash-flow', async () => {
      ensureRangeValid(cashFlowRange, 'Cash Flow Statement');
      const response = await financialReportsService.getCashFlowStatement(cashFlowRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load cash flow statement');
      const rows = toRecordRows(response.data.rows || []);
      const totalAmount = sumNumericField(rows, 'amount');
      onOpenModal({
        title: 'Cash Flow Statement',
        subtitle: `${formatDateOnly(cashFlowRange.fromDate)} - ${formatDateOnly(cashFlowRange.toDate)}`,
        fileName: 'cash-flow-statement',
        data: rows,
        columns: statementColumns,
        filters: { 'From Date': cashFlowRange.fromDate, 'To Date': cashFlowRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            amount: formatCurrency(totalAmount),
          },
        },
      });
    });

  const handleAccountBalances = (mode: 'show' | 'all') =>
    runCardAction('account-balances', async () => {
      const accountId = mode === 'show' ? Number(selectedAccountBalanceId || 0) : undefined;
      if (mode === 'show' && !accountId) throw new Error('Select an account first');
      const response = await financialReportsService.getAccountBalances({ mode, accountId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load account balances');
      const rows = toRecordRows(response.data.rows || []);
      const totalCurrentBalance = rows.reduce((sum, row) => sum + Number(row.current_balance || 0), 0);
      onOpenModal({
        title: 'Account Balances',
        subtitle: mode === 'show' ? selectedAccountBalanceLabel || 'Selected Account' : 'All Accounts',
        fileName: 'account-balances',
        data: rows,
        columns: accountBalanceColumns,
        totals: [
          {
            label: mode === 'show' ? 'Selected Account Balance' : 'Total Current Balance',
            value: formatCurrency(totalCurrentBalance),
          },
        ],
        tableTotals: {
          label: 'Total',
          values: {
            current_balance: formatCurrency(totalCurrentBalance),
          },
        },
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Account: mode === 'show' ? selectedAccountBalanceLabel || 'Selected Account' : 'All Accounts',
        },
      });
    });

  const handleExpenseSummary = () =>
    runCardAction('expense-summary', async () => {
      ensureRangeValid(expenseRange, 'Expense Summary');
      const response = await financialReportsService.getExpenseSummary(expenseRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load expense summary');
      const rows = toRecordRows(response.data.rows || []);
      const totalCharges = sumNumericField(rows, 'charges_count');
      const totalCharged = sumNumericField(rows, 'total_charged');
      const totalPaid = sumNumericField(rows, 'total_paid');
      const totalOutstanding = sumNumericField(rows, 'outstanding_amount');
      onOpenModal({
        title: 'Expense Summary',
        subtitle: `${formatDateOnly(expenseRange.fromDate)} - ${formatDateOnly(expenseRange.toDate)}`,
        fileName: 'expense-summary',
        data: rows,
        columns: expenseSummaryColumns,
        tableTotals: {
          label: 'Total',
          values: {
            charges_count: totalCharges.toLocaleString(),
            total_charged: formatCurrency(totalCharged),
            total_paid: formatCurrency(totalPaid),
            outstanding_amount: formatCurrency(totalOutstanding),
          },
        },
        filters: { 'From Date': expenseRange.fromDate, 'To Date': expenseRange.toDate },
      });
    });

  const handleCustomerReceipts = (mode: 'show' | 'all') =>
    runCardAction('customer-receipts', async () => {
      ensureRangeValid(customerRange, 'Customer Receipts');
      const customerId = mode === 'show' ? Number(selectedCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await financialReportsService.getCustomerReceipts({
        fromDate: customerRange.fromDate,
        toDate: customerRange.toDate,
        mode,
        customerId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load customer receipts');
      const rows = toRecordRows(response.data.rows || []);
      const totalAmount = sumNumericField(rows, 'amount');
      onOpenModal({
        title: 'Customer Receipts',
        subtitle: `${formatDateOnly(customerRange.fromDate)} - ${formatDateOnly(customerRange.toDate)}`,
        fileName: 'customer-receipts',
        data: rows,
        columns: customerReceiptsColumns,
        tableTotals: {
          label: 'Total',
          values: {
            amount: formatCurrency(totalAmount),
          },
        },
        filters: {
          'From Date': customerRange.fromDate,
          'To Date': customerRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Customer: mode === 'show' ? selectedCustomerLabel || 'Selected Customer' : 'All Customers',
        },
      });
    });

  const handleSupplierPayments = (mode: 'show' | 'all') =>
    runCardAction('supplier-payments', async () => {
      ensureRangeValid(supplierRange, 'Supplier Payments');
      const supplierId = mode === 'show' ? Number(selectedSupplierId || 0) : undefined;
      if (mode === 'show' && !supplierId) throw new Error('Select a supplier first');
      const response = await financialReportsService.getSupplierPayments({
        fromDate: supplierRange.fromDate,
        toDate: supplierRange.toDate,
        mode,
        supplierId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load supplier payments');
      const rows = toRecordRows(response.data.rows || []);
      const totalAmount = sumNumericField(rows, 'amount_paid');
      onOpenModal({
        title: 'Supplier Payments',
        subtitle: `${formatDateOnly(supplierRange.fromDate)} - ${formatDateOnly(supplierRange.toDate)}`,
        fileName: 'supplier-payments',
        data: rows,
        columns: supplierPaymentsColumns,
        tableTotals: {
          label: 'Total',
          values: {
            amount_paid: formatCurrency(totalAmount),
          },
        },
        filters: {
          'From Date': supplierRange.fromDate,
          'To Date': supplierRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Supplier: mode === 'show' ? selectedSupplierLabel || 'Selected Supplier' : 'All Suppliers',
        },
      });
    });

  const handleAccountStatement = (mode: 'show' | 'all') =>
    runCardAction('account-statement', async () => {
      ensureRangeValid(statementRange, 'Account Statement');
      const accountId = mode === 'show' ? Number(selectedAccountStatementId || 0) : undefined;
      if (mode === 'show' && !accountId) throw new Error('Select an account first');
      const response = await financialReportsService.getAccountStatement({
        fromDate: statementRange.fromDate,
        toDate: statementRange.toDate,
        mode,
        accountId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load account statement');
      const rows = toRecordRows(response.data.rows || []);
      const totalDebit = sumNumericField(rows, 'debit');
      const totalCredit = sumNumericField(rows, 'credit');
      const closingBalance = rows.length > 0 ? Number(rows[rows.length - 1].running_balance || 0) : 0;
      onOpenModal({
        title: 'Account Statement',
        subtitle: `${formatDateOnly(statementRange.fromDate)} - ${formatDateOnly(statementRange.toDate)}`,
        fileName: 'account-statement',
        data: rows,
        columns: accountStatementColumns,
        tableTotals: {
          label: 'Total',
          values: {
            debit: formatCurrency(totalDebit),
            credit: formatCurrency(totalCredit),
            running_balance: formatCurrency(closingBalance),
          },
        },
        filters: {
          'From Date': statementRange.fromDate,
          'To Date': statementRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Account: mode === 'show' ? selectedAccountStatementLabel || 'Selected Account' : 'All Accounts',
        },
      });
    });

  const handleTrialBalance = () =>
    runCardAction('trial-balance', async () => {
      ensureRangeValid(trialBalanceRange, 'Trial Balance');
      const response = await financialReportsService.getTrialBalance({
        fromDate: trialBalanceRange.fromDate,
        toDate: trialBalanceRange.toDate,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load trial balance');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Trial Balance',
        subtitle: `${formatDateOnly(trialBalanceRange.fromDate)} - ${formatDateOnly(trialBalanceRange.toDate)}`,
        fileName: 'trial-balance',
        data: rows,
        columns: trialBalanceColumns,
        tableTotals: {
          label: 'Total',
          values: {
            opening_debit: formatCurrency(sumNumericField(rows, 'opening_debit')),
            opening_credit: formatCurrency(sumNumericField(rows, 'opening_credit')),
            period_debit: formatCurrency(sumNumericField(rows, 'period_debit')),
            period_credit: formatCurrency(sumNumericField(rows, 'period_credit')),
            closing_debit: formatCurrency(sumNumericField(rows, 'closing_debit')),
            closing_credit: formatCurrency(sumNumericField(rows, 'closing_credit')),
          },
        },
        filters: { 'From Date': trialBalanceRange.fromDate, 'To Date': trialBalanceRange.toDate },
      });
    });

  const handleAccountsReceivable = () =>
    runCardAction('accounts-receivable', async () => {
      ensureRangeValid(receivableRange, 'Accounts Receivable');
      const response = await financialReportsService.getAccountsReceivable({
        fromDate: receivableRange.fromDate,
        toDate: receivableRange.toDate,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load accounts receivable');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Accounts Receivable',
        subtitle: `${formatDateOnly(receivableRange.fromDate)} - ${formatDateOnly(receivableRange.toDate)}`,
        fileName: 'accounts-receivable',
        data: rows,
        columns: accountsReceivableColumns,
        tableTotals: {
          label: 'Total',
          values: {
            amount: formatCurrency(sumNumericField(rows, 'amount')),
            paid: formatCurrency(sumNumericField(rows, 'paid')),
            balance: formatCurrency(sumNumericField(rows, 'balance')),
          },
        },
        filters: { 'From Date': receivableRange.fromDate, 'To Date': receivableRange.toDate },
      });
    });

  const handleAccountsPayable = () =>
    runCardAction('accounts-payable', async () => {
      ensureRangeValid(payableRange, 'Accounts Payable');
      const response = await financialReportsService.getAccountsPayable({
        fromDate: payableRange.fromDate,
        toDate: payableRange.toDate,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load accounts payable');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Accounts Payable',
        subtitle: `${formatDateOnly(payableRange.fromDate)} - ${formatDateOnly(payableRange.toDate)}`,
        fileName: 'accounts-payable',
        data: rows,
        columns: accountsPayableColumns,
        tableTotals: {
          label: 'Total',
          values: {
            amount: formatCurrency(sumNumericField(rows, 'amount')),
            paid: formatCurrency(sumNumericField(rows, 'paid')),
            balance: formatCurrency(sumNumericField(rows, 'balance')),
          },
        },
        filters: { 'From Date': payableRange.fromDate, 'To Date': payableRange.toDate },
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

  const renderCardBody = (cardId: FinancialCardId) => {
    if (cardId === 'income-statement') {
      return (
        <div className="space-y-3">
          {renderDateRange(incomeRange, setIncomeRange)}
          <button
            onClick={handleIncomeStatement}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    if (cardId === 'balance-sheet') {
      return (
        <div className="space-y-3">
          {renderDateRange(balanceRange, setBalanceRange)}
          <button
            onClick={handleBalanceSheet}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    if (cardId === 'cash-flow') {
      return (
        <div className="space-y-3">
          {renderDateRange(cashFlowRange, setCashFlowRange)}
          <button
            onClick={handleCashFlow}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    if (cardId === 'account-balances') {
      return (
        <div className="space-y-3">
          <select
            value={selectedAccountBalanceId}
            onChange={(event) => setSelectedAccountBalanceId(event.target.value)}
            className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
          >
            <option value="">Select Account</option>
            {accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleAccountBalances('show')}
              disabled={loadingCardId === cardId}
              className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Show
            </button>
            <button
              onClick={() => handleAccountBalances('all')}
              disabled={loadingCardId === cardId}
              className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70"
            >
              All
            </button>
          </div>
        </div>
      );
    }

    if (cardId === 'expense-summary') {
      return (
        <div className="space-y-3">
          {renderDateRange(expenseRange, setExpenseRange)}
          <button
            onClick={handleExpenseSummary}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    if (cardId === 'customer-receipts') {
      return (
        <div className="space-y-3">
          {renderDateRange(customerRange, setCustomerRange)}
          <select
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value)}
            className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
          >
            <option value="">Select Customer</option>
            {customers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleCustomerReceipts('show')}
              disabled={loadingCardId === cardId}
              className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Show
            </button>
            <button
              onClick={() => handleCustomerReceipts('all')}
              disabled={loadingCardId === cardId}
              className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70"
            >
              All
            </button>
          </div>
        </div>
      );
    }

    if (cardId === 'supplier-payments') {
      return (
        <div className="space-y-3">
          {renderDateRange(supplierRange, setSupplierRange)}
          <select
            value={selectedSupplierId}
            onChange={(event) => setSelectedSupplierId(event.target.value)}
            className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
          >
            <option value="">Select Supplier</option>
            {suppliers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSupplierPayments('show')}
              disabled={loadingCardId === cardId}
              className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Show
            </button>
            <button
              onClick={() => handleSupplierPayments('all')}
              disabled={loadingCardId === cardId}
              className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70"
            >
              All
            </button>
          </div>
        </div>
      );
    }

    if (cardId === 'account-statement') {
      return (
        <div className="space-y-3">
          {renderDateRange(statementRange, setStatementRange)}
          <select
            value={selectedAccountStatementId}
            onChange={(event) => setSelectedAccountStatementId(event.target.value)}
            className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
          >
            <option value="">Select Account</option>
            {accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleAccountStatement('show')}
              disabled={loadingCardId === cardId}
              className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
            >
              Show
            </button>
            <button
              onClick={() => handleAccountStatement('all')}
              disabled={loadingCardId === cardId}
              className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70"
            >
              All
            </button>
          </div>
        </div>
      );
    }

    if (cardId === 'accounts-receivable') {
      return (
        <div className="space-y-3">
          {renderDateRange(receivableRange, setReceivableRange)}
          <button
            onClick={handleAccountsReceivable}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    if (cardId === 'accounts-payable') {
      return (
        <div className="space-y-3">
          {renderDateRange(payableRange, setPayableRange)}
          <button
            onClick={handleAccountsPayable}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {renderDateRange(trialBalanceRange, setTrialBalanceRange)}
        <button
          onClick={handleTrialBalance}
          disabled={loadingCardId === cardId}
          className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
        >
          Show
        </button>
      </div>
    );
  };

  const renderCard = (card: { id: FinancialCardId; title: string; hint: string }, index: number) => {
    const cardKey = `${card.id}::${index}`;
    const isOpen = expandedCardKey === cardKey;
    return (
      <div key={cardKey} className="self-start overflow-hidden rounded-2xl border border-[#bfd0df] bg-white shadow-[0_8px_18px_rgba(15,79,118,0.08)]">
        <button
          onClick={() => {
            setCardErrors((prev) => ({ ...prev, [card.id]: '' }));
            setExpandedCardKey((prev) => (prev === cardKey ? null : cardKey));
          }}
          className="flex w-full items-center justify-between border-b border-[#d8e4ee] bg-gradient-to-r from-[#0f4f76] to-[#1f6f9f] px-5 py-4 text-left text-white"
        >
          <div>
            <p className="text-xl font-semibold leading-tight">{card.title}</p>
            <p className="mt-1 text-xs font-medium text-white/85">{card.hint}</p>
          </div>
          <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="space-y-3 bg-[#f8fbff] px-5 py-4">
            {renderCardBody(card.id)}
            {cardErrors[card.id] && <p className="text-sm font-semibold text-red-600">{cardErrors[card.id]}</p>}
          </div>
        )}
      </div>
    );
  };

  const indexedCards = financialCards.map((card, index) => ({ card, index }));
  const leftColumnCards = indexedCards.filter(({ index }) => index % 2 === 0);
  const rightColumnCards = indexedCards.filter(({ index }) => index % 2 === 1);

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && (
        <div className="inline-flex items-center gap-2 rounded-md border border-[#b8c8d7] bg-white px-3 py-2 text-sm text-[#38556d]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading accounts, customers, and suppliers...
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

