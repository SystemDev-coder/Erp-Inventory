import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { BadgeAlert, Boxes, CheckCircle2, RefreshCw, Store } from 'lucide-react';
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
import { defaultDateRange } from '../../utils/dateRange';
import { useBranch } from '../../context/BranchContext';

type ProductForm = Partial<Product>;
type TxCategory = 'adjustment' | 'paid' | 'sales' | 'cancelled';
type ItemFieldErrors = Partial<Record<string, string>>;

function ItemField({
  label,
  error,
  touched,
  success,
  children,
}: {
  label: string;
  error?: string;
  touched?: boolean;
  success?: boolean;
  children: React.ReactNode;
}) {
  const showError = touched && error;
  const showSuccess = touched && !error && success;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</label>
        {showSuccess && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      </div>
      {children}
      {showError && (
        <p className="text-xs font-medium text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

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
  cancelled: 'Canceled Items',
};

const Products = () => {
  const { showToast } = useToast();
  const { activeBranchId } = useBranch();

  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [stateProducts, setStateProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransactionRow[]>([]);
  const [itemsDisplayed, setItemsDisplayed] = useState(false);
  const [txDisplayed, setTxDisplayed] = useState(false);
  const [inactiveDisplayed, setInactiveDisplayed] = useState(false);
  const [txCategory, setTxCategory] = useState<TxCategory>('adjustment');
  const [itemsDateRange, setItemsDateRange] = useState(() => defaultDateRange());
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
  const [itemErrors, setItemErrors] = useState<ItemFieldErrors>({});
  const [itemTouched, setItemTouched] = useState<Partial<Record<string, boolean>>>({});
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
    const res = await productService.list({
      limit: 200,
      fromDate: itemsDateRange.fromDate,
      toDate: itemsDateRange.toDate,
      branchId: activeBranchId ?? undefined,
    });
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
      branchId: activeBranchId ?? undefined,
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
    // Backend caps list limit at 200; keep within allowed range to avoid validation errors.
    const res = await productService.list({
      includeInactive: true,
      limit: 200,
      fromDate: itemsDateRange.fromDate,
      toDate: itemsDateRange.toDate,
      branchId: activeBranchId ?? undefined,
    });
    if (res.success && res.data?.products) {
      const onlyInactive = res.data.products.filter((item) => !item.is_active || String(item.status).toLowerCase() === 'inactive');
      setStateProducts(onlyInactive);
    } else {
      showToast('error', 'Items State', res.error || 'Failed to load inactive items');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (itemsDisplayed) void loadProducts();
    if (txDisplayed) void loadTransactions();
    if (inactiveDisplayed) void loadInactiveStateItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  const filteredTransactions = useMemo(() => {
    return transactions;
  }, [transactions]);

  const itemColumns: ColumnDef<Product>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Item' },
      { accessorKey: 'quantity', header: 'Quantity', cell: ({ row }) => Number(row.original.quantity ?? row.original.stock ?? 0).toFixed(0) },
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
      { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => Number(row.original.quantity || 0).toFixed(0) },
      { accessorKey: 'store_name', header: 'Store', cell: ({ row }) => row.original.store_name || '-' },
      { accessorKey: 'notes', header: 'Note', cell: ({ row }) => row.original.notes || '-' },
    ],
    []
  );

  const validateItem = (f: ProductForm): ItemFieldErrors => {
    const errs: ItemFieldErrors = {};
    if (!f.name?.trim()) errs.name = 'Item name is required';
    else if (f.name.trim().length < 2) errs.name = 'Name must be at least 2 characters';
    if (!f.cost_price || Number(f.cost_price) <= 0) errs.cost_price = 'Cost price is required';
    if (!f.sell_price || Number(f.sell_price) <= 0) errs.sell_price = 'Sell price is required';
    if ((f.stock_alert ?? 0) < 0) errs.stock_alert = 'Stock alert cannot be negative';
    if ((f.opening_balance ?? 0) < 0) errs.opening_balance = 'Opening balance cannot be negative';
    if ((f.quantity ?? 0) < 0) errs.quantity = 'Quantity cannot be negative';
    return errs;
  };

  const getItemInputCls = (field: string) => {
    const base = 'h-12 w-full rounded-md border px-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:ring-2 dark:text-slate-100 dark:placeholder:text-slate-400 bg-white dark:bg-slate-800/80';
    if (!itemTouched[field]) return `${base} border-slate-300 dark:border-slate-600 focus:border-primary-500 focus:ring-primary-500/20`;
    if (itemErrors[field]) return `${base} border-red-400 bg-red-50/40 dark:border-red-500 dark:bg-red-900/10 focus:border-red-500 focus:ring-red-500/20`;
    return `${base} border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20`;
  };

  const touchItem = (field: string) => {
    setItemTouched(t => ({ ...t, [field]: true }));
    setItemErrors(validateItem(itemForm));
  };

  const setItemField = (field: string, value: unknown) => {
    const next = { ...itemForm, [field]: value } as ProductForm;
    setItemForm(next);
    if (itemTouched[field]) setItemErrors(validateItem(next));
  };

  const closeItemModal = () => {
    setItemModalOpen(false);
    setItemErrors({});
    setItemTouched({});
  };

  const saveItem = async () => {
    const errs = validateItem(itemForm);
    if (Object.keys(errs).length > 0) {
      setItemErrors(errs);
      setItemTouched({ name: true, cost_price: true, sell_price: true, stock_alert: true, opening_balance: true, quantity: true });
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
      closeItemModal();
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

  const removeItem = async (reason: string) => {
    if (!itemToDelete) return;
    const res = await productService.remove(itemToDelete.product_id, reason);
    if (res.success) {
      showToast('success', 'Items', 'Item deleted');
      setItemToDelete(null);
      if (itemsDisplayed) await loadProducts();
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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                From Date
              </span>
              <input
                type="date"
                value={itemsDateRange.fromDate}
                onChange={(e) => setItemsDateRange((prev) => ({ ...prev, fromDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                To Date
              </span>
              <input
                type="date"
                value={itemsDateRange.toDate}
                onChange={(e) => setItemsDateRange((prev) => ({ ...prev, toDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setItemsDisplayed(true);
                void loadProducts();
              }}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Display'}
            </button>
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
                setItemErrors({});
                setItemTouched({});
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
          </div>
          {!itemsDisplayed && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              Click <span className="font-semibold">Display</span> to load data.
            </div>
          )}
          {itemsDisplayed && !loading && products.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              No data found for the selected filters.
            </div>
          )}
          <DataTable
            data={itemsDisplayed ? products : []}
            columns={itemColumns}
            isLoading={loading}
            onEdit={async (row) => {
              setItemForm({ ...row, quantity: Number(row.quantity ?? row.stock ?? 0) });
              setItemErrors({});
              setItemTouched({});
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
              {(['adjustment', 'paid', 'sales', 'cancelled'] as TxCategory[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTxCategory(key);
                    setTxDisplayed(false);
                    setTransactions([]);
                  }}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    txCategory === key
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {txLabel[key]}
                </button>
              ))}
            </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    From Date
                  </span>
                  <input
                    type="date"
                    value={txFromDate}
                    onChange={(event) => {
                      setTxFromDate(event.target.value);
                      setTxDisplayed(false);
                      setTransactions([]);
                    }}
                    className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    To Date
                  </span>
                  <input
                    type="date"
                    value={txToDate}
                    onChange={(event) => {
                      setTxToDate(event.target.value);
                      setTxDisplayed(false);
                      setTransactions([]);
                    }}
                    className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setTxDisplayed(true);
                  void loadTransactions();
                }}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Loading...' : 'Display'}
              </button>
            </div>
          </div>
          </div>
          {!txDisplayed && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              Click <span className="font-semibold">Display</span> to load data.
            </div>
          )}
          {txDisplayed && !loading && filteredTransactions.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              No data found for the selected filters.
            </div>
          )}
          <DataTable
            data={txDisplayed ? filteredTransactions : []}
            columns={txColumns}
            isLoading={loading}
            searchPlaceholder="Search transactions..."
          />
        </div>
      ),
    },
    {
      id: 'state',
      label: 'Items State',
      icon: BadgeAlert,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                From Date
              </span>
              <input
                type="date"
                value={itemsDateRange.fromDate}
                onChange={(e) => setItemsDateRange((prev) => ({ ...prev, fromDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                To Date
              </span>
              <input
                type="date"
                value={itemsDateRange.toDate}
                onChange={(e) => setItemsDateRange((prev) => ({ ...prev, toDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setInactiveDisplayed(true);
                void loadInactiveStateItems();
              }}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Display'}
            </button>
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
          </div>
          {!inactiveDisplayed && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              Click <span className="font-semibold">Display</span> to load data.
            </div>
          )}
          {inactiveDisplayed && !loading && stateProducts.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              No data found for the selected filters.
            </div>
          )}
          <DataTable
            data={inactiveDisplayed ? stateProducts : []}
            columns={stateColumns}
            isLoading={loading}
            searchPlaceholder="Search inactive item..."
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Stock Management" description="Manage items, stores, inventory transactions, and item states." />
      <Tabs tabs={storeTabs} defaultTab="items" />

      <Modal isOpen={itemModalOpen} onClose={closeItemModal} title={itemForm.product_id ? 'Edit Item' : 'New Item'} size="lg">
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); void saveItem(); }}
          className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 p-2"
        >
          {/* Item Name — full width, required */}
          <div className="md:col-span-2">
            <ItemField
              label="Item Name"
              error={itemErrors.name}
              touched={itemTouched.name}
              success={!!itemForm.name?.trim() && itemForm.name.trim().length >= 2}
            >
              <input
                className={getItemInputCls('name')}
                placeholder="Enter item name"
                value={itemForm.name || ''}
                onBlur={() => touchItem('name')}
                onChange={(e) => setItemField('name', e.target.value)}
              />
            </ItemField>
          </div>

          <ItemField
            label="Cost Price"
            error={itemErrors.cost_price}
            touched={itemTouched.cost_price}
            success={Number(itemForm.cost_price ?? 0) > 0}
          >
            <input
              type="number"
              step="0.01"
              min={0}
              className={getItemInputCls('cost_price')}
              placeholder="0.00"
              value={itemForm.cost_price ?? 0}
              onBlur={() => touchItem('cost_price')}
              onChange={(e) => setItemField('cost_price', Number(e.target.value || 0))}
            />
          </ItemField>

          <ItemField
            label="Sell Price"
            error={itemErrors.sell_price}
            touched={itemTouched.sell_price}
            success={Number(itemForm.sell_price ?? 0) > 0}
          >
            <input
              type="number"
              step="0.01"
              min={0}
              className={getItemInputCls('sell_price')}
              placeholder="0.00"
              value={itemForm.sell_price ?? 0}
              onBlur={() => touchItem('sell_price')}
              onChange={(e) => setItemField('sell_price', Number(e.target.value || 0))}
            />
          </ItemField>

          <ItemField
            label="Barcode"
            error={itemErrors.barcode}
            touched={itemTouched.barcode}
            success={!!(itemForm.barcode?.trim())}
          >
            <input
              className={getItemInputCls('barcode')}
              placeholder="Scan or enter barcode"
              value={itemForm.barcode || ''}
              onBlur={() => touchItem('barcode')}
              onChange={(e) => setItemField('barcode', e.target.value)}
            />
          </ItemField>

          <ItemField
            label="Stock Alert"
            error={itemErrors.stock_alert}
            touched={itemTouched.stock_alert}
            success={(itemForm.stock_alert ?? 0) >= 0}
          >
            <input
              type="number"
              min={0}
              step="1"
              className={getItemInputCls('stock_alert')}
              placeholder="5"
              value={itemForm.stock_alert ?? 5}
              onBlur={() => touchItem('stock_alert')}
              onChange={(e) => setItemField('stock_alert', Number(e.target.value || 0))}
            />
          </ItemField>

          <ItemField
            label="Opening Balance"
            error={itemErrors.opening_balance}
            touched={itemTouched.opening_balance}
            success={(itemForm.opening_balance ?? 0) >= 0}
          >
            <input
              type="number"
              min={0}
              step="1"
              className={getItemInputCls('opening_balance')}
              placeholder="0"
              value={itemForm.opening_balance ?? 0}
              onBlur={() => touchItem('opening_balance')}
              onChange={(e) => setItemField('opening_balance', Number(e.target.value || 0))}
            />
          </ItemField>

          <ItemField
            label="Quantity"
            error={itemErrors.quantity}
            touched={itemTouched.quantity}
            success={(itemForm.quantity ?? 0) >= 0}
          >
            <input
              type="number"
              step="1"
              min={0}
              className={getItemInputCls('quantity')}
              placeholder="0"
              value={itemForm.quantity ?? 0}
              onBlur={() => touchItem('quantity')}
              onChange={(e) => setItemField('quantity', Number(e.target.value || 0))}
            />
          </ItemField>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Store (optional)</label>
            <select
              className="h-12 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800/80 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              value={itemStoreId}
              onChange={(e) => setItemStoreId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select store (optional)</option>
              {stores.map((s) => <option key={s.store_id} value={s.store_id}>{s.store_name}</option>)}
            </select>
          </div>

          <div className="md:col-span-2 flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
            <button
              type="button"
              onClick={closeItemModal}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
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

      <ConfirmDialog isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={(reason) => void removeItem(reason || '')} requireReason title="Delete Item" message={`Delete "${itemToDelete?.name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />

      <ImportUploadModal
        isOpen={itemImportOpen}
        onClose={() => setItemImportOpen(false)}
        importType="items"
        title="Upload Items"
        columns={['item', 'quantity', 'cost_price', 'amount', 'sell_price']}
        templateHeaders={['item', 'quantity', 'cost_price', 'sell_price', 'store_id', 'barcode', 'stock_alert', 'is_active']}
        onImported={async () => {
          if (itemsDisplayed) await loadProducts();
        }}
      />
    </div>
  );
};

export default Products;
