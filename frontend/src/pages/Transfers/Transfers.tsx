import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { useToast } from '../../components/ui/toast/Toast';
import {
  inventoryService,
  InventoryBranch,
  InventoryItem,
  InventoryWarehouse,
} from '../../services/inventory.service';

type MovementRow = {
  move_id: number;
  move_date: string;
  move_type: string;
  product_name: string;
  branch_name: string;
  wh_name: string | null;
  qty_in: number;
  qty_out: number;
  note: string | null;
};

type TransferForm = {
  fromType: 'warehouse' | 'branch';
  toType: 'warehouse' | 'branch';
  fromWhId: string;
  toWhId: string;
  fromBranchId: string;
  toBranchId: string;
  itemId: string;
  qty: number;
  unitCost: number;
  note: string;
};

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const TRANSFER_MOVE_TYPES = new Set(['transfer_out', 'transfer_in', 'wh_transfer_out', 'wh_transfer_in']);

const initialForm: TransferForm = {
  fromType: 'warehouse',
  toType: 'warehouse',
  fromWhId: '',
  toWhId: '',
  fromBranchId: '',
  toBranchId: '',
  itemId: '',
  qty: 0,
  unitCost: 0,
  note: '',
};

const Transfers = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [branches, setBranches] = useState<InventoryBranch[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [form, setForm] = useState<TransferForm>(initialForm);

  const activeBranches = useMemo(() => branches.filter((row) => row.is_active), [branches]);
  const activeWarehouses = useMemo(() => warehouses.filter((row) => row.is_active), [warehouses]);

  const fromBranchId = useMemo(() => {
    if (form.fromType === 'branch') return form.fromBranchId;
    const sourceWarehouse = activeWarehouses.find((row) => row.wh_id === Number(form.fromWhId));
    return sourceWarehouse ? String(sourceWarehouse.branch_id) : '';
  }, [activeWarehouses, form.fromBranchId, form.fromType, form.fromWhId]);

  const fromWarehouses = useMemo(() => {
    if (!form.fromBranchId) return activeWarehouses;
    return activeWarehouses.filter((row) => row.branch_id === Number(form.fromBranchId));
  }, [activeWarehouses, form.fromBranchId]);

  const toWarehouses = useMemo(() => {
    if (!form.toBranchId) return activeWarehouses;
    return activeWarehouses.filter((row) => row.branch_id === Number(form.toBranchId));
  }, [activeWarehouses, form.toBranchId]);

  const availableItems = useMemo(() => {
    if (!fromBranchId) return items;
    return items.filter((row) => row.branch_id === Number(fromBranchId));
  }, [fromBranchId, items]);

  const transferValue = useMemo(
    () => Number((Number(form.qty || 0) * Number(form.unitCost || 0)).toFixed(2)),
    [form.qty, form.unitCost]
  );

  const movementRows = useMemo(
    () => movements.filter((row) => TRANSFER_MOVE_TYPES.has(String(row.move_type || ''))),
    [movements]
  );

  const movementColumns = useMemo<ColumnDef<MovementRow>[]>(
    () => [
      { accessorKey: 'move_date', header: 'Date', cell: ({ row }) => new Date(row.original.move_date).toLocaleString() },
      { accessorKey: 'move_type', header: 'Type' },
      { accessorKey: 'product_name', header: 'Item' },
      { accessorKey: 'branch_name', header: 'Branch' },
      { accessorKey: 'wh_name', header: 'Warehouse', cell: ({ row }) => row.original.wh_name || '-' },
      { accessorKey: 'qty_in', header: 'In', cell: ({ row }) => Number(row.original.qty_in || 0).toFixed(3) },
      { accessorKey: 'qty_out', header: 'Out', cell: ({ row }) => Number(row.original.qty_out || 0).toFixed(3) },
      { accessorKey: 'note', header: 'Note', cell: ({ row }) => row.original.note || '-' },
    ],
    []
  );

  const loadData = async () => {
    setLoading(true);
    const [branchRes, warehouseRes, itemRes, movementRes] = await Promise.all([
      inventoryService.listBranches(),
      inventoryService.listWarehouses(),
      inventoryService.listItems({}),
      inventoryService.listMovements({ limit: 200, page: 1 }),
    ]);

    if (branchRes.success && branchRes.data?.branches) {
      setBranches(branchRes.data.branches);
    } else {
      showToast('error', 'Transfers', branchRes.error || 'Failed to load branches');
    }

    if (warehouseRes.success && warehouseRes.data?.warehouses) {
      setWarehouses(warehouseRes.data.warehouses);
    } else {
      showToast('error', 'Transfers', warehouseRes.error || 'Failed to load warehouses');
    }

    if (itemRes.success && itemRes.data?.items) {
      setItems(itemRes.data.items);
    } else {
      showToast('error', 'Transfers', itemRes.error || 'Failed to load items');
    }

    if (movementRes.success && movementRes.data?.rows) {
      setMovements(movementRes.data.rows as MovementRow[]);
    } else {
      showToast('error', 'Transfers', movementRes.error || 'Failed to load transfer history');
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const onItemChange = (itemId: string) => {
    const selected = availableItems.find((row) => row.item_id === Number(itemId));
    setForm((prev) => ({
      ...prev,
      itemId,
      unitCost: selected ? Number(selected.weighted_unit_cost || selected.last_unit_cost || selected.cost_price || 0) : 0,
    }));
  };

  const submitTransfer = async () => {
    if (!form.itemId || Number(form.qty) <= 0) {
      showToast('error', 'Transfers', 'Item and quantity are required');
      return;
    }
    if (form.fromType === 'warehouse' && !form.fromWhId) {
      showToast('error', 'Transfers', 'Source warehouse is required');
      return;
    }
    if (form.fromType === 'branch' && !form.fromBranchId) {
      showToast('error', 'Transfers', 'Source branch is required');
      return;
    }
    if (form.toType === 'warehouse' && !form.toWhId) {
      showToast('error', 'Transfers', 'Destination warehouse is required');
      return;
    }
    if (form.toType === 'branch' && !form.toBranchId) {
      showToast('error', 'Transfers', 'Destination branch is required');
      return;
    }

    setSubmitting(true);
    const response = await inventoryService.transfer({
      fromType: form.fromType,
      toType: form.toType,
      fromWhId: form.fromType === 'warehouse' ? Number(form.fromWhId) : undefined,
      toWhId: form.toType === 'warehouse' ? Number(form.toWhId) : undefined,
      fromBranchId: form.fromType === 'branch' ? Number(form.fromBranchId) : undefined,
      toBranchId: form.toType === 'branch' ? Number(form.toBranchId) : undefined,
      productId: Number(form.itemId),
      qty: Number(form.qty),
      unitCost: Number(form.unitCost || 0),
      note: form.note || undefined,
    });
    setSubmitting(false);

    if (!response.success) {
      showToast('error', 'Transfers', response.error || 'Transfer failed');
      return;
    }

    showToast('success', 'Transfers', 'Transfer posted');
    setForm(initialForm);
    await loadData();
  };

  return (
    <div>
      <PageHeader
        title="Transfers"
        description="Transfer stock between branches and warehouses."
        actions={
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">New Transfer</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-500/20 dark:text-primary-300">
            <ArrowLeftRight className="h-3 w-3" />
            Schema Aligned
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelClass}>From Type *</label>
            <select
              className={inputClass}
              value={form.fromType}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  fromType: e.target.value as 'warehouse' | 'branch',
                  fromWhId: '',
                  fromBranchId: '',
                  itemId: '',
                }))
              }
            >
              <option value="warehouse">Warehouse</option>
              <option value="branch">Branch</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>To Type *</label>
            <select
              className={inputClass}
              value={form.toType}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  toType: e.target.value as 'warehouse' | 'branch',
                  toWhId: '',
                  toBranchId: '',
                }))
              }
            >
              <option value="warehouse">Warehouse</option>
              <option value="branch">Branch</option>
            </select>
          </div>

          {form.fromType === 'warehouse' ? (
            <div>
              <label className={labelClass}>From Warehouse *</label>
              <select
                className={inputClass}
                value={form.fromWhId}
                onChange={(e) => setForm((prev) => ({ ...prev, fromWhId: e.target.value, itemId: '' }))}
              >
                <option value="">Select source warehouse</option>
                {activeWarehouses.map((row) => (
                  <option key={row.wh_id} value={row.wh_id}>
                    {row.wh_name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelClass}>From Branch *</label>
              <select
                className={inputClass}
                value={form.fromBranchId}
                onChange={(e) => setForm((prev) => ({ ...prev, fromBranchId: e.target.value, itemId: '' }))}
              >
                <option value="">Select source branch</option>
                {activeBranches.map((row) => (
                  <option key={row.branch_id} value={row.branch_id}>
                    {row.branch_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.toType === 'warehouse' ? (
            <div>
              <label className={labelClass}>To Warehouse *</label>
              <select
                className={inputClass}
                value={form.toWhId}
                onChange={(e) => setForm((prev) => ({ ...prev, toWhId: e.target.value }))}
              >
                <option value="">Select destination warehouse</option>
                {(form.toBranchId ? toWarehouses : activeWarehouses)
                  .filter((row) => row.wh_id !== Number(form.fromWhId))
                  .map((row) => (
                    <option key={row.wh_id} value={row.wh_id}>
                      {row.wh_name}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div>
              <label className={labelClass}>To Branch *</label>
              <select
                className={inputClass}
                value={form.toBranchId}
                onChange={(e) => setForm((prev) => ({ ...prev, toBranchId: e.target.value }))}
              >
                <option value="">Select destination branch</option>
                {activeBranches
                  .filter((row) => String(row.branch_id) !== fromBranchId)
                  .map((row) => (
                    <option key={row.branch_id} value={row.branch_id}>
                      {row.branch_name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {form.fromType === 'branch' && form.fromBranchId && (
            <div>
              <label className={labelClass}>From Warehouse (Optional)</label>
              <select
                className={inputClass}
                value={form.fromWhId}
                onChange={(e) => setForm((prev) => ({ ...prev, fromWhId: e.target.value }))}
              >
                <option value="">Use branch stock</option>
                {fromWarehouses.map((row) => (
                  <option key={row.wh_id} value={row.wh_id}>
                    {row.wh_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.toType === 'branch' && form.toBranchId && (
            <div>
              <label className={labelClass}>To Warehouse (Optional)</label>
              <select
                className={inputClass}
                value={form.toWhId}
                onChange={(e) => setForm((prev) => ({ ...prev, toWhId: e.target.value }))}
              >
                <option value="">Use branch stock</option>
                {toWarehouses.map((row) => (
                  <option key={row.wh_id} value={row.wh_id}>
                    {row.wh_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelClass}>Item *</label>
            <select className={inputClass} value={form.itemId} onChange={(e) => onItemChange(e.target.value)}>
              <option value="">Select item</option>
              {availableItems.map((row) => (
                <option key={row.item_id} value={row.item_id}>
                  {row.item_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Quantity *</label>
            <input
              type="number"
              className={inputClass}
              value={form.qty}
              onChange={(e) => setForm((prev) => ({ ...prev, qty: Number(e.target.value) }))}
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
            <label className={labelClass}>Transfer Value</label>
            <input type="number" className={inputClass} value={transferValue} readOnly />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Note</label>
            <input
              className={inputClass}
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Optional note"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end border-t border-slate-200 pt-3 dark:border-slate-700">
          <button
            type="button"
            onClick={() => void submitTransfer()}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <ArrowLeftRight className="h-4 w-4" />
            {submitting ? 'Posting...' : 'Post Transfer'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Transfer History</h2>
        <DataTable
          data={movementRows}
          columns={movementColumns}
          isLoading={loading}
          searchPlaceholder="Search transfers..."
          showToolbarActions={false}
        />
      </div>
    </div>
  );
};

export default Transfers;
