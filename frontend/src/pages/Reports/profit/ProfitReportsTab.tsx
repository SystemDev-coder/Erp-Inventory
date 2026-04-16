import { useEffect, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { ReportColumn } from '../../../components/reports/ReportModal';
import { financialReportsService } from '../../../services/reports/financialReports.service';
import { inventoryReportsService } from '../../../services/reports/inventoryReports.service';
import { financeService } from '../../../services/finance.service';
import type { DateRange, ModalReportState } from '../types';
import { formatCurrency, formatDateOnly, formatQuantity, toRecordRows, defaultReportRange } from '../reportUtils';

type ProfitCardId = 'income-statement' | 'profit-by-period' | 'profit-analysis';
type ProfitGroupBy = 'customer' | 'item' | 'store';

const profitCards: Array<{ id: ProfitCardId; title: string; hint: string }> = [
  { id: 'income-statement', title: 'Income Statement (Profit & Loss)', hint: 'Between two dates' },
  { id: 'profit-analysis', title: 'Profit Analysis', hint: 'Group by customer, item, or store' },
  { id: 'profit-by-period', title: 'Profit by Closing Period', hint: 'Closed periods within range' },
];

const statementColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'section', header: 'Section' },
  { key: 'line_item', header: 'Line Item' },
  { key: 'amount', header: 'Amount', align: 'right', render: (row) => formatCurrency(row.amount) },
];

const profitPeriodColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'closing_id', header: 'Closing #', width: '90px', align: 'center' },
  { key: 'period_from', header: 'From', render: (row) => formatDateOnly(row.period_from) },
  { key: 'period_to', header: 'To', render: (row) => formatDateOnly(row.period_to) },
  { key: 'close_mode', header: 'Mode' },
  { key: 'status', header: 'Status' },
  { key: 'net_income', header: 'Net Income', align: 'right', render: (row) => formatCurrency(row.net_income) },
  { key: 'sales_revenue', header: 'Sales', align: 'right', render: (row) => formatCurrency(row.sales_revenue) },
  { key: 'cogs', header: 'COGS', align: 'right', render: (row) => formatCurrency(row.cogs) },
  { key: 'expense_charges', header: 'Expenses', align: 'right', render: (row) => formatCurrency(row.expense_charges) },
  { key: 'payroll_expense', header: 'Payroll', align: 'right', render: (row) => formatCurrency(row.payroll_expense) },
];

const formatPercent = (value: unknown) => {
  const pct = Number(value || 0);
  return `${pct.toFixed(2)}%`;
};

const profitCustomerColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'customer_name', header: 'Customer' },
  { key: 'quantity_sold', header: 'Qty Sold', align: 'right', render: (row) => formatQuantity(row.quantity_sold) },
  { key: 'sales_amount', header: 'Sales', align: 'right', render: (row) => formatCurrency(row.sales_amount) },
  { key: 'cost_amount', header: 'Cost', align: 'right', render: (row) => formatCurrency(row.cost_amount) },
  { key: 'gross_profit', header: 'Gross Profit', align: 'right', render: (row) => formatCurrency(row.gross_profit) },
  { key: 'margin_pct', header: 'Margin %', align: 'right', render: (row) => formatPercent(row.margin_pct) },
];

const profitByItemColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'quantity_sold', header: 'Qty Sold', align: 'right', render: (row) => formatQuantity(row.quantity_sold) },
  { key: 'sales_amount', header: 'Sales', align: 'right', render: (row) => formatCurrency(row.sales_amount) },
  { key: 'cost_amount', header: 'Cost', align: 'right', render: (row) => formatCurrency(row.cost_amount) },
  { key: 'gross_profit', header: 'Gross Profit', align: 'right', render: (row) => formatCurrency(row.gross_profit) },
  { key: 'margin_pct', header: 'Margin %', align: 'right', render: (row) => formatPercent(row.margin_pct) },
];

const profitByStoreColumns: ReportColumn<Record<string, unknown>>[] = [
  { key: 'store_name', header: 'Store' },
  { key: 'quantity_sold', header: 'Qty Sold', align: 'right', render: (row) => formatQuantity(row.quantity_sold) },
  { key: 'sales_amount', header: 'Sales', align: 'right', render: (row) => formatCurrency(row.sales_amount) },
  { key: 'cost_amount', header: 'Cost', align: 'right', render: (row) => formatCurrency(row.cost_amount) },
  { key: 'gross_profit', header: 'Gross Profit', align: 'right', render: (row) => formatCurrency(row.gross_profit) },
  { key: 'margin_pct', header: 'Margin %', align: 'right', render: (row) => formatPercent(row.margin_pct) },
];

type Props = {
  onOpenModal: (report: ModalReportState) => void;
};

const sumByKey = (rows: Record<string, unknown>[], key: string) =>
  rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);

export function ProfitReportsTab({ onOpenModal }: Props) {
  const [expandedCardId, setExpandedCardId] = useState<ProfitCardId | null>(null);
  const [loadingCardId, setLoadingCardId] = useState<ProfitCardId | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const [incomeRange, setIncomeRange] = useState<DateRange>(defaultReportRange());
  const [profitRange, setProfitRange] = useState<DateRange>(defaultReportRange());
  const [analysisRange, setAnalysisRange] = useState<DateRange>(defaultReportRange());
  const [analysisGroupBy, setAnalysisGroupBy] = useState<ProfitGroupBy>('customer');

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [storeFiltersEnabled, setStoreFiltersEnabled] = useState(true);
  const [customers, setCustomers] = useState<Array<{ id: number; label: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: number; label: string }>>([]);
  const [stores, setStores] = useState<Array<{ id: number; label: string }>>([]);

  const [analysisCustomerId, setAnalysisCustomerId] = useState('');
  const [analysisItemId, setAnalysisItemId] = useState('');
  const [analysisStoreId, setAnalysisStoreId] = useState('');

  useEffect(() => {
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');

    Promise.all([financialReportsService.getFinancialOptions(), inventoryReportsService.getInventoryOptions()])
      .then(([financial, inventory]) => {
        if (!alive) return;
        if (!financial.success || !financial.data) {
          setOptionsError(financial.error || financial.message || 'Failed to load customer options');
        } else {
          setCustomers(financial.data.customers || []);
          setStoreFiltersEnabled(financial.data.salesStoreEnabled !== false);
          if (financial.data.salesStoreEnabled === false) {
            setAnalysisGroupBy((prev) => (prev === 'store' ? 'customer' : prev));
          }
        }
        if (!inventory.success || !inventory.data) {
          setOptionsError((prev) => prev || inventory.error || inventory.message || 'Failed to load item options');
        } else {
          setProducts(inventory.data.products || []);
          setStores(inventory.data.stores || []);
        }
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setOptionsError(error instanceof Error ? error.message : 'Failed to load report options');
      })
      .finally(() => {
        if (alive) setOptionsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const runCardAction = async (cardId: ProfitCardId, action: () => Promise<void>) => {
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

  const resolveLabel = (options: Array<{ id: number; label: string }>, value: string, fallback = 'All') =>
    options.find((option) => String(option.id) === value)?.label || fallback;

  const toOptionalNumber = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed;
  };

  const handleGroupByChange = (mode: ProfitGroupBy) => {
    setAnalysisGroupBy(mode);
    setAnalysisCustomerId('');
    setAnalysisItemId('');
    setAnalysisStoreId('');
  };

  const renderFilterButtons = (
    modes: Array<{ mode: ProfitGroupBy; label: string }>,
    active: ProfitGroupBy,
    onChange: (mode: ProfitGroupBy) => void
  ) => (
    <div className="flex flex-wrap gap-2">
      {modes.map((entry) => (
        <button
          key={entry.mode}
          type="button"
          onClick={() => onChange(entry.mode)}
          className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
            active === entry.mode
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-slate-200 bg-white text-slate-800 hover:border-primary-500'
          }`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );

  const renderShowButton = (onClick: () => void, disabled: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-w-[140px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
    >
      Show
    </button>
  );

  const handleIncomeStatement = () =>
    runCardAction('income-statement', async () => {
      ensureRangeValid(incomeRange, 'Income Statement');
      const response = await financialReportsService.getIncomeStatement(incomeRange);
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load income statement');
      onOpenModal({
        title: 'Income Statement',
        subtitle: `${formatDateOnly(incomeRange.fromDate)} - ${formatDateOnly(incomeRange.toDate)}`,
        fileName: 'income-statement',
        variant: 'income-statement',
        data: toRecordRows(response.data.rows || []),
        columns: statementColumns,
        filters: { 'From Date': incomeRange.fromDate, 'To Date': incomeRange.toDate },
      });
    });

  const handleProfitByPeriod = () =>
    runCardAction('profit-by-period', async () => {
      ensureRangeValid(profitRange, 'Profit by Closing Period');
      const response = await financeService.listClosingPeriods({
        status: 'closed',
        fromDate: profitRange.fromDate,
        toDate: profitRange.toDate,
      });
      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load closing periods');
      const rows = (response.data.periods || []).map((period) => {
        const summary = period.summary_json || {};
        return {
          closing_id: period.closing_id,
          period_from: period.period_from,
          period_to: period.period_to,
          close_mode: period.close_mode,
          status: period.status,
          net_income: Number(summary.netIncome || 0),
          sales_revenue: Number(summary.salesRevenue || 0),
          cogs: Number(summary.cogs || 0),
          expense_charges: Number(summary.expenseCharges || 0),
          payroll_expense: Number(summary.payrollExpense || 0),
        };
      });
      const recordRows = toRecordRows(rows);
      onOpenModal({
        title: 'Profit by Closing Period',
        subtitle: `${formatDateOnly(profitRange.fromDate)} - ${formatDateOnly(profitRange.toDate)}`,
        fileName: 'profit-by-period',
        data: recordRows,
        columns: profitPeriodColumns,
        tableTotals: {
          label: 'Total',
          values: {
            net_income: formatCurrency(sumByKey(recordRows, 'net_income')),
            sales_revenue: formatCurrency(sumByKey(recordRows, 'sales_revenue')),
            cogs: formatCurrency(sumByKey(recordRows, 'cogs')),
            expense_charges: formatCurrency(sumByKey(recordRows, 'expense_charges')),
            payroll_expense: formatCurrency(sumByKey(recordRows, 'payroll_expense')),
          },
        },
        filters: { 'From Date': profitRange.fromDate, 'To Date': profitRange.toDate, Status: 'Closed' },
      });
    });

  const handleProfitAnalysis = () =>
    runCardAction('profit-analysis', async () => {
      ensureRangeValid(analysisRange, 'Profit Analysis');
      const selectedCustomerId = toOptionalNumber(analysisCustomerId);
      const selectedItemId = toOptionalNumber(analysisItemId);
      const selectedStoreId = toOptionalNumber(analysisStoreId);

      let response:
        | Awaited<ReturnType<typeof financialReportsService.getProfitByCustomer>>
        | Awaited<ReturnType<typeof financialReportsService.getProfitByItem>>
        | Awaited<ReturnType<typeof financialReportsService.getProfitByStore>>;
      let title = '';
      let fileName = '';
      let columns: ReportColumn<Record<string, unknown>>[] = [];
      let filters: Record<string, string> = {
        'From Date': analysisRange.fromDate,
        'To Date': analysisRange.toDate,
      };

      if (analysisGroupBy === 'customer') {
        response = await financialReportsService.getProfitByCustomer({
          fromDate: analysisRange.fromDate,
          toDate: analysisRange.toDate,
          itemId: selectedItemId,
          storeId: selectedStoreId,
        });
        title = 'Profit by Customer';
        fileName = 'profit-by-customer';
        columns = profitCustomerColumns;
        filters = {
          ...filters,
          'Group By': 'Customer',
          Item: resolveLabel(products, analysisItemId),
          ...(storeFiltersEnabled ? { Store: resolveLabel(stores, analysisStoreId) } : {}),
        };
      } else if (analysisGroupBy === 'item') {
        response = await financialReportsService.getProfitByItem({
          fromDate: analysisRange.fromDate,
          toDate: analysisRange.toDate,
          customerId: selectedCustomerId,
          storeId: selectedStoreId,
        });
        title = 'Profit by Item';
        fileName = 'profit-by-item';
        columns = profitByItemColumns;
        filters = {
          ...filters,
          'Group By': 'Item',
          Customer: resolveLabel(customers, analysisCustomerId),
          ...(storeFiltersEnabled ? { Store: resolveLabel(stores, analysisStoreId) } : {}),
        };
      } else {
        if (!storeFiltersEnabled) {
          throw new Error('Store grouping is not available for this system.');
        }
        response = await financialReportsService.getProfitByStore({
          fromDate: analysisRange.fromDate,
          toDate: analysisRange.toDate,
          customerId: selectedCustomerId,
          itemId: selectedItemId,
        });
        title = 'Profit by Store';
        fileName = 'profit-by-store';
        columns = profitByStoreColumns;
        filters = {
          ...filters,
          'Group By': 'Store',
          Customer: resolveLabel(customers, analysisCustomerId),
          Item: resolveLabel(products, analysisItemId),
        };
      }

      if (!response.success || !response.data) throw new Error(response.error || response.message || 'Failed to load profit analysis');
      const rawRows: unknown[] = (response.data.rows || []) as unknown[];
      const recordRows = toRecordRows(rawRows);
      const totalSales = sumByKey(recordRows, 'sales_amount');
      const totalCost = sumByKey(recordRows, 'cost_amount');
      const totalGross = totalSales - totalCost;
      const totalQty = sumByKey(recordRows, 'quantity_sold');
      const totalMargin = totalSales > 0 ? (totalGross / totalSales) * 100 : 0;

      onOpenModal({
        title,
        subtitle: `${formatDateOnly(analysisRange.fromDate)} - ${formatDateOnly(analysisRange.toDate)}`,
        fileName,
        data: recordRows,
        columns,
        tableTotals: {
          label: 'Total',
          values: {
            quantity_sold: formatQuantity(totalQty),
            sales_amount: formatCurrency(totalSales),
            cost_amount: formatCurrency(totalCost),
            gross_profit: formatCurrency(totalGross),
            margin_pct: formatPercent(totalMargin),
          },
        },
        filters,
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

  const renderCardBody = (cardId: ProfitCardId) => {
    if (cardId === 'income-statement') {
      return (
        <div className="space-y-3">
          {renderDateRange(incomeRange, setIncomeRange)}
          <button
            onClick={handleIncomeStatement}
            disabled={loadingCardId === cardId}
            className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Show
          </button>
        </div>
      );
    }

    if (cardId === 'profit-analysis') {
      return (
        <div className="space-y-3">
          {renderDateRange(analysisRange, setAnalysisRange)}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">Group results by</p>
            {renderFilterButtons(
              [
                { mode: 'customer', label: 'By Customer' },
                { mode: 'item', label: 'By Item' },
                ...(storeFiltersEnabled ? [{ mode: 'store' as const, label: 'By Store' }] : []),
              ],
              analysisGroupBy,
              handleGroupByChange
            )}
          </div>
          {analysisGroupBy === 'customer' && (
            <div
              className={`grid grid-cols-1 gap-3 sm:items-end ${
                storeFiltersEnabled ? 'sm:grid-cols-[1fr_1fr_auto]' : 'sm:grid-cols-[1fr_auto]'
              }`}
            >
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>Item</span>
                <select
                  value={analysisItemId}
                  onChange={(event) => setAnalysisItemId(event.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
                >
                  <option value="">All Items</option>
                  {products.map((option) => (
                    <option key={`analysis-item-${option.id}`} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {storeFiltersEnabled && (
                <label className="space-y-1 text-xs font-semibold text-slate-600">
                  <span>Store</span>
                  <select
                    value={analysisStoreId}
                    onChange={(event) => setAnalysisStoreId(event.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
                  >
                    <option value="">All Stores</option>
                    {stores.map((option) => (
                      <option key={`analysis-store-${option.id}`} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {renderShowButton(handleProfitAnalysis, loadingCardId === cardId)}
            </div>
          )}
          {analysisGroupBy === 'item' && (
            <div
              className={`grid grid-cols-1 gap-3 sm:items-end ${
                storeFiltersEnabled ? 'sm:grid-cols-[1fr_1fr_auto]' : 'sm:grid-cols-[1fr_auto]'
              }`}
            >
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>Customer</span>
                <select
                  value={analysisCustomerId}
                  onChange={(event) => setAnalysisCustomerId(event.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
                >
                  <option value="">All Customers</option>
                  {customers.map((option) => (
                    <option key={`analysis-cust-${option.id}`} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {storeFiltersEnabled && (
                <label className="space-y-1 text-xs font-semibold text-slate-600">
                  <span>Store</span>
                  <select
                    value={analysisStoreId}
                    onChange={(event) => setAnalysisStoreId(event.target.value)}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
                  >
                    <option value="">All Stores</option>
                    {stores.map((option) => (
                      <option key={`analysis-store-${option.id}`} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {renderShowButton(handleProfitAnalysis, loadingCardId === cardId)}
            </div>
          )}
          {analysisGroupBy === 'store' && storeFiltersEnabled && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>Customer</span>
                <select
                  value={analysisCustomerId}
                  onChange={(event) => setAnalysisCustomerId(event.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
                >
                  <option value="">All Customers</option>
                  {customers.map((option) => (
                    <option key={`analysis-cust-${option.id}`} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>Item</span>
                <select
                  value={analysisItemId}
                  onChange={(event) => setAnalysisItemId(event.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-primary-500 focus:outline-none"
                >
                  <option value="">All Items</option>
                  {products.map((option) => (
                    <option key={`analysis-item-${option.id}`} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {renderShowButton(handleProfitAnalysis, loadingCardId === cardId)}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {renderDateRange(profitRange, setProfitRange)}
        <button
          onClick={handleProfitByPeriod}
          disabled={loadingCardId === cardId}
          className="inline-flex min-w-[160px] items-center justify-center rounded-md bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Show
        </button>
      </div>
    );
  };

  const renderCard = (card: { id: ProfitCardId; title: string; hint: string }) => {
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

  const leftColumnCards = profitCards.filter((_, index) => index % 2 === 0);
  const rightColumnCards = profitCards.filter((_, index) => index % 2 === 1);

  return (
    <div className="space-y-3">
      {optionsError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{optionsError}</div>
      )}
      {optionsLoading && (
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading customer and item options...
        </div>
      )}
      <div className="space-y-3 lg:hidden">
        {profitCards.map(renderCard)}
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


