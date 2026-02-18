import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import {
  BadgeAlert,
  BadgePercent,
  Boxes,
  Ruler,
  SlidersHorizontal,
  Store,
  Tags,
} from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { DataTable } from '../../components/ui/table/DataTable';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { Modal } from '../../components/ui/modal/Modal';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import {
  Category,
  Product,
  Tax,
  Unit,
  productService,
} from '../../services/product.service';
import StoresPage from '../Stock/StoresPage';
import StockAdjustmentsPage from '../Stock/StockAdjustmentsPage';

type ProductForm = Partial<Product>;
type CategoryForm = Partial<Category>;
type UnitForm = Partial<Unit>;
type TaxForm = Partial<Tax>;

const defaultProductForm: ProductForm = {
  name: '',
  sku: '',
  category_id: null,
  unit_id: null,
  tax_id: null,
  price: 0,
  cost: 0,
  stock: 0,
  opening_balance: 0,
  reorder_level: 0,
  reorder_qty: 0,
  status: 'active',
  is_active: true,
};

const defaultCategoryForm: CategoryForm = {
  name: '',
  description: '',
  is_active: true,
};

const defaultUnitForm: UnitForm = {
  unit_name: '',
  symbol: '',
  is_active: true,
};

const defaultTaxForm: TaxForm = {
  tax_name: '',
  rate_percent: 0,
  is_inclusive: false,
  is_active: true,
};

const fieldCls =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

const Products = () => {
  const location = useLocation();
  const { showToast } = useToast();
  const isAdjustmentOnly = location.pathname.endsWith('/adjustment-items');

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [taxModalOpen, setTaxModalOpen] = useState(false);
  const [stateModalOpen, setStateModalOpen] = useState(false);

  const [itemForm, setItemForm] = useState<ProductForm>(defaultProductForm);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(defaultCategoryForm);
  const [unitForm, setUnitForm] = useState<UnitForm>(defaultUnitForm);
  const [taxForm, setTaxForm] = useState<TaxForm>(defaultTaxForm);
  const [stateForm, setStateForm] = useState<{ product_id?: number; status: 'active' | 'inactive' }>({
    product_id: undefined,
    status: 'active',
  });

  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null);
  const [taxToDelete, setTaxToDelete] = useState<Tax | null>(null);

  const loadProducts = async (term?: string, categoryId?: number) => {
    setLoading(true);
    const res = await productService.list({ search: term, categoryId, limit: 200 });
    if (res.success && res.data?.products) setProducts(res.data.products);
    else showToast('error', 'Items', res.error || 'Failed to load items');
    setLoading(false);
  };

  const loadCategories = async () => {
    const res = await productService.listCategories({ limit: 200 });
    if (res.success && res.data?.categories) setCategories(res.data.categories);
    else showToast('error', 'Categories', res.error || 'Failed to load categories');
  };

  const loadUnits = async () => {
    const res = await productService.listUnits({ limit: 200 });
    if (res.success && res.data?.units) setUnits(res.data.units);
    else showToast('error', 'Units', res.error || 'Failed to load units');
  };

  const loadTaxes = async () => {
    const res = await productService.listTaxes({ limit: 200 });
    if (res.success && res.data?.taxes) setTaxes(res.data.taxes);
    else showToast('error', 'Taxes', res.error || 'Failed to load taxes');
  };

  const loadMasters = async () => {
    await Promise.all([loadCategories(), loadUnits(), loadTaxes()]);
  };

  const showItems = async () => {
    await loadMasters();
    await loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId);
  };

  useEffect(() => {
    if (!isAdjustmentOnly) {
      showItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdjustmentOnly]);

  const itemColumns: ColumnDef<Product>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Item' },
      { accessorKey: 'sku', header: 'SKU', cell: ({ row }) => row.original.sku || '-' },
      { accessorKey: 'category_name', header: 'Category', cell: ({ row }) => row.original.category_name || '-' },
      { accessorKey: 'unit_name', header: 'Unit', cell: ({ row }) => row.original.unit_name || '-' },
      { accessorKey: 'tax_name', header: 'Tax', cell: ({ row }) => row.original.tax_name || '-' },
      { accessorKey: 'cost', header: 'Cost', cell: ({ row }) => `$${Number(row.original.cost || 0).toFixed(2)}` },
      { accessorKey: 'price', header: 'Price', cell: ({ row }) => `$${Number(row.original.price || 0).toFixed(2)}` },
      { accessorKey: 'stock', header: 'Stock' },
      { accessorKey: 'reorder_level', header: 'Reorder' },
      {
        accessorKey: 'is_active',
        header: 'Active',
        cell: ({ row }) => (
          <Badge color={row.original.is_active ? 'success' : 'warning'} variant="light">
            {row.original.is_active ? 'Yes' : 'No'}
          </Badge>
        ),
      },
    ],
    []
  );

  const categoryColumns: ColumnDef<Category>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Category' },
      { accessorKey: 'description', header: 'Description', cell: ({ row }) => row.original.description || '-' },
      {
        accessorKey: 'is_active',
        header: 'Active',
        cell: ({ row }) => (
          <Badge color={row.original.is_active ? 'success' : 'warning'} variant="light">
            {row.original.is_active ? 'Yes' : 'No'}
          </Badge>
        ),
      },
    ],
    []
  );

  const unitColumns: ColumnDef<Unit>[] = useMemo(
    () => [
      { accessorKey: 'unit_name', header: 'Unit Name' },
      { accessorKey: 'symbol', header: 'Symbol', cell: ({ row }) => row.original.symbol || '-' },
      {
        accessorKey: 'is_active',
        header: 'Active',
        cell: ({ row }) => (
          <Badge color={row.original.is_active ? 'success' : 'warning'} variant="light">
            {row.original.is_active ? 'Yes' : 'No'}
          </Badge>
        ),
      },
    ],
    []
  );

  const taxColumns: ColumnDef<Tax>[] = useMemo(
    () => [
      { accessorKey: 'tax_name', header: 'Tax Name' },
      { accessorKey: 'rate_percent', header: 'Rate %' },
      { accessorKey: 'is_inclusive', header: 'Inclusive', cell: ({ row }) => (row.original.is_inclusive ? 'Yes' : 'No') },
      {
        accessorKey: 'is_active',
        header: 'Active',
        cell: ({ row }) => (
          <Badge color={row.original.is_active ? 'success' : 'warning'} variant="light">
            {row.original.is_active ? 'Yes' : 'No'}
          </Badge>
        ),
      },
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

  const saveItem = async () => {
    if (!itemForm.name?.trim() || !itemForm.category_id) {
      showToast('error', 'Items', 'Name and category are required');
      return;
    }
    setLoading(true);
    const res = itemForm.product_id
      ? await productService.update(itemForm.product_id, itemForm)
      : await productService.create(itemForm);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Items', itemForm.product_id ? 'Item updated' : 'Item created');
      setItemModalOpen(false);
      setItemForm(defaultProductForm);
      await loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId);
    } else showToast('error', 'Items', res.error || 'Failed to save item');
  };

  const saveCategory = async () => {
    if (!categoryForm.name?.trim()) return showToast('error', 'Categories', 'Category name is required');
    setLoading(true);
    const res = categoryForm.category_id
      ? await productService.updateCategory(categoryForm.category_id, categoryForm)
      : await productService.createCategory(categoryForm);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Categories', categoryForm.category_id ? 'Category updated' : 'Category created');
      setCategoryModalOpen(false);
      setCategoryForm(defaultCategoryForm);
      await loadCategories();
    } else showToast('error', 'Categories', res.error || 'Failed to save category');
  };

  const saveUnit = async () => {
    if (!unitForm.unit_name?.trim()) return showToast('error', 'Units', 'Unit name is required');
    setLoading(true);
    const res = unitForm.unit_id
      ? await productService.updateUnit(unitForm.unit_id, unitForm)
      : await productService.createUnit(unitForm);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Units', unitForm.unit_id ? 'Unit updated' : 'Unit created');
      setUnitModalOpen(false);
      setUnitForm(defaultUnitForm);
      await loadUnits();
    } else showToast('error', 'Units', res.error || 'Failed to save unit');
  };

  const saveTax = async () => {
    if (!taxForm.tax_name?.trim()) return showToast('error', 'Taxes', 'Tax name is required');
    setLoading(true);
    const res = taxForm.tax_id
      ? await productService.updateTax(taxForm.tax_id, taxForm)
      : await productService.createTax(taxForm);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Taxes', taxForm.tax_id ? 'Tax updated' : 'Tax created');
      setTaxModalOpen(false);
      setTaxForm(defaultTaxForm);
      await loadTaxes();
    } else showToast('error', 'Taxes', res.error || 'Failed to save tax');
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
      await loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId);
    } else showToast('error', 'Item State', res.error || 'Failed to update item state');
  };

  const removeItem = async () => {
    if (!itemToDelete) return;
    const res = await productService.remove(itemToDelete.product_id);
    if (res.success) {
      showToast('success', 'Items', 'Item deleted');
      setItemToDelete(null);
      await loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId);
    } else showToast('error', 'Items', res.error || 'Failed to delete item');
  };

  const removeCategory = async () => {
    if (!categoryToDelete) return;
    const res = await productService.removeCategory(categoryToDelete.category_id);
    if (res.success) {
      showToast('success', 'Categories', 'Category deleted');
      setCategoryToDelete(null);
      await loadCategories();
    } else showToast('error', 'Categories', res.error || 'Failed to delete category');
  };

  const removeUnit = async () => {
    if (!unitToDelete) return;
    const res = await productService.removeUnit(unitToDelete.unit_id);
    if (res.success) {
      showToast('success', 'Units', 'Unit deleted');
      setUnitToDelete(null);
      await loadUnits();
    } else showToast('error', 'Units', res.error || 'Failed to delete unit');
  };

  const removeTax = async () => {
    if (!taxToDelete) return;
    const res = await productService.removeTax(taxToDelete.tax_id);
    if (res.success) {
      showToast('success', 'Taxes', 'Tax deleted');
      setTaxToDelete(null);
      await loadTaxes();
    } else showToast('error', 'Taxes', res.error || 'Failed to delete tax');
  };

  const storeTabs = [
    {
      id: 'items',
      label: 'Store Items',
      icon: Boxes,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Category</label>
              <select className="rounded-lg border px-3 py-2 text-sm" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">All Categories</option>
                {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={showItems} className="rounded-lg border px-3 py-2 text-sm">Show Items</button>
              <button type="button" onClick={async () => { await loadMasters(); setItemForm(defaultProductForm); setItemModalOpen(true); }} className="rounded-lg bg-primary-600 px-3 py-2 text-sm text-white">New Item</button>
            </div>
          </div>
          <DataTable data={products} columns={itemColumns} isLoading={loading} onEdit={(row) => { setItemForm(row); setItemModalOpen(true); }} onDelete={(row) => setItemToDelete(row)} searchPlaceholder="Search items..." />
        </div>
      ),
    },
    { id: 'store', label: 'Store', icon: Store, content: <StoresPage embedded /> },
    {
      id: 'categories',
      label: 'Categories',
      icon: Tags,
      content: <div className="space-y-2"><TabActionToolbar title="Categories" primaryAction={{ label: 'New Category', onClick: () => { setCategoryForm(defaultCategoryForm); setCategoryModalOpen(true); } }} onDisplay={() => loadCategories()} /><DataTable data={categories} columns={categoryColumns} isLoading={loading} onEdit={(row) => { setCategoryForm(row); setCategoryModalOpen(true); }} onDelete={(row) => setCategoryToDelete(row)} searchPlaceholder="Search categories..." /></div>,
    },
    {
      id: 'units',
      label: 'Units',
      icon: Ruler,
      content: <div className="space-y-2"><TabActionToolbar title="Units" primaryAction={{ label: 'New Unit', onClick: () => { setUnitForm(defaultUnitForm); setUnitModalOpen(true); } }} onDisplay={() => loadUnits()} /><DataTable data={units} columns={unitColumns} isLoading={loading} onEdit={(row) => { setUnitForm(row); setUnitModalOpen(true); }} onDelete={(row) => setUnitToDelete(row)} searchPlaceholder="Search units..." /></div>,
    },
    {
      id: 'taxes',
      label: 'Taxes',
      icon: BadgePercent,
      content: <div className="space-y-2"><TabActionToolbar title="Taxes" primaryAction={{ label: 'New Tax', onClick: () => { setTaxForm(defaultTaxForm); setTaxModalOpen(true); } }} onDisplay={() => loadTaxes()} /><DataTable data={taxes} columns={taxColumns} isLoading={loading} onEdit={(row) => { setTaxForm(row); setTaxModalOpen(true); }} onDelete={(row) => setTaxToDelete(row)} searchPlaceholder="Search taxes..." /></div>,
    },
    {
      id: 'state',
      label: 'Item State',
      icon: BadgeAlert,
      content: <div className="space-y-2"><TabActionToolbar title="Item State" primaryAction={{ label: 'Set State', onClick: () => { setStateForm({ product_id: undefined, status: 'active' }); setStateModalOpen(true); } }} onDisplay={() => loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId)} onSearch={(value: string) => setSearch(value)} /><DataTable data={products} columns={stateColumns} isLoading={loading} onEdit={(row) => { setStateForm({ product_id: row.product_id, status: row.status === 'inactive' ? 'inactive' : 'active' }); setStateModalOpen(true); }} searchPlaceholder="Search item state..." /></div>,
    },
  ];

  const adjustmentTabs = [{ id: 'adjustment-items', label: 'Adjustment Items', icon: SlidersHorizontal, content: <StockAdjustmentsPage embedded /> }];

  const defaultTab = location.pathname.endsWith('/store') || location.pathname.endsWith('/stores')
    ? 'store'
    : location.pathname.endsWith('/categories')
    ? 'categories'
    : location.pathname.endsWith('/units')
    ? 'units'
    : location.pathname.endsWith('/taxes')
    ? 'taxes'
    : location.pathname.endsWith('/item-state')
    ? 'state'
    : 'items';

  return (
    <div>
      <PageHeader title="Store Management" description="Manage items, stores, categories, units, taxes, item state, and adjustments." />
      {!isAdjustmentOnly ? <Tabs tabs={storeTabs} defaultTab={defaultTab} /> : <Tabs tabs={adjustmentTabs} defaultTab="adjustment-items" />}

      <Modal isOpen={itemModalOpen} onClose={() => setItemModalOpen(false)} title={itemForm.product_id ? 'Edit Item' : 'New Item'} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); saveItem(); }} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-sm font-medium">Name<input className={fieldCls} value={itemForm.name || ''} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required /></label>
          <label className="text-sm font-medium">SKU<input className={fieldCls} value={itemForm.sku || ''} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} /></label>
          <label className="text-sm font-medium">Category<select className={fieldCls} value={itemForm.category_id ?? ''} onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value ? Number(e.target.value) : null })}><option value="">Select category</option>{categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></label>
          <label className="text-sm font-medium">Unit<select className={fieldCls} value={itemForm.unit_id ?? ''} onChange={(e) => setItemForm({ ...itemForm, unit_id: e.target.value ? Number(e.target.value) : null })}><option value="">Select unit</option>{units.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}</select></label>
          <label className="text-sm font-medium">Tax<select className={fieldCls} value={itemForm.tax_id ?? ''} onChange={(e) => setItemForm({ ...itemForm, tax_id: e.target.value ? Number(e.target.value) : null })}><option value="">Select tax</option>{taxes.map((t) => <option key={t.tax_id} value={t.tax_id}>{`${t.tax_name} (${t.rate_percent}%)`}</option>)}</select></label>
          <label className="text-sm font-medium">Cost<input type="number" step="0.01" className={fieldCls} value={itemForm.cost ?? 0} onChange={(e) => setItemForm({ ...itemForm, cost: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">Price<input type="number" step="0.01" className={fieldCls} value={itemForm.price ?? 0} onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">Opening Balance<input type="number" step="0.001" className={fieldCls} value={itemForm.opening_balance ?? 0} onChange={(e) => setItemForm({ ...itemForm, opening_balance: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">Reorder Level<input type="number" step="0.001" className={fieldCls} value={itemForm.reorder_level ?? 0} onChange={(e) => setItemForm({ ...itemForm, reorder_level: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">Reorder Qty<input type="number" step="0.001" className={fieldCls} value={itemForm.reorder_qty ?? 0} onChange={(e) => setItemForm({ ...itemForm, reorder_qty: Number(e.target.value || 0) })} /></label>
          <label className="text-sm font-medium">State<select className={fieldCls} value={itemForm.status || 'active'} onChange={(e) => setItemForm({ ...itemForm, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2"><button type="button" onClick={() => setItemModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-white">Save</button></div>
        </form>
      </Modal>

      <Modal isOpen={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title={categoryForm.category_id ? 'Edit Category' : 'New Category'} size="md">
        <form onSubmit={(e) => { e.preventDefault(); saveCategory(); }} className="space-y-3">
          <label className="text-sm font-medium">Name<input className={fieldCls} value={categoryForm.name || ''} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} required /></label>
          <label className="text-sm font-medium">Description<textarea className={fieldCls} value={categoryForm.description || ''} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></label>
          <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={categoryForm.is_active ?? true} onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })} />Active</label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setCategoryModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-white">Save</button></div>
        </form>
      </Modal>

      <Modal isOpen={unitModalOpen} onClose={() => setUnitModalOpen(false)} title={unitForm.unit_id ? 'Edit Unit' : 'New Unit'} size="sm">
        <form onSubmit={(e) => { e.preventDefault(); saveUnit(); }} className="space-y-3">
          <label className="text-sm font-medium">Unit Name<input className={fieldCls} value={unitForm.unit_name || ''} onChange={(e) => setUnitForm({ ...unitForm, unit_name: e.target.value })} required /></label>
          <label className="text-sm font-medium">Symbol<input className={fieldCls} value={unitForm.symbol || ''} onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })} /></label>
          <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={unitForm.is_active ?? true} onChange={(e) => setUnitForm({ ...unitForm, is_active: e.target.checked })} />Active</label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setUnitModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-white">Save</button></div>
        </form>
      </Modal>

      <Modal isOpen={taxModalOpen} onClose={() => setTaxModalOpen(false)} title={taxForm.tax_id ? 'Edit Tax' : 'New Tax'} size="sm">
        <form onSubmit={(e) => { e.preventDefault(); saveTax(); }} className="space-y-3">
          <label className="text-sm font-medium">Tax Name<input className={fieldCls} value={taxForm.tax_name || ''} onChange={(e) => setTaxForm({ ...taxForm, tax_name: e.target.value })} required /></label>
          <label className="text-sm font-medium">Rate %<input type="number" min={0} step="0.001" className={fieldCls} value={taxForm.rate_percent ?? 0} onChange={(e) => setTaxForm({ ...taxForm, rate_percent: Number(e.target.value || 0) })} /></label>
          <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={taxForm.is_inclusive ?? false} onChange={(e) => setTaxForm({ ...taxForm, is_inclusive: e.target.checked })} />Inclusive</label>
          <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={taxForm.is_active ?? true} onChange={(e) => setTaxForm({ ...taxForm, is_active: e.target.checked })} />Active</label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setTaxModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-white">Save</button></div>
        </form>
      </Modal>

      <Modal isOpen={stateModalOpen} onClose={() => setStateModalOpen(false)} title="Update Item State" size="sm">
        <div className="space-y-3">
          <label className="text-sm font-medium">Item<select className={fieldCls} value={stateForm.product_id ?? ''} onChange={(e) => setStateForm({ ...stateForm, product_id: e.target.value ? Number(e.target.value) : undefined })}><option value="">Select item</option>{products.map((item) => <option key={item.product_id} value={item.product_id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">Status<select className={fieldCls} value={stateForm.status} onChange={(e) => setStateForm({ ...stateForm, status: e.target.value as 'active' | 'inactive' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setStateModalOpen(false)} className="rounded-lg border px-4 py-2">Cancel</button><button type="button" onClick={saveState} className="rounded-lg bg-primary-600 px-4 py-2 text-white">Save</button></div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={removeItem} title="Delete Item" message={`Delete "${itemToDelete?.name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />
      <ConfirmDialog isOpen={!!categoryToDelete} onClose={() => setCategoryToDelete(null)} onConfirm={removeCategory} title="Delete Category" message={`Delete "${categoryToDelete?.name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />
      <ConfirmDialog isOpen={!!unitToDelete} onClose={() => setUnitToDelete(null)} onConfirm={removeUnit} title="Delete Unit" message={`Delete "${unitToDelete?.unit_name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />
      <ConfirmDialog isOpen={!!taxToDelete} onClose={() => setTaxToDelete(null)} onConfirm={removeTax} title="Delete Tax" message={`Delete "${taxToDelete?.tax_name || ''}"?`} confirmText="Delete" variant="danger" isLoading={loading} />
    </div>
  );
};

export default Products;
