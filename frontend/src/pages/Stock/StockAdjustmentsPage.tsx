import { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';
import DeleteConfirmModal from '../../components/ui/modal/DeleteConfirmModal';
import { inventoryService, InventoryItem, StockAdjustmentRow } from '../../services/inventory.service';
import { defaultDateRange } from '../../utils/dateRange';

const formatDate = (value: string) => {
  // API may return ISO datetime; show YYYY-MM-DD.
  if (!value) return '';
  return value.slice(0, 10);
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

export default function StockAdjustmentsPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [hasDisplayed, setHasDisplayed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [rows, setRows] = useState<StockAdjustmentRow[]>([]);
  const [dateRange, setDateRange] = useState(() => defaultDateRange());
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StockAdjustmentRow | null>(null);
  const [editForm, setEditForm] = useState({
    itemId: '',
    adjustmentType: 'INCREASE' as 'INCREASE' | 'DECREASE',
    quantity: 1,
    reason: '',
    status: 'POSTED' as 'POSTED' | 'CANCELLED',
    adjustmentDate: todayYmd(),
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StockAdjustmentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    const res = await inventoryService.listAdjustments({
      page: 1,
      limit: 200,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
    });
    setRows(res.data?.rows ?? []);
  }, [dateRange.fromDate, dateRange.toDate]);

  const loadItems = useCallback(async () => {
    try {
      setItemsLoading(true);
      const res = await inventoryService.listItems({ page: 1, limit: 1000 });
      setItems(res.data?.items ?? []);
    } catch (err: any) {
      showToast('error', 'Failed', err?.message || 'Could not load items.');
    } finally {
      setItemsLoading(false);
    }
  }, [showToast]);

  const reloadAll = useCallback(async () => {
    if (dateRange.fromDate && dateRange.toDate && dateRange.fromDate > dateRange.toDate) {
      showToast('error', 'Invalid Date Range', 'From date cannot be after To date.');
      return;
    }
    try {
      setHasDisplayed(true);
      setIsLoading(true);
      await loadAdjustments();
    } catch (err: any) {
      showToast('error', 'Failed', err?.message || 'Could not load stock adjustments.');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange.fromDate, dateRange.toDate, loadAdjustments, showToast]);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const openEdit = async (row: StockAdjustmentRow) => {
    const inferredType = row.adjustment_type ?? (Number(row.qty_delta || 0) < 0 ? 'DECREASE' : 'INCREASE');
    const inferredQty = (row.quantity ?? Math.abs(Number(row.qty_delta || 0))) || 1;
    setEditTarget(row);
    setEditForm({
      itemId: row.item_id ? String(row.item_id) : '',
      adjustmentType: inferredType as 'INCREASE' | 'DECREASE',
      quantity: Math.max(1, Math.round(Number(inferredQty) || 1)),
      reason: row.reason || '',
      status: (row.status || 'POSTED') as 'POSTED' | 'CANCELLED',
      adjustmentDate: row.adj_date ? formatDate(String(row.adj_date)) : todayYmd(),
    });
    if (items.length === 0 && !itemsLoading) {
      await loadItems();
    }
    setEditOpen(true);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    if (!editForm.itemId) {
      showToast('error', 'Validation error', 'Item is required.');
      return;
    }
    if (!Number.isFinite(editForm.quantity) || editForm.quantity < 1) {
      showToast('error', 'Validation error', 'Quantity must be at least 1.');
      return;
    }
    try {
      setSavingEdit(true);
      const res = await inventoryService.updateAdjustment(editTarget.adj_id, {
        itemId: Number(editForm.itemId),
        adjustmentType: editForm.adjustmentType,
        quantity: Math.round(Number(editForm.quantity)),
        reason: editForm.reason.trim() || undefined,
        status: editForm.status,
        adjustmentDate: editForm.adjustmentDate,
      });
      if (!res.success) {
        throw new Error(res.error || 'Failed to update adjustment');
      }
      showToast('success', 'Updated', 'Stock adjustment updated.');
      setEditOpen(false);
      setEditTarget(null);
      await reloadAll();
    } catch (err: any) {
      showToast('error', 'Failed', err?.message || 'Could not update stock adjustment.');
    } finally {
      setSavingEdit(false);
    }
  };

  const requestDelete = (row: StockAdjustmentRow) => {
    setDeleteTarget(row);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await inventoryService.deleteAdjustment(deleteTarget.adj_id);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete adjustment');
      }
      showToast('success', 'Deleted', 'Stock adjustment deleted.');
      setDeleteTarget(null);
      await reloadAll();
    } catch (err: any) {
      showToast('error', 'Failed', err?.message || 'Could not delete stock adjustment.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock Adjustments"
        description="Increase or decrease stock for a single item."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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
        </div>
      </div>

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
          onEdit={openEdit}
          onDelete={requestDelete}
        />
      </div>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Stock Adjustment" size="md">
        <form onSubmit={submitEdit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Item *</label>
              <select
                value={editForm.itemId}
                onChange={(e) => setEditForm((prev) => ({ ...prev, itemId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                required
              >
                <option value="">{itemsLoading ? 'Loading items...' : 'Select item'}</option>
                {items.map((it) => (
                  <option key={it.item_id} value={it.item_id}>
                    {it.item_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Adjustment Type *</label>
              <select
                value={editForm.adjustmentType}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, adjustmentType: e.target.value as 'INCREASE' | 'DECREASE' }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="INCREASE">Increase</option>
                <option value="DECREASE">Decrease</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Quantity *</label>
              <input
                type="number"
                min={1}
                step={1}
                value={editForm.quantity}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Reason (optional)</label>
              <input
                type="text"
                value={editForm.reason}
                onChange={(e) => setEditForm((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Optional"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Status</label>
              <select
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, status: e.target.value as 'POSTED' | 'CANCELLED' }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="POSTED">Posted</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Date</label>
              <input
                type="date"
                value={editForm.adjustmentDate}
                onChange={(e) => setEditForm((prev) => ({ ...prev, adjustmentDate: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="rounded-xl px-6 py-2.5 text-sm font-bold text-slate-600 transition-all hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="rounded-xl bg-primary-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-500/20 transition-all hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-95"
            >
              {savingEdit ? 'Saving...' : 'Update'}
            </button>
          </div>
        </form>
      </Modal>

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Adjustment?"
        message="Are you sure you want to delete this stock adjustment?"
        itemName={deleteTarget?.item_names || `Adjustment #${deleteTarget?.adj_id}`}
        isDeleting={deleting}
      />
    </div>
  );
}
