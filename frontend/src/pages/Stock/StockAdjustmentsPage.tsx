import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Filter, Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import { inventoryService, InventoryBranch, InventoryWarehouse, StockAdjustmentRow } from '../../services/inventory.service';
import { productService, Product } from '../../services/product.service';

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const StockAdjustmentsPage = () => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<StockAdjustmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const [branches, setBranches] = useState<InventoryBranch[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [items, setItems] = useState<Product[]>([]);

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
    qty: 0,
    unitCost: 0,
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
        header: 'Qty Delta',
        cell: ({ row }) => Number(row.original.qty_delta).toFixed(3),
      },
      {
        accessorKey: 'value_delta',
        header: 'Value Delta',
        cell: ({ row }) => `$${Number(row.original.value_delta).toFixed(2)}`,
      },
      { accessorKey: 'reason', header: 'Reason' },
      {
        accessorKey: 'note',
        header: 'Note',
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
      productService.list(),
    ]);

    if (branchRes.success && branchRes.data?.branches) {
      setBranches(branchRes.data.branches);
    } else {
      showToast('error', 'Stock', branchRes.error || 'Failed to load branches');
    }

    if (whRes.success && whRes.data?.warehouses) {
      setWarehouses(whRes.data.warehouses);
    } else {
      showToast('error', 'Stock', whRes.error || 'Failed to load warehouses');
    }

    if (itemRes.success && itemRes.data?.products) {
      setItems(itemRes.data.products);
    } else {
      showToast('error', 'Stock', itemRes.error || 'Failed to load items');
    }
    setMastersLoading(false);
  };

  useEffect(() => {
    loadMasters();
  }, []);

  const loadAdjustments = async () => {
    setLoading(true);
    const res = await inventoryService.listAdjustments({
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
    showToast('error', 'Stock Adjustments', res.error || 'Failed to load adjustments');
  };

  const handleSave = async () => {
    if (!form.branchId || !form.itemId || Number(form.qty) === 0) {
      showToast('error', 'Stock Adjustments', 'Branch, item, and quantity are required');
      return;
    }

    const res = await inventoryService.adjust({
      branchId: Number(form.branchId),
      whId: form.whId ? Number(form.whId) : undefined,
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
    setForm({
      branchId: '',
      whId: '',
      itemId: '',
      qty: 0,
      unitCost: 0,
      note: '',
    });
    if (hasLoaded) {
      loadAdjustments();
    }
  };

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        description="Create manual item adjustments and review adjustment history."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={loadAdjustments}
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
              New Adjustment
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
              onChange={(e) => setFilters((prev) => ({ ...prev, branchId: e.target.value, whId: '' }))}
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
            <label className={labelClass}>Item</label>
            <select
              className={inputClass}
              value={filters.itemId}
              onChange={(e) => setFilters((prev) => ({ ...prev, itemId: e.target.value }))}
            >
              <option value="">All items</option>
              {items.map((item) => (
                <option key={item.product_id} value={item.product_id}>
                  {item.name}
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

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Stock Adjustment" size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelClass}>Branch *</label>
            <select
              className={inputClass}
              value={form.branchId}
              onChange={(e) => setForm((prev) => ({ ...prev, branchId: e.target.value, whId: '' }))}
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
              <option value="">Branch level only</option>
              {formWarehouses.map((warehouse) => (
                <option key={warehouse.wh_id} value={warehouse.wh_id}>
                  {warehouse.wh_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Item *</label>
            <select
              className={inputClass}
              value={form.itemId}
              onChange={(e) => setForm((prev) => ({ ...prev, itemId: e.target.value }))}
            >
              <option value="">Select item</option>
              {items.map((item) => (
                <option key={item.product_id} value={item.product_id}>
                  {item.name}
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
              placeholder="Use + to add, - to remove"
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
};

export default StockAdjustmentsPage;
