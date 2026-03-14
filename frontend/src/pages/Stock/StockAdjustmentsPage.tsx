import { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { useToast } from '../../components/ui/toast/Toast';
import { inventoryService, StockAdjustmentRow } from '../../services/inventory.service';

const formatDate = (value: string) => {
  // API may return ISO datetime; show YYYY-MM-DD.
  if (!value) return '';
  return value.slice(0, 10);
};

export default function StockAdjustmentsPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [hasDisplayed, setHasDisplayed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [rows, setRows] = useState<StockAdjustmentRow[]>([]);

  const columns = useMemo<ColumnDef<StockAdjustmentRow>[]>(() => {
    return [
      {
        accessorKey: 'adj_date',
        header: 'Date',
        cell: ({ row }) => <span className="font-semibold">{formatDate(String(row.original.adj_date))}</span>,
      },
      { accessorKey: 'item_names', header: 'Item' },
      {
        accessorKey: 'qty_delta',
        header: 'Qty',
        cell: ({ row }) => {
          const v = Number(row.original.qty_delta || 0);
          return (
            <span className={v >= 0 ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'font-bold text-red-600 dark:text-red-300'}>
              {v >= 0 ? `+${v}` : v}
            </span>
          );
        },
      },
      {
        accessorKey: 'reason',
        header: 'Reason',
        cell: ({ row }) => row.original.reason || '-',
      },
      { accessorKey: 'created_by', header: 'By' },
    ];
  }, []);

  const loadAdjustments = useCallback(async () => {
    const res = await inventoryService.listAdjustments({ page: 1, limit: 200 });
    setRows(res.data.rows ?? []);
  }, []);

  const reloadAll = useCallback(async () => {
    try {
      setHasDisplayed(true);
      setIsLoading(true);
      await loadAdjustments();
    } catch (err: any) {
      showToast('error', 'Failed', err?.message || 'Could not load stock adjustments.');
    } finally {
      setIsLoading(false);
    }
  }, [loadAdjustments, showToast]);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Adjustments"
        description="Increase or decrease stock for a single item."
        actions={
          <>
            <button
              type="button"
              onClick={() => void reloadAll()}
              disabled={isLoading}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isLoading ? 'Loading...' : 'Display'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/stock-management/adjust-items/new')}
              className="flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-500/20 transition-all hover:bg-primary-700 active:scale-95"
            >
              <Plus className="h-5 w-5" />
              New Adjustment
            </button>
          </>
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {!hasDisplayed && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
            Click <span className="font-semibold">Display</span> to load data.
          </div>
        )}
        {hasDisplayed && !isLoading && rows.length === 0 && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
            No data found for the selected filters.
          </div>
        )}
        <DataTable
          data={rows}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Search adjustments..."
          enableRowSelection={false}
          enableColumnVisibility={false}
          showToolbarActions={true}
        />
      </div>
    </div>
  );
}
