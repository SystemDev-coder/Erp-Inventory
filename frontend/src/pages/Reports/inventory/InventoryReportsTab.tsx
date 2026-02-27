import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn, ReportTotalItem } from '../../../components/reports/ReportModal';
import { inventoryReportsService } from '../../../services/reports/inventoryReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, formatQuantity, toRecordRows, todayDate, defaultReportRange } from '../reportUtils';

type InventoryCardId =
  | 'current-stock'
  | 'low-stock'
  | 'movement-history'
  | 'valuation'
  | 'reorder-plan'
  | 'adjustments'
  | 'store-stock'
  | 'store-wise';

const inventoryCards: Array<{ id: InventoryCardId; title: string; hint: string }> = [
  { id: 'current-stock', title: 'Current Stock Levels', hint: 'All items with stock' },
  { id: 'low-stock', title: 'Low Stock Alert', hint: 'Only below threshold' },
  { id: 'movement-history', title: 'Stock Movement History', hint: 'Between two dates' },
  { id: 'valuation', title: 'Inventory Valuation', hint: 'Current stock value' },
  { id: 'reorder-plan', title: 'Reorder Planning', hint: 'Useful restock suggestion' },
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

const reorderPlanColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'barcode', header: 'Barcode' },
  { key: 'total_qty', header: 'Current Qty', align: 'right', render: (row) => formatQuantity(row.total_qty) },
  { key: 'min_stock_threshold', header: 'Min Qty', align: 'right', render: (row) => formatQuantity(row.min_stock_threshold) },
  { key: 'reorder_qty', header: 'Reorder Qty', align: 'right', render: (row) => formatQuantity(row.reorder_qty) },
  { key: 'cost_price', header: 'Unit Cost', align: 'right', render: (row) => formatCurrency(row.cost_price) },
  { key: 'reorder_cost', header: 'Reorder Cost', align: 'right', render: (row) => formatCurrency(row.reorder_cost) },
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

const sumByKey = (rows: Record<string, unknown>[], key: string) =>
  rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);

const countTotal = (label: string, value: number): ReportTotalItem => ({
  label,
  value: Math.max(0, Number(value || 0)).toLocaleString(),
});

const quantityTotal = (label: string, value: number): ReportTotalItem => ({
  label,
  value: formatQuantity(value),
});

const moneyTotal = (label: string, value: number): ReportTotalItem => ({
  label,
  value: formatCurrency(value),
});

export function InventoryReportsTab({ onOpenModal }: Props) {
  const [expandedCardId, setExpandedCardId] = useState<InventoryCardId | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<InventoryCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [selectedStoreSummaryId, setSelectedStoreSummaryId] = useState('');
  const [selectedStoreDetailsId, setSelectedStoreDetailsId] = useState('');

  const [movementRange, setMovementRange] = useState<DateRange>(defaultReportRange());
  const [adjustmentRange, setAdjustmentRange] = useState<DateRange>(defaultReportRange());

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
      const rows = toRecordRows(response.data.rows || []);
      const totalQty = sumByKey(rows, 'total_qty');
      const totalCostValue = sumByKey(rows, 'stock_value');
      const totalSaleValue = rows.reduce(
        (sum, row) => sum + Number(row.total_qty || 0) * Number(row.sale_price || 0),
        0
      );
      const lowStockCount = rows.reduce((count, row) => count + (row.low_stock ? 1 : 0), 0);
      onOpenModal({
        title: 'Current Stock Levels',
        subtitle: 'All Active Items',
        fileName: 'current-stock-levels',
        data: rows,
        columns: currentStockColumns,
        filters: { Action: 'All Current Stock' },
        tableTotals: {
          label: 'Total',
          values: {
            total_qty: formatQuantity(totalQty),
            min_stock_threshold: formatQuantity(sumByKey(rows, 'min_stock_threshold')),
            stock_value: formatCurrency(totalCostValue),
          },
        },
        totals: [
          countTotal('Items', rows.length),
          quantityTotal('Total Qty', totalQty),
          moneyTotal('Total Cost Value', totalCostValue),
          moneyTotal('Total Sale Value', totalSaleValue),
          countTotal('Low Stock Items', lowStockCount),
        ],
      });
    });

  const handleLowStockAlert = () =>
    runCardAction('low-stock', async () => {
      const response = await inventoryReportsService.getLowStockAlert();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load low stock alert');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Low Stock Alert',
        subtitle: 'Below threshold items',
        fileName: 'low-stock-alert',
        data: rows,
        columns: lowStockColumns,
        filters: { Scope: 'Low Stock Only' },
        tableTotals: {
          label: 'Total',
          values: {
            total_qty: formatQuantity(sumByKey(rows, 'total_qty')),
            min_stock_threshold: formatQuantity(sumByKey(rows, 'min_stock_threshold')),
            stock_value: formatCurrency(sumByKey(rows, 'stock_value')),
          },
        },
        totals: [
          countTotal('Items', rows.length),
          quantityTotal('Current Qty', sumByKey(rows, 'total_qty')),
          quantityTotal('Min Qty', sumByKey(rows, 'min_stock_threshold')),
          moneyTotal('Total Value', sumByKey(rows, 'stock_value')),
        ],
      });
    });

  const handleStockMovementHistory = () =>
    runCardAction('movement-history', async () => {
      ensureRangeValid(movementRange, 'Stock Movement History');
      const response = await inventoryReportsService.getStockMovementHistory(movementRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load movement history');
      const rows = toRecordRows(response.data.rows || []);
      const inboundQty = rows.reduce((sum, row) => {
        const direction = String(row.direction || '').toUpperCase();
        return direction === 'IN' ? sum + Number(row.quantity || 0) : sum;
      }, 0);
      const outboundQty = rows.reduce((sum, row) => {
        const direction = String(row.direction || '').toUpperCase();
        return direction === 'OUT' ? sum + Number(row.quantity || 0) : sum;
      }, 0);
      onOpenModal({
        title: 'Stock Movement History',
        subtitle: `${formatDateOnly(movementRange.fromDate)} - ${formatDateOnly(movementRange.toDate)}`,
        fileName: 'stock-movement-history',
        data: rows,
        columns: movementColumns,
        filters: { 'From Date': movementRange.fromDate, 'To Date': movementRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            quantity: formatQuantity(sumByKey(rows, 'quantity')),
            total_cost: formatCurrency(sumByKey(rows, 'total_cost')),
          },
        },
        totals: [
          countTotal('Transactions', rows.length),
          quantityTotal('Inbound Qty', inboundQty),
          quantityTotal('Outbound Qty', outboundQty),
          quantityTotal('Net Qty', inboundQty - outboundQty),
          moneyTotal('Total Cost', sumByKey(rows, 'total_cost')),
        ],
      });
    });

  const handleInventoryValuation = () =>
    runCardAction('valuation', async () => {
      const response = await inventoryReportsService.getInventoryValuation();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load valuation');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Inventory Valuation',
        subtitle: 'Current stock value',
        fileName: 'inventory-valuation',
        data: rows,
        columns: valuationColumns,
        filters: { Action: 'Show Valuation' },
        tableTotals: {
          label: 'Total',
          values: {
            total_qty: formatQuantity(sumByKey(rows, 'total_qty')),
            cost_value: formatCurrency(sumByKey(rows, 'cost_value')),
            retail_value: formatCurrency(sumByKey(rows, 'retail_value')),
          },
        },
        totals: [
          countTotal('Items', rows.length),
          quantityTotal('Total Qty', sumByKey(rows, 'total_qty')),
          moneyTotal('Cost Value', sumByKey(rows, 'cost_value')),
          moneyTotal('Retail Value', sumByKey(rows, 'retail_value')),
        ],
      });
    });

  const handleReorderPlanning = () =>
    runCardAction('reorder-plan', async () => {
      const response = await inventoryReportsService.getLowStockAlert();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load reorder planning');
      const preparedRows = (response.data.rows || []).map((row) => {
        const currentQty = Number(row.total_qty || 0);
        const minQty = Number(row.min_stock_threshold || 0);
        const reorderQty = Math.max(minQty - currentQty, 0);
        const reorderCost = reorderQty * Number(row.cost_price || 0);
        return {
          ...row,
          reorder_qty: reorderQty,
          reorder_cost: reorderCost,
        };
      });
      const rows = toRecordRows(preparedRows);
      onOpenModal({
        title: 'Reorder Planning',
        subtitle: 'Items that need restock now',
        fileName: 'reorder-planning',
        data: rows,
        columns: reorderPlanColumns,
        filters: { Scope: 'Low Stock Items' },
        tableTotals: {
          label: 'Total',
          values: {
            total_qty: formatQuantity(sumByKey(rows, 'total_qty')),
            min_stock_threshold: formatQuantity(sumByKey(rows, 'min_stock_threshold')),
            reorder_qty: formatQuantity(sumByKey(rows, 'reorder_qty')),
            reorder_cost: formatCurrency(sumByKey(rows, 'reorder_cost')),
          },
        },
        totals: [
          countTotal('Items', rows.length),
          quantityTotal('Current Qty', sumByKey(rows, 'total_qty')),
          quantityTotal('Reorder Qty', sumByKey(rows, 'reorder_qty')),
          moneyTotal('Estimated Reorder Cost', sumByKey(rows, 'reorder_cost')),
        ],
      });
    });

  const handleStockAdjustmentLog = () =>
    runCardAction('adjustments', async () => {
      ensureRangeValid(adjustmentRange, 'Stock Adjustment Log');
      const response = await inventoryReportsService.getStockAdjustmentLog(adjustmentRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load adjustments');
      const rows = toRecordRows(response.data.rows || []);
      const addQty = rows.reduce((sum, row) => {
        const type = String(row.adjustment_type || '').toUpperCase();
        return type.includes('ADD') || type.includes('IN') || type.includes('+') ? sum + Number(row.quantity || 0) : sum;
      }, 0);
      const subtractQty = rows.reduce((sum, row) => {
        const type = String(row.adjustment_type || '').toUpperCase();
        return type.includes('SUB') || type.includes('OUT') || type.includes('-') ? sum + Number(row.quantity || 0) : sum;
      }, 0);
      onOpenModal({
        title: 'Stock Adjustment Log',
        subtitle: `${formatDateOnly(adjustmentRange.fromDate)} - ${formatDateOnly(adjustmentRange.toDate)}`,
        fileName: 'stock-adjustment-log',
        data: rows,
        columns: adjustmentColumns,
        filters: { 'From Date': adjustmentRange.fromDate, 'To Date': adjustmentRange.toDate },
        tableTotals: {
          label: 'Total',
          values: {
            quantity: formatQuantity(sumByKey(rows, 'quantity')),
          },
        },
        totals: [
          countTotal('Adjustments', rows.length),
          quantityTotal('Added Qty', addQty),
          quantityTotal('Reduced Qty', subtractQty),
          quantityTotal('Net Change', addQty - subtractQty),
        ],
      });
    });

  const handleStoreStockReport = (mode: 'show' | 'all') =>
    runCardAction('store-stock', async () => {
      const storeId = mode === 'show' ? Number(selectedStoreSummaryId || 0) : undefined;
      if (mode === 'show' && !storeId) throw new Error('Select a store first');
      const response = await inventoryReportsService.getStoreStockReport({ mode, storeId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load store stock report');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Store Stock Report',
        subtitle: mode === 'show' ? selectedStoreSummaryLabel || 'Selected Store' : 'All Stores',
        fileName: 'store-stock-report',
        data: rows,
        columns: storeStockColumns,
        filters: { Mode: mode === 'show' ? 'Show' : 'All', Store: mode === 'show' ? selectedStoreSummaryLabel || 'Selected Store' : 'All Stores' },
        tableTotals: {
          label: 'Total',
          values: {
            item_count: sumByKey(rows, 'item_count').toLocaleString(),
            total_qty: formatQuantity(sumByKey(rows, 'total_qty')),
            stock_value: formatCurrency(sumByKey(rows, 'stock_value')),
          },
        },
        totals: [
          countTotal('Stores', rows.length),
          countTotal('Items', sumByKey(rows, 'item_count')),
          quantityTotal('Total Qty', sumByKey(rows, 'total_qty')),
          moneyTotal('Total Value', sumByKey(rows, 'stock_value')),
        ],
      });
    });

  const handleStoreWiseStock = (mode: 'show' | 'all') =>
    runCardAction('store-wise', async () => {
      const storeId = mode === 'show' ? Number(selectedStoreDetailsId || 0) : undefined;
      if (mode === 'show' && !storeId) throw new Error('Select a store first');
      const response = await inventoryReportsService.getStoreWiseStock({ mode, storeId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load store-wise stock');
      const rows = toRecordRows(response.data.rows || []);
      const uniqueItems = new Set(rows.map((row) => String(row.item_id || ''))).size;
      onOpenModal({
        title: 'Store-wise Stock',
        subtitle: mode === 'show' ? selectedStoreDetailsLabel || 'Selected Store' : 'All Stores',
        fileName: 'store-wise-stock',
        data: rows,
        columns: storeWiseColumns,
        filters: { Mode: mode === 'show' ? 'Show' : 'All', Store: mode === 'show' ? selectedStoreDetailsLabel || 'Selected Store' : 'All Stores' },
        tableTotals: {
          label: 'Total',
          values: {
            quantity: formatQuantity(sumByKey(rows, 'quantity')),
            stock_value: formatCurrency(sumByKey(rows, 'stock_value')),
          },
        },
        totals: [
          countTotal('Rows', rows.length),
          countTotal('Unique Items', uniqueItems),
          quantityTotal('Total Qty', sumByKey(rows, 'quantity')),
          moneyTotal('Total Value', sumByKey(rows, 'stock_value')),
        ],
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
    if (cardId === 'reorder-plan') return <button onClick={handleReorderPlanning} disabled={loadingCardId === cardId} className="inline-flex min-w-[180px] items-center justify-center rounded-md bg-[#0f4f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4061] disabled:cursor-not-allowed disabled:opacity-70">Show Reorder Plan</button>;
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

