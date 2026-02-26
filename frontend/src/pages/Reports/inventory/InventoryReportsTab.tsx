import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn } from '../../../components/reports/ReportModal';
import { inventoryReportsService } from '../../../services/reports/inventoryReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, formatQuantity, toRecordRows, todayDate } from '../reportUtils';

type InventoryCardId =
  | 'current-stock'
  | 'low-stock'
  | 'movement-history'
  | 'valuation'
  | 'expiry'
  | 'adjustments'
  | 'store-stock'
  | 'store-wise';

const inventoryCards: Array<{ id: InventoryCardId; title: string; hint: string }> = [
  { id: 'current-stock', title: 'Current Stock Levels', hint: 'All items with stock' },
  { id: 'low-stock', title: 'Low Stock Alert', hint: 'Only below threshold' },
  { id: 'movement-history', title: 'Stock Movement History', hint: 'Between two dates' },
  { id: 'valuation', title: 'Inventory Valuation', hint: 'Current stock value' },
  { id: 'expiry', title: 'Expiry Tracking', hint: 'Between two dates' },
  { id: 'adjustments', title: 'Stock Adjustment Log', hint: 'Between two dates' },
  { id: 'store-stock', title: 'Store Stock Report', hint: 'Show selected store or all' },
  { id: 'store-wise', title: 'Store-wise Stock', hint: 'Detailed by store' },
];

const currentStockColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'barcode', header: 'Barcode' },
  { key: 'total_qty', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.total_qty) },
  { key: 'min_stock_threshold', header: 'Min Qty', align: 'right', render: (row) => formatQuantity(row.min_stock_threshold) },
  { key: 'low_stock', header: 'Low Stock', render: (row) => (row.low_stock ? 'Yes' : 'No') },
  { key: 'cost_price', header: 'Cost', align: 'right', render: (row) => formatCurrency(row.cost_price) },
  { key: 'sale_price', header: 'Sale', align: 'right', render: (row) => formatCurrency(row.sale_price) },
  { key: 'stock_value', header: 'Value', align: 'right', render: (row) => formatCurrency(row.stock_value) },
];

const lowStockColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'total_qty', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.total_qty) },
  { key: 'min_stock_threshold', header: 'Min Qty', align: 'right', render: (row) => formatQuantity(row.min_stock_threshold) },
  { key: 'stock_value', header: 'Value', align: 'right', render: (row) => formatCurrency(row.stock_value) },
];

const movementColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'transaction_id', header: 'Txn #' },
  { key: 'transaction_date', header: 'Date', render: (row) => formatDateTime(row.transaction_date) },
  { key: 'transaction_type', header: 'Type' },
  { key: 'direction', header: 'Dir' },
  { key: 'item_name', header: 'Item' },
  { key: 'store_name', header: 'Store' },
  { key: 'quantity', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.quantity) },
  { key: 'unit_cost', header: 'Unit Cost', align: 'right', render: (row) => formatCurrency(row.unit_cost) },
  { key: 'total_cost', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total_cost) },
  { key: 'reference_no', header: 'Ref' },
  { key: 'status', header: 'Status' },
];

const valuationColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'total_qty', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.total_qty) },
  { key: 'cost_price', header: 'Cost', align: 'right', render: (row) => formatCurrency(row.cost_price) },
  { key: 'sell_price', header: 'Sale', align: 'right', render: (row) => formatCurrency(row.sell_price) },
  { key: 'cost_value', header: 'Cost Value', align: 'right', render: (row) => formatCurrency(row.cost_value) },
  { key: 'retail_value', header: 'Retail Value', align: 'right', render: (row) => formatCurrency(row.retail_value) },
];

const expiryColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'purchase_date', header: 'Purchase Date', render: (row) => formatDateTime(row.purchase_date) },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'item_name', header: 'Item' },
  { key: 'batch_no', header: 'Batch' },
  { key: 'expiry_date', header: 'Expiry Date' },
  { key: 'days_to_expiry', header: 'Days Left', align: 'right' },
  { key: 'quantity', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.quantity) },
  { key: 'unit_cost', header: 'Unit Cost', align: 'right', render: (row) => formatCurrency(row.unit_cost) },
];

const adjustmentColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'adjustment_id', header: 'Adjustment #' },
  { key: 'adjustment_date', header: 'Date', render: (row) => formatDateTime(row.adjustment_date) },
  { key: 'item_name', header: 'Item' },
  { key: 'adjustment_type', header: 'Type' },
  { key: 'quantity', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.quantity) },
  { key: 'reason', header: 'Reason' },
  { key: 'status', header: 'Status' },
  { key: 'created_by', header: 'Created By' },
];

const storeStockColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'store_name', header: 'Store' },
  { key: 'item_count', header: 'Items', align: 'right' },
  { key: 'total_qty', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.total_qty) },
  { key: 'stock_value', header: 'Value', align: 'right', render: (row) => formatCurrency(row.stock_value) },
];

const storeWiseColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'store_name', header: 'Store' },
  { key: 'item_name', header: 'Item' },
  { key: 'barcode', header: 'Barcode' },
  { key: 'quantity', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.quantity) },
  { key: 'cost_price', header: 'Cost', align: 'right', render: (row) => formatCurrency(row.cost_price) },
  { key: 'sell_price', header: 'Sale', align: 'right', render: (row) => formatCurrency(row.sell_price) },
  { key: 'stock_value', header: 'Value', align: 'right', render: (row) => formatCurrency(row.stock_value) },
];

type Props = {
  onOpenModal: (report: ModalReportState) => void;
};

export function InventoryReportsTab({ onOpenModal }: Props) {
  const [expandedCardId, setExpandedCardId] = useState<InventoryCardId | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<InventoryCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [selectedStoreSummaryId, setSelectedStoreSummaryId] = useState('');
  const [selectedStoreDetailsId, setSelectedStoreDetailsId] = useState('');

  const [movementRange, setMovementRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [expiryRange, setExpiryRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });
  const [adjustmentRange, setAdjustmentRange] = useState<DateRange>({ fromDate: todayDate(), toDate: todayDate() });

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [stores, setStores] = useState<Array<{ id: number; label: string }>>([]);

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');
    inventoryReportsService
      .getInventoryOptions()
      .then((response) => {
        if (!alive) return;
        if (!response.success || !response.data) {
          setOptionsError(response.error || response.message || 'Failed to load store options');
          return;
        }
        setStores(response.data.stores || []);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load store options');
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const selectedStoreSummaryLabel = useMemo(
    () => stores.find((option) => String(option.id) === selectedStoreSummaryId)?.label || '',
    [stores, selectedStoreSummaryId]
  );
  const selectedStoreDetailsLabel = useMemo(
    () => stores.find((option) => String(option.id) === selectedStoreDetailsId)?.label || '',
    [stores, selectedStoreDetailsId]
  );

  const runCardAction = async (cardId: InventoryCardId, action: () => Promise<void>) => {
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

  const handleCurrentStockLevels = () =>
    runCardAction('current-stock', async () => {
      const response = await inventoryReportsService.getCurrentStockLevels();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load current stock');
      onOpenModal({
        title: 'Current Stock Levels',
        subtitle: 'All Active Items',
        fileName: 'current-stock-levels',
        data: toRecordRows(response.data.rows || []),
        columns: currentStockColumns,
        filters: { Action: 'All Current Stock' },
      });
    });

  const handleLowStockAlert = () =>
    runCardAction('low-stock', async () => {
      const response = await inventoryReportsService.getLowStockAlert();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load low stock alert');
      onOpenModal({
        title: 'Low Stock Alert',
        subtitle: 'Below threshold items',
        fileName: 'low-stock-alert',
        data: toRecordRows(response.data.rows || []),
        columns: lowStockColumns,
        filters: { Scope: 'Low Stock Only' },
      });
    });

  const handleStockMovementHistory = () =>
    runCardAction('movement-history', async () => {
      ensureRangeValid(movementRange, 'Stock Movement History');
      const response = await inventoryReportsService.getStockMovementHistory(movementRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load movement history');
      onOpenModal({
        title: 'Stock Movement History',
        subtitle: `${formatDateOnly(movementRange.fromDate)} - ${formatDateOnly(movementRange.toDate)}`,
        fileName: 'stock-movement-history',
        data: toRecordRows(response.data.rows || []),
        columns: movementColumns,
        filters: { 'From Date': movementRange.fromDate, 'To Date': movementRange.toDate },
      });
    });

  const handleInventoryValuation = () =>
    runCardAction('valuation', async () => {
      const response = await inventoryReportsService.getInventoryValuation();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load valuation');
      onOpenModal({
        title: 'Inventory Valuation',
        subtitle: 'Current stock value',
        fileName: 'inventory-valuation',
        data: toRecordRows(response.data.rows || []),
        columns: valuationColumns,
        filters: { Action: 'Show Valuation' },
      });
    });

  const handleExpiryTracking = () =>
    runCardAction('expiry', async () => {
      ensureRangeValid(expiryRange, 'Expiry Tracking');
      const response = await inventoryReportsService.getExpiryTracking(expiryRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load expiry tracking');
      onOpenModal({
        title: 'Expiry Tracking',
        subtitle: `${formatDateOnly(expiryRange.fromDate)} - ${formatDateOnly(expiryRange.toDate)}`,
        fileName: 'expiry-tracking',
        data: toRecordRows(response.data.rows || []),
        columns: expiryColumns,
        filters: { 'From Date': expiryRange.fromDate, 'To Date': expiryRange.toDate },
      });
    });

  const handleStockAdjustmentLog = () =>
    runCardAction('adjustments', async () => {
      ensureRangeValid(adjustmentRange, 'Stock Adjustment Log');
      const response = await inventoryReportsService.getStockAdjustmentLog(adjustmentRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load adjustments');
      onOpenModal({
        title: 'Stock Adjustment Log',
        subtitle: `${formatDateOnly(adjustmentRange.fromDate)} - ${formatDateOnly(adjustmentRange.toDate)}`,
        fileName: 'stock-adjustment-log',
        data: toRecordRows(response.data.rows || []),
        columns: adjustmentColumns,
        filters: { 'From Date': adjustmentRange.fromDate, 'To Date': adjustmentRange.toDate },
      });
    });

  const handleStoreStockReport = (mode: 'show' | 'all') =>
    runCardAction('store-stock', async () => {
      const storeId = mode === 'show' ? Number(selectedStoreSummaryId || 0) : undefined;
      if (mode === 'show' && !storeId) throw new Error('Select a store first');
      const response = await inventoryReportsService.getStoreStockReport({ mode, storeId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load store stock report');
      onOpenModal({
        title: 'Store Stock Report',
        subtitle: mode === 'show' ? selectedStoreSummaryLabel || 'Selected Store' : 'All Stores',
        fileName: 'store-stock-report',
        data: toRecordRows(response.data.rows || []),
        columns: storeStockColumns,
        filters: { Mode: mode === 'show' ? 'Show' : 'All', Store: mode === 'show' ? selectedStoreSummaryLabel || 'Selected Store' : 'All Stores' },
      });
    });

  const handleStoreWiseStock = (mode: 'show' | 'all') =>
    runCardAction('store-wise', async () => {
      const storeId = mode === 'show' ? Number(selectedStoreDetailsId || 0) : undefined;
      if (mode === 'show' && !storeId) throw new Error('Select a store first');
      const response = await inventoryReportsService.getStoreWiseStock({ mode, storeId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load store-wise stock');
      onOpenModal({
        title: 'Store-wise Stock',
        subtitle: mode === 'show' ? selectedStoreDetailsLabel || 'Selected Store' : 'All Stores',
        fileName: 'store-wise-stock',
        data: toRecordRows(response.data.rows || []),
        columns: storeWiseColumns,
        filters: { Mode: mode === 'show' ? 'Show' : 'All', Store: mode === 'show' ? selectedStoreDetailsLabel || 'Selected Store' : 'All Stores' },
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

  const renderCardBody = (cardId: InventoryCardId) => {
    if (cardId === 'current-stock') return <button onClick={handleCurrentStockLevels} disabled={loadingCardId === cardId} className="inline-flex min-w-[180px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">All Current Stock</button>;
    if (cardId === 'low-stock') return <button onClick={handleLowStockAlert} disabled={loadingCardId === cardId} className="inline-flex min-w-[180px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show Low Stock</button>;
    if (cardId === 'movement-history') return <div className="space-y-3">{renderDateRange(movementRange, setMovementRange)}<button onClick={handleStockMovementHistory} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    if (cardId === 'valuation') return <button onClick={handleInventoryValuation} disabled={loadingCardId === cardId} className="inline-flex min-w-[180px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show Valuation</button>;
    if (cardId === 'expiry') return <div className="space-y-3">{renderDateRange(expiryRange, setExpiryRange)}<button onClick={handleExpiryTracking} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    if (cardId === 'adjustments') return <div className="space-y-3">{renderDateRange(adjustmentRange, setAdjustmentRange)}<button onClick={handleStockAdjustmentLog} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;

    if (cardId === 'store-stock') {
      return (
        <div className="space-y-3">
          <select value={selectedStoreSummaryId} onChange={(event) => setSelectedStoreSummaryId(event.target.value)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none">
            <option value="">Select Store</option>
            {stores.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleStoreStockReport('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button>
            <button onClick={() => handleStoreStockReport('all')} disabled={loadingCardId === cardId} className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70">All</button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <select value={selectedStoreDetailsId} onChange={(event) => setSelectedStoreDetailsId(event.target.value)} className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none">
          <option value="">Select Store</option>
          {stores.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => handleStoreWiseStock('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show</button>
          <button onClick={() => handleStoreWiseStock('all')} disabled={loadingCardId === cardId} className="rounded-md border border-[#9ec5df] bg-white px-4 py-2.5 text-sm font-semibold text-[#0f4f76] hover:bg-[#edf5fb] disabled:cursor-not-allowed disabled:opacity-70">All</button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && <div className="inline-flex items-center gap-2 rounded-md border border-[#b8c8d7] bg-white px-3 py-2 text-sm text-[#38556d]"><Loader2 className="h-4 w-4 animate-spin" />Loading store options...</div>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {inventoryCards.map((card) => {
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
