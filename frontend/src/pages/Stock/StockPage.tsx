import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Filter, RefreshCw, ArrowLeftRight, Plus, Building2, Warehouse, History } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { inventoryService, InventoryBranch, InventoryWarehouse, InventoryItem, StockLevelRow } from '../../services/inventory.service';
import { useToast } from '../../components/ui/toast/Toast';
import { useAuth } from '../../context/AuthContext';

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
const badgeClass = 'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold';

const StockPage = () => {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [stock, setStock] = useState<StockLevelRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingMove, setLoadingMove] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stockDisplayed, setStockDisplayed] = useState(false);
  const [filters, setFilters] = useState({ branchId: '', whId: '', productId: '', search: '' });
  const [showAdjust, setShowAdjust] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [branches, setBranches] = useState<InventoryBranch[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [adjustForm, setAdjustForm] = useState({ branchId: '', whId: '', productId: '', qty: 0, unitCost: 0, salePrice: 0, note: '' });
  const [transferForm, setTransferForm] = useState({
    fromType: 'warehouse' as 'warehouse' | 'branch',
    toType: 'warehouse' as 'warehouse' | 'branch',
    fromWhId: '',
    toWhId: '',
    fromBranchId: '',
    toBranchId: '',
    productId: '',
    qty: 0,
    unitCost: 0,
    salePrice: 0,
    note: '',
  });
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

  const stockSummary = useMemo(() => {
    const totalQty = stock.reduce((acc, row) => acc + Number(row.total_qty || 0), 0);
    const totalValue = stock.reduce((acc, row) => acc + Number(row.stock_value || 0), 0);
    const lowStockCount = stock.filter((row) => row.low_stock).length;
    return { totalQty, totalValue, lowStockCount };
  }, [stock]);

  const filterWarehouses = useMemo(() => {
    if (!filters.branchId) return activeWarehouses;
    return activeWarehouses.filter((w) => w.branch_id === Number(filters.branchId));
  }, [activeWarehouses, filters.branchId]);

  const adjustWarehouses = useMemo(() => {
    if (!adjustForm.branchId) return activeWarehouses;
    return activeWarehouses.filter((w) => w.branch_id === Number(adjustForm.branchId));
  }, [activeWarehouses, adjustForm.branchId]);

  const transferFromWarehouses = useMemo(() => {
    if (!transferForm.fromBranchId) return activeWarehouses;
    return activeWarehouses.filter((w) => w.branch_id === Number(transferForm.fromBranchId));
  }, [activeWarehouses, transferForm.fromBranchId]);

  const transferToWarehouses = useMemo(() => {
    if (!transferForm.toBranchId) return activeWarehouses;
    return activeWarehouses.filter((w) => w.branch_id === Number(transferForm.toBranchId));
  }, [activeWarehouses, transferForm.toBranchId]);

  const filterItems = useMemo(() => {
    if (!filters.branchId) return items;
    return items.filter((item) => item.branch_id === Number(filters.branchId));
  }, [items, filters.branchId]);

  const adjustItems = useMemo(() => {
    if (!adjustForm.branchId) return items;
    return items.filter((item) => item.branch_id === Number(adjustForm.branchId));
  }, [items, adjustForm.branchId]);

  const transferSourceBranchId = useMemo(() => {
    if (transferForm.fromType === 'warehouse') {
      const wh = activeWarehouses.find((w) => w.wh_id === Number(transferForm.fromWhId));
      return wh ? String(wh.branch_id) : '';
    }
    return transferForm.fromBranchId;
  }, [activeWarehouses, transferForm.fromBranchId, transferForm.fromType, transferForm.fromWhId]);

  const transferItems = useMemo(() => {
    if (!transferSourceBranchId) return items;
    return items.filter((item) => item.branch_id === Number(transferSourceBranchId));
  }, [items, transferSourceBranchId]);

  const openTransferFromRow = (row: StockLevelRow) => {
    const fromWarehouse = (row.warehouse_breakdown || []).find((warehouse) => Number(warehouse.quantity || 0) > 0);
    setTransferForm({
      fromType: fromWarehouse ? 'warehouse' : 'branch',
      toType: 'warehouse',
      fromWhId: fromWarehouse ? String(fromWarehouse.wh_id) : '',
      toWhId: '',
      fromBranchId: fromWarehouse ? '' : String(row.branch_id),
      toBranchId: '',
      productId: String(row.item_id),
      qty: 1,
      unitCost: Number(row.cost_price || 0),
      salePrice: Number(row.sale_price || 0),
      note: '',
    });
    setShowTransfer(true);
  };

  const stockColumns = useMemo<ColumnDef<StockLevelRow>[]>(() => [
    { accessorKey: 'name', header: 'Item' },
    { accessorKey: 'branch_name', header: 'Branch' },
    {
      accessorKey: 'warehouse_breakdown',
      header: 'Warehouse Qty',
      cell: ({ row }) => {
        const breakdown = row.original.warehouse_breakdown || [];
        if (!breakdown.length) return '-';
        return breakdown.map((w) => `${w.wh_name}: ${Number(w.quantity || 0).toFixed(3)}`).join(', ');
      },
    },
    {
      accessorKey: 'branch_qty',
      header: 'Branch Qty',
      cell: ({ row }) => Number(row.original.branch_qty || 0).toFixed(3),
    },
    {
      accessorKey: 'total_qty',
      header: 'Total Qty',
      cell: ({ row }) => Number(row.original.total_qty || 0).toFixed(3),
    },
    {
      accessorKey: 'cost_price',
      header: 'Cost Price',
      cell: ({ row }) => `$${Number(row.original.cost_price || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'stock_value',
      header: 'Stock Value',
      cell: ({ row }) => `$${Number(row.original.stock_value || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'low_stock',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          {row.original.low_stock ? (
            <span className={`${badgeClass} bg-red-100 text-red-700`}>
              <AlertTriangle className="mr-1 h-3 w-3" />
              {`Low (<= ${Number(row.original.min_stock_threshold || 0).toFixed(0)})`}
            </span>
          ) : (
            <span className={`${badgeClass} bg-emerald-100 text-emerald-700`}>In Stock</span>
          )}
          {row.original.qty_mismatch && (
            <span className={`${badgeClass} bg-amber-100 text-amber-700`}>Mismatch</span>
          )}
        </div>
      ),
    },
    {
      id: 'transfer_action',
      header: 'Transfer',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => openTransferFromRow(row.original)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeftRight className="h-3 w-3" />
          Transfer
        </button>
      ),
    },
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
    if (res.success && res.data?.rows) setStock(res.data.rows);
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
    const [bRes, wRes, iRes] = await Promise.all([
      inventoryService.listBranches({ includeInactive: canManageLocations }),
      inventoryService.listWarehouses({ includeInactive: canManageLocations }),
      inventoryService.listItems({}),
    ]);
    if (bRes.success && bRes.data?.branches) setBranches(bRes.data.branches);
    else showToast('error', 'Branches', bRes.error || 'Failed to load branches');
    if (wRes.success && wRes.data?.warehouses) setWarehouses(wRes.data.warehouses);
    else showToast('error', 'Warehouses', wRes.error || 'Failed to load warehouses');
    if (iRes.success && iRes.data?.items) setItems(iRes.data.items);
    else showToast('error', 'Items', iRes.error || 'Failed to load purchased items');
    setLoadingLocations(false);
  };

  const refreshAll = async () => {
    setStockDisplayed(true);
    setRefreshing(true);
    await Promise.all([loadStock(), loadMovements(), loadLocations()]);
    setRefreshing(false);
  };

  const handleAdjustItemChange = (itemId: string) => {
    const selected = adjustItems.find((item) => item.item_id === Number(itemId));
    setAdjustForm((prev) => ({
      ...prev,
      productId: itemId,
      unitCost: selected ? Number(selected.weighted_unit_cost || selected.last_unit_cost || selected.cost_price || 0) : 0,
      salePrice: selected ? Number(selected.sale_price || 0) : 0,
    }));
  };

  const handleTransferItemChange = (itemId: string) => {
    const selected = transferItems.find((item) => item.item_id === Number(itemId));
    setTransferForm((prev) => ({
      ...prev,
      productId: itemId,
      unitCost: selected ? Number(selected.weighted_unit_cost || selected.last_unit_cost || selected.cost_price || 0) : 0,
      salePrice: selected ? Number(selected.sale_price || 0) : 0,
    }));
  };

  const adjustAutoValue = useMemo(
    () => Number((Number(adjustForm.qty || 0) * Number(adjustForm.unitCost || 0)).toFixed(2)),
    [adjustForm.qty, adjustForm.unitCost]
  );

  const transferAutoValue = useMemo(
    () => Number((Number(transferForm.qty || 0) * Number(transferForm.unitCost || 0)).toFixed(2)),
    [transferForm.qty, transferForm.unitCost]
  );

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
      setAdjustForm({ branchId: '', whId: '', productId: '', qty: 0, unitCost: 0, salePrice: 0, note: '' });
      await Promise.all([loadStock(), loadMovements()]);
    } else showToast('error', 'Adjust', res.error || 'Failed');
  };

  const handleTransfer = async () => {
    if (!transferForm.productId || transferForm.qty <= 0) {
      showToast('error', 'Transfer', 'Select source, destination, item, and quantity');
      return;
    }

    if (transferForm.fromType === 'warehouse' && !transferForm.fromWhId) return showToast('error', 'Transfer', 'Source warehouse is required');
    if (transferForm.fromType === 'branch' && !transferForm.fromBranchId) return showToast('error', 'Transfer', 'Source branch is required');
    if (transferForm.toType === 'warehouse' && !transferForm.toWhId) return showToast('error', 'Transfer', 'Destination warehouse is required');
    if (transferForm.toType === 'branch' && !transferForm.toBranchId) return showToast('error', 'Transfer', 'Destination branch is required');

    const res = await inventoryService.transfer({
      fromType: transferForm.fromType,
      toType: transferForm.toType,
      fromWhId: transferForm.fromType === 'warehouse' ? Number(transferForm.fromWhId) : undefined,
      toWhId: transferForm.toType === 'warehouse' ? Number(transferForm.toWhId) : undefined,
      fromBranchId: transferForm.fromType === 'branch' ? Number(transferForm.fromBranchId) : undefined,
      toBranchId: transferForm.toType === 'branch' ? Number(transferForm.toBranchId) : undefined,
      productId: Number(transferForm.productId),
      qty: Number(transferForm.qty),
      unitCost: Number(transferForm.unitCost || 0),
      note: transferForm.note || undefined,
    });
    if (res.success) {
      showToast('success', 'Transfer', 'Stock transferred');
      setShowTransfer(false);
      setTransferForm({
        fromType: 'warehouse',
        toType: 'warehouse',
        fromWhId: '',
        toWhId: '',
        fromBranchId: '',
        toBranchId: '',
        productId: '',
        qty: 0,
        unitCost: 0,
        salePrice: 0,
        note: '',
      });
      await Promise.all([loadStock(), loadMovements()]);
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
        actions={<div className="flex flex-wrap gap-2"><button onClick={() => void refreshAll()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Display</button><button onClick={() => setShowAdjust(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" />Stock Adjustment</button><button onClick={() => setShowTransfer(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white"><ArrowLeftRight className="h-4 w-4" />Transfer</button></div>}
      />

      {!stockDisplayed && (
        <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Click <span className="font-semibold">Display</span> to load stock levels and movement data.
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs uppercase text-slate-500">Total Qty</p><p className="text-2xl font-semibold">{stockSummary.totalQty.toFixed(3)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs uppercase text-slate-500">Stock Value</p><p className="text-2xl font-semibold">${stockSummary.totalValue.toFixed(2)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs uppercase text-slate-500">Low Stock Items</p><p className="text-2xl font-semibold text-red-600">{stockSummary.lowStockCount}</p></div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div><label className={labelClass}>Search</label><input className={inputClass} placeholder="Item name..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></div>
          <div><label className={labelClass}>Branch</label><select className={inputClass} value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value, whId: '' })}><option value="">All branches</option>{activeBranches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></div>
          <div><label className={labelClass}>Warehouse</label><select className={inputClass} value={filters.whId} onChange={(e) => setFilters({ ...filters, whId: e.target.value })}><option value="">All warehouses</option>{filterWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          <div><label className={labelClass}>Purchased Item</label><select className={inputClass} value={filters.productId} onChange={(e) => setFilters({ ...filters, productId: e.target.value })}><option value="">All purchased items</option>{filterItems.map((item) => <option key={item.item_id} value={item.item_id}>{item.item_name}</option>)}</select></div>
        </div>
        <div className="mt-3 flex justify-end"><button onClick={() => { setStockDisplayed(true); void Promise.all([loadStock(), loadMovements()]); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><Filter className="h-4 w-4" />Display</button></div>
      </div>

      <Tabs tabs={tabs} defaultTab="levels" />

      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Stock Adjustment" size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div><label className={labelClass}>Branch *</label><select className={inputClass} value={adjustForm.branchId} onChange={(e) => setAdjustForm({ ...adjustForm, branchId: e.target.value, whId: '', productId: '', unitCost: 0, salePrice: 0 })}><option value="">Select branch</option>{activeBranches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></div>
          <div><label className={labelClass}>Warehouse</label><select className={inputClass} value={adjustForm.whId} onChange={(e) => setAdjustForm({ ...adjustForm, whId: e.target.value })}><option value="">Branch level only</option>{adjustWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          <div><label className={labelClass}>Purchased Item *</label><select className={inputClass} value={adjustForm.productId} onChange={(e) => handleAdjustItemChange(e.target.value)}><option value="">Select purchased item</option>{adjustItems.map((item) => <option key={item.item_id} value={item.item_id}>{item.item_name}</option>)}</select></div>
          <div><label className={labelClass}>Quantity *</label><input type="number" className={inputClass} value={adjustForm.qty} onChange={(e) => setAdjustForm({ ...adjustForm, qty: Number(e.target.value) })} /></div>
          <div><label className={labelClass}>Cost Price</label><input type="number" className={inputClass} value={adjustForm.unitCost} onChange={(e) => setAdjustForm({ ...adjustForm, unitCost: Number(e.target.value) })} /></div>
          <div><label className={labelClass}>Sale Price</label><input type="number" className={inputClass} value={adjustForm.salePrice} readOnly /></div>
          <div><label className={labelClass}>Auto Value (Qty x Cost)</label><input type="number" className={inputClass} value={adjustAutoValue} readOnly /></div>
          <div><label className={labelClass}>Note</label><input className={inputClass} value={adjustForm.note} onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700"><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setShowAdjust(false)}>Cancel</button><button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white" onClick={handleAdjust}>Save</button></div>
      </Modal>

      <Modal isOpen={showTransfer} onClose={() => setShowTransfer(false)} title="Stock Transfer" size="lg">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div><label className={labelClass}>From Type *</label><select className={inputClass} value={transferForm.fromType} onChange={(e) => setTransferForm({ ...transferForm, fromType: e.target.value as 'warehouse' | 'branch', fromWhId: '', fromBranchId: '', productId: '', unitCost: 0, salePrice: 0 })}><option value="warehouse">Warehouse</option><option value="branch">Branch</option></select></div>
          <div><label className={labelClass}>To Type *</label><select className={inputClass} value={transferForm.toType} onChange={(e) => setTransferForm({ ...transferForm, toType: e.target.value as 'warehouse' | 'branch', toWhId: '', toBranchId: '' })}><option value="warehouse">Warehouse</option><option value="branch">Branch</option></select></div>
          {transferForm.fromType === 'warehouse' ? (
            <div><label className={labelClass}>From Warehouse *</label><select className={inputClass} value={transferForm.fromWhId} onChange={(e) => setTransferForm({ ...transferForm, fromWhId: e.target.value, productId: '', unitCost: 0, salePrice: 0 })}><option value="">Select source</option>{activeWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          ) : (
            <div><label className={labelClass}>From Branch *</label><select className={inputClass} value={transferForm.fromBranchId} onChange={(e) => setTransferForm({ ...transferForm, fromBranchId: e.target.value, fromWhId: '', productId: '', unitCost: 0, salePrice: 0 })}><option value="">Select source branch</option>{activeBranches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></div>
          )}
          {transferForm.toType === 'warehouse' ? (
            <div><label className={labelClass}>To Warehouse *</label><select className={inputClass} value={transferForm.toWhId} onChange={(e) => setTransferForm({ ...transferForm, toWhId: e.target.value })}><option value="">Select destination</option>{(transferForm.toBranchId ? transferToWarehouses : activeWarehouses).filter((w) => w.wh_id !== Number(transferForm.fromWhId)).map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          ) : (
            <div><label className={labelClass}>To Branch *</label><select className={inputClass} value={transferForm.toBranchId} onChange={(e) => setTransferForm({ ...transferForm, toBranchId: e.target.value })}><option value="">Select destination branch</option>{activeBranches.filter((b) => String(b.branch_id) !== transferSourceBranchId).map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></div>
          )}
          {transferForm.fromType === 'branch' && transferForm.fromBranchId && (
            <div><label className={labelClass}>From Warehouse (optional)</label><select className={inputClass} value={transferForm.fromWhId} onChange={(e) => setTransferForm({ ...transferForm, fromWhId: e.target.value })}><option value="">Use branch stock</option>{transferFromWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          )}
          {transferForm.toType === 'branch' && transferForm.toBranchId && (
            <div><label className={labelClass}>To Warehouse (optional)</label><select className={inputClass} value={transferForm.toWhId} onChange={(e) => setTransferForm({ ...transferForm, toWhId: e.target.value })}><option value="">Use branch stock</option>{transferToWarehouses.map((w) => <option key={w.wh_id} value={w.wh_id}>{w.wh_name}</option>)}</select></div>
          )}
          <div><label className={labelClass}>Purchased Item *</label><select className={inputClass} value={transferForm.productId} onChange={(e) => handleTransferItemChange(e.target.value)}><option value="">Select purchased item</option>{transferItems.map((item) => <option key={item.item_id} value={item.item_id}>{item.item_name}</option>)}</select></div>
          <div><label className={labelClass}>Quantity *</label><input type="number" className={inputClass} value={transferForm.qty} onChange={(e) => setTransferForm({ ...transferForm, qty: Number(e.target.value) })} /></div>
          <div><label className={labelClass}>Cost Price</label><input type="number" className={inputClass} value={transferForm.unitCost} onChange={(e) => setTransferForm({ ...transferForm, unitCost: Number(e.target.value) })} /></div>
          <div><label className={labelClass}>Sale Price</label><input type="number" className={inputClass} value={transferForm.salePrice} readOnly /></div>
          <div><label className={labelClass}>Auto Value (Qty x Cost)</label><input type="number" className={inputClass} value={transferAutoValue} readOnly /></div>
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
