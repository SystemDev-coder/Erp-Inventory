import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { BadgeAlert, Boxes, Edit3, GitMerge, MoreVertical, PackageCheck, PackageSearch, PackageX, RefreshCw, Ruler, Store, Tags, Trash2 } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { ActionDropdown } from '../../components/ui/dropdown/ActionDropdown';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { Modal } from '../../components/ui/modal/Modal';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';
import { Category, Product, Unit, productService } from '../../services/product.service';
import { deletePreviewService, DeleteImpactPreview } from '../../services/deletePreview.service';
import { InventoryTransactionRow, inventoryService } from '../../services/inventory.service';
import { storeService, Store as StoreType } from '../../services/store.service';
import StoresPage from '../Stock/StoresPage';
import ImportUploadModal from '../../components/import/ImportUploadModal';
import { useBranch } from '../../context/BranchContext';
import { useBusinessConfig } from '../../context/BusinessConfigContext';
import { usePermissions } from '../../hooks/usePermissions';
import { attributeSummary, DEFAULT_CATEGORIES_BY_BUSINESS_TYPE, PRODUCT_ATTRIBUTE_CATALOG } from '../../config/productAttributes';

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
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { activeBranchId } = useBranch();
  const { can } = usePermissions();
  const { profile: businessProfile } = useBusinessConfig();
  const productConfig = businessProfile.productConfig;
  // Part 7: relabel generic fields per business type instead of adding new
  // ones - perfume's "volume" and cosmetics' "shade" are the same underlying
  // size/color columns as clothing's, just meaningful under a different name.
  const sizeLabel = businessProfile.businessType === 'perfume' ? 'Volume' : 'Size';
  const colorLabel = businessProfile.businessType === 'cosmetics' ? 'Shade' : 'Color';

  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [itemsSummary, setItemsSummary] = useState({ total: 0, inStock: 0, lowStock: 0, noStock: 0 });
  const [stateProducts, setStateProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransactionRow[]>([]);
  const [itemsDisplayed, setItemsDisplayed] = useState(false);
  // Server-side pagination for the Items tab: fetch one small page at a time.
  const [itemsPageSize, setItemsPageSize] = useState(20);
  const [itemsPageIndex, setItemsPageIndex] = useState(0); // 0-based
  const [itemsTotalPages, setItemsTotalPages] = useState(0);
  const [itemsTotalRows, setItemsTotalRows] = useState(0);
  const [itemsSearch, setItemsSearch] = useState('');
  // Made clickable (Total/In Stock/Low Stock/No Stock summary cards): filters
  // the server-side query, not just the currently-loaded page, so every
  // matching item shows up regardless of which page it would otherwise fall on.
  const [itemsStockFilter, setItemsStockFilter] = useState<'in_stock' | 'low_stock' | 'no_stock' | null>(null);
  const [txDisplayed, setTxDisplayed] = useState(false);
  const [inactiveDisplayed, setInactiveDisplayed] = useState(false);
  const [txCategory, setTxCategory] = useState<TxCategory>('adjustment');
  const [txFromDate, setTxFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [txToDate, setTxToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [stateModalOpen, setStateModalOpen] = useState(false);
  const [itemImportOpen, setItemImportOpen] = useState(false);
  const [exportingItems, setExportingItems] = useState(false);

  // itemStoreId/stores stay here (not moved to ProductEditor.tsx) because
  // resolveStores()/loadInactiveStateItems() below still use them - New/Edit
  // Product itself now lives on its own page/route (see ProductEditor.tsx).
  const [itemStoreId, setItemStoreId] = useState<number | ''>('');
  const [stores, setStores] = useState<StoreType[]>([]);
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
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpactPreview | null>(null);

  // Phase 3 (Central Delete Architecture): fetch the Impact Preview as soon as
  // the delete confirm dialog opens, so the user sees what's blocked/kept
  // before confirming rather than after a failed save.
  const openDeleteConfirm = (item: Product) => {
    setItemToDelete(item);
    setDeleteImpact(null);
    void deletePreviewService.preview('items', item.product_id).then((res) => {
      if (res.success && res.data?.preview) setDeleteImpact(res.data.preview);
    });
  };

  const closeDeleteConfirm = () => {
    setItemToDelete(null);
    setDeleteImpact(null);
  };

  // Phase 6: consolidates a "duplicate" product's history/stock into another
  // product, then archives the duplicate - see products.service.ts#mergeItems.
  const [itemToMerge, setItemToMerge] = useState<Product | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<number | ''>('');
  const [mergeTargetQuery, setMergeTargetQuery] = useState('');
  const [merging, setMerging] = useState(false);

  const openMergeModal = (item: Product) => {
    setItemToMerge(item);
    setMergeTargetId('');
    setMergeTargetQuery('');
  };

  const closeMergeModal = () => {
    setItemToMerge(null);
    setMergeTargetId('');
    setMergeTargetQuery('');
  };

  const confirmMerge = async () => {
    if (!itemToMerge || !mergeTargetId) return;
    setMerging(true);
    const res = await productService.merge(itemToMerge.product_id, Number(mergeTargetId));
    setMerging(false);
    if (res.success) {
      showToast('success', 'Products', 'Products merged');
      closeMergeModal();
      if (itemsDisplayed) await loadProducts();
    } else {
      showToast('error', 'Merge failed', res.error || 'Could not merge products');
    }
  };

  // The generic Impact Preview has no concept of quantity - it only knows
  // whether a dependent row exists - so on-hand stock (which deleteProduct
  // requires to be zero) is checked here client-side, from data already on
  // the row, and merged into the same impact summary the dialog renders.
  const deleteStockOnHand = itemToDelete ? Number(itemToDelete.stock ?? itemToDelete.quantity ?? 0) : 0;
  const deleteConfirmImpact: DeleteImpactPreview | null = itemToDelete
    ? {
        blocked: Boolean(deleteImpact?.blocked) || deleteStockOnHand > 0,
        blockedBy: [
          ...(deleteStockOnHand > 0 ? [{ table: 'stock', label: 'On-hand stock', count: deleteStockOnHand }] : []),
          ...(deleteImpact?.blockedBy || []),
        ],
        cascaded: deleteImpact?.cascaded || [],
        preserved: deleteImpact?.preserved || [],
      }
    : null;


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

  const handleExportProducts = async () => {
    setExportingItems(true);
    const res = await productService.exportXlsx({
      search: itemsSearch || undefined,
      stockStatus: itemsStockFilter || undefined,
      branchId: activeBranchId ?? undefined,
    });
    setExportingItems(false);
    if (!res.success || !res.blob) {
      showToast('error', 'Export failed', res.success ? 'No file returned from server.' : res.error || 'Could not export products');
      return;
    }
    const url = window.URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename || 'products.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const [seedingCategories, setSeedingCategories] = useState(false);
  const handleSeedDefaultCategories = async () => {
    setSeedingCategories(true);
    const res = await productService.seedDefaultCategories(activeBranchId ?? undefined);
    setSeedingCategories(false);
    if (res.success) {
      const count = res.data?.categories?.length ?? 0;
      showToast(
        'success',
        'Categories',
        count > 0 ? `${count} starter categor${count === 1 ? 'y' : 'ies'} added` : 'Starter categories already exist'
      );
      setCategoriesDisplayed(true);
      await resolveCategories();
    } else {
      showToast('error', 'Categories', res.error || 'Failed to seed starter categories');
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

  const loadProducts = async (
    nextPageIndex = itemsPageIndex,
    search = itemsSearch,
    pageSize = itemsPageSize,
    stockFilter = itemsStockFilter
  ) => {
    setLoading(true);
    await Promise.all([resolveStores(), resolveCategories(), resolveUnits(), loadSummary()]);
    const res = await productService.list({
      page: nextPageIndex + 1,
      limit: pageSize,
      search: search || undefined,
      branchId: activeBranchId ?? undefined,
      stockStatus: stockFilter ?? undefined,
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

  const handleItemsPageSizeChange = (nextSize: number) => {
    setItemsPageSize(nextSize);
    setItemsPageIndex(0);
    void loadProducts(0, itemsSearch, nextSize);
  };

  const handleItemsServerSearch = (value: string) => {
    setItemsSearch(value);
    setItemsPageIndex(0);
    void loadProducts(0, value);
  };

  const handleItemsStockFilterClick = (status: 'in_stock' | 'low_stock' | 'no_stock') => {
    const next = itemsStockFilter === status ? null : status;
    setItemsStockFilter(next);
    setItemsDisplayed(true);
    setItemsPageIndex(0);
    void loadProducts(0, itemsSearch, itemsPageSize, next);
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

  const openEditItem = (row: Product) => navigate(`/items/${row.product_id}/edit`);

  const itemColumns: ColumnDef<Product>[] = useMemo(
    () => [
      {
        id: 'code',
        header: 'Code',
        cell: ({ row }) => `#PRD${String(row.original.product_id).padStart(4, '0')}`,
      },
      {
        accessorKey: 'name',
        header: 'Product',
        // Phase 9: the DataTable is also part of the centralized Dynamic
        // Product Attributes config - a light caption of up to 2 of the
        // product's own attribute values (e.g. "Model: iPhone 15 - Storage:
        // 128GB") instead of a fixed extra column, since different
        // categories under the same profile use different keys.
        cell: ({ row }) => {
          const summary = attributeSummary(row.original.attributes);
          return (
            <div>
              <div>{row.original.name}</div>
              {summary && <div className="text-xs text-slate-400">{summary}</div>}
            </div>
          );
        },
      },
      { accessorKey: 'category_name', header: 'Category', cell: ({ row }) => row.original.category_name || '-' },
      { accessorKey: 'brand', header: 'Brand', cell: ({ row }) => row.original.brand || '-' },
      {
        accessorKey: 'unit_name',
        header: 'Unit',
        cell: ({ row }) => row.original.unit_symbol || row.original.unit_name || '-',
      },
      { accessorKey: 'supplier_name', header: 'Supplier', cell: ({ row }) => row.original.supplier_name || '-' },
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
            can('items.update') && can('items.delete') && {
              label: 'Merge into...',
              icon: <GitMerge className="h-4 w-4" aria-hidden="true" />,
              onClick: () => openMergeModal(item),
            },
            can('items.delete') && {
              label: 'Delete',
              icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
              variant: 'danger' as const,
              onClick: () => openDeleteConfirm(item),
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
      closeDeleteConfirm();
      if (itemsDisplayed) await loadProducts();
    } else {
      showToast('error', 'Products', res.error || 'Failed to delete product');
    }
  };

  // Phase 9: Excel Import's optional attribute columns - the union of
  // attribute_keys across the branch's actual categories (loaded via
  // Display/seeding above), not the full catalog - so the template only
  // offers columns that are actually relevant to this business right now.
  const activeAttributeKeys = useMemo(
    () => Array.from(new Set(categories.flatMap((c) => c.attribute_keys || []))),
    [categories]
  );

  const storeTabs = [
    {
      id: 'items',
      label: 'Products',
      icon: Boxes,
      content: (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Total Products', value: itemsSummary.total, icon: Boxes, cls: 'text-primary-600 dark:text-primary-300 bg-primary-50 dark:bg-primary-500/10', status: null as const },
              { label: 'In Stock', value: itemsSummary.inStock, icon: PackageCheck, cls: 'text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10', status: 'in_stock' as const },
              { label: 'Low Stock', value: itemsSummary.lowStock, icon: PackageSearch, cls: 'text-amber-600 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10', status: 'low_stock' as const },
              { label: 'No Stock', value: itemsSummary.noStock, icon: PackageX, cls: 'text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10', status: 'no_stock' as const },
            ].map(({ label, value, icon: Icon, cls, status }) => {
              const isActive = itemsStockFilter === status;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    if (status === null) {
                      setItemsStockFilter(null);
                      setItemsDisplayed(true);
                      setItemsPageIndex(0);
                      void loadProducts(0, itemsSearch, itemsPageSize, null);
                    } else {
                      handleItemsStockFilterClick(status);
                    }
                  }}
                  title={status === null ? 'Show all products' : `Filter to ${label.toLowerCase()}`}
                  className={`flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition-colors ${
                    isActive
                      ? 'border-primary-500 bg-primary-50/60 ring-2 ring-primary-500/30 dark:border-primary-400 dark:bg-primary-500/10'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${cls}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {itemsStockFilter && (
            <p className="text-xs font-medium text-primary-700 dark:text-primary-300">
              Showing only "{itemsStockFilter.replace('_', ' ')}" products.{' '}
              <button
                type="button"
                onClick={() => {
                  setItemsStockFilter(null);
                  setItemsPageIndex(0);
                  void loadProducts(0, itemsSearch, itemsPageSize, null);
                }}
                className="underline hover:no-underline"
              >
                Clear filter
              </button>
            </p>
          )}
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
            {can('items.view') && (
              <button
                type="button"
                disabled={exportingItems}
                onClick={() => void handleExportProducts()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {exportingItems ? 'Exporting...' : 'Export Excel'}
              </button>
            )}
            {can('items.create') && (
              <button
                type="button"
                onClick={() => navigate('/items/new')}
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
              pageSize: itemsPageSize,
              pageCount: Math.max(itemsTotalPages, 1),
              totalRows: itemsTotalRows,
              onPageChange: handleItemsPageChange,
              onPageSizeChange: handleItemsPageSizeChange,
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
            {can('items.create') && businessProfile.businessType && DEFAULT_CATEGORIES_BY_BUSINESS_TYPE[businessProfile.businessType] && (
              <button
                type="button"
                disabled={seedingCategories}
                onClick={() => void handleSeedDefaultCategories()}
                className="inline-flex items-center gap-2 rounded-lg border border-primary-300 px-3 py-2 text-sm text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-primary-700 dark:text-primary-300 dark:hover:bg-primary-900/20"
              >
                {seedingCategories
                  ? 'Adding...'
                  : `Add ${businessProfile.businessType.charAt(0).toUpperCase()}${businessProfile.businessType.slice(1)} Starter Categories`}
              </button>
            )}
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

      <Modal isOpen={stateModalOpen} onClose={() => setStateModalOpen(false)} title="Set Product State" size="sm">
        <div className="space-y-3">
          <label className="text-sm font-medium">Select Product<select className={fieldCls} value={stateForm.product_id ?? ''} onChange={(e) => setStateForm({ ...stateForm, product_id: e.target.value ? Number(e.target.value) : undefined })}><option value="">Select product</option>{products.map((item) => <option key={item.product_id} value={item.product_id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Select State<select className={fieldCls} value={stateForm.status} onChange={(e) => setStateForm({ ...stateForm, status: e.target.value as 'active' | 'inactive' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setStateModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="button" onClick={() => void saveState()} className="rounded-lg bg-primary-600 px-4 py-2 text-white">Save</button></div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!itemToDelete}
        onClose={closeDeleteConfirm}
        onConfirm={(reason) => void removeItem(reason || '')}
        requireReason
        title="Delete Product"
        message={
          deleteStockOnHand > 0
            ? `Delete "${itemToDelete?.name || ''}"? ${deleteStockOnHand} unit(s) of stock remain — reduce to zero first.`
            : `Delete "${itemToDelete?.name || ''}"?`
        }
        confirmText="Delete"
        variant="danger"
        isLoading={loading}
        impact={deleteConfirmImpact}
      />

      <Modal isOpen={!!itemToMerge} onClose={closeMergeModal} title="Merge Product" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Move all history and stock from <strong>{itemToMerge?.name}</strong> into another product, then archive{' '}
            <strong>{itemToMerge?.name}</strong>. This cannot be undone.
          </p>
          <label className="text-sm font-medium">
            Merge into
            <select
              className={fieldCls}
              value={mergeTargetId}
              onChange={(e) => setMergeTargetId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select target product</option>
              {products
                .filter((p) => p.product_id !== itemToMerge?.product_id)
                .filter((p) => !mergeTargetQuery.trim() || p.name.toLowerCase().includes(mergeTargetQuery.trim().toLowerCase()))
                .map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <input
            className={fieldCls}
            placeholder="Type to filter products..."
            value={mergeTargetQuery}
            onChange={(e) => setMergeTargetQuery(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeMergeModal} className="rounded-lg border px-4 py-2" disabled={merging}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmMerge()}
              disabled={!mergeTargetId || merging}
              className="rounded-lg bg-primary-600 px-4 py-2 text-white disabled:opacity-50"
            >
              {merging ? 'Merging...' : 'Merge'}
            </button>
          </div>
        </div>
      </Modal>

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
          <ItemField label="Attributes">
            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-0.5 mb-1">
              Which fields do products in this category need? (e.g. Model, Storage, RAM for phones)
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2">
              {Object.values(PRODUCT_ATTRIBUTE_CATALOG).map((def) => {
                const checked = (categoryForm.attribute_keys || []).includes(def.key);
                return (
                  <label key={def.key} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const current = categoryForm.attribute_keys || [];
                        const next = e.target.checked ? [...current, def.key] : current.filter((k) => k !== def.key);
                        setCategoryForm({ ...categoryForm, attribute_keys: next });
                      }}
                    />
                    {def.label}
                  </label>
                );
              })}
            </div>
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
        columns={['item', 'quantity', 'cost_price', 'amount', 'sell_price', 'category', 'unit', 'supplier', ...activeAttributeKeys]}
        templateHeaders={[
          'item', 'quantity', 'cost_price', 'sell_price', 'store_id', 'barcode', 'stock_alert', 'is_active', 'category', 'unit', 'supplier',
          ...activeAttributeKeys,
        ]}
        hint={
          activeAttributeKeys.length
            ? `store_id, category, unit, and supplier are all optional. If left blank, the system assigns Main Store / the default category / the default unit / no default supplier. The remaining columns (${activeAttributeKeys
                .map((k) => PRODUCT_ATTRIBUTE_CATALOG[k]?.label || k)
                .join(', ')}) are also optional - based on your categories' current Attributes settings - only fill in the ones relevant to each row.`
            : "store_id, category, unit, and supplier are all optional. If left blank, the system assigns Main Store / the default category / the default unit / no default supplier - and creates a new category, unit, or supplier automatically if you type a name that doesn't exist yet."
        }
        onImported={async () => {
          if (itemsDisplayed) await loadProducts();
        }}
      />
    </div>
  );
};

export default Products;
