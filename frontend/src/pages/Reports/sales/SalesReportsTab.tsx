import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn } from '../../../components/reports/ReportModal';
import { salesReportsService } from '../../../services/reports/salesReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, formatQuantity, toRecordRows, todayDate } from '../reportUtils';

type SalesCardId =
  | 'daily-sales'
  | 'sales-by-customer'
  | 'sales-by-product'
  | 'top-selling-items'
  | 'sales-returns'
  | 'cashier-performance';

const salesCards: Array<{ id: SalesCardId; title: string; hint: string }> = [
  { id: 'daily-sales', title: 'Daily Sales Report', hint: 'Single action report' },
  { id: 'sales-by-customer', title: 'Sales by Customer', hint: 'Dropdown + Show / All' },
  { id: 'sales-by-product', title: 'Sales by Product', hint: 'Dropdown + Show / All' },
  { id: 'top-selling-items', title: 'Top Selling Items', hint: 'Between two dates' },
  { id: 'sales-returns', title: 'Sales Returns Report', hint: 'Between two dates' },
  { id: 'cashier-performance', title: 'Cashier Performance', hint: 'Between two dates' },
];

const dailySalesColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sale_id', header: 'Sale #' },
  { key: 'sale_date', header: 'Sale Date', render: (row) => formatDateTime(row.sale_date) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'status', header: 'Status' },
];

const salesByCustomerColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sale_id', header: 'Sale #' },
  { key: 'sale_date', header: 'Sale Date', render: (row) => formatDateTime(row.sale_date) },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'status', header: 'Status' },
];

const salesByProductColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sale_id', header: 'Sale #' },
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

const salesReturnsColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'return_id', header: 'Return #' },
  { key: 'return_date', header: 'Return Date', render: (row) => formatDateTime(row.return_date) },
  { key: 'sale_id', header: 'Sale #' },
  { key: 'customer_name', header: 'Customer' },
  { key: 'cashier_name', header: 'Cashier' },
  { key: 'subtotal', header: 'Subtotal', align: 'right', render: (row) => formatCurrency(row.subtotal) },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
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

  const [topSellingRange, setTopSellingRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [returnsRange, setReturnsRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [cashierRange, setCashierRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [salesOptions, setSalesOptions] = useState<{
    customers: Array<{ id: number; label: string }>;
    products: Array<{ id: number; label: string }>;
  }>({
    customers: [],
    products: [],
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

  const handleDailySales = () =>
    runCardAction('daily-sales', async () => {
      const response = await salesReportsService.getDailySales();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load daily sales');
      onOpenModal({
        title: 'Daily Sales Report',
        subtitle: 'All Daily Sale',
        fileName: 'daily-sales-report',
        data: toRecordRows(response.data.rows || []),
        columns: dailySalesColumns,
        filters: { Date: new Date().toLocaleDateString(), Action: 'All Daily Sale' },
      });
    });

  const handleSalesByCustomer = (mode: 'show' | 'all') =>
    runCardAction('sales-by-customer', async () => {
      const customerId = mode === 'show' ? Number(selectedCustomerId || 0) : undefined;
      if (mode === 'show' && !customerId) throw new Error('Select a customer first');
      const response = await salesReportsService.getSalesByCustomer({ mode, customerId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load customer sales');
      onOpenModal({
        title: 'Sales by Customer',
        subtitle: mode === 'show' ? selectedCustomerLabel || 'Selected Customer' : 'All Customers',
        fileName: 'sales-by-customer',
        data: toRecordRows(response.data.rows || []),
        columns: salesByCustomerColumns,
        filters: { Mode: mode === 'show' ? 'Show' : 'All', Customer: mode === 'show' ? selectedCustomerLabel || 'Selected customer' : 'All Customers' },
      });
    });

  const handleSalesByProduct = (mode: 'show' | 'all') =>
    runCardAction('sales-by-product', async () => {
      const productId = mode === 'show' ? Number(selectedProductId || 0) : undefined;
      if (mode === 'show' && !productId) throw new Error('Select a product first');
      const response = await salesReportsService.getSalesByProduct({ mode, productId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load product sales');
      onOpenModal({
        title: 'Sales by Product',
        subtitle: mode === 'show' ? selectedProductLabel || 'Selected Product' : 'All Products',
        fileName: 'sales-by-product',
        data: toRecordRows(response.data.rows || []),
        columns: salesByProductColumns,
        filters: { Mode: mode === 'show' ? 'Show' : 'All', Product: mode === 'show' ? selectedProductLabel || 'Selected product' : 'All Products' },
      });
    });

  const handleTopSellingItems = () =>
    runCardAction('top-selling-items', async () => {
      ensureRangeValid(topSellingRange, 'Top Selling Items');
      const response = await salesReportsService.getTopSellingItems(topSellingRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load top selling items');
      onOpenModal({
        title: 'Top Selling Items',
        subtitle: `${formatDateOnly(topSellingRange.fromDate)} - ${formatDateOnly(topSellingRange.toDate)}`,
        fileName: 'top-selling-items',
        data: toRecordRows(response.data.rows || []),
        columns: topSellingColumns,
        filters: { 'From Date': topSellingRange.fromDate, 'To Date': topSellingRange.toDate },
      });
    });

  const handleSalesReturns = () =>
    runCardAction('sales-returns', async () => {
      ensureRangeValid(returnsRange, 'Sales Returns');
      const response = await salesReportsService.getSalesReturns(returnsRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load sales returns');
      onOpenModal({
        title: 'Sales Returns Report',
        subtitle: `${formatDateOnly(returnsRange.fromDate)} - ${formatDateOnly(returnsRange.toDate)}`,
        fileName: 'sales-returns-report',
        data: toRecordRows(response.data.rows || []),
        columns: salesReturnsColumns,
        filters: { 'From Date': returnsRange.fromDate, 'To Date': returnsRange.toDate },
      });
    });

  const handleCashierPerformance = () =>
    runCardAction('cashier-performance', async () => {
      ensureRangeValid(cashierRange, 'Cashier Performance');
      const response = await salesReportsService.getCashierPerformance(cashierRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load cashier performance');
      onOpenModal({
        title: 'Cashier Performance',
        subtitle: `${formatDateOnly(cashierRange.fromDate)} - ${formatDateOnly(cashierRange.toDate)}`,
        fileName: 'cashier-performance',
        data: toRecordRows(response.data.rows || []),
        columns: cashierPerformanceColumns,
        filters: { 'From Date': cashierRange.fromDate, 'To Date': cashierRange.toDate },
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

    if (cardId === 'top-selling-items') {
      return <div className="space-y-3">{renderDateRange(topSellingRange, setTopSellingRange)}<button onClick={handleTopSellingItems} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    }

    if (cardId === 'sales-returns') {
      return <div className="space-y-3">{renderDateRange(returnsRange, setReturnsRange)}<button onClick={handleSalesReturns} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    }

    return <div className="space-y-3">{renderDateRange(cashierRange, setCashierRange)}<button onClick={handleCashierPerformance} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
  };

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && <div className="inline-flex items-center gap-2 rounded-md border border-[#b8c8d7] bg-white px-3 py-2 text-sm text-[#38556d]"><Loader2 className="h-4 w-4 animate-spin" />Loading customer and product options...</div>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {salesCards.map((card) => {
          const isOpen = expandedCardId === card.id;
          return (
            <div key={card.id} className="overflow-hidden rounded-md border border-[#aebfd0] bg-white shadow-sm">
              <button onClick={() => { setCardErrors((prev) => ({ ...prev, [card.id]: '' })); setExpandedCardId((prev) => (prev === card.id ? null : card.id)); }} className="flex w-full items-center justify-between bg-[#0f4f76] px-5 py-4 text-left text-white">
                <div>
                  <p className="text-xl font-semibold leading-tight">{card.title}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wider text-[#b7d2e8]">{card.hint}</p>
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
