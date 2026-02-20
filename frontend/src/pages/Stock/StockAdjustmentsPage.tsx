import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Filter, Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
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
  const [filters, setFilters] = useState({ itemId: '', search: '' });
  const [form, setForm] = useState({ itemId: '', qty: 0, unitCost: 0, note: '' });

  const columns = useMemo<ColumnDef<StockAdjustmentRow>[]>(
    () => [
      { accessorKey: 'adj_date', header: 'Date', cell: ({ row }) => new Date(row.original.adj_date).toLocaleString() },
      { accessorKey: 'item_names', header: 'Item' },
      { accessorKey: 'qty_delta', header: 'Qty Delta', cell: ({ row }) => Number(row.original.qty_delta).toFixed(3) },
      { accessorKey: 'value_delta', header: 'Value Delta', cell: ({ row }) => `$${Number(row.original.value_delta).toFixed(2)}` },
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
    const selected = items.find((row) => row.item_id === Number(itemId));
    setForm((prev) => ({
      ...prev,
      itemId,
      unitCost: selected ? Number(selected.last_unit_cost || selected.cost_price || 0) : 0,
    }));
  };

  const handleSave = async () => {
    if (!form.itemId || Number(form.qty) === 0) {
      showToast('error', 'Stock Adjustments', 'Item and quantity are required');
      return;
    }

    const res = await inventoryService.adjust({
      itemId: Number(form.itemId),
      qty: Number(form.qty),
      unitCost: Number(form.unitCost || 0),
      note: form.note || undefined,
    });

    if (!res.success) {
      showToast('error', 'Stock Adjustments', res.error || 'Failed to save adjustment');
      return;
    }

    showToast('success', 'Stock Adjustments', 'Adjustment saved');
    setIsModalOpen(false);
    setForm({ itemId: '', qty: 0, unitCost: 0, note: '' });
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
          searchPlaceholder="Search adjustments..."
          showToolbarActions={false}
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Stock Adjustment" size="md">
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
            <label className={labelClass}>Quantity Delta *</label>
            <input
              type="number"
              className={inputClass}
              value={form.qty}
              onChange={(e) => setForm((prev) => ({ ...prev, qty: Number(e.target.value) }))}
              placeholder="Use + to increase, - to decrease"
            />
          </div>
          <div>
            <label className={labelClass}>Unit Cost</label>
            <input
              type="number"
              className={inputClass}
              value={form.unitCost}
              onChange={(e) => setForm((prev) => ({ ...prev, unitCost: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className={labelClass}>Note</label>
            <input
              className={inputClass}
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Reason for adjustment"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setIsModalOpen(false)}>
            Cancel
          </button>
          <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white" onClick={handleSave}>
            Save Adjustment
          </button>
        </div>
      </Modal>
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
