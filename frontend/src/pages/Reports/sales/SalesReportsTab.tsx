import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn } from '../../../components/reports/ReportModal';
import { salesReportsService } from '../../../services/reports/salesReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, formatQuantity, toRecordRows, defaultReportRange } from '../reportUtils';

type SalesCardId =
  | 'sales-summary'
  | 'invoice-status'
  | 'daily-sales'
  | 'sales-by-customer'
  | 'sales-by-product'
  | 'sales-by-store'
  | 'top-selling-items'
  | 'top-customers'
  | 'sales-returns'
  | 'payments-by-account'
  | 'quotations'
  | 'cashier-performance';

const salesCards: Array<{ id: SalesCardId; title: string; hint: string }> = [
  { id: 'sales-summary', title: 'Sales Summary', hint: 'Between two dates' },
  { id: 'invoice-status', title: 'Invoice Status', hint: 'Between two dates + status filter' },
  { id: 'daily-sales', title: 'Daily Sales Report', hint: 'Single action report' },
  { id: 'sales-by-customer', title: 'Sales by Customer', hint: 'Dropdown + Show / All' },
  { id: 'sales-by-product', title: 'Sales by Product', hint: 'Dropdown + Show / All' },
  { id: 'sales-by-store', title: 'Sales by Store', hint: 'Between two dates + Store dropdown + Show / All' },
  { id: 'top-selling-items', title: 'Most Sold Items', hint: 'Between two dates' },
  { id: 'top-customers', title: 'Top Customers', hint: 'Between two dates' },
  { id: 'sales-returns', title: 'Sales Returns Report', hint: 'Between two dates' },
  { id: 'payments-by-account', title: 'Sales Payments by Account', hint: 'Between two dates' },
  { id: 'quotations', title: 'Quotations', hint: 'Between two dates' },
  { id: 'cashier-performance', title: 'Cashier Performance', hint: 'Between two dates' },
];

const salesSummaryColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'metric', header: 'Metric' },
  {
    key: 'value',
    header: 'Value',
    align: 'right',
    render: (row) => (row.kind === 'money' ? formatCurrency(row.value) : Number(row.value || 0).toLocaleString()),
  },
];

const invoiceStatusColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sale_id', header: 'Invoice #', getHref: (row) => (row.sale_id ? `/sales/${row.sale_id}/edit` : null) },
  { key: 'sale_date', header: 'Date', render: (row) => formatDateTime(row.sale_date) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'sale_type', header: 'Type' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'paid', header: 'Paid', align: 'right', render: (row) => formatCurrency(row.paid) },
  { key: 'balance', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.balance) },
  { key: 'status', header: 'Status' },
];

const salesByStoreColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'store_name', header: 'Store' },
  { key: 'quantity_sold', header: 'Qty Sold', align: 'right', render: (row) => formatQuantity(row.quantity_sold) },
  { key: 'sales_count', header: 'Sales Count', align: 'right' },
  { key: 'sales_amount', header: 'Sales Amount', align: 'right', render: (row) => formatCurrency(row.sales_amount) },
];

const dailySalesColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sale_id', header: 'Sale #', getHref: (row) => (row.sale_id ? `/sales/${row.sale_id}/edit` : null) },
  { key: 'sale_date', header: 'Sale Date', render: (row) => formatDateTime(row.sale_date) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'status', header: 'Status' },
];

const salesByCustomerColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sale_id', header: 'Sale #', getHref: (row) => (row.sale_id ? `/sales/${row.sale_id}/edit` : null) },
  { key: 'sale_date', header: 'Sale Date', render: (row) => formatDateTime(row.sale_date) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'status', header: 'Status' },
];

const salesByProductColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sale_id', header: 'Sale #', getHref: (row) => (row.sale_id ? `/sales/${row.sale_id}/edit` : null) },
  { key: 'sale_date', header: 'Sale Date', render: (row) => formatDateTime(row.sale_date) },
  { key: 'product_name', header: 'Product' },
  { key: 'quantity', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.quantity) },
  { key: 'unit_price', header: 'Unit Price', align: 'right', render: (row) => formatCurrency(row.unit_price) },
  { key: 'line_total', header: 'Line Total', align: 'right', render: (row) => formatCurrency(row.line_total) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
];

const topSellingColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'product_name', header: 'Product' },
  { key: 'quantity_sold', header: 'Qty Sold', align: 'right', render: (row) => formatQuantity(row.quantity_sold) },
  { key: 'sales_count', header: 'Sales Count', align: 'right' },
  { key: 'sales_amount', header: 'Sales Amount', align: 'right', render: (row) => formatCurrency(row.sales_amount) },
];

const topCustomersColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_name', header: 'Customer' },
  { key: 'invoice_count', header: 'Invoices', align: 'right' },
  { key: 'quantity', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.quantity) },
  { key: 'sales_total', header: 'Sales', align: 'right', render: (row) => formatCurrency(row.sales_total) },
  { key: 'returns_total', header: 'Returns', align: 'right', render: (row) => formatCurrency(row.returns_total) },
  { key: 'net_sales', header: 'Net Sales', align: 'right', render: (row) => formatCurrency(row.net_sales) },
];

const salesReturnsColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'return_id', header: 'Return #', getHref: (row) => (row.return_id ? `/returns/sales/${row.return_id}/edit` : null) },
  { key: 'return_date', header: 'Return Date', render: (row) => formatDateTime(row.return_date) },
  { key: 'sale_id', header: 'Sale #', getHref: (row) => (row.sale_id ? `/sales/${row.sale_id}/edit` : null) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'subtotal', header: 'Subtotal', align: 'right', render: (row) => formatCurrency(row.subtotal) },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'note', header: 'Note' },
];

const paymentsByAccountColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'account_name', header: 'Account' },
  { key: 'sales_count', header: 'Sales Count', align: 'right' },
  { key: 'payment_count', header: 'Payments', align: 'right' },
  { key: 'amount_paid', header: 'Amount Paid', align: 'right', render: (row) => formatCurrency(row.amount_paid) },
];

const quotationsColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'quotation_id', header: 'Quotation #', getHref: (row) => (row.quotation_id ? `/sales/${row.quotation_id}/edit` : null) },
  { key: 'quotation_date', header: 'Date', render: (row) => formatDateTime(row.quotation_date) },
  { key: 'valid_until', header: 'Valid Until', render: (row) => (row.valid_until ? formatDateOnly(row.valid_until) : '-') },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'status', header: 'Status' },
  { key: 'note', header: 'Note' },
];

const cashierPerformanceColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'sales_count', header: 'Sales Count', align: 'right' },
  { key: 'gross_sales', header: 'Gross Sales', align: 'right', render: (row) => formatCurrency(row.gross_sales) },
  { key: 'returns_count', header: 'Returns Count', align: 'right' },
  { key: 'returns_total', header: 'Returns Total', align: 'right', render: (row) => formatCurrency(row.returns_total) },
  { key: 'net_sales', header: 'Net Sales', align: 'right', render: (row) => formatCurrency(row.net_sales) },
];

type Props = {
  onOpenModal: (report: ModalReportState) => void;
};

export function SalesReportsTab({ onOpenModal }: Props) {
  const [expandedCardId, setExpandedCardId] = useState<SalesCardId | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<SalesCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');

  const [summaryRange, setSummaryRange] = useState<DateRange>(defaultReportRange());
  const [invoiceStatusRange, setInvoiceStatusRange] = useState<DateRange>(defaultReportRange());
  const [topSellingRange, setTopSellingRange] = useState<DateRange>(defaultReportRange());
  const [salesByStoreRange, setSalesByStoreRange] = useState<DateRange>(defaultReportRange());
  const [topCustomersRange, setTopCustomersRange] = useState<DateRange>(defaultReportRange());
  const [returnsRange, setReturnsRange] = useState<DateRange>(defaultReportRange());
  const [paymentsRange, setPaymentsRange] = useState<DateRange>(defaultReportRange());
  const [quotationsRange, setQuotationsRange] = useState<DateRange>(defaultReportRange());
  const [cashierRange, setCashierRange] = useState<DateRange>(defaultReportRange());

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [salesOptions, setSalesOptions] = useState<{
    customers: Array<{ id: number; label: string }>;
    products: Array<{ id: number; label: string }>;
    stores: Array<{ id: number; label: string }>;
  }>({
    customers: [],
    products: [],
    stores: [],
  });

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');

    salesReportsService
      .getSalesOptions()
      .then((response) => {
        if (!alive) return;
        if (!response.success || !response.data) {
          setOptionsError(response.error || response.message || 'Failed to load sales options');
          return;
        }
        setSalesOptions({
          customers: response.data.customers || [],
          products: response.data.products || [],
          stores: response.data.stores || [],
        });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load sales options');
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const selectedCustomerLabel = useMemo(
    () => salesOptions.customers.find((option) => String(option.id) === selectedCustomerId)?.label || '',
    [salesOptions.customers, selectedCustomerId]
  );
  const selectedProductLabel = useMemo(
    () => salesOptions.products.find((option) => String(option.id) === selectedProductId)?.label || '',
    [salesOptions.products, selectedProductId]
  );
  const selectedStoreLabel = useMemo(
    () => salesOptions.stores.find((option) => String(option.id) === selectedStoreId)?.label || '',
    [salesOptions.stores, selectedStoreId]
  );

  const runCardAction = async (cardId: SalesCardId, action: () => Promise<void>) => {
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
    if (!range.fromDate || !range.toDate) {
      throw new Error(`${label}: both start and end date are required`);
    }
    if (range.fromDate > range.toDate) {
      throw new Error(`${label}: start date cannot be after end date`);
    }
  };

  const sumNumericField = (rows: Record<string, unknown>[], field: string) =>
    rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);

  const handleDailySales = () =>
    runCardAction('daily-sales', async () => {
      const response = await salesReportsService.getDailySales();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load daily sales');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Daily Sales Report',
        subtitle: 'All Daily Sale',
        fileName: 'daily-sales-report',
        data: rows,
        columns: dailySalesColumns,
        filters: { Date: new Date().toLocaleDateString(), Action: 'All Daily Sale' },
        tableTotals: {
          label: 'Total',
          values: {
            total: formatCurrency(sumNumericField(rows, 'total')),
          },
        },
      });
    });

  const handleSalesSummary = () =>
    runCardAction('sales-summary', async () => {
      ensureRangeValid(summaryRange, 'Sales Summary');
      const response = await salesReportsService.getSalesSummary(summaryRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load sales summary');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Sales Summary',
        subtitle: `${formatDateOnly(summaryRange.fromDate)} - ${formatDateOnly(summaryRange.toDate)}`,
        fileName: 'sales-summary',
        data: rows,
        columns: salesSummaryColumns,
        filters: { 'From Date': summaryRange.fromDate, 'To Date': summaryRange.toDate },
      });
    });

  const handleInvoiceStatus = () =>
    runCardAction('invoice-status', async () => {
      ensureRangeValid(invoiceStatusRange, 'Invoice Status');
      const response = await salesReportsService.getInvoiceStatus({
        ...invoiceStatusRange,
        status: invoiceStatusFilter,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load invoice status report');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Invoice Status',
        subtitle: `${formatDateOnly(invoiceStatusRange.fromDate)} - ${formatDateOnly(invoiceStatusRange.toDate)}`,
        fileName: 'invoice-status',
        data: rows,
        columns: invoiceStatusColumns,
        filters: { Status: invoiceStatusFilter, 'From Date': invoiceStatusRange.fromDate, 'To Date': invoiceStatusRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            total: formatCurrency(sumNumericField(rows, 'total')),
            paid: formatCurrency(sumNumericField(rows, 'paid')),
            balance: formatCurrency(sumNumericField(rows, 'balance')),
          },
        },
      });
    });

  const handleSalesByCustomer = (mode: 'show' | 'all') =>
    runCardAction('sales-by-customer', async () => {
      const customerId = mode === 'show' ? Number(selectedCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await salesReportsService.getSalesByCustomer({ mode, customerId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load customer sales');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Sales by Customer',
        subtitle: mode === 'show' ? selectedCustomerLabel || 'Selected Customer' : 'All Customers',
        fileName: 'sales-by-customer',
        data: rows,
        columns: salesByCustomerColumns,
        filters: { Mode: mode === 'show' ? 'Show' : 'All', Customer: mode === 'show' ? selectedCustomerLabel || 'Selected customer' : 'All Customers' },
        tableTotals: {
          label: 'Total',
          values: {
            total: formatCurrency(sumNumericField(rows, 'total')),
          },
        },
      });
    });

  const handleSalesByProduct = (mode: 'show' | 'all') =>
    runCardAction('sales-by-product', async () => {
      const productId = mode === 'show' ? Number(selectedProductId || 0) : undefined;
      if (mode === 'show' && !productId) throw new Error('Select a product first');
      const response = await salesReportsService.getSalesByProduct({ mode, productId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load product sales');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Sales by Product',
        subtitle: mode === 'show' ? selectedProductLabel || 'Selected Product' : 'All Products',
        fileName: 'sales-by-product',
        data: rows,
        columns: salesByProductColumns,
        filters: { Mode: mode === 'show' ? 'Show' : 'All', Product: mode === 'show' ? selectedProductLabel || 'Selected product' : 'All Products' },
        tableTotals: {
          label: 'Total',
          values: {
            quantity: formatQuantity(sumNumericField(rows, 'quantity')),
            line_total: formatCurrency(sumNumericField(rows, 'line_total')),
          },
        },
      });
    });

  const handleSalesByStore = (mode: 'show' | 'all') =>
    runCardAction('sales-by-store', async () => {
      ensureRangeValid(salesByStoreRange, 'Sales by Store');
      const storeId = mode === 'show' ? Number(selectedStoreId || 0) : undefined;
      if (mode === 'show' && !storeId) throw new Error('Select a store first');
      const response = await salesReportsService.getSalesByStore({
        ...salesByStoreRange,
        mode,
        storeId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load store sales report');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Sales by Store',
        subtitle: `${formatDateOnly(salesByStoreRange.fromDate)} - ${formatDateOnly(salesByStoreRange.toDate)}`,
        fileName: 'sales-by-store',
        data: rows,
        columns: salesByStoreColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Store: mode === 'show' ? selectedStoreLabel || 'Selected store' : 'All Stores',
          'From Date': salesByStoreRange.fromDate,
          'To Date': salesByStoreRange.toDate,
        },
        tableTotals: {
          label: 'Total',
          values: {
            quantity_sold: formatQuantity(sumNumericField(rows, 'quantity_sold')),
            sales_count: sumNumericField(rows, 'sales_count').toLocaleString(),
            sales_amount: formatCurrency(sumNumericField(rows, 'sales_amount')),
          },
        },
      });
    });

  const handleTopSellingItems = () =>
    runCardAction('top-selling-items', async () => {
      ensureRangeValid(topSellingRange, 'Top Selling Items');
      const response = await salesReportsService.getTopSellingItems(topSellingRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load top selling items');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Most Sold Items',
        subtitle: `${formatDateOnly(topSellingRange.fromDate)} - ${formatDateOnly(topSellingRange.toDate)}`,
        fileName: 'top-selling-items',
        data: rows,
        columns: topSellingColumns,
        filters: { 'From Date': topSellingRange.fromDate, 'To Date': topSellingRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            quantity_sold: formatQuantity(sumNumericField(rows, 'quantity_sold')),
            sales_count: sumNumericField(rows, 'sales_count').toLocaleString(),
            sales_amount: formatCurrency(sumNumericField(rows, 'sales_amount')),
          },
        },
      });
    });

  const handleTopCustomers = () =>
    runCardAction('top-customers', async () => {
      ensureRangeValid(topCustomersRange, 'Top Customers');
      const response = await salesReportsService.getTopCustomers(topCustomersRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load top customers report');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Top Customers',
        subtitle: `${formatDateOnly(topCustomersRange.fromDate)} - ${formatDateOnly(topCustomersRange.toDate)}`,
        fileName: 'top-customers',
        data: rows,
        columns: topCustomersColumns,
        filters: { 'From Date': topCustomersRange.fromDate, 'To Date': topCustomersRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            invoice_count: sumNumericField(rows, 'invoice_count').toLocaleString(),
            quantity: formatQuantity(sumNumericField(rows, 'quantity')),
            sales_total: formatCurrency(sumNumericField(rows, 'sales_total')),
            returns_total: formatCurrency(sumNumericField(rows, 'returns_total')),
            net_sales: formatCurrency(sumNumericField(rows, 'net_sales')),
          },
        },
      });
    });

  const handleSalesReturns = () =>
    runCardAction('sales-returns', async () => {
      ensureRangeValid(returnsRange, 'Sales Returns');
      const response = await salesReportsService.getSalesReturns(returnsRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load sales returns');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Sales Returns Report',
        subtitle: `${formatDateOnly(returnsRange.fromDate)} - ${formatDateOnly(returnsRange.toDate)}`,
        fileName: 'sales-returns-report',
        data: rows,
        columns: salesReturnsColumns,
        filters: { 'From Date': returnsRange.fromDate, 'To Date': returnsRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            subtotal: formatCurrency(sumNumericField(rows, 'subtotal')),
            total: formatCurrency(sumNumericField(rows, 'total')),
          },
        },
      });
    });

  const handlePaymentsByAccount = () =>
    runCardAction('payments-by-account', async () => {
      ensureRangeValid(paymentsRange, 'Sales Payments by Account');
      const response = await salesReportsService.getPaymentsByAccount(paymentsRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load payments by account report');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Sales Payments by Account',
        subtitle: `${formatDateOnly(paymentsRange.fromDate)} - ${formatDateOnly(paymentsRange.toDate)}`,
        fileName: 'sales-payments-by-account',
        data: rows,
        columns: paymentsByAccountColumns,
        filters: { 'From Date': paymentsRange.fromDate, 'To Date': paymentsRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            sales_count: sumNumericField(rows, 'sales_count').toLocaleString(),
            payment_count: sumNumericField(rows, 'payment_count').toLocaleString(),
            amount_paid: formatCurrency(sumNumericField(rows, 'amount_paid')),
          },
        },
      });
    });

  const handleQuotations = () =>
    runCardAction('quotations', async () => {
      ensureRangeValid(quotationsRange, 'Quotations');
      const response = await salesReportsService.getQuotations(quotationsRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load quotations report');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Quotations',
        subtitle: `${formatDateOnly(quotationsRange.fromDate)} - ${formatDateOnly(quotationsRange.toDate)}`,
        fileName: 'quotations',
        data: rows,
        columns: quotationsColumns,
        filters: { 'From Date': quotationsRange.fromDate, 'To Date': quotationsRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            total: formatCurrency(sumNumericField(rows, 'total')),
          },
        },
      });
    });

  const handleCashierPerformance = () =>
    runCardAction('cashier-performance', async () => {
      ensureRangeValid(cashierRange, 'Cashier Performance');
      const response = await salesReportsService.getCashierPerformance(cashierRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load cashier performance');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Cashier Performance',
        subtitle: `${formatDateOnly(cashierRange.fromDate)} - ${formatDateOnly(cashierRange.toDate)}`,
        fileName: 'cashier-performance',
        data: rows,
        columns: cashierPerformanceColumns,
        filters: { 'From Date': cashierRange.fromDate, 'To Date': cashierRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            sales_count: sumNumericField(rows, 'sales_count').toLocaleString(),
            gross_sales: formatCurrency(sumNumericField(rows, 'gross_sales')),
            returns_count: sumNumericField(rows, 'returns_count').toLocaleString(),
            returns_total: formatCurrency(sumNumericField(rows, 'returns_total')),
            net_sales: formatCurrency(sumNumericField(rows, 'net_sales')),
          },
        },
      });
    });

  const renderDateRange = (
    range: DateRange,
    onChange: (next: DateRange) => void
  ) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-semibold text-[#47657f]">
        <span>From Date</span>
        <input type="date" value={range.fromDate} onChange={(event) => onChange({ ...range, fromDate: event.target.value })} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none" />
      </label>
      <label className="space-y-1 text-xs font-semibold text-[#47657f]">
        <span>To Date</span>
        <input type="date" value={range.toDate} onChange={(event) => onChange({ ...range, toDate: event.target.value })} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none" />
      </label>
    </div>
  );

  const renderCardBody = (cardId: SalesCardId) => {
    if (cardId === 'sales-summary') {
      return <div className="space-y-3">{renderDateRange(summaryRange, setSummaryRange)}<button onClick={handleSalesSummary} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    }

    if (cardId === 'invoice-status') {
      return (
        <div className="space-y-3">
          {renderDateRange(invoiceStatusRange, setInvoiceStatusRange)}
          <label className="space-y-1 text-xs font-semibold text-[#47657f]">
            <span>Status</span>
            <select value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value as any)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none">
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
          <button onClick={handleInvoiceStatus} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button>
        </div>
      );
    }

    if (cardId === 'daily-sales') {
      return <button onClick={handleDailySales} disabled={loadingCardId === cardId} className="inline-flex min-w-[180px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">{loadingCardId === cardId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}All Daily Sale</button>;
    }

    if (cardId === 'sales-by-customer') {
      return (
        <div className="space-y-3">
          <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none">
            <option value="">Select Customer</option>
            {salesOptions.customers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleSalesByCustomer('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button>
            <button onClick={() => handleSalesByCustomer('all')} disabled={loadingCardId === cardId} className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70">All</button>
          </div>
        </div>
      );
    }

    if (cardId === 'sales-by-product') {
      return (
        <div className="space-y-3">
          <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none">
            <option value="">Select Product</option>
            {salesOptions.products.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleSalesByProduct('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button>
            <button onClick={() => handleSalesByProduct('all')} disabled={loadingCardId === cardId} className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70">All</button>
          </div>
        </div>
      );
    }

    if (cardId === 'sales-by-store') {
      return (
        <div className="space-y-3">
          {renderDateRange(salesByStoreRange, setSalesByStoreRange)}
          <select value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none">
            <option value="">Select Store</option>
            {salesOptions.stores.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleSalesByStore('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button>
            <button onClick={() => handleSalesByStore('all')} disabled={loadingCardId === cardId} className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70">All</button>
          </div>
        </div>
      );
    }

    if (cardId === 'top-selling-items') {
      return <div className="space-y-3">{renderDateRange(topSellingRange, setTopSellingRange)}<button onClick={handleTopSellingItems} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    }

    if (cardId === 'top-customers') {
      return <div className="space-y-3">{renderDateRange(topCustomersRange, setTopCustomersRange)}<button onClick={handleTopCustomers} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    }

    if (cardId === 'sales-returns') {
      return <div className="space-y-3">{renderDateRange(returnsRange, setReturnsRange)}<button onClick={handleSalesReturns} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    }

    if (cardId === 'payments-by-account') {
      return <div className="space-y-3">{renderDateRange(paymentsRange, setPaymentsRange)}<button onClick={handlePaymentsByAccount} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    }

    if (cardId === 'quotations') {
      return <div className="space-y-3">{renderDateRange(quotationsRange, setQuotationsRange)}<button onClick={handleQuotations} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    }

    return <div className="space-y-3">{renderDateRange(cashierRange, setCashierRange)}<button onClick={handleCashierPerformance} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
  };

  const renderCard = (card: { id: SalesCardId; title: string; hint: string }) => {
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

  const leftColumnCards = salesCards.filter((_, index) => index % 2 === 0);
  const rightColumnCards = salesCards.filter((_, index) => index % 2 === 1);

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && <div className="inline-flex items-center gap-2 rounded-md border border-[#b8c8d7] bg-white px-3 py-2 text-sm text-[#38556d]"><Loader2 className="h-4 w-4 animate-spin" />Loading customers, products and stores...</div>}
      <div className="space-y-3 lg:hidden">
        {salesCards.map(renderCard)}
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

