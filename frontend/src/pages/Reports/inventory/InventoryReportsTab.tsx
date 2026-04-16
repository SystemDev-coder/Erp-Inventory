import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn, ReportTotalItem } from '../../../components/reports/ReportModal';
import { inventoryReportsService } from '../../../services/reports/inventoryReports.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, formatQuantity, toRecordRows, defaultReportRange } from '../reportUtils';

type InventoryCardId =
  | 'current-stock'
  | 'low-stock'
  | 'valuation'
  | 'adjustments'
  | 'inventory-loss'
  | 'inventory-ledger'
  | 'store-stock'
  | 'store-wise'
  | 'store-movement'
  | 'store-movement-detail';

const inventoryCards: Array<{ id: InventoryCardId; title: string; hint: string }> = [
  { id: 'current-stock', title: 'Current Stock Levels', hint: 'All items with stock' },
  { id: 'low-stock', title: 'Low Stock Alert', hint: 'Only below threshold' },
  { id: 'valuation', title: 'Stock Value', hint: 'Total value of current stock' },
  { id: 'adjustments', title: 'Stock Adjustment Log', hint: 'Between two dates' },
  { id: 'inventory-loss', title: 'Inventory Loss', hint: 'Lost/damaged adjustments' },
  { id: 'inventory-ledger', title: 'Inventory Found', hint: 'Increase adjustments (found stock)' },
  { id: 'store-stock', title: 'Store Stock Report', hint: 'Show selected store or all' },
  { id: 'store-wise', title: 'Store-wise Stock', hint: 'Detailed by store' },
  { id: 'store-movement', title: 'Store Movement Summary', hint: 'Between two dates + begin/purchase/sales qty' },
  { id: 'store-movement-detail', title: 'Store Movement Detail', hint: 'Item-wise movement between two dates' },
];

const currentStockColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'total_qty', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.total_qty) },
  { key: 'min_stock_threshold', header: 'Min Qty', align: 'right', render: (row) => formatQuantity(row.min_stock_threshold) },
  { key: 'low_stock', header: 'Low Stock', render: (row) => (row.low_stock ? 'Yes' : 'No') },
  { key: 'cost_price', header: 'Cost', align: 'right', render: (row) => formatCurrency(row.cost_price) },
  { key: 'sale_price', header: 'Sale', align: 'right', render: (row) => formatCurrency(row.sale_price) },
  { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
];

const lowStockColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'total_qty', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.total_qty) },
  { key: 'min_stock_threshold', header: 'Min Qty', align: 'right', render: (row) => formatQuantity(row.min_stock_threshold) },
  { key: 'stock_value', header: 'Value', align: 'right', render: (row) => formatCurrency(row.stock_value) },
];

const valuationColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'total_qty', header: 'Qty', align: 'right', render: (row) => formatQuantity(row.total_qty) },
  { key: 'cost_price', header: 'Cost', align: 'right', render: (row) => formatCurrency(row.cost_price) },
  { key: 'sell_price', header: 'Sale', align: 'right', render: (row) => formatCurrency(row.sell_price) },
  { key: 'cost_value', header: 'Cost Value', align: 'right', render: (row) => formatCurrency(row.cost_value) },
  { key: 'retail_value', header: 'Retail Value', align: 'right', render: (row) => formatCurrency(row.retail_value) },
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

const lossColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'loss_id', header: 'Loss #' },
  { key: 'loss_date', header: 'Date', render: (row) => formatDateTime(row.loss_date) },
  { key: 'item_name', header: 'Item' },
  { key: 'quantity', header: 'Qty Lost', align: 'right', render: (row) => formatQuantity(row.quantity) },
  { key: 'unit_cost', header: 'Unit Cost', align: 'right', render: (row) => formatCurrency(row.unit_cost) },
  { key: 'total_loss', header: 'Total Loss', align: 'right', render: (row) => formatCurrency(row.total_loss) },
  { key: 'reason', header: 'Reason' },
  { key: 'status', header: 'Status' },
  { key: 'created_by', header: 'Created By' },
];

const foundColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'found_id', header: 'Found #' },
  { key: 'found_date', header: 'Date', render: (row) => formatDateTime(row.found_date) },
  { key: 'item_name', header: 'Item' },
  { key: 'quantity', header: 'Qty Found', align: 'right', render: (row) => formatQuantity(row.quantity) },
  { key: 'unit_cost', header: 'Unit Cost', align: 'right', render: (row) => formatCurrency(row.unit_cost) },
  { key: 'total_found', header: 'Total Found', align: 'right', render: (row) => formatCurrency(row.total_found) },
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

const storeMovementColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'store_name', header: 'Store' },
  { key: 'item_count', header: 'Items', align: 'right' },
  { key: 'begin_qty', header: 'Begin Qty', align: 'right', render: (row) => formatQuantity(row.begin_qty) },
  { key: 'purchase_qty', header: 'Purchase Qty', align: 'right', render: (row) => formatQuantity(row.purchase_qty) },
  { key: 'sales_qty', header: 'Sales Qty', align: 'right', render: (row) => formatQuantity(row.sales_qty) },
  { key: 'sales_return_qty', header: 'Sales Return', align: 'right', render: (row) => formatQuantity(row.sales_return_qty) },
  { key: 'purchase_return_qty', header: 'Purchase Return', align: 'right', render: (row) => formatQuantity(row.purchase_return_qty) },
  { key: 'adjustment_in_qty', header: 'Adjust In', align: 'right', render: (row) => formatQuantity(row.adjustment_in_qty) },
  { key: 'adjustment_out_qty', header: 'Adjust Out', align: 'right', render: (row) => formatQuantity(row.adjustment_out_qty) },
  { key: 'net_movement_qty', header: 'Net Move', align: 'right', render: (row) => formatQuantity(row.net_movement_qty) },
  { key: 'ending_qty', header: 'Ending Qty', align: 'right', render: (row) => formatQuantity(row.ending_qty) },
];

const storeMovementDetailColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'store_name', header: 'Store' },
  { key: 'item_name', header: 'Item' },
  { key: 'type_display', header: 'Type' },
  { key: 'txn_date', header: 'Date', render: (row) => formatDateTime(row.txn_date) },
  { key: 'num', header: 'Num' },
  { key: 'name_display', header: 'Name' },
  { key: 'memo_display', header: 'Memo' },
  { key: 'split_display', header: 'Split' },
  { key: 'debit', header: 'Debit', align: 'right', render: (row) => formatCurrency(row.debit) },
  { key: 'credit', header: 'Credit', align: 'right', render: (row) => formatCurrency(row.credit) },
  { key: 'balance_display', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.balance_display) },
];

const formatInventoryLedgerType = (txnType: unknown, refTable: unknown) => {
  const t = String(txnType || '').toLowerCase();
  const r = String(refTable || '').toLowerCase();
  if (t === 'opening') return 'Opening Balance';
  if (r === 'sales') return 'Invoice';
  if (r === 'purchases') return 'Bill';
  if (r === 'sales_returns') return 'Credit Memo';
  if (r === 'purchase_returns') return 'Vendor Credit';
  if (r === 'stock_adjustment' || t.includes('adjust')) return 'Inventory Adjust';
  if (r === 'journal_entries' || t === 'journal') return 'Journal';
  if (r === 'customer_receipts') return 'Receipt';
  if (r === 'supplier_receipts') return 'Payment';
  if (t === 'other') return 'Other';
  return t
    ? t.split(/[_\s]+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : '—';
};

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
  const [selectedStoreMovementId, setSelectedStoreMovementId] = useState('');
  const [selectedStoreMovementDetailId, setSelectedStoreMovementDetailId] = useState('');
  const [selectedMovementItemId, setSelectedMovementItemId] = useState('');

  const [adjustmentRange, setAdjustmentRange] = useState<DateRange>(defaultReportRange());
  const [lossRange, setLossRange] = useState<DateRange>(defaultReportRange());
  const [inventoryLedgerRange, setInventoryLedgerRange] = useState<DateRange>(defaultReportRange());
  const [movementRange, setMovementRange] = useState<DateRange>(defaultReportRange());
  const [movementDetailRange, setMovementDetailRange] = useState<DateRange>(defaultReportRange());

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [stores, setStores] = useState<Array<{ id: number; label: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: number; label: string }>>([]);

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');
    inventoryReportsService
      .getInventoryOptions()
      .then((response) => {
        if (!alive) return;
        if (!response.success || !response.data) {
          setOptionsError(response.error || response.message || 'Failed to load store/item options');
          return;
        }
        setStores(response.data.stores || []);
        setProducts(response.data.products || []);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load store/item options');
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
  const selectedStoreMovementLabel = useMemo(
    () => stores.find((option) => String(option.id) === selectedStoreMovementId)?.label || '',
    [stores, selectedStoreMovementId]
  );
  const selectedStoreMovementDetailLabel = useMemo(
    () => stores.find((option) => String(option.id) === selectedStoreMovementDetailId)?.label || '',
    [stores, selectedStoreMovementDetailId]
  );
  const selectedMovementItemLabel = useMemo(
    () => products.find((option) => String(option.id) === selectedMovementItemId)?.label || '',
    [products, selectedMovementItemId]
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
      const totalCostValue = sumByKey(rows, 'amount');
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
            amount: formatCurrency(totalCostValue),
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

  const handleInventoryValuation = () =>
    runCardAction('valuation', async () => {
      const response = await inventoryReportsService.getInventoryValuation();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load valuation');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Stock Value',
        subtitle: 'Current inventory value',
        fileName: 'inventory-valuation',
        data: rows,
        columns: valuationColumns,
        filters: { Action: 'View Stock Value' },
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

  const handleInventoryLoss = () =>
    runCardAction('inventory-loss', async () => {
      ensureRangeValid(lossRange, 'Inventory Loss');
      const response = await inventoryReportsService.getInventoryLoss(lossRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load inventory loss');
      const rows = toRecordRows(response.data.rows || []);
      const totalQty = sumByKey(rows, 'quantity');
      const totalLoss = sumByKey(rows, 'total_loss');
      onOpenModal({
        title: 'Inventory Loss',
        subtitle: `${formatDateOnly(lossRange.fromDate)} - ${formatDateOnly(lossRange.toDate)}`,
        fileName: 'inventory-loss',
        data: rows,
        columns: lossColumns,
        filters: { 'From Date': lossRange.fromDate, 'To Date': lossRange.toDate, Type: 'Decrease Adjustments' },
        tableTotals: {
          label: 'Total',
          values: {
            quantity: formatQuantity(totalQty),
            total_loss: formatCurrency(totalLoss),
          },
        },
        totals: [
          countTotal('Loss Records', rows.length),
          quantityTotal('Total Qty Lost', totalQty),
          moneyTotal('Total Loss', totalLoss),
        ],
      });
    });

  const handleInventoryFound = () =>
    runCardAction('inventory-ledger', async () => {
      ensureRangeValid(inventoryLedgerRange, 'Inventory Found');
      const response = await inventoryReportsService.getInventoryFound({
        fromDate: inventoryLedgerRange.fromDate,
        toDate: inventoryLedgerRange.toDate,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load inventory found');

      const rows = toRecordRows(response.data.rows || []);
      const totalQty = sumByKey(rows, 'quantity');
      const totalFound = sumByKey(rows, 'total_found');

      onOpenModal({
        title: 'Inventory Found',
        subtitle: `${formatDateOnly(inventoryLedgerRange.fromDate)} - ${formatDateOnly(inventoryLedgerRange.toDate)}`,
        fileName: 'inventory-found',
        data: rows,
        columns: foundColumns,
        filters: {
          'From Date': inventoryLedgerRange.fromDate,
          'To Date': inventoryLedgerRange.toDate,
          Type: 'Increase Adjustments',
        },
        tableTotals: {
          label: 'Total',
          values: {
            quantity: formatQuantity(totalQty),
            total_found: formatCurrency(totalFound),
          },
        },
        totals: [
          countTotal('Found Records', rows.length),
          quantityTotal('Total Qty Found', totalQty),
          moneyTotal('Total Found', totalFound),
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

  const handleStoreMovementSummary = (mode: 'show' | 'all') =>
    runCardAction('store-movement', async () => {
      ensureRangeValid(movementRange, 'Store Movement Summary');
      const storeId = mode === 'show' ? Number(selectedStoreMovementId || 0) : undefined;
      if (mode === 'show' && !storeId) throw new Error('Select a store first');
      const response = await inventoryReportsService.getStoreMovementSummary({
        mode,
        fromDate: movementRange.fromDate,
        toDate: movementRange.toDate,
        storeId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load store movement summary');
      const rows = toRecordRows(response.data.rows || []);
      onOpenModal({
        title: 'Store Movement Summary',
        subtitle: mode === 'show' ? selectedStoreMovementLabel || 'Selected Store' : 'All Stores',
        fileName: 'store-movement-summary',
        data: rows,
        columns: storeMovementColumns,
        filters: {
          'From Date': movementRange.fromDate,
          'To Date': movementRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Store: mode === 'show' ? selectedStoreMovementLabel || 'Selected Store' : 'All Stores',
        },
        tableTotals: {
          label: 'Total',
          values: {
            item_count: sumByKey(rows, 'item_count').toLocaleString(),
            begin_qty: formatQuantity(sumByKey(rows, 'begin_qty')),
            purchase_qty: formatQuantity(sumByKey(rows, 'purchase_qty')),
            sales_qty: formatQuantity(sumByKey(rows, 'sales_qty')),
            sales_return_qty: formatQuantity(sumByKey(rows, 'sales_return_qty')),
            purchase_return_qty: formatQuantity(sumByKey(rows, 'purchase_return_qty')),
            adjustment_in_qty: formatQuantity(sumByKey(rows, 'adjustment_in_qty')),
            adjustment_out_qty: formatQuantity(sumByKey(rows, 'adjustment_out_qty')),
            net_movement_qty: formatQuantity(sumByKey(rows, 'net_movement_qty')),
            ending_qty: formatQuantity(sumByKey(rows, 'ending_qty')),
          },
        },
        totals: [
          countTotal('Stores', rows.length),
          countTotal('Items', sumByKey(rows, 'item_count')),
          quantityTotal('Begin Qty', sumByKey(rows, 'begin_qty')),
          quantityTotal('Purchase Qty', sumByKey(rows, 'purchase_qty')),
          quantityTotal('Sales Qty', sumByKey(rows, 'sales_qty')),
          quantityTotal('Net Move', sumByKey(rows, 'net_movement_qty')),
          quantityTotal('Ending Qty', sumByKey(rows, 'ending_qty')),
        ],
      });
    });

  const handleStoreMovementDetail = (mode: 'show' | 'all') =>
    runCardAction('store-movement-detail', async () => {
      ensureRangeValid(movementDetailRange, 'Store Movement Detail');
      const storeId = mode === 'show' ? Number(selectedStoreMovementDetailId || 0) : undefined;
      if (mode === 'show' && !storeId) throw new Error('Select a store first');
      const itemId = selectedMovementItemId ? Number(selectedMovementItemId) : undefined;
      const response = await inventoryReportsService.getStoreMovementDetail({
        mode,
        fromDate: movementDetailRange.fromDate,
        toDate: movementDetailRange.toDate,
        storeId,
        itemId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load store movement detail');
      const rows: Record<string, unknown>[] = toRecordRows(response.data.rows || []).map((row) => ({
        ...row,
        type_display: formatInventoryLedgerType(row.txn_type, row.ref_table),
        num: String(row.txn_number || row.ref_id || ''),
        name_display: String(row.party_name || row.item_name || ''),
        memo_display: String(row.memo || ''),
        split_display: String(row.split_account || ''),
        balance_display: Number(row.running_balance || 0),
      }));
      const totalDebit = sumByKey(rows, 'debit');
      const totalCredit = sumByKey(rows, 'credit');
      const closingBalance =
        mode === 'show'
          ? (rows.length ? Number(rows[rows.length - 1].balance_display || 0) : 0)
          : Array.from(
              rows.reduce((map, row) => {
                map.set(String(row.store_id || '0'), Number(row.balance_display || 0));
                return map;
              }, new Map<string, number>()).values()
            ).reduce((sum, value) => sum + Number(value || 0), 0);
      onOpenModal({
        title: 'Store Movement Detail',
        subtitle: mode === 'show' ? selectedStoreMovementDetailLabel || 'Selected Store' : 'All Stores',
        fileName: 'store-movement-detail',
        data: rows,
        columns: storeMovementDetailColumns,
        filters: {
          'From Date': movementDetailRange.fromDate,
          'To Date': movementDetailRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Store: mode === 'show' ? selectedStoreMovementDetailLabel || 'Selected Store' : 'All Stores',
          Item: selectedMovementItemLabel || 'All Items',
        },
        tableTotals: {
          label: 'Total',
          values: {
            debit: formatCurrency(totalDebit),
            credit: formatCurrency(totalCredit),
            balance_display: formatCurrency(closingBalance),
          },
        },
        totals: [
          countTotal('Rows', rows.length),
          countTotal('Items', new Set(rows.map((row) => String(row.item_id || ''))).size),
          moneyTotal('Total Debit', totalDebit),
          moneyTotal('Total Credit', totalCredit),
          moneyTotal('Closing Balance', closingBalance),
        ],
      });
    });

  const renderDateRange = (range: DateRange, onChange: (next: DateRange) => void) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-semibold text-slate-600">
        <span>From Date</span>
        <input type="date" value={range.fromDate} onChange={(event) => onChange({ ...range, fromDate: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none" />
      </label>
      <label className="space-y-1 text-xs font-semibold text-slate-600">
        <span>To Date</span>
        <input type="date" value={range.toDate} onChange={(event) => onChange({ ...range, toDate: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none" />
      </label>
    </div>
  );

  const renderCardBody = (cardId: InventoryCardId) => {
    if (cardId === 'current-stock') return <button onClick={handleCurrentStockLevels} disabled={loadingCardId === cardId} className="inline-flex min-w-[180px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">All Current Stock</button>;
    if (cardId === 'low-stock') return <button onClick={handleLowStockAlert} disabled={loadingCardId === cardId} className="inline-flex min-w-[180px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">Show Low Stock</button>;
    if (cardId === 'valuation') return <button onClick={handleInventoryValuation} disabled={loadingCardId === cardId} className="inline-flex min-w-[180px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">View Stock Value</button>;
    if (cardId === 'adjustments') return <div className="space-y-3">{renderDateRange(adjustmentRange, setAdjustmentRange)}<button onClick={handleStockAdjustmentLog} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    if (cardId === 'inventory-loss') return <div className="space-y-3">{renderDateRange(lossRange, setLossRange)}<button onClick={handleInventoryLoss} disabled={loadingCardId === cardId} className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">Show</button></div>;
    if (cardId === 'inventory-ledger') return <div className="space-y-3">{renderDateRange(inventoryLedgerRange, setInventoryLedgerRange)}<button onClick={handleInventoryFound} disabled={loadingCardId === cardId} className="inline-flex min-w-[200px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">Show Found</button></div>;

    if (cardId === 'store-stock') {
      return (
        <div className="space-y-3">
          <select value={selectedStoreSummaryId} onChange={(event) => setSelectedStoreSummaryId(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none">
            <option value="">Select Store</option>
            {stores.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleStoreStockReport('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">Show</button>
            <button onClick={() => handleStoreStockReport('all')} disabled={loadingCardId === cardId} className="rounded-md border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-70">All</button>
          </div>
        </div>
      );
    }

    if (cardId === 'store-movement') {
      return (
        <div className="space-y-3">
          {renderDateRange(movementRange, setMovementRange)}
          <select value={selectedStoreMovementId} onChange={(event) => setSelectedStoreMovementId(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none">
            <option value="">Select Store</option>
            {stores.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleStoreMovementSummary('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">Show</button>
            <button onClick={() => handleStoreMovementSummary('all')} disabled={loadingCardId === cardId} className="rounded-md border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-70">All</button>
          </div>
        </div>
      );
    }

    if (cardId === 'store-movement-detail') {
      return (
        <div className="space-y-3">
          {renderDateRange(movementDetailRange, setMovementDetailRange)}
          <select value={selectedStoreMovementDetailId} onChange={(event) => setSelectedStoreMovementDetailId(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none">
            <option value="">Select Store</option>
            {stores.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <select value={selectedMovementItemId} onChange={(event) => setSelectedMovementItemId(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none">
            <option value="">All Items</option>
            {products.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => handleStoreMovementDetail('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">Show</button>
            <button onClick={() => handleStoreMovementDetail('all')} disabled={loadingCardId === cardId} className="rounded-md border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-70">All</button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <select value={selectedStoreDetailsId} onChange={(event) => setSelectedStoreDetailsId(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none">
          <option value="">Select Store</option>
          {stores.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => handleStoreWiseStock('show')} disabled={loadingCardId === cardId} className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">Show</button>
          <button onClick={() => handleStoreWiseStock('all')} disabled={loadingCardId === cardId} className="rounded-md border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-70">All</button>
        </div>
      </div>
    );
  };

  const renderCard = (card: { id: InventoryCardId; title: string; hint: string }) => {
    const isOpen = expandedCardId === card.id;
    return (
      <div key={card.id} className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.08)]">
        <button
          onClick={() => {
            setCardErrors((prev) => ({ ...prev, [card.id]: '' }));
            setExpandedCardId((prev) => (prev === card.id ? null : card.id));
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

  const leftColumnCards = inventoryCards.filter((_, index) => index % 2 === 0);
  const rightColumnCards = inventoryCards.filter((_, index) => index % 2 === 1);

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />Loading store/item options...</div>}
      <div className="space-y-3 lg:hidden">
        {inventoryCards.map(renderCard)}
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


