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
type TxCategory = 'adjustment' | 'paid' | 'sales' | 'damage';

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
const txLabel: Record<TxCategory, string> = {
  adjustment: 'Adjustment',
  paid: 'Paid',
  sales: 'Sales',
  damage: 'Damage',
};

const Products = () => {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransactionRow[]>([]);
  const [txCategory, setTxCategory] = useState<TxCategory>('adjustment');

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [itemImportOpen, setItemImportOpen] = useState(false);

  const [itemForm, setItemForm] = useState<ProductForm>(defaultProductForm);
  const [selectedStoreId, setSelectedStoreId] = useState<number | ''>('');
  const [itemStoreId, setItemStoreId] = useState<number | ''>('');
  const [stores, setStores] = useState<StoreType[]>([]);
  const [stateForm, setStateForm] = useState<{ product_id?: number; status: 'active' | 'inactive' }>({
    product_id: undefined,
    status: 'active',
  });

  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);

  const resolveStores = async () => {
    if (stores.length) return stores;
    const storeRes = await storeService.list();
    if (storeRes.success && storeRes.data?.stores) {
      const loaded = storeRes.data.stores;
      setStores(loaded);
      if (!selectedStoreId && loaded.length) {
        const firstId = loaded[0].store_id;
        setSelectedStoreId(firstId);
      }
      return loaded;
    }
    return [];
  };

  const loadProducts = async () => {
    setLoading(true);
    const loadedStores = await resolveStores();
    const effectiveStoreId = selectedStoreId || loadedStores[0]?.store_id || undefined;
    const res = await productService.list({ limit: 200, storeId: effectiveStoreId });
    if (res.success && res.data?.products) setProducts(res.data.products);
    else showToast('error', 'Items', res.error || 'Failed to load items');
    setLoading(false);
  };

  const loadTransactions = async (category: TxCategory = txCategory) => {
    setLoading(true);
    const res = await inventoryService.listTransactions({
      limit: 200,
      page: 1,
      transactionType: category.toUpperCase(),
    });
    if (res.success && res.data?.rows) setTransactions(res.data.rows as InventoryTransactionRow[]);
    else showToast('error', 'Inventory Transaction', res.error || 'Failed to load transactions');
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
            <label className="text-sm font-medium">Store
              <select
                className={`${fieldCls} min-w-[180px]`}
                value={selectedStoreId}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : '';
                  setSelectedStoreId(next);
                }}
              >
                <option value="">Select store</option>
                {stores.map((s) => <option key={s.store_id} value={s.store_id}>{s.store_name}</option>)}
              </select>
            </label>
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
                  setItemStoreId(selectedStoreId || '');
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
              setItemStoreId(selectedStoreId || row.store_id || '');
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
              {(['adjustment', 'paid', 'sales', 'damage'] as TxCategory[]).map((key) => (
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
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void loadTransactions()} className="rounded-lg border px-3 py-2 text-sm">Display</button>
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
            <button type="button" onClick={loadProducts} className="rounded-lg border px-3 py-2 text-sm">Display</button>
            <button
              type="button"
              onClick={() => {
                setStateForm({ product_id: undefined, status: 'active' });
                setStateModalOpen(true);
              }}
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
            >
              + Set State
            </button>
          </div>
          <DataTable data={products} columns={stateColumns} isLoading={loading} searchPlaceholder="Search item state..." />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Stock Management" description="Manage items, stores, inventory transactions, and item states." />
      <Tabs tabs={storeTabs} defaultTab="items" />

      <Modal isOpen={itemModalOpen} onClose={() => setItemModalOpen(false)} title={itemForm.product_id ? 'Edit Item' : 'New Item'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); void saveItem(); }} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-medium">Name<input className={fieldCls} value={itemForm.name || ''} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required /></label>
          <label className="text-sm font-medium">Barcode<input className={fieldCls} value={itemForm.barcode || ''} onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })} /></label>
          <label className="text-sm font-medium">Stock Alert<input type="number" step="0.001" className={fieldCls} value={itemForm.stock_alert ?? 5} onChange={(e) => setItemForm({ ...itemForm, stock_alert: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">Cost Price<input type="number" step="0.01" className={fieldCls} value={itemForm.cost_price ?? 0} onChange={(e) => setItemForm({ ...itemForm, cost_price: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">Sell Price<input type="number" step="0.01" className={fieldCls} value={itemForm.sell_price ?? 0} onChange={(e) => setItemForm({ ...itemForm, sell_price: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">Opening Balance<input type="number" step="0.001" className={fieldCls} value={itemForm.opening_balance ?? 0} onChange={(e) => setItemForm({ ...itemForm, opening_balance: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">Store (optional)
            <select className={fieldCls} value={itemStoreId} onChange={(e) => setItemStoreId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">None</option>
              {stores.map((s) => <option key={s.store_id} value={s.store_id}>{s.store_name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Quantity
            <input type="number" step="0.001" min={0} className={fieldCls} value={itemForm.quantity ?? 0} onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value || 0) })} />
          </label>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2"><button type="button" onClick={() => setItemModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-white">{itemForm.product_id ? 'Update' : 'Save'}</button></div>
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
