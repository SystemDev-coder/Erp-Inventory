import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn } from '../../../components/reports/ReportModal';
import { purchaseReportsService } from '../../../services/reports/purchaseReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, formatQuantity, toRecordRows, todayDate } from '../reportUtils';

type PurchaseCardId =
  | 'orders-summary'
  | 'supplier-wise'
  | 'purchase-returns'
  | 'payment-status'
  | 'supplier-ledger'
  | 'by-date-range'
  | 'best-suppliers'
  | 'price-variance';

const purchaseCards: Array<{ id: PurchaseCardId; title: string; hint: string }> = [
  { id: 'orders-summary', title: 'Purchase Orders Summary', hint: 'Between two dates' },
  { id: 'supplier-wise', title: 'Supplier Wise Purchases', hint: 'Dropdown + Show / All' },
  { id: 'purchase-returns', title: 'Purchase Returns', hint: 'Between two dates' },
  { id: 'payment-status', title: 'Purchase Payment Status', hint: 'Between two dates' },
  { id: 'supplier-ledger', title: 'Supplier Ledger', hint: 'Dropdown + Show / All' },
  { id: 'by-date-range', title: 'Purchase by Date Range', hint: 'Between two dates' },
  { id: 'best-suppliers', title: 'Best Suppliers', hint: 'Between two dates' },
  { id: 'price-variance', title: 'Purchase Price Variance', hint: 'Date range + product selection' },
];

const ordersSummaryColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'purchase_date', header: 'Date', render: (row) => formatDateTime(row.purchase_date) },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'buyer_name', header: 'Buyer' },
  { key: 'store_name', header: 'Store' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'paid_amount', header: 'Paid', align: 'right', render: (row) => formatCurrency(row.paid_amount) },
  { key: 'outstanding_amount', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_amount) },
  { key: 'payment_status', header: 'Payment Status' },
  { key: 'status', header: 'Status' },
];

const supplierWiseColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'purchase_date', header: 'Date', render: (row) => formatDateTime(row.purchase_date) },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'buyer_name', header: 'Buyer' },
  { key: 'store_name', header: 'Store' },
  { key: 'subtotal', header: 'Subtotal', align: 'right', render: (row) => formatCurrency(row.subtotal) },
  { key: 'discount', header: 'Discount', align: 'right', render: (row) => formatCurrency(row.discount) },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'status', header: 'Status' },
];

const purchaseReturnsColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'return_id', header: 'Return #' },
  { key: 'return_date', header: 'Return Date', render: (row) => formatDateTime(row.return_date) },
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'buyer_name', header: 'Buyer' },
  { key: 'subtotal', header: 'Subtotal', align: 'right', render: (row) => formatCurrency(row.subtotal) },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'note', header: 'Note' },
];

const paymentStatusColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'purchase_date', header: 'Date', render: (row) => formatDateTime(row.purchase_date) },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'paid_amount', header: 'Paid', align: 'right', render: (row) => formatCurrency(row.paid_amount) },
  { key: 'outstanding_amount', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_amount) },
  { key: 'payment_status', header: 'Payment Status' },
  { key: 'status', header: 'Status' },
];

const supplierLedgerColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sup_ledger_id', header: 'Entry #' },
  { key: 'entry_date', header: 'Date', render: (row) => formatDateTime(row.entry_date) },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'entry_type', header: 'Type' },
  { key: 'ref_table', header: 'Ref Table' },
  { key: 'ref_id', header: 'Ref Id' },
  { key: 'debit', header: 'Debit', align: 'right', render: (row) => formatCurrency(row.debit) },
  { key: 'credit', header: 'Credit', align: 'right', render: (row) => formatCurrency(row.credit) },
  { key: 'running_balance', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.running_balance) },
  { key: 'note', header: 'Note' },
];

const byDateRangeColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'purchase_date', header: 'Date', render: (row) => formatDateTime(row.purchase_date) },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'item_lines', header: 'Lines', align: 'right' },
  { key: 'total_quantity', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.total_quantity) },
  { key: 'subtotal', header: 'Subtotal', align: 'right', render: (row) => formatCurrency(row.subtotal) },
  { key: 'discount', header: 'Discount', align: 'right', render: (row) => formatCurrency(row.discount) },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'status', header: 'Status' },
];

const bestSuppliersColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'purchases_count', header: 'Purchases', align: 'right' },
  { key: 'total_amount', header: 'Total Amount', align: 'right', render: (row) => formatCurrency(row.total_amount) },
  { key: 'total_paid', header: 'Total Paid', align: 'right', render: (row) => formatCurrency(row.total_paid) },
  { key: 'outstanding_amount', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding_amount) },
  { key: 'avg_purchase_value', header: 'Avg Purchase', align: 'right', render: (row) => formatCurrency(row.avg_purchase_value) },
];

const priceVarianceColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'min_unit_cost', header: 'Min Cost', align: 'right', render: (row) => formatCurrency(row.min_unit_cost) },
  { key: 'max_unit_cost', header: 'Max Cost', align: 'right', render: (row) => formatCurrency(row.max_unit_cost) },
  { key: 'avg_unit_cost', header: 'Avg Cost', align: 'right', render: (row) => formatCurrency(row.avg_unit_cost) },
  { key: 'last_unit_cost', header: 'Last Cost', align: 'right', render: (row) => formatCurrency(row.last_unit_cost) },
  { key: 'variance_amount', header: 'Variance', align: 'right', render: (row) => formatCurrency(row.variance_amount) },
  { key: 'variance_percent', header: 'Variance %', align: 'right', render: (row) => `${Number(row.variance_percent || 0).toFixed(2)}%` },
  { key: 'purchase_lines', header: 'Lines', align: 'right' },
];

type Props = {
  onOpenModal: (report: ModalReportState) => void;
};

export function PurchaseReportsTab({ onOpenModal }: Props) {
  const [expandedCardId, setExpandedCardId] = useState<PurchaseCardId | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<PurchaseCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [selectedSupplierWiseId, setSelectedSupplierWiseId] = useState('');
  const [selectedSupplierLedgerId, setSelectedSupplierLedgerId] = useState('');
  const [selectedVarianceProductId, setSelectedVarianceProductId] = useState('');

  const [ordersRange, setOrdersRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [returnsRange, setReturnsRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [paymentRange, setPaymentRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [byDateRange, setByDateRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [bestSuppliersRange, setBestSuppliersRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [priceVarianceRange, setPriceVarianceRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: number; label: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: number; label: string }>>([]);

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');

    purchaseReportsService
      .getPurchaseOptions()
      .then((response) => {
        if (!alive) return;
        if (!response.success || !response.data) {
          setOptionsError(response.error || response.message || 'Failed to load purchase options');
          return;
        }
        setSuppliers(response.data.suppliers || []);
        setProducts(response.data.products || []);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load purchase options');
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const selectedSupplierWiseLabel = useMemo(
    () => suppliers.find((option) => String(option.id) === selectedSupplierWiseId)?.label || '',
    [suppliers, selectedSupplierWiseId]
  );
  const selectedSupplierLedgerLabel = useMemo(
    () => suppliers.find((option) => String(option.id) === selectedSupplierLedgerId)?.label || '',
    [suppliers, selectedSupplierLedgerId]
  );
  const selectedVarianceProductLabel = useMemo(
    () => products.find((option) => String(option.id) === selectedVarianceProductId)?.label || '',
    [products, selectedVarianceProductId]
  );

  const runCardAction = async (cardId: PurchaseCardId, action: () => Promise<void>) => {
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

  const handleOrdersSummary = () =>
    runCardAction('orders-summary', async () => {
      ensureRangeValid(ordersRange, 'Purchase Orders Summary');
      const response = await purchaseReportsService.getPurchaseOrdersSummary(ordersRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load purchase orders');
      onOpenModal({
        title: 'Purchase Orders Summary',
        subtitle: `${formatDateOnly(ordersRange.fromDate)} - ${formatDateOnly(ordersRange.toDate)}`,
        fileName: 'purchase-orders-summary',
        data: toRecordRows(response.data.rows || []),
        columns: ordersSummaryColumns,
        filters: { 'From Date': ordersRange.fromDate, 'To Date': ordersRange.toDate },
      });
    });

  const handleSupplierWisePurchases = (mode: 'show' | 'all') =>
    runCardAction('supplier-wise', async () => {
      const supplierId = mode === 'show' ? Number(selectedSupplierWiseId || 0) : undefined;
      if (mode === 'show' && !supplierId) throw new Error('Select a supplier first');
      const response = await purchaseReportsService.getSupplierWisePurchases({ mode, supplierId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load supplier purchases');
      onOpenModal({
        title: 'Supplier Wise Purchases',
        subtitle: mode === 'show' ? selectedSupplierWiseLabel || 'Selected Supplier' : 'All Suppliers',
        fileName: 'supplier-wise-purchases',
        data: toRecordRows(response.data.rows || []),
        columns: supplierWiseColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Supplier: mode === 'show' ? selectedSupplierWiseLabel || 'Selected Supplier' : 'All Suppliers',
        },
      });
    });

  const handlePurchaseReturns = () =>
    runCardAction('purchase-returns', async () => {
      ensureRangeValid(returnsRange, 'Purchase Returns');
      const response = await purchaseReportsService.getPurchaseReturns(returnsRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load purchase returns');
      onOpenModal({
        title: 'Purchase Returns',
        subtitle: `${formatDateOnly(returnsRange.fromDate)} - ${formatDateOnly(returnsRange.toDate)}`,
        fileName: 'purchase-returns',
        data: toRecordRows(response.data.rows || []),
        columns: purchaseReturnsColumns,
        filters: { 'From Date': returnsRange.fromDate, 'To Date': returnsRange.toDate },
      });
    });

  const handlePaymentStatus = () =>
    runCardAction('payment-status', async () => {
      ensureRangeValid(paymentRange, 'Purchase Payment Status');
      const response = await purchaseReportsService.getPurchasePaymentStatus(paymentRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load payment status');
      onOpenModal({
        title: 'Purchase Payment Status',
        subtitle: `${formatDateOnly(paymentRange.fromDate)} - ${formatDateOnly(paymentRange.toDate)}`,
        fileName: 'purchase-payment-status',
        data: toRecordRows(response.data.rows || []),
        columns: paymentStatusColumns,
        filters: { 'From Date': paymentRange.fromDate, 'To Date': paymentRange.toDate },
      });
    });

  const handleSupplierLedger = (mode: 'show' | 'all') =>
    runCardAction('supplier-ledger', async () => {
      const supplierId = mode === 'show' ? Number(selectedSupplierLedgerId || 0) : undefined;
      if (mode === 'show' && !supplierId) throw new Error('Select a supplier first');
      const response = await purchaseReportsService.getSupplierLedger({ mode, supplierId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load supplier ledger');
      onOpenModal({
        title: 'Supplier Ledger',
        subtitle: mode === 'show' ? selectedSupplierLedgerLabel || 'Selected Supplier' : 'All Suppliers',
        fileName: 'supplier-ledger',
        data: toRecordRows(response.data.rows || []),
        columns: supplierLedgerColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Supplier: mode === 'show' ? selectedSupplierLedgerLabel || 'Selected Supplier' : 'All Suppliers',
        },
      });
    });

  const handlePurchaseByDateRange = () =>
    runCardAction('by-date-range', async () => {
      ensureRangeValid(byDateRange, 'Purchase by Date Range');
      const response = await purchaseReportsService.getPurchaseByDateRange(byDateRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load purchases by date');
      onOpenModal({
        title: 'Purchase by Date Range',
        subtitle: `${formatDateOnly(byDateRange.fromDate)} - ${formatDateOnly(byDateRange.toDate)}`,
        fileName: 'purchase-by-date-range',
        data: toRecordRows(response.data.rows || []),
        columns: byDateRangeColumns,
        filters: { 'From Date': byDateRange.fromDate, 'To Date': byDateRange.toDate },
      });
    });

  const handleBestSuppliers = () =>
    runCardAction('best-suppliers', async () => {
      ensureRangeValid(bestSuppliersRange, 'Best Suppliers');
      const response = await purchaseReportsService.getBestSuppliers(bestSuppliersRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load best suppliers');
      onOpenModal({
        title: 'Best Suppliers',
        subtitle: `${formatDateOnly(bestSuppliersRange.fromDate)} - ${formatDateOnly(bestSuppliersRange.toDate)}`,
        fileName: 'best-suppliers',
        data: toRecordRows(response.data.rows || []),
        columns: bestSuppliersColumns,
        filters: { 'From Date': bestSuppliersRange.fromDate, 'To Date': bestSuppliersRange.toDate },
      });
    });

  const handlePriceVariance = (mode: 'show' | 'all') =>
    runCardAction('price-variance', async () => {
      ensureRangeValid(priceVarianceRange, 'Purchase Price Variance');
      const productId = mode === 'show' ? Number(selectedVarianceProductId || 0) : undefined;
      if (mode === 'show' && !productId) throw new Error('Select a product first');
      const response = await purchaseReportsService.getPurchasePriceVariance({
        fromDate: priceVarianceRange.fromDate,
        toDate: priceVarianceRange.toDate,
        mode,
        productId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load price variance');
      onOpenModal({
        title: 'Purchase Price Variance',
        subtitle: `${formatDateOnly(priceVarianceRange.fromDate)} - ${formatDateOnly(priceVarianceRange.toDate)}`,
        fileName: 'purchase-price-variance',
        data: toRecordRows(response.data.rows || []),
        columns: priceVarianceColumns,
        filters: {
          'From Date': priceVarianceRange.fromDate,
          'To Date': priceVarianceRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Product: mode === 'show' ? selectedVarianceProductLabel || 'Selected Product' : 'All Products',
        },
      });
    });

  const renderDateRange = (range: DateRange, onChange: (next: DateRange) => void) => (
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

  const renderCardBody = (cardId: PurchaseCardId) => {
    if (cardId === 'orders-summary') return <div className="space-y-3">{renderDateRange(ordersRange, setOrdersRange)}<button onClick={handleOrdersSummary} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    if (cardId === 'supplier-wise') return <div className="space-y-3"><select value={selectedSupplierWiseId} onChange={(event) => setSelectedSupplierWiseId(event.target.value)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"><option value="">Select Supplier</option>{suppliers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><div className="grid grid-cols-2 gap-3"><button onClick={() => handleSupplierWisePurchases('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button><button onClick={() => handleSupplierWisePurchases('all')} disabled={loadingCardId === cardId} className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70">All</button></div></div>;
    if (cardId === 'purchase-returns') return <div className="space-y-3">{renderDateRange(returnsRange, setReturnsRange)}<button onClick={handlePurchaseReturns} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    if (cardId === 'payment-status') return <div className="space-y-3">{renderDateRange(paymentRange, setPaymentRange)}<button onClick={handlePaymentStatus} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    if (cardId === 'supplier-ledger') return <div className="space-y-3"><select value={selectedSupplierLedgerId} onChange={(event) => setSelectedSupplierLedgerId(event.target.value)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"><option value="">Select Supplier</option>{suppliers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><div className="grid grid-cols-2 gap-3"><button onClick={() => handleSupplierLedger('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button><button onClick={() => handleSupplierLedger('all')} disabled={loadingCardId === cardId} className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70">All</button></div></div>;
    if (cardId === 'by-date-range') return <div className="space-y-3">{renderDateRange(byDateRange, setByDateRange)}<button onClick={handlePurchaseByDateRange} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    if (cardId === 'best-suppliers') return <div className="space-y-3">{renderDateRange(bestSuppliersRange, setBestSuppliersRange)}<button onClick={handleBestSuppliers} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;

    return <div className="space-y-3">{renderDateRange(priceVarianceRange, setPriceVarianceRange)}<select value={selectedVarianceProductId} onChange={(event) => setSelectedVarianceProductId(event.target.value)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"><option value="">Select Product</option>{products.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select><div className="grid grid-cols-2 gap-3"><button onClick={() => handlePriceVariance('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button><button onClick={() => handlePriceVariance('all')} disabled={loadingCardId === cardId} className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70">All</button></div></div>;
  };

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && <div className="inline-flex items-center gap-2 rounded-md border border-[#b8c8d7] bg-white px-3 py-2 text-sm text-[#38556d]"><Loader2 className="h-4 w-4 animate-spin" />Loading supplier and product options...</div>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {purchaseCards.map((card) => {
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
