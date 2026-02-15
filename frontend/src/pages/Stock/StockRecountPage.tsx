import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Filter, Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import {
  inventoryService,
  InventoryBranch,
  InventoryWarehouse,
  StockAdjustmentRow,
  InventoryItem,
} from '../../services/inventory.service';

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const StockRecountPage = () => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<StockAdjustmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [branches, setBranches] = useState<InventoryBranch[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [filters, setFilters] = useState({
    branchId: '',
    whId: '',
    itemId: '',
    search: '',
  });

  const [form, setForm] = useState({
    branchId: '',
    whId: '',
    itemId: '',
    countedQty: 0,
    unitCost: 0,
    salePrice: 0,
    note: '',
  });

  const filteredWarehouses = useMemo(() => {
    if (!filters.branchId) return warehouses;
    return warehouses.filter((row) => row.branch_id === Number(filters.branchId));
  }, [filters.branchId, warehouses]);

  const formWarehouses = useMemo(() => {
    if (!form.branchId) return warehouses;
    return warehouses.filter((row) => row.branch_id === Number(form.branchId));
  }, [form.branchId, warehouses]);

  const filterItems = useMemo(() => {
    if (!filters.branchId) return items;
    return items.filter((row) => row.branch_id === Number(filters.branchId));
  }, [filters.branchId, items]);

  const formItems = useMemo(() => {
    if (!form.branchId) return items;
    return items.filter((row) => row.branch_id === Number(form.branchId));
  }, [form.branchId, items]);

  const recountValue = useMemo(
    () => Number((Number(form.countedQty || 0) * Number(form.unitCost || 0)).toFixed(2)),
    [form.countedQty, form.unitCost]
  );

  const columns = useMemo<ColumnDef<StockAdjustmentRow>[]>(
    () => [
      {
        accessorKey: 'adj_date',
        header: 'Date',
        cell: ({ row }) => new Date(row.original.adj_date).toLocaleString(),
      },
      { accessorKey: 'branch_name', header: 'Branch' },
      {
        accessorKey: 'wh_name',
        header: 'Warehouse',
        cell: ({ row }) => row.original.wh_name || '-',
      },
      { accessorKey: 'item_names', header: 'Items' },
      {
        accessorKey: 'qty_delta',
        header: 'Difference',
        cell: ({ row }) => Number(row.original.qty_delta).toFixed(3),
      },
      {
        accessorKey: 'value_delta',
        header: 'Value Impact',
        cell: ({ row }) => `$${Number(row.original.value_delta).toFixed(2)}`,
      },
      {
        accessorKey: 'note',
        header: 'Details',
        cell: ({ row }) => row.original.note || '-',
      },
      { accessorKey: 'created_by', header: 'By' },
    ],
    []
  );

  const loadMasters = async () => {
    setMastersLoading(true);
    const [branchRes, whRes, itemRes] = await Promise.all([
      inventoryService.listBranches({ includeInactive: false }),
      inventoryService.listWarehouses({ includeInactive: false }),
      inventoryService.listItems({}),
    ]);

    if (branchRes.success && branchRes.data?.branches) {
      setBranches(branchRes.data.branches);
    } else {
      showToast('error', 'Stock Recount', branchRes.error || 'Failed to load branches');
    }

    if (whRes.success && whRes.data?.warehouses) {
      setWarehouses(whRes.data.warehouses);
    } else {
      showToast('error', 'Stock Recount', whRes.error || 'Failed to load warehouses');
    }

    if (itemRes.success && itemRes.data?.items) {
      setItems(itemRes.data.items);
    } else {
      showToast('error', 'Stock Recount', itemRes.error || 'Failed to load purchased items');
    }
    setMastersLoading(false);
  };

  useEffect(() => {
    loadMasters();
  }, []);

  const loadRecounts = async () => {
    setLoading(true);
    const res = await inventoryService.listRecounts({
      branchId: filters.branchId || undefined,
      whId: filters.whId || undefined,
      itemId: filters.itemId || undefined,
      search: filters.search || undefined,
    });
    setLoading(false);
    setHasLoaded(true);
    if (res.success && res.data?.rows) {
      setRows(res.data.rows);
      return;
    }
    showToast('error', 'Stock Recount', res.error || 'Failed to load recount history');
  };

  const handleSelectFormItem = (itemId: string) => {
    const selected = formItems.find((row) => row.item_id === Number(itemId));
    setForm((prev) => ({
      ...prev,
      itemId,
      unitCost: selected ? Number(selected.last_unit_cost || selected.cost_price || 0) : 0,
      salePrice: selected ? Number(selected.sale_price || 0) : 0,
    }));
  };

  const handleSave = async () => {
    if (!form.branchId || !form.itemId) {
      showToast('error', 'Stock Recount', 'Branch and item are required');
      return;
    }

    const res = await inventoryService.recount({
      branchId: Number(form.branchId),
      whId: form.whId ? Number(form.whId) : undefined,
      itemId: Number(form.itemId),
      countedQty: Number(form.countedQty),
      unitCost: Number(form.unitCost || 0),
      note: form.note || undefined,
    });

    if (!res.success) {
      showToast('error', 'Stock Recount', res.error || 'Failed to save recount');
      return;
    }

    const data = res.data as any;
    if (data?.changed === false) {
      showToast('info', 'Stock Recount', 'No stock difference found. Nothing was posted.');
      setIsModalOpen(false);
      return;
    }

    showToast('success', 'Stock Recount', 'Recount posted successfully');
    setIsModalOpen(false);
    setForm({
      branchId: '',
      whId: '',
      itemId: '',
      countedQty: 0,
      unitCost: 0,
      salePrice: 0,
      note: '',
    });
    if (hasLoaded) {
      loadRecounts();
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock Recount"
        description="Record physical count and automatically adjust item stock differences."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={loadRecounts}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              Display
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
              disabled={mastersLoading}
            >
              <Plus className="h-4 w-4" />
              New Recount
            </button>
          </div>
        }
      />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass}>Branch</label>
            <select
              className={inputClass}
              value={filters.branchId}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  branchId: e.target.value,
                  whId: '',
                  itemId: '',
                }))
              }
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.branch_id} value={branch.branch_id}>
                  {branch.branch_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Warehouse</label>
            <select
              className={inputClass}
              value={filters.whId}
              onChange={(e) => setFilters((prev) => ({ ...prev, whId: e.target.value }))}
            >
              <option value="">All warehouses</option>
              {filteredWarehouses.map((warehouse) => (
                <option key={warehouse.wh_id} value={warehouse.wh_id}>
                  {warehouse.wh_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Purchased Item</label>
            <select
              className={inputClass}
              value={filters.itemId}
              onChange={(e) => setFilters((prev) => ({ ...prev, itemId: e.target.value }))}
            >
              <option value="">All purchased items</option>
              {filterItems.map((item) => (
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
              placeholder="Search notes..."
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={loadRecounts}
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
          searchPlaceholder="Search recounts..."
          showToolbarActions={false}
        />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Stock Recount" size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>Branch *</label>
            <select
              className={inputClass}
              value={form.branchId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  branchId: e.target.value,
                  whId: '',
                  itemId: '',
                  unitCost: 0,
                  salePrice: 0,
                }))
              }
            >
              <option value="">Select branch</option>
              {branches.map((branch) => (
                <option key={branch.branch_id} value={branch.branch_id}>
                  {branch.branch_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Warehouse</label>
            <select
              className={inputClass}
              value={form.whId}
              onChange={(e) => setForm((prev) => ({ ...prev, whId: e.target.value }))}
            >
              <option value="">Branch level recount</option>
              {formWarehouses.map((warehouse) => (
                <option key={warehouse.wh_id} value={warehouse.wh_id}>
                  {warehouse.wh_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Purchased Item *</label>
            <select
              className={inputClass}
              value={form.itemId}
              onChange={(e) => handleSelectFormItem(e.target.value)}
              disabled={!form.branchId}
            >
              <option value="">Select purchased item</option>
              {formItems.map((item) => (
                <option key={item.item_id} value={item.item_id}>
                  {item.item_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Counted Quantity *</label>
            <input
              type="number"
              className={inputClass}
              value={form.countedQty}
              onChange={(e) => setForm((prev) => ({ ...prev, countedQty: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className={labelClass}>Cost Price</label>
            <input
              type="number"
              className={inputClass}
              value={form.unitCost}
              onChange={(e) => setForm((prev) => ({ ...prev, unitCost: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className={labelClass}>Sale Price</label>
            <input type="number" className={inputClass} value={form.salePrice} readOnly />
          </div>
          <div>
            <label className={labelClass}>Auto Value (Qty x Cost)</label>
            <input type="number" className={inputClass} value={recountValue} readOnly />
          </div>
          <div>
            <label className={labelClass}>Note</label>
            <input
              className={inputClass}
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Optional recount note"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setIsModalOpen(false)}>
            Cancel
          </button>
          <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white" onClick={handleSave}>
            Save Recount
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default StockRecountPage;
