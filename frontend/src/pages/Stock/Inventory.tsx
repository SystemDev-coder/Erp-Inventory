import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Filter, RefreshCw, ArrowLeftRight, Plus } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { inventoryService } from '../../services/inventory.service';
import { productService } from '../../services/product.service';
import { useToast } from '../../components/ui/toast/Toast';

const Inventory = () => {
  const { showToast } = useToast();
  const [stock, setStock] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [loadingMove, setLoadingMove] = useState(false);
  const [filters, setFilters] = useState({ branchId: '', whId: '', productId: '', search: '' });
  const [showAdjust, setShowAdjust] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [adjustForm, setAdjustForm] = useState({ branchId: '', whId: '', productId: '', qty: 0, unitCost: 0, note: '' });
  const [transferForm, setTransferForm] = useState({ fromWhId: '', toWhId: '', productId: '', qty: 0, unitCost: 0, note: '' });

  const stockColumns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'name', header: 'Product' },
    { accessorKey: 'barcode', header: 'Barcode' },
    { accessorKey: 'branch_name', header: 'Branch' },
    { accessorKey: 'wh_name', header: 'Warehouse' },
    { accessorKey: 'wh_qty', header: 'WH Qty' },
    { accessorKey: 'branch_qty', header: 'Branch Qty' },
  ], []);

  const movementColumns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'move_date', header: 'Date', cell: ({ row }) => new Date(row.original.move_date).toLocaleString() },
    { accessorKey: 'move_type', header: 'Type' },
    { accessorKey: 'product_name', header: 'Product' },
    { accessorKey: 'branch_name', header: 'Branch' },
    { accessorKey: 'wh_name', header: 'Warehouse' },
    { accessorKey: 'qty_in', header: 'Qty In' },
    { accessorKey: 'qty_out', header: 'Qty Out' },
    { accessorKey: 'ref_table', header: 'Ref' },
    { accessorKey: 'ref_id', header: 'Ref ID' },
  ], []);

  const loadStock = async () => {
    setLoadingStock(true);
    const res = await inventoryService.listStock({
      ...filters,
      branchId: filters.branchId || undefined,
      whId: filters.whId || undefined,
      productId: filters.productId || undefined,
    });
    setLoadingStock(false);
    if (res.success && res.data?.rows) setStock(res.data.rows);
    else showToast('error', 'Inventory', res.error || 'Failed to load stock');
  };

  const loadMovements = async () => {
    setLoadingMove(true);
    const res = await inventoryService.listMovements({
      ...filters,
      branchId: filters.branchId || undefined,
      whId: filters.whId || undefined,
      productId: filters.productId || undefined,
    });
    setLoadingMove(false);
    if (res.success && res.data?.rows) setMovements(res.data.rows);
    else showToast('error', 'Inventory', res.error || 'Failed to load movements');
  };

  useEffect(() => {
    loadStock();
    productService.list().then((r) => { if (r.success && r.data?.products) setProducts(r.data.products); });
  }, []);

  const handleAdjust = async () => {
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

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Branch & warehouse stock with movement history"
        actions={
          <div className="flex gap-2">
            <button onClick={loadStock} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={() => setShowAdjust(true)} className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Adjust Stock
            </button>
            <button onClick={() => setShowTransfer(true)} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4" /> Transfer
            </button>
          </div>
        }
      />

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Search product..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Branch ID"
            value={filters.branchId}
            onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Warehouse ID"
            value={filters.whId}
            onChange={(e) => setFilters({ ...filters, whId: e.target.value })}
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="Product ID"
            value={filters.productId}
            onChange={(e) => setFilters({ ...filters, productId: e.target.value })}
          />
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={() => { loadStock(); loadMovements(); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">
            <Filter className="w-4 h-4" /> Apply Filters
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Stock</h3>
          </div>
          <DataTable data={stock} columns={stockColumns} isLoading={loadingStock} searchPlaceholder="Search stock..." showToolbarActions={false} />
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">Movements</h3>
          </div>
          <DataTable data={movements} columns={movementColumns} isLoading={loadingMove} searchPlaceholder="Search movements..." showToolbarActions={false} />
        </div>
      </div>

      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="Adjust Stock">
        <div className="space-y-3">
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Branch ID" value={adjustForm.branchId} onChange={(e) => setAdjustForm({ ...adjustForm, branchId: e.target.value })} />
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Warehouse ID (optional)" value={adjustForm.whId} onChange={(e) => setAdjustForm({ ...adjustForm, whId: e.target.value })} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={adjustForm.productId} onChange={(e) => setAdjustForm({ ...adjustForm, productId: e.target.value })}>
            <option value="">Select product</option>
            {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}
          </select>
          <input type="number" className="rounded-lg border px-3 py-2 text-sm" placeholder="Qty (+/-)" value={adjustForm.qty} onChange={(e) => setAdjustForm({ ...adjustForm, qty: Number(e.target.value) })} />
          <input type="number" className="rounded-lg border px-3 py-2 text-sm" placeholder="Unit cost (optional)" value={adjustForm.unitCost} onChange={(e) => setAdjustForm({ ...adjustForm, unitCost: Number(e.target.value) })} />
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Note" value={adjustForm.note} onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <button className="px-4 py-2 rounded-lg border" onClick={() => setShowAdjust(false)}>Cancel</button>
            <button className="px-4 py-2 rounded-lg bg-primary-600 text-white" onClick={handleAdjust}>Save</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTransfer} onClose={() => setShowTransfer(false)} title="Transfer Stock">
        <div className="space-y-3">
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="From Warehouse ID" value={transferForm.fromWhId} onChange={(e) => setTransferForm({ ...transferForm, fromWhId: e.target.value })} />
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="To Warehouse ID" value={transferForm.toWhId} onChange={(e) => setTransferForm({ ...transferForm, toWhId: e.target.value })} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={transferForm.productId} onChange={(e) => setTransferForm({ ...transferForm, productId: e.target.value })}>
            <option value="">Select product</option>
            {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}
          </select>
          <input type="number" className="rounded-lg border px-3 py-2 text-sm" placeholder="Qty" value={transferForm.qty} onChange={(e) => setTransferForm({ ...transferForm, qty: Number(e.target.value) })} />
          <input type="number" className="rounded-lg border px-3 py-2 text-sm" placeholder="Unit cost (optional)" value={transferForm.unitCost} onChange={(e) => setTransferForm({ ...transferForm, unitCost: Number(e.target.value) })} />
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Note" value={transferForm.note} onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <button className="px-4 py-2 rounded-lg border" onClick={() => setShowTransfer(false)}>Cancel</button>
            <button className="px-4 py-2 rounded-lg bg-primary-600 text-white" onClick={handleTransfer}>Transfer</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Inventory;
