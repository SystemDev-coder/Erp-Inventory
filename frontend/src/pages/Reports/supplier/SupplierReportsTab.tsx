import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn, ReportTotalItem } from '../../../components/reports/ReportModal';
import { financialReportsService } from '../../../services/reports/financialReports.service';
import { purchaseReportsService } from '../../../services/reports/purchaseReports.service';
import { financeService } from '../../../services/finance.service';
import { supplierService } from '../../../services/supplier.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatDateTime, toRecordRows, defaultReportRange } from '../reportUtils';

type SupplierCardId =
  | 'supplier-list'
  | 'supplier-ledger'
  | 'supplier-payments'
  | 'supplier-outstanding';
const supplierCards: Array<{ id: SupplierCardId; title: string; hint: string }> = [
  { id: 'supplier-list', title: 'Supplier List', hint: 'Dropdown + Show / All' },
  { id: 'supplier-ledger', title: 'Supplier Ledger', hint: 'Dropdown + Show / All' },
  { id: 'supplier-payments', title: 'Supplier Payments', hint: 'Date range + Show / All' },
  { id: 'supplier-outstanding', title: 'Outstanding Purchases', hint: 'Dropdown + Show / All' },
];
const supplierListColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'supplier_id', header: 'Supplier #' },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'company_name', header: 'Company' },
  { key: 'contact_person', header: 'Contact' },
  { key: 'phone', header: 'Phone' },
  { key: 'location', header: 'Location' },
  { key: 'remaining_balance', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.remaining_balance) },
  { key: 'status', header: 'Status' },
];

const formatSupplierLedgerId = (row: Record<string, unknown>) => {
  const rawId = Number(row.sup_ledger_id || 0);
  const entryType = String(row.entry_type || '').toLowerCase();
  if (entryType === 'opening' || rawId < 0) return 'OB';
  return rawId || '-';
};

const formatSupplierLedgerType = (value: unknown) => {
  const key = String(value || '').toLowerCase();
  if (key === 'opening') return 'Opening Balance';
  if (key === 'purchase') return 'Purchase';
  if (key === 'payment') return 'Payment';
  if (key === 'receipt') return 'Receipt';
  if (key === 'return') return 'Return';
  return key ? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-';
};

const formatSupplierLedgerRef = (row: Record<string, unknown>) => {
  const table = String(row.ref_table || '').toLowerCase();
  const id = row.ref_id ? `#${row.ref_id}` : '';
  if (table === 'suppliers') return 'Opening Balance';
  if (table === 'purchases') return `Purchase ${id}`.trim();
  if (table === 'supplier_payments') return `Payment ${id}`.trim();
  if (table === 'supplier_receipts') return `Receipt ${id}`.trim();
  if (table === 'purchase_returns') return `Return ${id}`.trim();
  if (!table && !id) return '-';
  return `${table.replace(/_/g, ' ')} ${id}`.trim();
};

const supplierLedgerColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sup_ledger_id', header: 'Entry #', render: (row) => formatSupplierLedgerId(row) },
  { key: 'entry_date', header: 'Date', render: (row) => formatDateTime(row.entry_date) },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'entry_type', header: 'Type', render: (row) => formatSupplierLedgerType(row.entry_type) },
  { key: 'reference', header: 'Reference', render: (row) => formatSupplierLedgerRef(row) },
  { key: 'note', header: 'Note' },
  { key: 'debit', header: 'Debit', align: 'right', render: (row) => formatCurrency(row.debit) },
  { key: 'credit', header: 'Credit', align: 'right', render: (row) => formatCurrency(row.credit) },
  { key: 'running_balance', header: 'Balance', align: 'right', render: (row) => formatCurrency(row.running_balance) },
];

const supplierPaymentsColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'sup_payment_id', header: 'Payment #' },
  { key: 'pay_date', header: 'Date', render: (row) => formatDateTime(row.pay_date) },
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'account_name', header: 'Account' },
  { key: 'amount_paid', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount_paid) },
  { key: 'reference_no', header: 'Reference' },
];

const supplierOutstandingColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'purchase_id', header: 'Purchase #' },
  { key: 'purchase_date', header: 'Date', render: (row) => formatDateTime(row.purchase_date) },
  { key: 'supplier_name', header: 'Supplier' },
  { key: 'total', header: 'Total', align: 'right', render: (row) => formatCurrency(row.total) },
  { key: 'paid', header: 'Paid', align: 'right', render: (row) => formatCurrency(row.paid) },
  { key: 'outstanding', header: 'Outstanding', align: 'right', render: (row) => formatCurrency(row.outstanding) },
  { key: 'status', header: 'Status' },
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

export function SupplierReportsTab({ onOpenModal }: Props) {
  const [expandedCardId, setExpandedCardId] = useState<SupplierCardId | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<SupplierCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: number; label: string }>>([]);

  const [selectedListSupplierId, setSelectedListSupplierId] = useState('');
  const [selectedLedgerSupplierId, setSelectedLedgerSupplierId] = useState('');
  const [selectedPaymentSupplierId, setSelectedPaymentSupplierId] = useState('');
  const [selectedOutstandingSupplierId, setSelectedOutstandingSupplierId] = useState('');

  const [paymentRange, setPaymentRange] = useState<DateRange>(defaultReportRange());

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');

    purchaseReportsService
      .getPurchaseOptions()
      .then((response) => {
        if (!alive) return;
        if (!response.success || !response.data) {
          setOptionsError(response.error || response.message || 'Failed to load supplier options');
          return;
        }
        setSuppliers(response.data.suppliers || []);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load supplier options');
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const supplierNameById = useMemo(
    () => new Map(suppliers.map((supplier) => [String(supplier.id), supplier.label])),
    [suppliers]
  );

  const runCardAction = async (cardId: SupplierCardId, action: () => Promise<void>) => {
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

  const handleSupplierList = (mode: 'show' | 'all') =>
    runCardAction('supplier-list', async () => {
      const response = await supplierService.list();
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load supplier list');
      const supplierId = mode === 'show' ? Number(selectedListSupplierId || 0) : undefined;
      if (mode === 'show' && !supplierId) throw new Error('Select a supplier first');
      const rows = (response.data.suppliers || [])
        .filter((row) => (supplierId ? Number(row.supplier_id) === supplierId : true))
        .map((row) => ({
          ...row,
          status: row.is_active ? 'Active' : 'Inactive',
        }));
      const recordRows = toRecordRows(rows);
      const totalBalance = sumByKey(recordRows, 'remaining_balance');
      onOpenModal({
        title: 'Supplier List',
        subtitle: mode === 'show' ? supplierNameById.get(selectedListSupplierId) || 'Selected Supplier' : 'All Suppliers',
        fileName: 'supplier-list',
        data: recordRows,
        columns: supplierListColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Supplier: mode === 'show' ? supplierNameById.get(selectedListSupplierId) || 'Selected Supplier' : 'All Suppliers',
        },
        tableTotals: {
          label: 'Total',
          values: {
            remaining_balance: formatCurrency(totalBalance),
          },
        },
        totals: [moneyTotal('Total Balance', totalBalance)],
      });
    });

  const handleSupplierLedger = (mode: 'show' | 'all') =>
    runCardAction('supplier-ledger', async () => {
      const supplierId = mode === 'show' ? Number(selectedLedgerSupplierId || 0) : undefined;
      if (mode === 'show' && !supplierId) throw new Error('Select a supplier first');
      const response = await purchaseReportsService.getSupplierLedger({ mode, supplierId });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load supplier ledger');
      const rows = toRecordRows(response.data.rows || []);
      const totalDebit = sumByKey(rows, 'debit');
      const totalCredit = sumByKey(rows, 'credit');
      const closingBalance = rows.length > 0 ? Number(rows[rows.length - 1].running_balance || 0) : 0;
      onOpenModal({
        title: 'Supplier Ledger',
        subtitle: mode === 'show' ? supplierNameById.get(selectedLedgerSupplierId) || 'Selected Supplier' : 'All Suppliers',
        fileName: 'supplier-ledger',
        data: rows,
        columns: supplierLedgerColumns,
        tableTotals: {
          label: 'Total',
          values: {
            debit: formatCurrency(totalDebit),
            credit: formatCurrency(totalCredit),
            running_balance: formatCurrency(closingBalance),
          },
        },
        totals: [
          moneyTotal('Total Debit', totalDebit),
          moneyTotal('Total Credit', totalCredit),
          moneyTotal('Closing Balance', closingBalance),
        ],
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Supplier: mode === 'show' ? supplierNameById.get(selectedLedgerSupplierId) || 'Selected Supplier' : 'All Suppliers',
        },
      });
    });

  const handleSupplierPayments = (mode: 'show' | 'all') =>
    runCardAction('supplier-payments', async () => {
      ensureRangeValid(paymentRange, 'Supplier Payments');
      const supplierId = mode === 'show' ? Number(selectedPaymentSupplierId || 0) : undefined;
      if (mode === 'show' && !supplierId) throw new Error('Select a supplier first');
      const response = await financialReportsService.getSupplierPayments({
        fromDate: paymentRange.fromDate,
        toDate: paymentRange.toDate,
        mode,
        supplierId,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load supplier payments');
      const rows = toRecordRows(response.data.rows || []);
      const totalAmount = sumByKey(rows, 'amount_paid');
      onOpenModal({
        title: 'Supplier Payments',
        subtitle: `${formatDateOnly(paymentRange.fromDate)} - ${formatDateOnly(paymentRange.toDate)}`,
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
          'From Date': paymentRange.fromDate,
          'To Date': paymentRange.toDate,
          Mode: mode === 'show' ? 'Show' : 'All',
          Supplier: mode === 'show' ? supplierNameById.get(selectedPaymentSupplierId) || 'Selected Supplier' : 'All Suppliers',
        },
      });
    });

  const handleOutstandingPurchases = (mode: 'show' | 'all') =>
    runCardAction('supplier-outstanding', async () => {
      const supplierId = mode === 'show' ? Number(selectedOutstandingSupplierId || 0) : undefined;
      if (mode === 'show' && !supplierId) throw new Error('Select a supplier first');
      const response = await financeService.listSupplierOutstandingPurchases(supplierId);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load outstanding purchases');
      const rows = toRecordRows(response.data.purchases || []);
      const totalOutstanding = sumByKey(rows, 'outstanding');
      onOpenModal({
        title: 'Outstanding Purchases',
        subtitle: mode === 'show' ? supplierNameById.get(selectedOutstandingSupplierId) || 'Selected Supplier' : 'All Suppliers',
        fileName: 'supplier-outstanding-purchases',
        data: rows,
        columns: supplierOutstandingColumns,
        filters: {
          Mode: mode === 'show' ? 'Show' : 'All',
          Supplier: mode === 'show' ? supplierNameById.get(selectedOutstandingSupplierId) || 'Selected Supplier' : 'All Suppliers',
        },
        tableTotals: {
          label: 'Total',
          values: {
            outstanding: formatCurrency(totalOutstanding),
          },
        },
        totals: [moneyTotal('Outstanding', totalOutstanding)],
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

  const renderSupplierSelector = (value: string, onChange: (value: string) => void, placeholder = 'Select Supplier') => (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-[#b6c9da] bg-white px-3 py-2.5 text-sm text-[#14344c] focus:border-[#0f4f76] focus:outline-none"
    >
      <option value="">{placeholder}</option>
      {suppliers.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );

  const renderShowAllButtons = (onShow: () => void, onAll: () => void, cardId: SupplierCardId) => (
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

  const renderCardBody = (cardId: SupplierCardId) => {
    if (cardId === 'supplier-list') {
      return (
        <div className="space-y-3">
          {renderSupplierSelector(selectedListSupplierId, setSelectedListSupplierId)}
          {renderShowAllButtons(() => handleSupplierList('show'), () => handleSupplierList('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'supplier-ledger') {
      return (
        <div className="space-y-3">
          {renderSupplierSelector(selectedLedgerSupplierId, setSelectedLedgerSupplierId)}
          {renderShowAllButtons(() => handleSupplierLedger('show'), () => handleSupplierLedger('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'supplier-payments') {
      return (
        <div className="space-y-3">
          {renderDateRange(paymentRange, setPaymentRange)}
          {renderSupplierSelector(selectedPaymentSupplierId, setSelectedPaymentSupplierId)}
          {renderShowAllButtons(() => handleSupplierPayments('show'), () => handleSupplierPayments('all'), cardId)}
        </div>
      );
    }

    if (cardId === 'supplier-outstanding') {
      return (
        <div className="space-y-3">
          {renderSupplierSelector(selectedOutstandingSupplierId, setSelectedOutstandingSupplierId)}
          {renderShowAllButtons(() => handleOutstandingPurchases('show'), () => handleOutstandingPurchases('all'), cardId)}
        </div>
      );
    }

    return null;
  };

  const renderCard = (card: { id: SupplierCardId; title: string; hint: string }) => {
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

  const leftColumnCards = supplierCards.filter((_, index) => index % 2 === 0);
  const rightColumnCards = supplierCards.filter((_, index) => index % 2 === 1);

  return (
    <div className="space-y-3">
      {optionsError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>}
      {optionsLoading && (
        <div className="inline-flex items-center gap-2 rounded-md border border-[#b8c8d7] bg-white px-3 py-2 text-sm text-[#38556d]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading supplier options...
        </div>
      )}
      <div className="space-y-3 lg:hidden">
        {supplierCards.map(renderCard)}
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
