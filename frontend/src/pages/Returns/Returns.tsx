import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, History, Info, RefreshCw, RotateCcw, ShoppingBag } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { useToast } from '../../components/ui/toast/Toast';
import { useAuth } from '../../context/AuthContext';
import { inventoryService, InventoryBranch, InventoryItem, InventoryWarehouse } from '../../services/inventory.service';
import { salesService, Sale } from '../../services/sales.service';
import { purchaseService, Purchase } from '../../services/purchase.service';
import { customerService, Customer } from '../../services/customer.service';
import { supplierService, Supplier } from '../../services/supplier.service';
import { accountService, Account } from '../../services/account.service';

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

type PurchaseWithBranch = Purchase & { branch_id?: number };

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const Returns = () => {
  const { showToast } = useToast();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<InventoryBranch[]>([]);
  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [purchases, setPurchases] = useState<PurchaseWithBranch[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);

  const [salesForm, setSalesForm] = useState({
    branchId: '',
    whId: '',
    saleId: '',
    customerId: '',
    itemId: '',
    qty: 1,
    unitPrice: 0,
    refundAccId: '',
    refundAmount: 0,
    note: '',
  });

  const [purchaseForm, setPurchaseForm] = useState({
    branchId: '',
    whId: '',
    purchaseId: '',
    supplierId: '',
    itemId: '',
    qty: 1,
    unitCost: 0,
    note: '',
  });

  useEffect(() => {
    if (!user?.branch_id) return;
    setSalesForm((prev) => ({ ...prev, branchId: prev.branchId || String(user.branch_id) }));
    setPurchaseForm((prev) => ({ ...prev, branchId: prev.branchId || String(user.branch_id) }));
  }, [user?.branch_id]);

  const loadData = async () => {
    setLoading(true);
    const [bRes, wRes, iRes, cRes, sRes, aRes, saleRes, purRes, mRes] = await Promise.all([
      inventoryService.listBranches(),
      inventoryService.listWarehouses(),
      inventoryService.listItems({}),
      customerService.list(),
      supplierService.list(),
      accountService.list(),
      salesService.list({ includeVoided: true }),
      purchaseService.list(),
      inventoryService.listMovements({ limit: 200, page: 1 }),
    ]);

    if (bRes.success && bRes.data?.branches) setBranches(bRes.data.branches);
    if (wRes.success && wRes.data?.warehouses) setWarehouses(wRes.data.warehouses);
    if (iRes.success && iRes.data?.items) setItems(iRes.data.items);
    if (cRes.success && cRes.data?.customers) setCustomers(cRes.data.customers);
    if (sRes.success && sRes.data?.suppliers) setSuppliers(sRes.data.suppliers);
    if (aRes.success && aRes.data?.accounts) setAccounts(aRes.data.accounts);
    if (saleRes.success && saleRes.data?.sales) setSales(saleRes.data.sales);
    if (purRes.success && purRes.data?.purchases) setPurchases(purRes.data.purchases as PurchaseWithBranch[]);
    if (mRes.success && mRes.data?.rows) setMovements(mRes.data.rows as MovementRow[]);
    if (!bRes.success || !wRes.success || !iRes.success || !mRes.success) showToast('error', 'Returns', 'Some return dependencies failed to load');
    setLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const activeBranches = useMemo(() => branches.filter((x) => x.is_active), [branches]);
  const activeWarehouses = useMemo(() => warehouses.filter((x) => x.is_active), [warehouses]);
  const activeAccounts = useMemo(() => accounts.filter((x) => x.is_active), [accounts]);
  const salesWarehouses = useMemo(() => activeWarehouses.filter((x) => !salesForm.branchId || x.branch_id === Number(salesForm.branchId)), [activeWarehouses, salesForm.branchId]);
  const purchaseWarehouses = useMemo(() => activeWarehouses.filter((x) => !purchaseForm.branchId || x.branch_id === Number(purchaseForm.branchId)), [activeWarehouses, purchaseForm.branchId]);
  const salesItems = useMemo(() => items.filter((x) => !salesForm.branchId || x.branch_id === Number(salesForm.branchId)), [items, salesForm.branchId]);
  const purchaseItems = useMemo(() => items.filter((x) => !purchaseForm.branchId || x.branch_id === Number(purchaseForm.branchId)), [items, purchaseForm.branchId]);
  const salesOptions = useMemo(() => sales.filter((x) => !salesForm.branchId || x.branch_id === Number(salesForm.branchId)), [sales, salesForm.branchId]);
  const purchaseOptions = useMemo(() => purchases.filter((x) => !purchaseForm.branchId || Number(x.branch_id || 0) === Number(purchaseForm.branchId)), [purchases, purchaseForm.branchId]);
  const returnHistory = useMemo(() => movements.filter((x) => x.move_type === 'sales_return' || x.move_type === 'purchase_return'), [movements]);

  const salesPayload = useMemo(() => ({
    p_branch_id: salesForm.branchId ? Number(salesForm.branchId) : null,
    p_wh_id: salesForm.whId ? Number(salesForm.whId) : null,
    p_user_id: user?.user_id ?? null,
    p_customer_id: salesForm.customerId ? Number(salesForm.customerId) : null,
    p_sale_id: salesForm.saleId ? Number(salesForm.saleId) : null,
    p_items: salesForm.itemId ? [{ item_id: Number(salesForm.itemId), qty: Number(salesForm.qty), unit_price: Number(salesForm.unitPrice) }] : [],
    p_refund: salesForm.refundAccId && salesForm.refundAmount > 0 ? { acc_id: Number(salesForm.refundAccId), amount_refund: Number(salesForm.refundAmount) } : null,
    p_note: salesForm.note || null,
  }), [salesForm, user?.user_id]);

  const purchasePayload = useMemo(() => ({
    p_branch_id: purchaseForm.branchId ? Number(purchaseForm.branchId) : null,
    p_wh_id: purchaseForm.whId ? Number(purchaseForm.whId) : null,
    p_user_id: user?.user_id ?? null,
    p_supplier_id: purchaseForm.supplierId ? Number(purchaseForm.supplierId) : null,
    p_purchase_id: purchaseForm.purchaseId ? Number(purchaseForm.purchaseId) : null,
    p_items: purchaseForm.itemId ? [{ item_id: Number(purchaseForm.itemId), qty: Number(purchaseForm.qty), unit_cost: Number(purchaseForm.unitCost) }] : [],
    p_note: purchaseForm.note || null,
  }), [purchaseForm, user?.user_id]);

  const movementColumns = useMemo<ColumnDef<MovementRow>[]>(() => [
    { accessorKey: 'move_date', header: 'Date', cell: ({ row }) => new Date(row.original.move_date).toLocaleString() },
    { accessorKey: 'move_type', header: 'Type' },
    { accessorKey: 'product_name', header: 'Item' },
    { accessorKey: 'branch_name', header: 'Branch' },
    { accessorKey: 'wh_name', header: 'Warehouse', cell: ({ row }) => row.original.wh_name || '-' },
    { accessorKey: 'qty_in', header: 'In', cell: ({ row }) => Number(row.original.qty_in || 0).toFixed(3) },
    { accessorKey: 'qty_out', header: 'Out', cell: ({ row }) => Number(row.original.qty_out || 0).toFixed(3) },
    { accessorKey: 'note', header: 'Note', cell: ({ row }) => row.original.note || '-' },
  ], []);

  const copyPayload = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      showToast('success', 'Returns', 'Payload copied');
    } catch {
      showToast('error', 'Returns', 'Copy failed');
    }
  };

  const prepare = (kind: 'sales' | 'purchase') => {
    showToast('info', 'Returns', `${kind === 'sales' ? 'Sales' : 'Purchase'} return payload is prepared. Backend return route is not exposed yet.`);
  };

  const tabs = [
    {
      id: 'sales',
      label: 'Sales Returns',
      icon: RotateCcw,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
            <div><label className={labelClass}>Branch *</label><select className={inputClass} value={salesForm.branchId} onChange={(e) => setSalesForm((p) => ({ ...p, branchId: e.target.value, whId: '', itemId: '' }))}><option value="">Select branch</option>{activeBranches.map((x) => <option key={x.branch_id} value={x.branch_id}>{x.branch_name}</option>)}</select></div>
            <div><label className={labelClass}>Warehouse *</label><select className={inputClass} value={salesForm.whId} onChange={(e) => setSalesForm((p) => ({ ...p, whId: e.target.value }))}><option value="">Select warehouse</option>{salesWarehouses.map((x) => <option key={x.wh_id} value={x.wh_id}>{x.wh_name}</option>)}</select></div>
            <div><label className={labelClass}>Sale (Optional)</label><select className={inputClass} value={salesForm.saleId} onChange={(e) => setSalesForm((p) => ({ ...p, saleId: e.target.value }))}><option value="">Select sale</option>{salesOptions.map((x) => <option key={x.sale_id} value={x.sale_id}>#{x.sale_id} - {x.customer_name || 'Walk-in'}</option>)}</select></div>
            <div><label className={labelClass}>Customer (Optional)</label><select className={inputClass} value={salesForm.customerId} onChange={(e) => setSalesForm((p) => ({ ...p, customerId: e.target.value }))}><option value="">Select customer</option>{customers.map((x) => <option key={x.customer_id} value={x.customer_id}>{x.full_name}</option>)}</select></div>
            <div><label className={labelClass}>Item *</label><select className={inputClass} value={salesForm.itemId} onChange={(e) => { const id = e.target.value; const selected = salesItems.find((x) => x.item_id === Number(id)); setSalesForm((p) => ({ ...p, itemId: id, unitPrice: selected ? Number(selected.sale_price || 0) : 0 })); }}><option value="">Select item</option>{salesItems.map((x) => <option key={x.item_id} value={x.item_id}>{x.item_name}</option>)}</select></div>
            <div><label className={labelClass}>Qty *</label><input type="number" className={inputClass} value={salesForm.qty} onChange={(e) => setSalesForm((p) => ({ ...p, qty: Number(e.target.value) }))} /></div>
            <div><label className={labelClass}>Unit Price *</label><input type="number" className={inputClass} value={salesForm.unitPrice} onChange={(e) => setSalesForm((p) => ({ ...p, unitPrice: Number(e.target.value) }))} /></div>
            <div><label className={labelClass}>Refund Account</label><select className={inputClass} value={salesForm.refundAccId} onChange={(e) => setSalesForm((p) => ({ ...p, refundAccId: e.target.value }))}><option value="">No refund account</option>{activeAccounts.map((x) => <option key={x.acc_id} value={x.acc_id}>{x.name}</option>)}</select></div>
            <div><label className={labelClass}>Refund Amount</label><input type="number" className={inputClass} value={salesForm.refundAmount} onChange={(e) => setSalesForm((p) => ({ ...p, refundAmount: Number(e.target.value) }))} /></div>
            <div className="md:col-span-2 lg:col-span-3"><label className={labelClass}>Note</label><input className={inputClass} value={salesForm.note} onChange={(e) => setSalesForm((p) => ({ ...p, note: e.target.value }))} /></div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2"><button onClick={() => void copyPayload(salesPayload)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Copy Payload</button><button onClick={() => prepare('sales')} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white">Prepare Sales Return</button></div>
          </div>
          <pre className="max-h-72 overflow-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(salesPayload, null, 2)}</pre>
        </div>
      ),
    },
    {
      id: 'purchase',
      label: 'Purchase Returns',
      icon: ShoppingBag,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2 lg:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
            <div><label className={labelClass}>Branch *</label><select className={inputClass} value={purchaseForm.branchId} onChange={(e) => setPurchaseForm((p) => ({ ...p, branchId: e.target.value, whId: '', itemId: '' }))}><option value="">Select branch</option>{activeBranches.map((x) => <option key={x.branch_id} value={x.branch_id}>{x.branch_name}</option>)}</select></div>
            <div><label className={labelClass}>Warehouse *</label><select className={inputClass} value={purchaseForm.whId} onChange={(e) => setPurchaseForm((p) => ({ ...p, whId: e.target.value }))}><option value="">Select warehouse</option>{purchaseWarehouses.map((x) => <option key={x.wh_id} value={x.wh_id}>{x.wh_name}</option>)}</select></div>
            <div><label className={labelClass}>Supplier *</label><select className={inputClass} value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm((p) => ({ ...p, supplierId: e.target.value }))}><option value="">Select supplier</option>{suppliers.map((x) => <option key={x.supplier_id} value={x.supplier_id}>{x.supplier_name}</option>)}</select></div>
            <div><label className={labelClass}>Purchase (Optional)</label><select className={inputClass} value={purchaseForm.purchaseId} onChange={(e) => setPurchaseForm((p) => ({ ...p, purchaseId: e.target.value }))}><option value="">Select purchase</option>{purchaseOptions.map((x) => <option key={x.purchase_id} value={x.purchase_id}>#{x.purchase_id} - {x.supplier_name || 'Supplier'}</option>)}</select></div>
            <div><label className={labelClass}>Item *</label><select className={inputClass} value={purchaseForm.itemId} onChange={(e) => { const id = e.target.value; const selected = purchaseItems.find((x) => x.item_id === Number(id)); setPurchaseForm((p) => ({ ...p, itemId: id, unitCost: selected ? Number(selected.weighted_unit_cost || selected.last_unit_cost || selected.cost_price || 0) : 0 })); }}><option value="">Select item</option>{purchaseItems.map((x) => <option key={x.item_id} value={x.item_id}>{x.item_name}</option>)}</select></div>
            <div><label className={labelClass}>Qty *</label><input type="number" className={inputClass} value={purchaseForm.qty} onChange={(e) => setPurchaseForm((p) => ({ ...p, qty: Number(e.target.value) }))} /></div>
            <div><label className={labelClass}>Unit Cost *</label><input type="number" className={inputClass} value={purchaseForm.unitCost} onChange={(e) => setPurchaseForm((p) => ({ ...p, unitCost: Number(e.target.value) }))} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Note</label><input className={inputClass} value={purchaseForm.note} onChange={(e) => setPurchaseForm((p) => ({ ...p, note: e.target.value }))} /></div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end gap-2"><button onClick={() => void copyPayload(purchasePayload)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Copy Payload</button><button onClick={() => prepare('purchase')} className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white">Prepare Purchase Return</button></div>
          </div>
          <pre className="max-h-72 overflow-auto rounded-2xl bg-slate-900 p-4 text-xs text-slate-100">{JSON.stringify(purchasePayload, null, 2)}</pre>
        </div>
      ),
    },
    {
      id: 'history',
      label: 'Return History',
      icon: History,
      content: <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><DataTable data={returnHistory} columns={movementColumns} isLoading={loading} searchPlaceholder="Search returns..." showToolbarActions={false} /></div>,
    },
  ];

  return (
    <div>
      <PageHeader title="Returns" description="Schema-ready sales and purchase returns." actions={<button type="button" onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>} />

      <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-500/10 dark:text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>This page maps frontend fields directly to `ims.sp_post_sales_return` and `ims.sp_post_purchase_return`. API post routes are not yet exposed, so it prepares validated payloads and shows return movement history.</div>
      </div>

      <Tabs tabs={tabs} defaultTab="sales" />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100"><ClipboardList className="h-4 w-4" />Return Movement Count</div>
        <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{returnHistory.length}</p>
      </div>
    </div>
  );
};

export default Returns;
