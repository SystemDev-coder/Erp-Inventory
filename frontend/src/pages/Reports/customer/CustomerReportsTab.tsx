import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn, ReportTotalItem } from '../../../components/reports/ReportModal';
import { customerReportsService } from '../../../services/reports/customerReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, toRecordRows, todayDate, defaultReportRange } from '../reportUtils';

type CustomerCardId =
  | 'customer-list'
  | 'customer-ledger'
  | 'outstanding-balances'
  | 'top-customers'
  | 'payment-history'
  | 'credit-customers'
  | 'new-customers'
  | 'customer-activity';

const customerCards: Array<{ id: CustomerCardId; title: string; hint: string }> = [
  { id: 'customer-list', title: 'Customer List', hint: 'Dropdown + Show / All' },
  { id: 'customer-ledger', title: 'Customer Ledger', hint: 'Date range + Show / All' },
  { id: 'outstanding-balances', title: 'Outstanding Balances', hint: 'Dropdown + Show / All' },
  { id: 'top-customers', title: 'Top Customers', hint: 'Between two dates' },
  { id: 'payment-history', title: 'Customer Payment History', hint: 'Date range + Show / All' },
  { id: 'credit-customers', title: 'Credit Customers', hint: 'Dropdown + Show / All' },
  { id: 'new-customers', title: 'New Customers (by date)', hint: 'Between two dates' },
  { id: 'customer-activity', title: 'Customer Activity', hint: 'Date range + Show / All' },
];

const customerListColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_id', header: 'Customer #' },
  { key: 'full_name', header: 'Customer Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'customer_type', header: 'Type' },
  { key: 'registered_date', header: 'Registered Date' },
  { key: 'balance', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.balance) },
  { key: 'status', header: 'Status' },
];

const customerLedgerColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'cust_ledger_id', header: 'Entry #' },
  { key: 'entry_date', header: 'Date', render: (row) => formatDateTime(row.entry_date) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'entry_type', header: 'Type' },
  { key: 'ref_table', header: 'Ref Table' },
  { key: 'ref_id', header: 'Ref Id' },
  { key: 'debit', header: 'Debit', align: 'right', render: (row) => formatCurrency(row.debit) },
  { key: 'credit', header: 'Credit', align: 'right', render: (row) => formatCurrency(row.credit) },
  { key: 'running_balance', header: 'Running Balance', align: 'right', render: (row) => formatCurrency(row.running_balance) },
  { key: 'note', header: 'Note' },
];

const outstandingColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_id', header: 'Customer #' },
  { key: 'customer_name', header: 'Customer' },
  { key: 'phone', header: 'Phone' },
  { key: 'total_debit', header: 'Total Debit', align: 'right', render: (row) => formatCurrency(row.total_debit) },
  { key: 'total_credit', header: 'Total Credit', align: 'right', render: (row) => formatCurrency(row.total_credit) },
  { key: 'outstanding_balance', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_balance) },
];

const topCustomersColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_id', header: 'Customer #' },
  { key: 'customer_name', header: 'Customer' },
  { key: 'sales_count', header: 'Sales Count', align: 'right' },
  { key: 'net_sales', header: 'Net Sales', align: 'right', render: (row) => formatCurrency(row.net_sales) },
  { key: 'total_receipts', header: 'Receipts', align: 'right', render: (row) => formatCurrency(row.total_receipts) },
  { key: 'outstanding_balance', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_balance) },
];

const paymentHistoryColumns: ReportColumn<Record<string, unknown>>[] = [
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

const creditCustomersColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_id', header: 'Customer #' },
  { key: 'customer_name', header: 'Customer' },
  { key: 'phone', header: 'Phone' },
  { key: 'customer_type', header: 'Type' },
  { key: 'current_credit', header: 'Credit Balance', align: 'right', render: (row) => formatCurrency(row.current_credit) },
  { key: 'status', header: 'Status' },
];

const newCustomersColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_id', header: 'Customer #' },
  { key: 'full_name', header: 'Customer' },
  { key: 'phone', header: 'Phone' },
  { key: 'customer_type', header: 'Type' },
  { key: 'registered_date', header: 'Registered Date' },
  { key: 'opening_balance', header: 'Opening Balance', align: 'right', render: (row) => formatCurrency(row.opening_balance) },
  { key: 'current_balance', header: 'Current Balance', align: 'right', render: (row) => formatCurrency(row.current_balance) },
];

const customerActivityColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_id', header: 'Customer #' },
  { key: 'customer_name', header: 'Customer' },
  { key: 'sales_count', header: 'Sales', align: 'right' },
  { key: 'returns_count', header: 'Returns', align: 'right' },
  { key: 'receipts_count', header: 'Receipts', align: 'right' },
  { key: 'gross_sales', header: 'Gross Sales', align: 'right', render: (row) => formatCurrency(row.gross_sales) },
  { key: 'sales_returns', header: 'Sales Returns', align: 'right', render: (row) => formatCurrency(row.sales_returns) },
  { key: 'total_receipts', header: 'Total Receipts', align: 'right', render: (row) => formatCurrency(row.total_receipts) },
  { key: 'net_exposure', header: 'Net Exposure', align: 'right', render: (row) => formatCurrency(row.net_exposure) },
];

type Props = {
  onOpenModal: (report: ModalReportState) => void;
};

const sumByKey = (rows: Record<string, unknown>[], key: string) =>
  rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);

const moneyTotal = (label: string, value: number): ReportTotalItem => ({
  label,
  value: formatCurrency(value),
});

export function CustomerReportsTab({ onOpenModal }: Props) {
  const [expandedCardId, setExpandedCardId] = useState<CustomerCardId | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<CustomerCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: number; label: string }>>([]);

  const [selectedListCustomerId, setSelectedListCustomerId] = useState('');
  const [selectedLedgerCustomerId, setSelectedLedgerCustomerId] = useState('');
  const [selectedOutstandingCustomerId, setSelectedOutstandingCustomerId] = useState('');
  const [selectedPaymentCustomerId, setSelectedPaymentCustomerId] = useState('');
  const [selectedCreditCustomerId, setSelectedCreditCustomerId] = useState('');
  const [selectedActivityCustomerId, setSelectedActivityCustomerId] = useState('');

  const [ledgerRange, setLedgerRange] = useState<DateRange>(defaultReportRange());
  const [topCustomersRange, setTopCustomersRange] = useState<DateRange>(defaultReportRange());
  const [paymentHistoryRange, setPaymentHistoryRange] = useState<DateRange>(defaultReportRange());
  const [newCustomersRange, setNewCustomersRange] = useState<DateRange>(defaultReportRange());
  const [activityRange, setActivityRange] = useState<DateRange>(defaultReportRange());

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');

    customerReportsService
      .getCustomerOptions()
      .then((response) => {
        if (!alive) return;
        if (!response.success || !response.data) {
          setOptionsError(response.error || response.message || 'Failed to load customer options');
          return;
        }
        setCustomers(response.data.customers || []);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load customer options');
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const customerNameById = useMemo(
    () => new Map(customers.map((customer) => [String(customer.id), customer.label])),
    [customers]
  );

  const runCardAction = async (cardId: CustomerCardId, action: () => Promise<void>) => {
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

  const handleCustomerList = (mode: 'show' | 'all') =>
    runCardAction('customer-list', async () => {
      const customerId = mode === 'show' ? Number(selectedListCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await customerReportsService.getCustomerList({ mode, customerId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load customer list');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Customer List',
        subtitle: mode === 'show' ? customerNameById.get(selectedListCustomerId) || 'Selected Customer' : 'All Customers',
        fileName: 'customer-list',
        data: rows,
        columns: customerListColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Customer: mode === 'show' ? customerNameById.get(selectedListCustomerId) || 'Selected Customer' : 'All Customers',
        },
        tableTotals: {
          label: 'Total',
          values: {
            balance: formatCurrency(sumByKey(rows, 'balance')),
          },
        },
        totals: [moneyTotal('Total Balance', sumByKey(rows, 'balance'))],
      });
    });

  const handleCustomerLedger = (mode: 'show' | 'all') =>
    runCardAction('customer-ledger', async () => {
      ensureRangeValid(ledgerRange, 'Customer Ledger');
      const customerId = mode === 'show' ? Number(selectedLedgerCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await customerReportsService.getCustomerLedger({
        fromDate: ledgerRange.fromDate,
        toDate: ledgerRange.toDate,
        mode,
        customerId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load customer ledger');
      const rows = toRecordRows(response.data.rows || []);
      const dr = sumByKey(rows, 'debit');
      const cr = sumByKey(rows, 'credit');
      const closingBalance = rows.length > 0 ? Number(rows[rows.length - 1].running_balance || 0) : 0;
      onOpenModal({
        title: 'Customer Ledger',
        subtitle: `${formatDateOnly(ledgerRange.fromDate)} - ${formatDateOnly(ledgerRange.toDate)}`,
        fileName: 'customer-ledger',
        data: rows,
        columns: customerLedgerColumns,
        filters: {
          'From Date': ledgerRange.fromDate,
          'To Date': ledgerRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Customer: mode === 'show' ? customerNameById.get(selectedLedgerCustomerId) || 'Selected Customer' : 'All Customers',
        },
        tableTotals: {
          label: 'Total',
          values: {
            debit: formatCurrency(dr),
            credit: formatCurrency(cr),
            running_balance: formatCurrency(closingBalance),
          },
        },
        totals: [moneyTotal('DR', dr), moneyTotal('CR', cr), moneyTotal('Total', dr - cr)],
      });
    });

  const handleOutstandingBalances = (mode: 'show' | 'all') =>
    runCardAction('outstanding-balances', async () => {
      const customerId = mode === 'show' ? Number(selectedOutstandingCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await customerReportsService.getOutstandingBalances({ mode, customerId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load outstanding balances');
      const rows = toRecordRows(response.data.rows || []);
      const dr = sumByKey(rows, 'total_debit');
      const cr = sumByKey(rows, 'total_credit');
      const total = sumByKey(rows, 'outstanding_balance');
      onOpenModal({
        title: 'Outstanding Balances',
        subtitle: mode === 'show' ? customerNameById.get(selectedOutstandingCustomerId) || 'Selected Customer' : 'All Customers',
        fileName: 'customer-outstanding-balances',
        data: rows,
        columns: outstandingColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Customer: mode === 'show' ? customerNameById.get(selectedOutstandingCustomerId) || 'Selected Customer' : 'All Customers',
        },
        tableTotals: {
          label: 'Total',
          values: {
            total_debit: formatCurrency(dr),
            total_credit: formatCurrency(cr),
            outstanding_balance: formatCurrency(total),
          },
        },
        totals: [moneyTotal('DR', dr), moneyTotal('CR', cr), moneyTotal('Total', total)],
      });
    });

  const handleTopCustomers = () =>
    runCardAction('top-customers', async () => {
      ensureRangeValid(topCustomersRange, 'Top Customers');
      const response = await customerReportsService.getTopCustomers(topCustomersRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load top customers');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Top Customers',
        subtitle: `${formatDateOnly(topCustomersRange.fromDate)} - ${formatDateOnly(topCustomersRange.toDate)}`,
        fileName: 'top-customers',
        data: rows,
        columns: topCustomersColumns,
        filters: {
          'From Date': topCustomersRange.fromDate,
          'To Date': topCustomersRange.toDate,
        },
        tableTotals: {
          label: 'Total',
          values: {
            sales_count: sumByKey(rows, 'sales_count').toLocaleString(),
            net_sales: formatCurrency(sumByKey(rows, 'net_sales')),
            total_receipts: formatCurrency(sumByKey(rows, 'total_receipts')),
            outstanding_balance: formatCurrency(sumByKey(rows, 'outstanding_balance')),
          },
        },
        totals: [
          moneyTotal('Net Sales', sumByKey(rows, 'net_sales')),
          moneyTotal('Receipts', sumByKey(rows, 'total_receipts')),
          moneyTotal('Outstanding', sumByKey(rows, 'outstanding_balance')),
        ],
      });
    });

  const handlePaymentHistory = (mode: 'show' | 'all') =>
    runCardAction('payment-history', async () => {
      ensureRangeValid(paymentHistoryRange, 'Customer Payment History');
      const customerId = mode === 'show' ? Number(selectedPaymentCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await customerReportsService.getPaymentHistory({
        fromDate: paymentHistoryRange.fromDate,
        toDate: paymentHistoryRange.toDate,
        mode,
        customerId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load payment history');
      const rows = toRecordRows(response.data.rows || []);
      const totalReceived = sumByKey(rows, 'amount');
      onOpenModal({
        title: 'Customer Payment History',
        subtitle: `${formatDateOnly(paymentHistoryRange.fromDate)} - ${formatDateOnly(paymentHistoryRange.toDate)}`,
        fileName: 'customer-payment-history',
        data: rows,
        columns: paymentHistoryColumns,
        filters: {
          'From Date': paymentHistoryRange.fromDate,
          'To Date': paymentHistoryRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Customer: mode === 'show' ? customerNameById.get(selectedPaymentCustomerId) || 'Selected Customer' : 'All Customers',
        },
        tableTotals: {
          label: 'Total',
          values: {
            amount: formatCurrency(totalReceived),
          },
        },
        totals: [moneyTotal('CR', totalReceived), moneyTotal('Total', totalReceived)],
      });
    });

  const handleCreditCustomers = (mode: 'show' | 'all') =>
    runCardAction('credit-customers', async () => {
      const customerId = mode === 'show' ? Number(selectedCreditCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await customerReportsService.getCreditCustomers({ mode, customerId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load credit customers');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Credit Customers',
        subtitle: mode === 'show' ? customerNameById.get(selectedCreditCustomerId) || 'Selected Customer' : 'All Customers',
        fileName: 'credit-customers',
        data: rows,
        columns: creditCustomersColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Customer: mode === 'show' ? customerNameById.get(selectedCreditCustomerId) || 'Selected Customer' : 'All Customers',
        },
        tableTotals: {
          label: 'Total',
          values: {
            current_credit: formatCurrency(sumByKey(rows, 'current_credit')),
          },
        },
        totals: [moneyTotal('Total Credit', sumByKey(rows, 'current_credit'))],
      });
    });

  const handleNewCustomers = () =>
    runCardAction('new-customers', async () => {
      ensureRangeValid(newCustomersRange, 'New Customers');
      const response = await customerReportsService.getNewCustomers(newCustomersRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load new customers');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'New Customers (by date)',
        subtitle: `${formatDateOnly(newCustomersRange.fromDate)} - ${formatDateOnly(newCustomersRange.toDate)}`,
        fileName: 'new-customers-by-date',
        data: rows,
        columns: newCustomersColumns,
        filters: {
          'From Date': newCustomersRange.fromDate,
          'To Date': newCustomersRange.toDate,
        },
        tableTotals: {
          label: 'Total',
          values: {
            opening_balance: formatCurrency(sumByKey(rows, 'opening_balance')),
            current_balance: formatCurrency(sumByKey(rows, 'current_balance')),
          },
        },
        totals: [
          moneyTotal('Opening Balance', sumByKey(rows, 'opening_balance')),
          moneyTotal('Current Balance', sumByKey(rows, 'current_balance')),
        ],
      });
    });

  const handleCustomerActivity = (mode: 'show' | 'all') =>
    runCardAction('customer-activity', async () => {
      ensureRangeValid(activityRange, 'Customer Activity');
      const customerId = mode === 'show' ? Number(selectedActivityCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await customerReportsService.getCustomerActivity({
        fromDate: activityRange.fromDate,
        toDate: activityRange.toDate,
        mode,
        customerId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load customer activity');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Customer Activity',
        subtitle: `${formatDateOnly(activityRange.fromDate)} - ${formatDateOnly(activityRange.toDate)}`,
        fileName: 'customer-activity',
        data: rows,
        columns: customerActivityColumns,
        filters: {
          'From Date': activityRange.fromDate,
          'To Date': activityRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Customer: mode === 'show' ? customerNameById.get(selectedActivityCustomerId) || 'Selected Customer' : 'All Customers',
        },
        tableTotals: {
          label: 'Total',
          values: {
            sales_count: sumByKey(rows, 'sales_count').toLocaleString(),
            returns_count: sumByKey(rows, 'returns_count').toLocaleString(),
            receipts_count: sumByKey(rows, 'receipts_count').toLocaleString(),
            gross_sales: formatCurrency(sumByKey(rows, 'gross_sales')),
            sales_returns: formatCurrency(sumByKey(rows, 'sales_returns')),
            total_receipts: formatCurrency(sumByKey(rows, 'total_receipts')),
            net_exposure: formatCurrency(sumByKey(rows, 'net_exposure')),
          },
        },
        totals: [
          moneyTotal('Gross Sales', sumByKey(rows, 'gross_sales')),
          moneyTotal('Sales Returns', sumByKey(rows, 'sales_returns')),
          moneyTotal('Receipts', sumByKey(rows, 'total_receipts')),
          moneyTotal('Net Exposure', sumByKey(rows, 'net_exposure')),
        ],
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

  const renderCustomerSelector = (value: string, onChange: (value: string) => void, placeholder = 'Select Customer') => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {customers.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const renderShowAllButtons = (onShow: () => void, onAll: () => void, cardId: CustomerCardId) => (
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

  const renderCardBody = (cardId: CustomerCardId) => {
    if (cardId === 'customer-list') {
      return (
        <div className="space-y-3">
          {renderCustomerSelector(selectedListCustomerId, setSelectedListCustomerId)}
          {renderShowAllButtons(() => handleCustomerList('show'), () => handleCustomerList('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'customer-ledger') {
      return (
        <div className="space-y-3">
          {renderDateRange(ledgerRange, setLedgerRange)}
          {renderCustomerSelector(selectedLedgerCustomerId, setSelectedLedgerCustomerId)}
          {renderShowAllButtons(() => handleCustomerLedger('show'), () => handleCustomerLedger('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'outstanding-balances') {
      return (
        <div className="space-y-3">
          {renderCustomerSelector(selectedOutstandingCustomerId, setSelectedOutstandingCustomerId)}
          {renderShowAllButtons(() => handleOutstandingBalances('show'), () => handleOutstandingBalances('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'top-customers') {
      return (
        <div className="space-y-3">
          {renderDateRange(topCustomersRange, setTopCustomersRange)}
          <button
            onClick={handleTopCustomers}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    if (cardId === 'payment-history') {
      return (
        <div className="space-y-3">
          {renderDateRange(paymentHistoryRange, setPaymentHistoryRange)}
          {renderCustomerSelector(selectedPaymentCustomerId, setSelectedPaymentCustomerId)}
          {renderShowAllButtons(() => handlePaymentHistory('show'), () => handlePaymentHistory('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'credit-customers') {
      return (
        <div className="space-y-3">
          {renderCustomerSelector(selectedCreditCustomerId, setSelectedCreditCustomerId)}
          {renderShowAllButtons(() => handleCreditCustomers('show'), () => handleCreditCustomers('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'new-customers') {
      return (
        <div className="space-y-3">
          {renderDateRange(newCustomersRange, setNewCustomersRange)}
          <button
            onClick={handleNewCustomers}
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
        {renderDateRange(activityRange, setActivityRange)}
        {renderCustomerSelector(selectedActivityCustomerId, setSelectedActivityCustomerId)}
        {renderShowAllButtons(() => handleCustomerActivity('show'), () => handleCustomerActivity('all'), cardId)}
      </div>
    );
  };

  const renderCard = (card: { id: CustomerCardId; title: string; hint: string }) => {
    const isOpen = expandedCardId === card.id;
    return (
      <div key={card.id} className="self-start overflow-hidden rounded-2xl border border-[#bfd0df] bg-white shadow-[0_8px_18px_rgba(15,79,118,0.08)]">
        <button
          onClick={() => {
            setCardErrors((prev) => ({ ...prev, [card.id]: '' }));
            setExpandedCardId((prev) => (prev === card.id ? null : card.id));
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

  const leftColumnCards = customerCards.filter((_, index) => index % 2 === 0);
  const rightColumnCards = customerCards.filter((_, index) => index % 2 === 1);

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && (
        <div className="inline-flex items-center gap-2 rounded-md border border-[#b8c8d7] bg-white px-3 py-2 text-sm text-[#38556d]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading customer options...
        </div>
      )}
      <div className="space-y-3 lg:hidden">
        {customerCards.map(renderCard)}
      </div>
      <div className="hidden items-start gap-3 lg:grid lg:grid-cols-2">
        <div className="space-y-3">
          {leftColumnCards.map(renderCard)}
        </div>
        <div className="space-y-3">
          {rightColumnCards.map(renderCard)}
        </div>
      </div>
    </div>
  );
}

