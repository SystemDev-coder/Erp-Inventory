import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Filter, RefreshCw, ArrowLeftRight, Plus, Building2, Warehouse, History } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { inventoryService, InventoryBranch, InventoryWarehouse } from '../../services/inventory.service';
import { productService, Product } from '../../services/product.service';
import { useToast } from '../../components/ui/toast/Toast';
import { useAuth } from '../../context/AuthContext';

type StockRow = {
  product_id: number;
  name: string;
  barcode?: string;
  branch_id: number;
  branch_name: string;
  wh_id: number | null;
  wh_name: string | null;
  wh_qty: number;
  branch_qty: number;
};

type MovementRow = {
  move_date: string;
  move_type: string;
  product_name: string;
  branch_name: string;
  wh_name: string | null;
  qty_in: number;
  qty_out: number;
  note: string | null;
};

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const StockPage = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [stock, setStock] = useState<StockRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingMove, setLoadingMove] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [filters, setFilters] = useState({ branchId: '', whId: '', productId: '', search: '' });
  const [showAdjust, setShowAdjust] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<InventoryBranch[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [adjustForm, setAdjustForm] = useState({ branchId: '', whId: '', productId: '', qty: 0, unitCost: 0, note: '' });
  const [transferForm, setTransferForm] = useState({ fromWhId: '', toWhId: '', productId: '', qty: 0, unitCost: 0, note: '' });
  const [branchForm, setBranchForm] = useState({ branchName: '', location: '', phone: '', isActive: true });
  const [warehouseForm, setWarehouseForm] = useState({ branchId: '', whName: '', location: '', isActive: true });
  const [editingBranch, setEditingBranch] = useState<InventoryBranch | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<InventoryWarehouse | null>(null);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [branchToDelete, setBranchToDelete] = useState<InventoryBranch | null>(null);
  const [warehouseToDelete, setWarehouseToDelete] = useState<InventoryWarehouse | null>(null);
  const [deletingBranch, setDeletingBranch] = useState(false);
  const [deletingWarehouse, setDeletingWarehouse] = useState(false);

  const canManageLocations = useMemo(() => {
    const role = (user?.role_name || '').toLowerCase();
    return role === 'admin' || role === 'manager';
  }, [user?.role_name]);

  const activeBranches = useMemo(() => branches.filter((b) => b.is_active), [branches]);
  const activeWarehouses = useMemo(() => warehouses.filter((w) => w.is_active), [warehouses]);

  const filterWarehouses = useMemo(() => {
    if (!filters.branchId) return activeWarehouses;
    return activeWarehouses.filter((w) => w.branch_id === Number(filters.branchId));
  }, [activeWarehouses, filters.branchId]);

  const adjustWarehouses = useMemo(() => {
    if (!adjustForm.branchId) return activeWarehouses;
    return activeWarehouses.filter((w) => w.branch_id === Number(adjustForm.branchId));
  }, [activeWarehouses, adjustForm.branchId]);

  const transferWarehouses = useMemo(() => {
    if (!transferForm.fromWhId) return activeWarehouses;
    return activeWarehouses.filter((w) => w.wh_id !== Number(transferForm.fromWhId));
  }, [activeWarehouses, transferForm.fromWhId]);

  const stockColumns = useMemo<ColumnDef<StockRow>[]>(() => [
    { accessorKey: 'name', header: 'Item' },
    { accessorKey: 'branch_name', header: 'Branch' },
    { accessorKey: 'wh_name', header: 'Warehouse', cell: ({ row }) => row.original.wh_name || '-' },
    { accessorKey: 'wh_qty', header: 'Qty' },
    { accessorKey: 'branch_qty', header: 'Branch Qty' },
  ], []);

  const movementColumns = useMemo<ColumnDef<MovementRow>[]>(() => [
    { accessorKey: 'move_date', header: 'Date', cell: ({ row }) => new Date(row.original.move_date).toLocaleString() },
    { accessorKey: 'move_type', header: 'Type' },
    { accessorKey: 'product_name', header: 'Item' },
    { accessorKey: 'branch_name', header: 'Branch' },
    { accessorKey: 'wh_name', header: 'Warehouse', cell: ({ row }) => row.original.wh_name || '-' },
    { accessorKey: 'qty_in', header: 'In' },
    { accessorKey: 'qty_out', header: 'Out' },
    { accessorKey: 'note', header: 'Note', cell: ({ row }) => row.original.note || '-' },
  ], []);

  const branchColumns = useMemo<ColumnDef<InventoryBranch>[]>(() => [
    { accessorKey: 'branch_name', header: 'Branch' },
    { accessorKey: 'location', header: 'Location', cell: ({ row }) => row.original.location || '-' },
    { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '-' },
    { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
  ], []);

  const warehouseColumns = useMemo<ColumnDef<InventoryWarehouse>[]>(() => [
    { accessorKey: 'wh_name', header: 'Warehouse' },
    { accessorKey: 'branch_name', header: 'Branch' },
    { accessorKey: 'location', header: 'Location', cell: ({ row }) => row.original.location || '-' },
    { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
  ], []);

  const loadStock = async () => {
    setLoadingStock(true);
    const res = await inventoryService.listStock({
      branchId: filters.branchId || undefined,
      whId: filters.whId || undefined,
      productId: filters.productId || undefined,
      search: filters.search || undefined,
    });
    setLoadingStock(false);
    if (res.success && res.data?.rows) setStock(res.data.rows as StockRow[]);
    else showToast('error', 'Inventory', res.error || 'Failed to load stock');
  };

  const loadMovements = async () => {
    setLoadingMove(true);
    const res = await inventoryService.listMovements({
      branchId: filters.branchId || undefined,
      whId: filters.whId || undefined,
      productId: filters.productId || undefined,
      search: filters.search || undefined,
    });
    setLoadingMove(false);
    if (res.success && res.data?.rows) setMovements(res.data.rows as MovementRow[]);
    else showToast('error', 'Inventory', res.error || 'Failed to load movements');
  };

  const loadLocations = async () => {
    setLoadingLocations(true);
    const [bRes, wRes] = await Promise.all([
      inventoryService.listBranches({ includeInactive: canManageLocations }),
      inventoryService.listWarehouses({ includeInactive: canManageLocations }),
    ]);
    if (bRes.success && bRes.data?.branches) setBranches(bRes.data.branches);
    else showToast('error', 'Branches', bRes.error || 'Failed to load branches');
    if (wRes.success && wRes.data?.warehouses) setWarehouses(wRes.data.warehouses);
    else showToast('error', 'Warehouses', wRes.error || 'Failed to load warehouses');
    setLoadingLocations(false);
  };

  useEffect(() => {
    loadLocations();
    productService.list().then((r) => {
      if (r.success && r.data?.products) setProducts(r.data.products);
    });
  }, []);

  const handleAdjust = async () => {
    if (!adjustForm.branchId || !adjustForm.productId || Number(adjustForm.qty) === 0) {
      showToast('error', 'Adjust', 'Branch, item, and quantity are required');
      return;
    }
    const res = await inventoryService.adjust({
      branchId: Number(adjustForm.branchId),
      whId: adjustForm.whId ? Number(adjustForm.whId) : undefined,
      productId: Number(adjustForm.productId),
      qty: Number(adjustForm.qty),
      unitCost: Number(adjustForm.unitCost || 0),
      note: adjustForm.note || undefined,
    });
    if (res.success) {
      showToast('success', 'Adjust', 'Stock adjusted');
      setShowAdjust(false);
      loadStock();
      loadMovements();
    } else showToast('error', 'Adjust', res.error || 'Failed');
  };

  const handleTransfer = async () => {
    if (!transferForm.fromWhId || !transferForm.toWhId || !transferForm.productId || transferForm.qty <= 0) {
      showToast('error', 'Transfer', 'Select warehouses, item, and quantity');
      return;
    }
    const res = await inventoryService.transfer({
      fromWhId: Number(transferForm.fromWhId),
      toWhId: Number(transferForm.toWhId),
      productId: Number(transferForm.productId),
      qty: Number(transferForm.qty),
      unitCost: Number(transferForm.unitCost || 0),
      note: transferForm.note || undefined,
    });
    if (res.success) {
      showToast('success', 'Transfer', 'Stock transferred');
      setShowTransfer(false);
      loadStock();
      loadMovements();
    } else showToast('error', 'Transfer', res.error || 'Failed');
  };

  const saveBranch = async () => {
    if (!branchForm.branchName.trim()) {
      showToast('error', 'Branch', 'Branch name is required');
      return;
    }
    setSavingBranch(true);
    const payload = {
      branchName: branchForm.branchName.trim(),
      location: branchForm.location.trim(),
      phone: branchForm.phone.trim(),
      isActive: branchForm.isActive,
    };
    const res = editingBranch
      ? await inventoryService.updateBranch(editingBranch.branch_id, payload)
      : await inventoryService.createBranch(payload);
    setSavingBranch(false);
    if (!res.success) {
      showToast('error', 'Branch', res.error || 'Failed to save branch');
      return;
    }
    showToast('success', 'Branch', editingBranch ? 'Branch updated' : 'Branch created');
    setShowBranchModal(false);
    setEditingBranch(null);
    setBranchForm({ branchName: '', location: '', phone: '', isActive: true });
    loadLocations();
  };

  const confirmDeleteBranch = async () => {
    if (!branchToDelete) return;
    setDeletingBranch(true);
    const res = await inventoryService.deleteBranch(branchToDelete.branch_id);
    setDeletingBranch(false);
    if (!res.success) {
      showToast('error', 'Branch', res.error || 'Failed to delete branch');
      return;
    }
    showToast('success', 'Branch', 'Branch deleted');
    setBranchToDelete(null);
    loadLocations();
  };

  const saveWarehouse = async () => {
    if (!warehouseForm.branchId || !warehouseForm.whName.trim()) {
      showToast('error', 'Warehouse', 'Branch and warehouse name are required');
      return;
    }
    setSavingWarehouse(true);
    const payload = {
      branchId: Number(warehouseForm.branchId),
      whName: warehouseForm.whName.trim(),
      location: warehouseForm.location.trim(),
      isActive: warehouseForm.isActive,
    };
    const res = editingWarehouse
      ? await inventoryService.updateWarehouse(editingWarehouse.wh_id, payload)
      : await inventoryService.createWarehouse(payload);
    setSavingWarehouse(false);
    if (!res.success) {
      showToast('error', 'Warehouse', res.error || 'Failed to save warehouse');
      return;
    }
    showToast('success', 'Warehouse', editingWarehouse ? 'Warehouse updated' : 'Warehouse created');
    setShowWarehouseModal(false);
    setEditingWarehouse(null);
    setWarehouseForm({ branchId: '', whName: '', location: '', isActive: true });
    loadLocations();
  };

  const confirmDeleteWarehouse = async () => {
    if (!warehouseToDelete) return;
    setDeletingWarehouse(true);
    const res = await inventoryService.deleteWarehouse(warehouseToDelete.wh_id);
    setDeletingWarehouse(false);
    if (!res.success) {
      showToast('error', 'Warehouse', res.error || 'Failed to delete warehouse');
      return;
    }
    showToast('success', 'Warehouse', 'Warehouse deleted');
    setWarehouseToDelete(null);
    loadLocations();
  };

  const tabs = [
    {
      id: 'levels',
      label: 'Stock Levels',
      icon: Filter,
      content: (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <DataTable data={stock} columns={stockColumns} isLoading={loadingStock} searchPlaceholder="Search stock..." showToolbarActions={false} />
        </div>
      ),
    },
    {
      id: 'movements',
      label: 'Stock Movements',
      icon: History,
      content: (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <DataTable data={movements} columns={movementColumns} isLoading={loadingMove} searchPlaceholder="Search movements..." showToolbarActions={false} />
        </div>
      ),
    },
    ...(canManageLocations
      ? [
          {
            id: 'branches',
            label: 'Branches',
            icon: Building2,
            content: (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex justify-end">
                  <button onClick={loadLocations} className="mr-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">Display</button>
                  <button onClick={() => { setEditingBranch(null); setBranchForm({ branchName: '', location: '', phone: '', isActive: true }); setShowBranchModal(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" />Add Branch</button>
                </div>
                <DataTable data={branches} columns={branchColumns} isLoading={loadingLocations} searchPlaceholder="Search branches..." onEdit={(row) => { setEditingBranch(row); setBranchForm({ branchName: row.branch_name, location: row.location || '', phone: row.phone || '', isActive: row.is_active }); setShowBranchModal(true); }} onDelete={(row) => setBranchToDelete(row)} showToolbarActions={false} />
              </div>
            ),
          },
          {
            id: 'warehouses',
            label: 'Warehouses',
            icon: Warehouse,
            content: (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex justify-end">
                  <button onClick={loadLocations} className="mr-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">Display</button>
                  <button onClick={() => { setEditingWarehouse(null); setWarehouseForm({ branchId: filters.branchId || '', whName: '', location: '', isActive: true }); setShowWarehouseModal(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" />Add Warehouse</button>
                </div>
                <DataTable data={warehouses} columns={warehouseColumns} isLoading={loadingLocations} searchPlaceholder="Search warehouses..." onEdit={(row) => { setEditingWarehouse(row); setWarehouseForm({ branchId: String(row.branch_id), whName: row.wh_name, location: row.location || '', isActive: row.is_active }); setShowWarehouseModal(true); }} onDelete={(row) => setWarehouseToDelete(row)} showToolbarActions={false} />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Monitor stock by branch and warehouse."
        actions={<div className="flex flex-wrap gap-2"><button onClick={() => { loadStock(); loadMovements(); loadLocations(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button><button onClick={() => setShowAdjust(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" />Stock Adjustment</button><button onClick={() => setShowTransfer(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white"><ArrowLeftRight className="h-4 w-4" />Transfer</button></div>}
      />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div><label className={labelClass}>Search</label><input className={inputClass} placeholder="Item name..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></div>
          <div><label className={labelClass}>Branch</label><select className={inputClass} value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value, whId: '' })}><option value="">All branches</option>{activeBranches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></div>
          <div><label className={labelClass}>Warehouse</label><select className={inputClass} value={filters.whId} onChange={(e) => setFilters({ ...filters, whId: e.target.value })}><option value="">All warehouses</option>{filterWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          <div><label className={labelClass}>Item</label><select className={inputClass} value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })}><option value="">All items</option>{products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select></div>
        </div>
        <div className="mt-3 flex justify-end"><button onClick={() => { loadStock(); loadMovements(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><Filter className="h-4 w-4" />Display</button></div>
      </div>

      <Tabs tabs={tabs} defaultTab="levels" />

      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Stock Adjustment" size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div><label className={labelClass}>Branch *</label><select className={inputClass} value={adjustForm.branchId} onChange={(e) => setAdjustForm({ ...adjustForm, branchId: e.target.value, whId: '' })}><option value="">Select branch</option>{activeBranches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></div>
          <div><label className={labelClass}>Warehouse</label><select className={inputClass} value={adjustForm.whId} onChange={(e) => setAdjustForm({ ...adjustForm, whId: e.target.value })}><option value="">Branch level only</option>{adjustWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          <div><label className={labelClass}>Item *</label><select className={inputClass} value={adjustForm.productId} onChange={(e) => setAdjustForm({ ...adjustForm, productId: e.target.value })}><option value="">Select item</option>{products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select></div>
          <div><label className={labelClass}>Quantity *</label><input type="number" className={inputClass} value={adjustForm.qty} onChange={(e) => setAdjustForm({ ...adjustForm, qty: Number(e.target.value) })} /></div>
          <div><label className={labelClass}>Unit Cost</label><input type="number" className={inputClass} value={adjustForm.unitCost} onChange={(e) => setAdjustForm({ ...adjustForm, unitCost: Number(e.target.value) })} /></div>
          <div><label className={labelClass}>Note</label><input className={inputClass} value={adjustForm.note} onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700"><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setShowAdjust(false)}>Cancel</button><button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white" onClick={handleAdjust}>Save</button></div>
      </Modal>

      <Modal isOpen={showTransfer} onClose={() => setShowTransfer(false)} title="Warehouse Transfer" size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div><label className={labelClass}>From Warehouse *</label><select className={inputClass} value={transferForm.fromWhId} onChange={(e) => setTransferForm({ ...transferForm, fromWhId: e.target.value, toWhId: transferForm.toWhId === e.target.value ? '' : transferForm.toWhId })}><option value="">Select source</option>{activeWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          <div><label className={labelClass}>To Warehouse *</label><select className={inputClass} value={transferForm.toWhId} onChange={(e) => setTransferForm({ ...transferForm, toWhId: e.target.value })}><option value="">Select destination</option>{transferWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          <div><label className={labelClass}>Item *</label><select className={inputClass} value={transferForm.productId} onChange={(e) => setTransferForm({ ...transferForm, productId: e.target.value })}><option value="">Select item</option>{products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select></div>
          <div><label className={labelClass}>Quantity *</label><input type="number" className={inputClass} value={transferForm.qty} onChange={(e) => setTransferForm({ ...transferForm, qty: Number(e.target.value) })} /></div>
          <div><label className={labelClass}>Unit Cost</label><input type="number" className={inputClass} value={transferForm.unitCost} onChange={(e) => setTransferForm({ ...transferForm, unitCost: Number(e.target.value) })} /></div>
          <div><label className={labelClass}>Note</label><input className={inputClass} value={transferForm.note} onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700"><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setShowTransfer(false)}>Cancel</button><button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white" onClick={handleTransfer}>Transfer</button></div>
      </Modal>

      <Modal isOpen={showBranchModal} onClose={() => setShowBranchModal(false)} title={editingBranch ? 'Edit Branch' : 'New Branch'} size="md">
        <div className="space-y-3">
          <div><label className={labelClass}>Branch Name *</label><input className={inputClass} value={branchForm.branchName} onChange={(e) => setBranchForm({ ...branchForm, branchName: e.target.value })} /></div>
          <div><label className={labelClass}>Location</label><input className={inputClass} value={branchForm.location} onChange={(e) => setBranchForm({ ...branchForm, location: e.target.value })} /></div>
          <div><label className={labelClass}>Phone</label><input className={inputClass} value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={branchForm.isActive} onChange={(e) => setBranchForm({ ...branchForm, isActive: e.target.checked })} />Active</label>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700"><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setShowBranchModal(false)}>Cancel</button><button disabled={savingBranch} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={saveBranch}>{savingBranch ? 'Saving...' : 'Save Branch'}</button></div>
      </Modal>

      <Modal isOpen={showWarehouseModal} onClose={() => setShowWarehouseModal(false)} title={editingWarehouse ? 'Edit Warehouse' : 'New Warehouse'} size="md">
        <div className="space-y-3">
          <div><label className={labelClass}>Branch *</label><select className={inputClass} value={warehouseForm.branchId} onChange={(e) => setWarehouseForm({ ...warehouseForm, branchId: e.target.value })}><option value="">Select branch</option>{activeBranches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></div>
          <div><label className={labelClass}>Warehouse Name *</label><input className={inputClass} value={warehouseForm.whName} onChange={(e) => setWarehouseForm({ ...warehouseForm, whName: e.target.value })} /></div>
          <div><label className={labelClass}>Location</label><input className={inputClass} value={warehouseForm.location} onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={warehouseForm.isActive} onChange={(e) => setWarehouseForm({ ...warehouseForm, isActive: e.target.checked })} />Active</label>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700"><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setShowWarehouseModal(false)}>Cancel</button><button disabled={savingWarehouse} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={saveWarehouse}>{savingWarehouse ? 'Saving...' : 'Save Warehouse'}</button></div>
      </Modal>

      <ConfirmDialog
        isOpen={!!branchToDelete}
        onClose={() => setBranchToDelete(null)}
        onConfirm={confirmDeleteBranch}
        title="Delete Branch"
        message={`Are you sure you want to delete branch "${branchToDelete?.branch_name || ''}"?`}
        confirmText="Delete"
        variant="danger"
        isLoading={deletingBranch}
      />

      <ConfirmDialog
        isOpen={!!warehouseToDelete}
        onClose={() => setWarehouseToDelete(null)}
        onConfirm={confirmDeleteWarehouse}
        title="Delete Warehouse"
        message={`Are you sure you want to delete warehouse "${warehouseToDelete?.wh_name || ''}"?`}
        confirmText="Delete"
        variant="danger"
        isLoading={deletingWarehouse}
      />
    </div>
  );
};

export default StockPage;
