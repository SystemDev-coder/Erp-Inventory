import { useState } from 'react';
import { Plus, RefreshCw, RotateCcw, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { useToast } from '../../components/ui/toast/Toast';
import { returnsService, PurchaseReturn, SalesReturn } from '../../services/returns.service';
import DeleteConfirmModal from '../../components/ui/modal/DeleteConfirmModal';
import { defaultDateRange } from '../../utils/dateRange';

const tableHeadCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const tableCellCls = 'px-3 py-2 text-sm text-slate-800 dark:text-slate-200';
const tableMutedCell = 'px-3 py-2 text-sm text-slate-500 dark:text-slate-400';

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
};
const fmtCurrency = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const resolveStatus = (value?: string | null) => (value && value.trim() ? value.toUpperCase() : 'POSTED');

type DeleteReturnTarget =
  | { type: 'sales'; id: number; label: string }
  | { type: 'purchase'; id: number; label: string };

const Returns = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [salesRows, setSalesRows] = useState<SalesReturn[]>([]);
  const [purchaseRows, setPurchaseRows] = useState<PurchaseReturn[]>([]);
  const [salesDisplayed, setSalesDisplayed] = useState(false);
  const [purchaseDisplayed, setPurchaseDisplayed] = useState(false);
  const [dateRange, setDateRange] = useState(() => defaultDateRange());
  const [deleteTarget, setDeleteTarget] = useState<DeleteReturnTarget | null>(null);
  const [deletingReturn, setDeletingReturn] = useState(false);

  const loadSalesReturns = async () => {
    setLoading(true);
    const res = await returnsService.listSalesReturns({
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
    });
    setLoading(false);
    if (res.success && res.data?.rows) {
      setSalesRows(res.data.rows);
    } else {
      showToast('error', 'Sales Returns', res.error || 'Failed to load sales returns');
    }
  };

  const loadPurchaseReturns = async () => {
    setLoading(true);
    const res = await returnsService.listPurchaseReturns({
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
    });
    setLoading(false);
    if (res.success && res.data?.rows) {
      setPurchaseRows(res.data.rows);
    } else {
      showToast('error', 'Purchase Returns', res.error || 'Failed to load purchase returns');
    }
  };

  const removeSalesReturn = async (id: number) => {
    setLoading(true);
    const res = await returnsService.deleteSalesReturn(id);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Sales Return', 'Deleted successfully');
      if (salesDisplayed) await loadSalesReturns();
    } else {
      showToast('error', 'Sales Return', res.error || 'Failed to delete return');
    }
  };

  const removePurchaseReturn = async (id: number) => {
    setLoading(true);
    const res = await returnsService.deletePurchaseReturn(id);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Purchase Return', 'Deleted successfully');
      if (purchaseDisplayed) await loadPurchaseReturns();
    } else {
      showToast('error', 'Purchase Return', res.error || 'Failed to delete return');
    }
  };

  const requestDeleteSalesReturn = (row: SalesReturn) => {
    setDeleteTarget({
      type: 'sales',
      id: row.sr_id,
      label: `${row.reference_no || `SR-${row.sr_id}`} - ${row.customer_name || 'Sales Return'}`,
    });
  };

  const requestDeletePurchaseReturn = (row: PurchaseReturn) => {
    setDeleteTarget({
      type: 'purchase',
      id: row.pr_id,
      label: `${row.reference_no || `PR-${row.pr_id}`} - ${row.supplier_name || 'Purchase Return'}`,
    });
  };

  const confirmDeleteReturn = async () => {
    if (!deleteTarget) return;
    setDeletingReturn(true);
    try {
      if (deleteTarget.type === 'sales') {
        await removeSalesReturn(deleteTarget.id);
      } else {
        await removePurchaseReturn(deleteTarget.id);
      }
    } finally {
      setDeletingReturn(false);
      setDeleteTarget(null);
    }
  };

  const tabs = [
    {
      id: 'sales-return',
      label: 'Sales Return',
      icon: RotateCcw,
      badge: salesRows.length,
      content: (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                From Date
              </span>
              <input
                type="date"
                value={dateRange.fromDate}
                onChange={(e) => setDateRange((prev) => ({ ...prev, fromDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                To Date
              </span>
              <input
                type="date"
                value={dateRange.toDate}
                onChange={(e) => setDateRange((prev) => ({ ...prev, toDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSalesDisplayed(true);
                void loadSalesReturns();
              }}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Loading...' : 'Display'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/returns/sales/new')}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" /> New Return
            </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" /></div>
            ) : !salesDisplayed ? (
              <div className="py-12 text-center text-slate-500 text-sm">Click Display to load data.</div>
            ) : salesRows.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No data found for the selected filters.</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className={tableHeadCls}>#</th>
                    <th className={tableHeadCls}>Date</th>
                    <th className={tableHeadCls}>Reference</th>
                    <th className={tableHeadCls}>Customer</th>
                    <th className={tableHeadCls}>Total</th>
                    <th className={tableHeadCls}>Refund Account</th>
                    <th className={tableHeadCls}>Refund</th>
                    <th className={tableHeadCls}>Status</th>
                    <th className={tableHeadCls}>Note</th>
                    <th className={tableHeadCls}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {salesRows.map((row) => (
                    <tr key={row.sr_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className={tableCellCls}>{row.sr_id}</td>
                      <td className={tableCellCls}>{fmtDate(row.return_date)}</td>
                      <td className={tableCellCls}>{row.reference_no || '-'}</td>
                      <td className={tableCellCls}>{row.customer_name || '-'}</td>
                      <td className={tableCellCls}>{fmtCurrency(row.total)}</td>
                      <td className={row.refund_account_name ? tableCellCls : tableMutedCell}>
                        {row.refund_account_name || '-'}
                      </td>
                      <td className={row.refund_amount ? tableCellCls : tableMutedCell}>
                        {row.refund_amount ? fmtCurrency(Number(row.refund_amount)) : '-'}
                      </td>
                      <td className={tableCellCls}>
                        {(() => {
                          const status = resolveStatus((row as any).status);
                          const isPosted = status === 'POSTED';
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPosted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {status}
                            </span>
                          );
                        })()}
                      </td>
                      <td className={tableCellCls}>{row.note || '-'}</td>
                      <td className={tableCellCls}>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => navigate(`/returns/sales/${row.sr_id}/edit`)} className="rounded border px-2 py-1 text-xs">Edit</button>
                          <button type="button" onClick={() => requestDeleteSalesReturn(row)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'purchase-return',
      label: 'Supplier Return',
      icon: ShoppingBag,
      badge: purchaseRows.length,
      content: (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                From Date
              </span>
              <input
                type="date"
                value={dateRange.fromDate}
                onChange={(e) => setDateRange((prev) => ({ ...prev, fromDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                To Date
              </span>
              <input
                type="date"
                value={dateRange.toDate}
                onChange={(e) => setDateRange((prev) => ({ ...prev, toDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPurchaseDisplayed(true);
                void loadPurchaseReturns();
              }}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Loading...' : 'Display'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/returns/purchases/new')}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" /> New Return
            </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" /></div>
            ) : !purchaseDisplayed ? (
              <div className="py-12 text-center text-slate-500 text-sm">Click Display to load data.</div>
            ) : purchaseRows.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No data found for the selected filters.</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className={tableHeadCls}>#</th>
                    <th className={tableHeadCls}>Date</th>
                    <th className={tableHeadCls}>Reference</th>
                    <th className={tableHeadCls}>Supplier</th>
                    <th className={tableHeadCls}>Total</th>
                    <th className={tableHeadCls}>Refund Account</th>
                    <th className={tableHeadCls}>Refund</th>
                    <th className={tableHeadCls}>Status</th>
                    <th className={tableHeadCls}>Note</th>
                    <th className={tableHeadCls}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {purchaseRows.map((row) => (
                    <tr key={row.pr_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className={tableCellCls}>{row.pr_id}</td>
                      <td className={tableCellCls}>{fmtDate(row.return_date)}</td>
                      <td className={tableCellCls}>{row.reference_no || '-'}</td>
                      <td className={tableCellCls}>{row.supplier_name || '-'}</td>
                      <td className={tableCellCls}>{fmtCurrency(row.total)}</td>
                      <td className={row.refund_account_name ? tableCellCls : tableMutedCell}>
                        {row.refund_account_name || '-'}
                      </td>
                      <td className={row.refund_amount ? tableCellCls : tableMutedCell}>
                        {row.refund_amount ? fmtCurrency(Number(row.refund_amount)) : '-'}
                      </td>
                      <td className={tableCellCls}>
                        {(() => {
                          const status = resolveStatus((row as any).status);
                          const isPosted = status === 'POSTED';
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPosted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {status}
                            </span>
                          );
                        })()}
                      </td>
                      <td className={tableCellCls}>{row.note || '-'}</td>
                      <td className={tableCellCls}>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => navigate(`/returns/purchases/${row.pr_id}/edit`)} className="rounded border px-2 py-1 text-xs">Edit</button>
                          <button type="button" onClick={() => requestDeletePurchaseReturn(row)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Returns" description="Manage sales returns and purchase/supplier returns." />
      <Tabs tabs={tabs} defaultTab="sales-return" />

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => { if (!deletingReturn) setDeleteTarget(null); }}
        onConfirm={confirmDeleteReturn}
        title={deleteTarget?.type === 'sales' ? 'Delete Sales Return?' : 'Delete Purchase Return?'}
        message="This action cannot be undone and will reverse the return record."
        itemName={deleteTarget?.label}
        isDeleting={deletingReturn}
      />
    </div>
  );
};

export default Returns;
