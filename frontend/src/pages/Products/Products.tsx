import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { BadgeAlert, Boxes, Edit3, Image as ImageIcon, MoreVertical, PackageCheck, PackageSearch, PackageX, RefreshCw, Ruler, Store, Tags, Trash2, X } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { ActionDropdown } from '../../components/ui/dropdown/ActionDropdown';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { Modal } from '../../components/ui/modal/Modal';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';
import { Category, Product, Unit, productService } from '../../services/product.service';
import { imageService } from '../../services/image.service';
import { InventoryTransactionRow, inventoryService } from '../../services/inventory.service';
import { storeService, Store as StoreType } from '../../services/store.service';
import StoresPage from '../Stock/StoresPage';
import ImportUploadModal from '../../components/import/ImportUploadModal';
import { useBranch } from '../../context/BranchContext';
import { usePermissions } from '../../hooks/usePermissions';

type ProductForm = Partial<Product>;
type TxCategory = 'adjustment' | 'paid' | 'sales' | 'cancelled';

// Deliberately has no error/touched/success state: the form relies on native HTML5
// validation (required/minLength/min on the inputs themselves) instead of custom
// red-border flashing, matching the Employee modal's behavior. The browser blocks
// submission and shows its own message for invalid fields.
function ItemField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide">
        <span>{label}{required ? ' *' : ''}</span>
      </label>
      {children}
    </div>
  );
}

const defaultProductForm: ProductForm = {
  name: '',
  barcode: '',
  category_id: undefined,
  unit_id: undefined,
  brand: '',
  stock_alert: 5,
  opening_balance: 0,
  quantity: 0,
  cost_price: 0,
  sell_price: 0,
  is_active: true,
};

const defaultCategoryForm: Partial<Category> = { name: '', description: '', is_active: true };
const defaultUnitForm: Partial<Unit> = { unit_name: '', symbol: '', is_active: true };

const fieldCls =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const txLabel: Record<TxCategory, string> = {
  adjustment: 'Adjustment',
  paid: 'Paid',
  sales: 'Sales',
  cancelled: 'Canceled Products',
};

const Products = () => {
  const { showToast } = useToast();
  const { activeBranchId } = useBranch();
  const { can } = usePermissions();

  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [itemsSummary, setItemsSummary] = useState({ total: 0, inStock: 0, lowStock: 0, noStock: 0 });
  const [stateProducts, setStateProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransactionRow[]>([]);
  const [itemsDisplayed, setItemsDisplayed] = useState(false);
  // Server-side pagination for the Items tab: fetch one small page at a time.
  const ITEMS_PAGE_SIZE = 20;
  const [itemsPageIndex, setItemsPageIndex] = useState(0); // 0-based
  const [itemsTotalPages, setItemsTotalPages] = useState(0);
  const [itemsTotalRows, setItemsTotalRows] = useState(0);
  const [itemsSearch, setItemsSearch] = useState('');
  const [txDisplayed, setTxDisplayed] = useState(false);
  const [inactiveDisplayed, setInactiveDisplayed] = useState(false);
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
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [itemImageRemoved, setItemImageRemoved] = useState(false);
  const [savingItemImage, setSavingItemImage] = useState(false);
  const [itemCategoryQuery, setItemCategoryQuery] = useState('');
  const [itemUnitQuery, setItemUnitQuery] = useState('');
  const [creatingItemCategory, setCreatingItemCategory] = useState(false);
  const [creatingItemUnit, setCreatingItemUnit] = useState(false);
  const [stateForm, setStateForm] = useState<{ product_id?: number; status: 'active' | 'inactive' }>({
    product_id: undefined,
    status: 'inactive',
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesDisplayed, setCategoriesDisplayed] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<Partial<Category>>(defaultCategoryForm);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsDisplayed, setUnitsDisplayed] = useState(false);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [unitForm, setUnitForm] = useState<Partial<Unit>>(defaultUnitForm);
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);

  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);

  const QUICK_CREATE_CATEGORY_SENTINEL = -1;
  const QUICK_CREATE_UNIT_SENTINEL = -1;

  const handleCreateItemCategory = async (typedName: string) => {
    const name = typedName.trim();
    if (!name) return;
    const existing = categories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setItemField('category_id', existing.category_id);
      return;
    }
    setCreatingItemCategory(true);
    const res = await productService.createCategory({ name, is_active: true, branchId: activeBranchId ?? undefined } as Partial<Category> & { branchId?: number });
    setCreatingItemCategory(false);
    if (res.success && res.data?.category) {
      setCategories((prev) => [...prev, res.data!.category]);
      setItemField('category_id', res.data.category.category_id);
      showToast('success', 'Categories', `"${res.data.category.name}" was added as a new category.`);
    } else {
      showToast('error', 'Categories', res.error || 'Could not create this category.');
    }
  };

  const handleCreateItemUnit = async (typedName: string) => {
    const name = typedName.trim();
    if (!name) return;
    const existing = units.find((u) => u.unit_name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setItemField('unit_id', existing.unit_id);
      return;
    }
    setCreatingItemUnit(true);
    const res = await productService.createUnit({ unit_name: name, is_active: true, branchId: activeBranchId ?? undefined } as Partial<Unit> & { branchId?: number });
    setCreatingItemUnit(false);
    if (res.success && res.data?.unit) {
      setUnits((prev) => [...prev, res.data!.unit]);
      setItemField('unit_id', res.data.unit.unit_id);
      showToast('success', 'Units', `"${res.data.unit.unit_name}" was added as a new unit.`);
    } else {
      showToast('error', 'Units', res.error || 'Could not create this unit.');
    }
  };

  const resolveStores = async () => {
    const storeRes = await storeService.list({ branchId: activeBranchId ?? undefined });
    let loaded = storeRes.success && storeRes.data?.stores ? storeRes.data.stores : [];
    if (!loaded.length) {
      const created = await storeService.create({
        storeName: 'Main Store',
        storeCode: 'MAIN',
        branchId: activeBranchId ?? undefined,
      });
      if (created.success && created.data?.store) {
        loaded = [created.data.store];
      }
    }
    setStores(loaded);
    if (!itemStoreId && loaded.length) {
      const main =
        loaded.find((s) => String(s.store_name || '').toLowerCase() === 'main store') || loaded[0];
      setItemStoreId(main.store_id);
    }
    return loaded;
  };

  const resolveCategories = async () => {
    const res = await productService.listCategories({ branchId: activeBranchId ?? undefined });
    const loaded = res.success && res.data?.categories ? res.data.categories : [];
    setCategories(loaded);
    return loaded;
  };

  const resolveUnits = async () => {
    const res = await productService.listUnits({ branchId: activeBranchId ?? undefined });
    const loaded = res.success && res.data?.units ? res.data.units : [];
    setUnits(loaded);
    return loaded;
  };

  const loadCategories = async () => {
    setLoading(true);
    await resolveCategories();
    setLoading(false);
  };

  const loadUnits = async () => {
    setLoading(true);
    await resolveUnits();
    setLoading(false);
  };

  const saveCategory = async () => {
    setLoading(true);
    const res = categoryForm.category_id
      ? await productService.updateCategory(categoryForm.category_id, categoryForm)
      : await productService.createCategory({ ...categoryForm, branchId: activeBranchId ?? undefined } as Partial<Category> & { branchId?: number });
    setLoading(false);
    if (res.success) {
      showToast('success', 'Categories', categoryForm.category_id ? 'Category updated' : 'Category created');
      setCategoryModalOpen(false);
      setCategoryForm(defaultCategoryForm);
      await resolveCategories();
    } else {
      showToast('error', 'Categories', res.error || 'Failed to save category');
    }
  };

  const removeCategory = async (reason: string) => {
    if (!categoryToDelete) return;
    const res = await productService.removeCategory(categoryToDelete.category_id, reason);
    if (res.success) {
      showToast('success', 'Categories', 'Category deleted');
      setCategoryToDelete(null);
      await resolveCategories();
    } else {
      showToast('error', 'Categories', res.error || 'Failed to delete category');
    }
  };

  const saveUnit = async () => {
    setLoading(true);
    const res = unitForm.unit_id
      ? await productService.updateUnit(unitForm.unit_id, unitForm)
      : await productService.createUnit({ ...unitForm, branchId: activeBranchId ?? undefined } as Partial<Unit> & { branchId?: number });
    setLoading(false);
    if (res.success) {
      showToast('success', 'Units', unitForm.unit_id ? 'Unit updated' : 'Unit created');
      setUnitModalOpen(false);
      setUnitForm(defaultUnitForm);
      await resolveUnits();
    } else {
      showToast('error', 'Units', res.error || 'Failed to save unit');
    }
  };

  const removeUnit = async (reason: string) => {
    if (!unitToDelete) return;
    const res = await productService.removeUnit(unitToDelete.unit_id, reason);
    if (res.success) {
      showToast('success', 'Units', 'Unit deleted');
      setUnitToDelete(null);
      await resolveUnits();
    } else {
      showToast('error', 'Units', res.error || 'Failed to delete unit');
    }
  };

  const loadSummary = async () => {
    const res = await productService.getSummary(activeBranchId ?? undefined);
    if (res.success && res.data?.summary) setItemsSummary(res.data.summary);
  };

  const loadProducts = async (nextPageIndex = itemsPageIndex, search = itemsSearch) => {
    setLoading(true);
    await Promise.all([resolveStores(), resolveCategories(), resolveUnits(), loadSummary()]);
    const res = await productService.list({
      page: nextPageIndex + 1,
      limit: ITEMS_PAGE_SIZE,
      search: search || undefined,
      branchId: activeBranchId ?? undefined,
    });
    if (res.success && res.data?.products) {
      setProducts(res.data.products);
      setItemsTotalPages(res.data.pagination?.totalPages ?? 0);
      setItemsTotalRows(res.data.pagination?.total ?? res.data.products.length);
    } else {
      showToast('error', 'Products', res.error || 'Failed to load products');
    }
    setLoading(false);
  };

  const handleItemsPageChange = (next: number) => {
    setItemsPageIndex(next);
    void loadProducts(next, itemsSearch);
  };

  const handleItemsServerSearch = (value: string) => {
    setItemsSearch(value);
    setItemsPageIndex(0);
    void loadProducts(0, value);
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
      branchId: activeBranchId ?? undefined,
    });
    if (res.success && res.data?.products) {
      const onlyInactive = res.data.products.filter((item) => !item.is_active || String(item.status).toLowerCase() === 'inactive');
      setStateProducts(onlyInactive);
    } else {
      showToast('error', 'Products State', res.error || 'Failed to load inactive products');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadSummary();
    if (itemsDisplayed) {
      setItemsPageIndex(0);
      void loadProducts(0, itemsSearch);
    }
    if (txDisplayed) void loadTransactions();
    if (inactiveDisplayed) void loadInactiveStateItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  const filteredTransactions = useMemo(() => {
    return transactions;
  }, [transactions]);

  const openEditItem = async (row: Product) => {
    setItemForm({ ...row, quantity: Number(row.quantity ?? row.stock ?? 0) });
    setItemImageFile(null);
    setItemImagePreview(row.image_url || null);
    setItemImageRemoved(false);
    const [loaded] = await Promise.all([resolveStores(), resolveCategories(), resolveUnits()]);
    setItemStoreId(row.store_id || loaded[0]?.store_id || '');
    setItemModalOpen(true);
  };

  const itemColumns: ColumnDef<Product>[] = useMemo(
    () => [
      {
        id: 'code',
        header: 'Code',
        cell: ({ row }) => `#PRD${String(row.original.product_id).padStart(4, '0')}`,
      },
      { accessorKey: 'name', header: 'Product' },
      { accessorKey: 'category_name', header: 'Category', cell: ({ row }) => row.original.category_name || '-' },
      { accessorKey: 'brand', header: 'Brand', cell: ({ row }) => row.original.brand || '-' },
      {
        accessorKey: 'unit_name',
        header: 'Unit',
        cell: ({ row }) => row.original.unit_symbol || row.original.unit_name || '-',
      },
      { accessorKey: 'quantity', header: 'Quantity', cell: ({ row }) => Number(row.original.quantity ?? row.original.stock ?? 0).toFixed(0) },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const qty = Number(row.original.quantity ?? row.original.stock ?? 0);
          const alert = Number(row.original.stock_alert ?? 0);
          const state =
            qty <= 0 ? { label: 'No Stock', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' }
            : qty <= alert ? { label: 'Low Stock', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' }
            : { label: 'In Stock', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' };
          return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${state.cls}`}>
              {state.label}
            </span>
          );
        },
      },
      { accessorKey: 'cost_price', header: 'Purchase Price', cell: ({ row }) => `$${Number(row.original.cost_price || 0).toFixed(2)}` },
      { accessorKey: 'sell_price', header: 'Selling Price', cell: ({ row }) => `$${Number(row.original.sell_price || 0).toFixed(2)}` },
      {
        id: 'actions',
        header: 'Action',
        cell: ({ row }) => {
          const item = row.original;
          const menuItems = [
            can('items.update') && {
              label: 'Edit',
              icon: <Edit3 className="h-4 w-4" aria-hidden="true" />,
              onClick: () => void openEditItem(item),
            },
            can('items.delete') && {
              label: 'Delete',
              icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
              variant: 'danger' as const,
              onClick: () => setItemToDelete(item),
            },
          ].filter(Boolean) as { label: string; icon: React.ReactNode; onClick: () => void; variant?: 'danger' }[];
          if (!menuItems.length) return null;
          return (
            <ActionDropdown
              trigger={
                <button
                  type="button"
                  aria-label={`Actions for ${item.name}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>
              }
              items={menuItems}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [can]
  );

  const stateColumns: ColumnDef<Product>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Product' },
      { accessorKey: 'status', header: 'State' },
      { accessorKey: 'stock', header: 'Stock' },
    ],
    []
  );

  const categoryColumns: ColumnDef<Category>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Category' },
      { accessorKey: 'description', header: 'Description', cell: ({ row }) => row.original.description || '-' },
      { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
    ],
    []
  );

  const unitColumns: ColumnDef<Unit>[] = useMemo(
    () => [
      { accessorKey: 'unit_name', header: 'Unit' },
      { accessorKey: 'symbol', header: 'Symbol', cell: ({ row }) => row.original.symbol || '-' },
      { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
    ],
    []
  );

  const txColumns: ColumnDef<InventoryTransactionRow>[] = useMemo(
    () => [
      { accessorKey: 'transaction_date', header: 'Date', cell: ({ row }) => new Date(row.original.transaction_date).toLocaleString() },
      { accessorKey: 'transaction_type', header: 'Type' },
      { accessorKey: 'item_name', header: 'Product', cell: ({ row }) => row.original.item_name || '-' },
      { accessorKey: 'direction', header: 'Dir' },
      { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => Number(row.original.quantity || 0).toFixed(0) },
      { accessorKey: 'store_name', header: 'Store', cell: ({ row }) => row.original.store_name || '-' },
      { accessorKey: 'notes', header: 'Note', cell: ({ row }) => row.original.notes || '-' },
    ],
    []
  );

  const setItemField = (field: string, value: unknown) => {
    const next = { ...itemForm, [field]: value } as ProductForm;
    setItemForm(next);
  };

  const closeItemModal = () => {
    setItemModalOpen(false);
    setItemImageFile(null);
    setItemImagePreview(null);
    setItemImageRemoved(false);
  };

  const handleItemImageChange = (file: File | null) => {
    setItemImageFile(file);
    setItemImageRemoved(false);
    setItemImagePreview(file ? URL.createObjectURL(file) : null);
  };

  const handleRemoveItemImage = () => {
    setItemImageFile(null);
    setItemImagePreview(null);
    setItemImageRemoved(true);
  };

  const saveItem = async () => {
    // Required/minLength/min are enforced natively on the inputs (see the form's
    // required attributes below), so the browser blocks submission before this
    // ever runs when a field is invalid - no manual check needed here. Category
    // and Unit are the exception: SearchableCombobox has no native "required"
    // hook, so they're checked explicitly.
    if (!itemForm.category_id) {
      showToast('error', 'Products', 'Category is required');
      return;
    }
    if (!itemForm.unit_id) {
      showToast('error', 'Products', 'Unit is required');
      return;
    }
    setLoading(true);
    const payload = {
      ...itemForm,
      is_active: true,
      storeId: Number(itemStoreId),
      // Quantity is read-only once a product exists (see the form fields
      // above) - only send it when creating, where it's driven by Opening
      // Stock. Omitting it on edit avoids resubmitting a stale disabled-input
      // value through the direct, unaudited quantity-overwrite path.
      quantity: itemForm.product_id ? undefined : Number(itemForm.quantity ?? 0),
    };
    const res = itemForm.product_id
      ? await productService.update(itemForm.product_id, payload)
      : await productService.create(payload);
    if (!res.success || !res.data?.product) {
      setLoading(false);
      showToast('error', 'Products', res.error || 'Failed to save product');
      return;
    }

    const savedId = res.data.product.product_id;
    if (itemImageFile) {
      setSavingItemImage(true);
      const imgRes = await imageService.uploadProductImage(savedId, itemImageFile);
      setSavingItemImage(false);
      if (!imgRes.success) {
        showToast('error', 'Products', imgRes.error || 'Product saved, but the image could not be uploaded.');
      }
    } else if (itemImageRemoved && itemForm.product_id) {
      await imageService.deleteProductImage(savedId, 'Removed via product edit');
    }

    setLoading(false);
    showToast('success', 'Products', itemForm.product_id ? 'Product updated' : 'Product created');
    closeItemModal();
    setItemForm(defaultProductForm);
    setItemStoreId('');
    await loadProducts();
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
      showToast('success', 'Product State', 'Product state updated');
      setStateModalOpen(false);
      await loadInactiveStateItems();
      await loadProducts();
    } else {
      showToast('error', 'Product State', res.error || 'Failed to update product state');
    }
  };

  const removeItem = async (reason: string) => {
    if (!itemToDelete) return;
    const res = await productService.remove(itemToDelete.product_id, reason);
    if (res.success) {
      showToast('success', 'Products', 'Product deleted');
      setItemToDelete(null);
      if (itemsDisplayed) await loadProducts();
    } else {
      showToast('error', 'Products', res.error || 'Failed to delete product');
    }
  };

  const storeTabs = [
    {
      id: 'items',
      label: 'Products',
      icon: Boxes,
      content: (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Total Products', value: itemsSummary.total, icon: Boxes, cls: 'text-primary-600 dark:text-primary-300 bg-primary-50 dark:bg-primary-500/10' },
              { label: 'In Stock', value: itemsSummary.inStock, icon: PackageCheck, cls: 'text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10' },
              { label: 'Low Stock', value: itemsSummary.lowStock, icon: PackageSearch, cls: 'text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10' },
              { label: 'No Stock', value: itemsSummary.noStock, icon: PackageX, cls: 'text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10' },
            ].map(({ label, value, icon: Icon, cls }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${cls}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setItemsDisplayed(true);
                setItemsPageIndex(0);
                void loadProducts(0, itemsSearch);
              }}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Display'}
            </button>
            {can('items.create') && (
              <button
                type="button"
                onClick={() => setItemImportOpen(true)}
                className="rounded-lg border border-primary-300 px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 dark:border-primary-500/40 dark:text-primary-300 dark:hover:bg-primary-500/10"
              >
                Upload Data
              </button>
            )}
            {can('items.create') && (
              <button
                type="button"
                onClick={async () => {
                  setItemForm(defaultProductForm);
                  setItemStoreId('');
                  setItemImageFile(null);
                  setItemImagePreview(null);
                  setItemImageRemoved(false);
                  await Promise.all([resolveStores(), resolveCategories(), resolveUnits()]);
                  setItemModalOpen(true);
                }}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
              >
                New Product
              </button>
            )}
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
            searchPlaceholder="Search products..."
            serverPagination={{
              pageIndex: itemsPageIndex,
              pageSize: ITEMS_PAGE_SIZE,
              pageCount: Math.max(itemsTotalPages, 1),
              totalRows: itemsTotalRows,
              onPageChange: handleItemsPageChange,
              onPageSizeChange: () => {},
            }}
            onServerSearch={handleItemsServerSearch}
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
      label: 'Products State',
      icon: BadgeAlert,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
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
            searchPlaceholder="Search inactive product..."
          />
        </div>
      ),
    },
    {
      id: 'categories',
      label: 'Categories',
      icon: Tags,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setCategoriesDisplayed(true);
                void loadCategories();
              }}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Display'}
            </button>
            {can('items.create') && (
              <button
                type="button"
                onClick={() => {
                  setCategoryForm(defaultCategoryForm);
                  setCategoryModalOpen(true);
                }}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
              >
                New Category
              </button>
            )}
          </div>
          {!categoriesDisplayed && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              Click <span className="font-semibold">Display</span> to load data.
            </div>
          )}
          {categoriesDisplayed && !loading && categories.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              No data found.
            </div>
          )}
          <DataTable
            data={categoriesDisplayed ? categories : []}
            columns={categoryColumns}
            isLoading={loading}
            onEdit={can('items.update') ? (row) => {
              setCategoryForm(row);
              setCategoryModalOpen(true);
            } : undefined}
            onDelete={can('items.delete') ? (row) => setCategoryToDelete(row) : undefined}
            searchPlaceholder="Search categories..."
          />
        </div>
      ),
    },
    {
      id: 'units',
      label: 'Units',
      icon: Ruler,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setUnitsDisplayed(true);
                void loadUnits();
              }}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Display'}
            </button>
            {can('items.create') && (
              <button
                type="button"
                onClick={() => {
                  setUnitForm(defaultUnitForm);
                  setUnitModalOpen(true);
                }}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
              >
                New Unit
              </button>
            )}
          </div>
          {!unitsDisplayed && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              Click <span className="font-semibold">Display</span> to load data.
            </div>
          )}
          {unitsDisplayed && !loading && units.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              No data found.
            </div>
          )}
          <DataTable
            data={unitsDisplayed ? units : []}
            columns={unitColumns}
            isLoading={loading}
            onEdit={can('items.update') ? (row) => {
              setUnitForm(row);
              setUnitModalOpen(true);
            } : undefined}
            onDelete={can('items.delete') ? (row) => setUnitToDelete(row) : undefined}
            searchPlaceholder="Search units..."
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Stock Management" description="Manage products, categories, units, stores, inventory transactions, and product states." />
      <Tabs tabs={storeTabs} defaultTab="items" />

      <Modal isOpen={itemModalOpen} onClose={closeItemModal} title={itemForm.product_id ? 'Edit Product' : 'New Product'} size="lg">
        <form
          onSubmit={(e) => { e.preventDefault(); void saveItem(); }}
          className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 p-2"
        >
          {/* Product Name — full width, required */}
          <div className="md:col-span-2">
            <ItemField label="Product Name" required>
              <input
                required
                minLength={2}
                placeholder="Enter product name"
                value={itemForm.name || ''}
                onChange={(e) => setItemField('name', e.target.value)}
              />
            </ItemField>
          </div>

          <div className="md:col-span-2">
            <ItemField label="Product Image">
              <div className="flex items-center gap-4">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                  {itemImagePreview ? (
                    <img src={itemImagePreview} alt="Product preview" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-slate-400" aria-hidden="true" />
                  )}
                </div>
                <div className="flex flex-col items-start gap-2">
                  <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                    <span className="inline-flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" aria-hidden="true" />
                      {itemImagePreview ? 'Change image' : 'Upload image'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => handleItemImageChange(e.target.files?.[0] || null)}
                    />
                  </label>
                  {itemImagePreview && (
                    <button
                      type="button"
                      onClick={handleRemoveItemImage}
                      className="inline-flex w-fit items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove image
                    </button>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">JPG, PNG, GIF or WEBP. Up to 10MB.</p>
                </div>
              </div>
            </ItemField>
          </div>

          <ItemField label="Cost Price" required>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={itemForm.cost_price ?? 0}
              onChange={(e) => setItemField('cost_price', Number(e.target.value || 0))}
            />
          </ItemField>

          <ItemField label="Sell Price" required>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={itemForm.sell_price ?? 0}
              onChange={(e) => setItemField('sell_price', Number(e.target.value || 0))}
            />
          </ItemField>

          <ItemField label="Barcode">
            <input
              placeholder="Scan or enter barcode"
              value={itemForm.barcode || ''}
              onChange={(e) => setItemField('barcode', e.target.value)}
            />
          </ItemField>

          <ItemField label="Category" required>
            <SearchableCombobox<number>
              value={itemForm.category_id ?? ''}
              options={(() => {
                const base = categories.map((c) => ({ value: c.category_id, label: c.name }));
                const q = itemCategoryQuery.trim();
                if (!q) return base;
                const exists = categories.some((c) => c.name.trim().toLowerCase() === q.toLowerCase());
                if (exists) return base;
                return [{ value: QUICK_CREATE_CATEGORY_SENTINEL, label: `+ Create "${q}"` }, ...base];
              })()}
              placeholder="Select or type to create"
              disabled={creatingItemCategory}
              onSearch={(q) => setItemCategoryQuery(q)}
              onChange={(nextValue) => {
                if (nextValue === QUICK_CREATE_CATEGORY_SENTINEL) {
                  void handleCreateItemCategory(itemCategoryQuery.trim());
                  return;
                }
                setItemField('category_id', nextValue === '' ? undefined : Number(nextValue));
              }}
            />
          </ItemField>

          <ItemField label="Unit" required>
            <SearchableCombobox<number>
              value={itemForm.unit_id ?? ''}
              options={(() => {
                const base = units.map((u) => ({ value: u.unit_id, label: `${u.unit_name}${u.symbol ? ` (${u.symbol})` : ''}` }));
                const q = itemUnitQuery.trim();
                if (!q) return base;
                const exists = units.some((u) => u.unit_name.trim().toLowerCase() === q.toLowerCase());
                if (exists) return base;
                return [{ value: QUICK_CREATE_UNIT_SENTINEL, label: `+ Create "${q}"` }, ...base];
              })()}
              placeholder="Select or type to create"
              disabled={creatingItemUnit}
              onSearch={(q) => setItemUnitQuery(q)}
              onChange={(nextValue) => {
                if (nextValue === QUICK_CREATE_UNIT_SENTINEL) {
                  void handleCreateItemUnit(itemUnitQuery.trim());
                  return;
                }
                setItemField('unit_id', nextValue === '' ? undefined : Number(nextValue));
              }}
            />
          </ItemField>

          <ItemField label="Brand">
            <input
              placeholder="e.g. Apple, Dell, Adidas"
              value={itemForm.brand || ''}
              onChange={(e) => setItemField('brand', e.target.value)}
            />
          </ItemField>

          <ItemField label="Stock Alert">
            <input
              type="number"
              min={0}
              step="1"
              placeholder="5"
              value={itemForm.stock_alert ?? 5}
              onChange={(e) => setItemField('stock_alert', Number(e.target.value || 0))}
            />
          </ItemField>

          {itemForm.product_id ? (
            <>
              {/* Editing an existing product: Opening Balance (the original
                  cost-basis figure) stays editable - it already has its own
                  GL-reversal-and-repost path (rewriteItemOpeningStockGl), so
                  correcting a data-entry mistake here is safe and audited.
                  Quantity (today's actual live stock) is deliberately
                  read-only here instead: editing it used to call
                  upsertStoreItemQuantity directly, silently overwriting
                  store_items.quantity with no inventory_movements row and no
                  GL entry at all - the one place in the app where stock could
                  change with zero audit trail, unlike every sale, purchase,
                  transfer, or Stock Adjustment. Real stock changes belong in
                  Stock Adjustment, which does this correctly. */}
              <ItemField label="Opening Balance">
                <input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0"
                  value={itemForm.opening_balance ?? 0}
                  onChange={(e) => setItemField('opening_balance', Number(e.target.value || 0))}
                />
              </ItemField>

              <ItemField label="Quantity">
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={itemForm.quantity ?? 0}
                  disabled
                  readOnly
                  className="cursor-not-allowed opacity-70"
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Current stock - use Stock Adjustment to change it
                </p>
              </ItemField>
            </>
          ) : (
            // New product: there's no history yet, so "Opening Balance" and
            // "Quantity" would be the same number - one field, driving both.
            <ItemField label="Opening Stock">
              <input
                type="number"
                min={0}
                step="1"
                placeholder="0"
                value={itemForm.opening_balance ?? 0}
                onChange={(e) => {
                  const value = Number(e.target.value || 0);
                  setItemForm({ ...itemForm, opening_balance: value, quantity: value });
                }}
              />
            </ItemField>
          )}

          <ItemField label="Store" required>
            <select
              required
              value={itemStoreId}
              onChange={(e) => setItemStoreId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="" disabled>Select store</option>
              {stores.map((s) => <option key={s.store_id} value={s.store_id}>{s.store_name}</option>)}
            </select>
          </ItemField>

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
              {itemForm.product_id ? 'Update Product' : 'Save Product'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={stateModalOpen} onClose={() => setStateModalOpen(false)} title="Set Product State" size="sm">
        <div className="space-y-3">
          <label className="text-sm font-medium">Select Product<select className={fieldCls} value={stateForm.product_id ?? ''} onChange={(e) => setStateForm({ ...stateForm, product_id: e.target.value ? Number(e.target.value) : undefined })}><option value="">Select product</option>{products.map((item) => <option key={item.product_id} value={item.product_id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Select State<select className={fieldCls} value={stateForm.status} onChange={(e) => setStateForm({ ...stateForm, status: e.target.value as 'active' | 'inactive' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setStateModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="button" onClick={() => void saveState()} className="rounded-lg bg-primary-600 px-4 py-2 text-white">Save</button></div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={(reason) => void removeItem(reason || '')} requireReason title="Delete Product" message={`Delete "${itemToDelete?.name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />

      <Modal isOpen={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title={categoryForm.category_id ? 'Edit Category' : 'New Category'} size="sm">
        <form onSubmit={(e) => { e.preventDefault(); void saveCategory(); }} className="space-y-3">
          <ItemField label="Category Name" required>
            <input
              required
              minLength={2}
              placeholder="e.g. Electronics"
              value={categoryForm.name || ''}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            />
          </ItemField>
          <ItemField label="Description">
            <input
              placeholder="Optional description"
              value={categoryForm.description || ''}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
            />
          </ItemField>
          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
            <button type="button" onClick={() => setCategoryModalOpen(false)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700">{categoryForm.category_id ? 'Update' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!categoryToDelete} onClose={() => setCategoryToDelete(null)} onConfirm={(reason) => void removeCategory(reason || '')} requireReason title="Delete Category" message={`Delete "${categoryToDelete?.name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />

      <Modal isOpen={unitModalOpen} onClose={() => setUnitModalOpen(false)} title={unitForm.unit_id ? 'Edit Unit' : 'New Unit'} size="sm">
        <form onSubmit={(e) => { e.preventDefault(); void saveUnit(); }} className="space-y-3">
          <ItemField label="Unit Name" required>
            <input
              required
              minLength={1}
              placeholder="e.g. Kilogram"
              value={unitForm.unit_name || ''}
              onChange={(e) => setUnitForm({ ...unitForm, unit_name: e.target.value })}
            />
          </ItemField>
          <ItemField label="Symbol">
            <input
              placeholder="e.g. kg"
              value={unitForm.symbol || ''}
              onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })}
            />
          </ItemField>
          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
            <button type="button" onClick={() => setUnitModalOpen(false)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700">{unitForm.unit_id ? 'Update' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!unitToDelete} onClose={() => setUnitToDelete(null)} onConfirm={(reason) => void removeUnit(reason || '')} requireReason title="Delete Unit" message={`Delete "${unitToDelete?.unit_name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />

      <ImportUploadModal
        isOpen={itemImportOpen}
        onClose={() => setItemImportOpen(false)}
        importType="items"
        title="Upload Products"
        columns={['item', 'quantity', 'cost_price', 'amount', 'sell_price', 'category', 'unit']}
        templateHeaders={['item', 'quantity', 'cost_price', 'sell_price', 'store_id', 'barcode', 'stock_alert', 'is_active', 'category', 'unit']}
        hint="store_id, category, and unit are all optional. If left blank, the system assigns Main Store / the default category / the default unit - and creates a new category or unit automatically if you type a name that doesn't exist yet."
        onImported={async () => {
          if (itemsDisplayed) await loadProducts();
        }}
      />
    </div>
  );
};

export default Products;
