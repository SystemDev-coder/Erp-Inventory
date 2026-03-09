import { useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { BadgeAlert, Boxes, Store } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { Modal } from '../../components/ui/modal/Modal';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { Product, productService } from '../../services/product.service';
import { InventoryTransactionRow, inventoryService } from '../../services/inventory.service';
import { storeService, Store as StoreType } from '../../services/store.service';
import StoresPage from '../Stock/StoresPage';
import ImportUploadModal from '../../components/import/ImportUploadModal';

type ProductForm = Partial<Product>;
type TxCategory = 'adjustment' | 'paid' | 'sales' | 'cancelled';

const defaultProductForm: ProductForm = {
  name: '',
  barcode: '',
  stock_alert: 5,
  opening_balance: 0,
  quantity: 0,
  cost_price: 0,
  sell_price: 0,
  is_active: true,
};

const fieldCls =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const modalLabelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300';
const modalInputCls =
  'h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-primary-400 dark:focus:ring-primary-500/25';
const txLabel: Record<TxCategory, string> = {
  adjustment: 'Adjustment',
  paid: 'Paid',
  sales: 'Sales',
  cancelled: 'Canceled Items',
};

const Products = () => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [stateProducts, setStateProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransactionRow[]>([]);
  const [txCategory, setTxCategory] = useState<TxCategory>('adjustment');
  const [txFromDate, setTxFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [txToDate, setTxToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [itemImportOpen, setItemImportOpen] = useState(false);

  const [itemForm, setItemForm] = useState<ProductForm>(defaultProductForm);
  const [itemStoreId, setItemStoreId] = useState<number | ''>('');
  const [stores, setStores] = useState<StoreType[]>([]);
  const [stateForm, setStateForm] = useState<{ product_id?: number; status: 'active' | 'inactive' }>({
    product_id: undefined,
    status: 'inactive',
  });

  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);

  const resolveStores = async () => {
    if (stores.length) return stores;
    const storeRes = await storeService.list();
    if (storeRes.success && storeRes.data?.stores) {
      const loaded = storeRes.data.stores;
      setStores(loaded);
      return loaded;
    }
    return [];
  };

  const loadProducts = async () => {
    setLoading(true);
    await resolveStores();
    const res = await productService.list({ limit: 200 });
    if (res.success && res.data?.products) setProducts(res.data.products);
    else showToast('error', 'Items', res.error || 'Failed to load items');
    setLoading(false);
  };

  const loadTransactions = async (category: TxCategory = txCategory) => {
    if (txFromDate && txToDate && txFromDate > txToDate) {
      showToast('error', 'Inventory Transaction', 'From date cannot be after To date');
      return;
    }
    setLoading(true);
    const query: Record<string, unknown> = {
      limit: 200,
      page: 1,
      fromDate: txFromDate || undefined,
      toDate: txToDate || undefined,
    };
    if (category === 'cancelled') query.status = 'CANCELLED';
    else query.transactionType = category.toUpperCase();
    const res = await inventoryService.listTransactions(query);
    if (res.success && res.data?.rows) setTransactions(res.data.rows as InventoryTransactionRow[]);
    else showToast('error', 'Inventory Transaction', res.error || 'Failed to load transactions');
    setLoading(false);
  };

  const loadInactiveStateItems = async () => {
    setLoading(true);
    await resolveStores();
    const res = await productService.list({ includeInactive: true, limit: 500 });
    if (res.success && res.data?.products) {
      const onlyInactive = res.data.products.filter((item) => !item.is_active || String(item.status).toLowerCase() === 'inactive');
      setStateProducts(onlyInactive);
    } else {
      showToast('error', 'Items State', res.error || 'Failed to load inactive items');
    }
    setLoading(false);
  };

  const filteredTransactions = useMemo(() => {
    return transactions;
  }, [transactions]);

  const itemColumns: ColumnDef<Product>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Item' },
      { accessorKey: 'quantity', header: 'Quantity', cell: ({ row }) => Number(row.original.quantity ?? row.original.stock ?? 0).toFixed(3) },
      { accessorKey: 'cost_price', header: 'Cost Price', cell: ({ row }) => `$${Number(row.original.cost_price || 0).toFixed(2)}` },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => {
          const qty = Number(row.original.quantity ?? row.original.stock ?? 0);
          const cost = Number(row.original.cost_price || 0);
          return `$${(qty * cost).toFixed(2)}`;
        },
      },
      { accessorKey: 'sell_price', header: 'Sell Price', cell: ({ row }) => `$${Number(row.original.sell_price || 0).toFixed(2)}` },
    ],
    []
  );

  const stateColumns: ColumnDef<Product>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Item' },
      { accessorKey: 'status', header: 'State' },
      { accessorKey: 'stock', header: 'Stock' },
    ],
    []
  );

  const txColumns: ColumnDef<InventoryTransactionRow>[] = useMemo(
    () => [
      { accessorKey: 'transaction_date', header: 'Date', cell: ({ row }) => new Date(row.original.transaction_date).toLocaleString() },
      { accessorKey: 'transaction_type', header: 'Type' },
      { accessorKey: 'item_name', header: 'Item', cell: ({ row }) => row.original.item_name || '-' },
      { accessorKey: 'direction', header: 'Dir' },
      { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => Number(row.original.quantity || 0).toFixed(3) },
      { accessorKey: 'store_name', header: 'Store', cell: ({ row }) => row.original.store_name || '-' },
      { accessorKey: 'notes', header: 'Note', cell: ({ row }) => row.original.notes || '-' },
    ],
    []
  );

  const saveItem = async () => {
    if (!itemForm.name?.trim()) {
      showToast('error', 'Items', 'Name is required');
      return;
    }
    setLoading(true);
    const payload = {
      ...itemForm,
      is_active: true,
      storeId: itemStoreId || undefined,
      quantity: Number(itemForm.quantity ?? 0),
    };
    const res = itemForm.product_id
      ? await productService.update(itemForm.product_id, payload)
      : await productService.create(payload);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Items', itemForm.product_id ? 'Item updated' : 'Item created');
      setItemModalOpen(false);
      setItemForm(defaultProductForm);
      setItemStoreId('');
      await loadProducts();
    } else {
      showToast('error', 'Items', res.error || 'Failed to save item');
    }
  };

  const saveState = async () => {
    if (!stateForm.product_id) return;
    setLoading(true);
    const res = await productService.update(stateForm.product_id, {
      status: stateForm.status,
      is_active: stateForm.status === 'active',
    });
    setLoading(false);
    if (res.success) {
      showToast('success', 'Item State', 'Item state updated');
      setStateModalOpen(false);
      await loadInactiveStateItems();
      await loadProducts();
    } else {
      showToast('error', 'Item State', res.error || 'Failed to update item state');
    }
  };

  const removeItem = async () => {
    if (!itemToDelete) return;
    const res = await productService.remove(itemToDelete.product_id);
    if (res.success) {
      showToast('success', 'Items', 'Item deleted');
      setItemToDelete(null);
      await loadProducts();
    } else {
      showToast('error', 'Items', res.error || 'Failed to delete item');
    }
  };

  const storeTabs = [
    {
      id: 'items',
      label: 'Items',
      icon: Boxes,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <button type="button" onClick={loadProducts} className="rounded-lg border px-3 py-2 text-sm">Display</button>
            <button
              type="button"
              onClick={() => setItemImportOpen(true)}
              className="rounded-lg border border-primary-300 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 dark:border-primary-500/40 dark:text-primary-300 dark:hover:bg-primary-500/10"
            >
              Upload Data
            </button>
            <button
              type="button"
              onClick={async () => {
                setItemForm(defaultProductForm);
                const storeRes = await storeService.list();
                if (storeRes.success && storeRes.data?.stores) {
                  setStores(storeRes.data.stores);
                  setItemStoreId('');
                } else {
                  setItemStoreId('');
                }
                setItemModalOpen(true);
              }}
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
            >
              New Item
            </button>
          </div>
          <DataTable
            data={products}
            columns={itemColumns}
            isLoading={loading}
            onEdit={async (row) => {
              setItemForm(row);
              setItemForm((prev) => ({ ...prev, quantity: Number(row.quantity ?? row.stock ?? 0) }));
              const storeRes = await storeService.list();
              if (storeRes.success && storeRes.data?.stores) setStores(storeRes.data.stores);
              setItemStoreId(row.store_id || '');
              setItemModalOpen(true);
            }}
            onDelete={(row) => setItemToDelete(row)}
            searchPlaceholder="Search items..."
          />
        </div>
      ),
    },
    { id: 'store', label: 'Store', icon: Store, content: <StoresPage embedded /> },
    {
      id: 'inventory-transaction',
      label: 'Inventory Transaction',
      content: (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              {(['adjustment', 'paid', 'sales', 'cancelled'] as TxCategory[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTxCategory(key);
                    void loadTransactions(key);
                  }}
                  className={`rounded-lg px-3 py-2 text-sm ${txCategory === key ? 'bg-primary-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
                >
                  {txLabel[key]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>From Date</span>
                <input
                  type="date"
                  value={txFromDate}
                  onChange={(event) => setTxFromDate(event.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <span>To Date</span>
                <input
                  type="date"
                  value={txToDate}
                  onChange={(event) => setTxToDate(event.target.value)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <button type="button" onClick={() => void loadTransactions()} className="h-10 rounded-lg border px-3 text-sm">Display</button>
            </div>
          </div>
          <DataTable data={filteredTransactions} columns={txColumns} isLoading={loading} searchPlaceholder="Search transactions..." />
        </div>
      ),
    },
    {
      id: 'state',
      label: 'Items State',
      icon: BadgeAlert,
      content: (
        <div className="space-y-2">
          <div className="flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <button type="button" onClick={loadInactiveStateItems} className="rounded-lg border px-3 py-2 text-sm">Display</button>
            <button
              type="button"
              onClick={() => {
                setStateForm({ product_id: undefined, status: 'inactive' });
                setStateModalOpen(true);
              }}
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
            >
              + Set State
            </button>
          </div>
          <DataTable data={stateProducts} columns={stateColumns} isLoading={loading} searchPlaceholder="Search inactive item..." />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Stock Management" description="Manage items, stores, inventory transactions, and item states." />
      <Tabs tabs={storeTabs} defaultTab="items" />

      <Modal isOpen={itemModalOpen} onClose={() => setItemModalOpen(false)} title={itemForm.product_id ? 'Edit Item' : 'New Item'} size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveItem();
          }}
          className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/40"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className={modalLabelCls}>Name</label>
              <input
                className={modalInputCls}
                value={itemForm.name || ''}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="Item name"
                required
              />
            </div>
            <div className="space-y-1">
              <label className={modalLabelCls}>Barcode</label>
              <input
                className={modalInputCls}
                value={itemForm.barcode || ''}
                onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })}
                placeholder="Scan or enter barcode"
              />
            </div>
            <div className="space-y-1">
              <label className={modalLabelCls}>Stock Alert</label>
              <input
                type="number"
                step="0.001"
                className={modalInputCls}
                value={itemForm.stock_alert ?? 5}
                onChange={(e) => setItemForm({ ...itemForm, stock_alert: Number(e.target.value || 0) })}
                placeholder="5"
              />
            </div>
            <div className="space-y-1">
              <label className={modalLabelCls}>Cost Price</label>
              <input
                type="number"
                step="0.01"
                className={modalInputCls}
                value={itemForm.cost_price ?? 0}
                onChange={(e) => setItemForm({ ...itemForm, cost_price: Number(e.target.value || 0) })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className={modalLabelCls}>Sell Price</label>
              <input
                type="number"
                step="0.01"
                className={modalInputCls}
                value={itemForm.sell_price ?? 0}
                onChange={(e) => setItemForm({ ...itemForm, sell_price: Number(e.target.value || 0) })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <label className={modalLabelCls}>Opening Balance</label>
              <input
                type="number"
                step="0.001"
                className={modalInputCls}
                value={itemForm.opening_balance ?? 0}
                onChange={(e) => setItemForm({ ...itemForm, opening_balance: Number(e.target.value || 0) })}
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <label className={modalLabelCls}>Store (optional)</label>
              <select
                className={modalInputCls}
                value={itemStoreId}
                onChange={(e) => setItemStoreId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Select Store (optional)</option>
                {stores.map((s) => <option key={s.store_id} value={s.store_id}>{s.store_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={modalLabelCls}>Quantity</label>
              <input
                type="number"
                step="0.001"
                min={0}
                className={modalInputCls}
                value={itemForm.quantity ?? 0}
                onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value || 0) })}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setItemModalOpen(false)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2 font-semibold text-slate-700 transition-all hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button type="submit" className="rounded-xl bg-primary-600 px-7 py-2 text-white font-bold transition-all shadow-lg shadow-primary-500/20 hover:bg-primary-700 active:scale-95">
              {itemForm.product_id ? 'Update Item' : 'Save Item'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={stateModalOpen} onClose={() => setStateModalOpen(false)} title="Set Item State" size="sm">
        <div className="space-y-3">
          <label className="text-sm font-medium">Select Item<select className={fieldCls} value={stateForm.product_id ?? ''} onChange={(e) => setStateForm({ ...stateForm, product_id: e.target.value ? Number(e.target.value) : undefined })}><option value="">Select item</option>{products.map((item) => <option key={item.product_id} value={item.product_id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Select State<select className={fieldCls} value={stateForm.status} onChange={(e) => setStateForm({ ...stateForm, status: e.target.value as 'active' | 'inactive' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setStateModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="button" onClick={() => void saveState()} className="rounded-lg bg-primary-600 px-4 py-2 text-white">Save</button></div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={removeItem} title="Delete Item" message={`Delete "${itemToDelete?.name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />

      <ImportUploadModal
        isOpen={itemImportOpen}
        onClose={() => setItemImportOpen(false)}
        importType="items"
        title="Upload Items"
        columns={['item', 'quantity', 'cost_price', 'amount', 'sell_price']}
        templateHeaders={['item', 'quantity', 'cost_price', 'sell_price', 'store_id', 'barcode', 'stock_alert', 'is_active']}
        onImported={async () => {
          await loadProducts();
        }}
      />
    </div>
  );
};

export default Products;
