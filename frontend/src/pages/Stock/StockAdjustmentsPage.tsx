import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Filter, Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { useToast } from '../../components/ui/toast/Toast';
import { inventoryService, InventoryItem, StockAdjustmentRow } from '../../services/inventory.service';

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const StockAdjustmentsPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<StockAdjustmentRow[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rowToDelete, setRowToDelete] = useState<StockAdjustmentRow | null>(null);
  const [filters, setFilters] = useState({ itemId: '', search: '' });
  const [form, setForm] = useState({
    itemId: '',
    adjustmentType: 'INCREASE' as 'INCREASE' | 'DECREASE',
    quantity: 1,
    reason: '',
    status: 'POSTED' as 'POSTED' | 'CANCELLED',
  });

  const columns = useMemo<ColumnDef<StockAdjustmentRow>[]>(
    () => [
      { accessorKey: 'adj_date', header: 'Date', cell: ({ row }) => new Date(row.original.adj_date).toLocaleString() },
      { accessorKey: 'item_names', header: 'Item' },
      { accessorKey: 'qty_delta', header: 'Qty Delta', cell: ({ row }) => Number(row.original.qty_delta).toFixed(3) },
      { accessorKey: 'value_delta', header: 'Value Delta', cell: ({ row }) => `$${Number(row.original.value_delta).toFixed(2)}` },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => row.original.status || 'POSTED' },
      { accessorKey: 'reason', header: 'Reason' },
      { accessorKey: 'note', header: 'Note', cell: ({ row }) => row.original.note || '-' },
      { accessorKey: 'created_by', header: 'By' },
    ],
    []
  );

  const loadMasters = async () => {
    setMastersLoading(true);
    const itemRes = await inventoryService.listItems({});
    if (itemRes.success && itemRes.data?.items) {
      setItems(itemRes.data.items);
    } else {
      showToast('error', 'Stock Adjustments', itemRes.error || 'Failed to load items');
    }
    setMastersLoading(false);
  };

  const loadAdjustments = async () => {
    setLoading(true);
    const res = await inventoryService.listAdjustments({
      itemId: filters.itemId || undefined,
      search: filters.search || undefined,
    });
    setLoading(false);
    setHasLoaded(true);
    if (res.success && res.data?.rows) {
      setRows(res.data.rows);
      return;
    }
    showToast('error', 'Stock Adjustments', res.error || 'Failed to load adjustments');
  };

  const handleSelectFormItem = (itemId: string) => {
    setForm((prev) => ({
      ...prev,
      itemId,
    }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      itemId: '',
      adjustmentType: 'INCREASE',
      quantity: 1,
      reason: '',
      status: 'POSTED',
    });
  };

  const handleSave = async () => {
    if (!form.itemId || Number(form.quantity) <= 0 || !form.reason.trim()) {
      showToast('error', 'Stock Adjustments', 'Item, quantity, and reason are required');
      return;
    }

    const payload = {
      itemId: Number(form.itemId),
      adjustmentType: form.adjustmentType,
      quantity: Number(form.quantity),
      reason: form.reason.trim(),
      status: form.status,
    };
    setLoading(true);
    const res = editingId
      ? await inventoryService.updateAdjustment(editingId, payload)
      : await inventoryService.adjust(payload);
    setLoading(false);

    if (!res.success) {
      showToast('error', 'Stock Adjustments', res.error || `Failed to ${editingId ? 'update' : 'save'} adjustment`);
      return;
    }

    showToast('success', 'Stock Adjustments', editingId ? 'Adjustment updated' : 'Adjustment saved');
    setIsModalOpen(false);
    resetForm();
    if (hasLoaded) {
      void loadAdjustments();
    }
  };

  const handleEdit = async (row: StockAdjustmentRow) => {
    if (!items.length) {
      await loadMasters();
    }
    const fallbackType = Number(row.qty_delta || 0) < 0 ? 'DECREASE' : 'INCREASE';
    setEditingId(row.adj_id);
    setForm({
      itemId: row.item_id ? String(row.item_id) : '',
      adjustmentType: row.adjustment_type || fallbackType,
      quantity: Number((row.quantity ?? Math.abs(Number(row.qty_delta || 0))) || 1),
      reason: row.reason || '',
      status: (row.status || 'POSTED') as 'POSTED' | 'CANCELLED',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    if (!rowToDelete) return;
    setLoading(true);
    const res = await inventoryService.deleteAdjustment(rowToDelete.adj_id);
    setLoading(false);
    if (!res.success) {
      showToast('error', 'Stock Adjustments', res.error || 'Failed to delete adjustment');
      return;
    }
    showToast('success', 'Stock Adjustments', 'Adjustment deleted');
    setRowToDelete(null);
    if (hasLoaded) {
      void loadAdjustments();
    }
  };

  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={async () => {
            await loadMasters();
            await loadAdjustments();
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={loading}
        >
          <RefreshCw className="h-4 w-4" />
          Display
        </button>
        <button
          onClick={async () => {
            await loadMasters();
            resetForm();
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
          disabled={mastersLoading}
        >
          <Plus className="h-4 w-4" />
          New Adjustment
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>Item</label>
            <select
              className={inputClass}
              value={filters.itemId}
              onChange={(e) => setFilters((prev) => ({ ...prev, itemId: e.target.value }))}
            >
              <option value="">All items</option>
              {items.map((item) => (
                <option key={item.item_id} value={item.item_id}>
                  {item.item_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Search</label>
            <input
              className={inputClass}
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Reason or note..."
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={loadAdjustments}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            disabled={loading}
          >
            <Filter className="h-4 w-4" />
            Display
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <DataTable
          data={rows}
          columns={columns}
          isLoading={loading}
          onEdit={(row) => void handleEdit(row)}
          onDelete={(row) => setRowToDelete(row)}
          searchPlaceholder="Search adjustments..."
          showToolbarActions={false}
        />
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        title={editingId ? 'Edit Stock Adjustment' : 'New Stock Adjustment'}
        size="md"
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className={labelClass}>Item *</label>
            <select className={inputClass} value={form.itemId} onChange={(e) => handleSelectFormItem(e.target.value)}>
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.item_id} value={item.item_id}>
                  {item.item_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Adjustment Type *</label>
            <select
              className={inputClass}
              value={form.adjustmentType}
              onChange={(e) => setForm((prev) => ({ ...prev, adjustmentType: e.target.value as 'INCREASE' | 'DECREASE' }))}
            >
              <option value="INCREASE">Increase</option>
              <option value="DECREASE">Decrease</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Quantity *</label>
            <input
              type="number"
              min={0.001}
              step={0.001}
              className={inputClass}
              value={form.quantity}
              onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value || 0) }))}
            />
          </div>
          <div>
            <label className={labelClass}>Reason *</label>
            <input
              className={inputClass}
              value={form.reason}
              onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Reason for adjustment"
            />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as 'POSTED' | 'CANCELLED' }))}
            >
              <option value="POSTED">POSTED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => {
            setIsModalOpen(false);
            resetForm();
          }}>
            Cancel
          </button>
          <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white" onClick={handleSave}>
            {editingId ? 'Update Adjustment' : 'Save Adjustment'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!rowToDelete}
        onClose={() => setRowToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Adjustment"
        message={`Delete adjustment #${rowToDelete?.adj_id || ''}?`}
        confirmText="Delete"
        variant="danger"
        isLoading={loading}
      />
    </div>
  );

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="Stock Adjustments"
          description="Create manual item adjustments and review adjustment history."
        />
      )}
      <Tabs tabs={[{ id: 'stock-adjustments', label: 'Stock Adjustments', content }]} defaultTab="stock-adjustments" />
    </div>
  );
};

export default StockAdjustmentsPage;
