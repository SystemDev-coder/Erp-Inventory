import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { Boxes, Tags, BadgeAlert, Store, SlidersHorizontal } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import { productService, Product, Category } from '../../services/product.service';
import StoresPage from '../Stock/StoresPage';
import StockAdjustmentsPage from '../Stock/StockAdjustmentsPage';

type ProductForm = Partial<Product>;
type CategoryForm = Partial<Category>;

const defaultProductForm: ProductForm = {
  name: '',
  sku: '',
  category_id: null,
  price: 0,
  cost: 0,
  stock: 0,
  opening_balance: 0,
  reorder_level: 0,
  status: 'active',
  is_active: true,
  description: '',
};

const defaultCategoryForm: CategoryForm = {
  name: '',
  description: '',
  parent_id: null,
  is_active: true,
};

const Products = () => {
  const location = useLocation();
  const { showToast } = useToast();
  const isAdjustmentOnly = location.pathname.endsWith('/adjustment-items');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [stateModalOpen, setStateModalOpen] = useState(false);

  const [itemForm, setItemForm] = useState<ProductForm>(defaultProductForm);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(defaultCategoryForm);
  const [stateForm, setStateForm] = useState<{ product_id?: number; status: 'active' | 'inactive' }>({
    product_id: undefined,
    status: 'active',
  });

  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const loadProducts = async (term?: string, categoryId?: number) => {
    setLoading(true);
    const res = await productService.list(term, categoryId);
    if (res.success && res.data?.products) {
      setProducts(res.data.products);
    } else {
      showToast('error', 'Items', res.error || 'Failed to load items');
    }
    setLoading(false);
  };

  const loadCategories = async () => {
    setLoading(true);
    const res = await productService.listCategories();
    if (res.success && res.data?.categories) {
      setCategories(res.data.categories);
    } else {
      showToast('error', 'Categories', res.error || 'Failed to load categories');
    }
    setLoading(false);
  };

  const showItems = async () => {
    await loadCategories();
    await loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId);
  };

  const itemColumns: ColumnDef<Product>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Item' },
      { accessorKey: 'sku', header: 'SKU', cell: ({ row }) => row.original.sku || '-' },
      { accessorKey: 'category_name', header: 'Category', cell: ({ row }) => row.original.category_name || '-' },
      { accessorKey: 'cost', header: 'Cost', cell: ({ row }) => `$${Number(row.original.cost || 0).toFixed(2)}` },
      { accessorKey: 'price', header: 'Price', cell: ({ row }) => `$${Number(row.original.price || 0).toFixed(2)}` },
      { accessorKey: 'stock', header: 'Stock' },
      { accessorKey: 'opening_balance', header: 'Opening Balance', cell: ({ row }) => Number(row.original.opening_balance || 0).toFixed(3) },
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

  const stateColumns: ColumnDef<Product>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Item' },
      {
        accessorKey: 'status',
        header: 'State',
        cell: ({ row }) => (
          <Badge
            color={
              row.original.status === 'active'
                ? 'success'
                : row.original.status === 'inactive'
                ? 'warning'
                : 'error'
            }
            variant="light"
          >
            {row.original.status || 'active'}
          </Badge>
        ),
      },
      {
        accessorKey: 'is_active',
        header: 'Active',
        cell: ({ row }) => (
          <Badge color={row.original.is_active ? 'success' : 'warning'} variant="light">
            {row.original.is_active ? 'Yes' : 'No'}
          </Badge>
        ),
      },
      { accessorKey: 'stock', header: 'Stock' },
    ],
    []
  );

  const saveItem = async () => {
    if (!itemForm.name?.trim()) {
      showToast('error', 'Items', 'Item name is required');
      return;
    }
    if (!itemForm.category_id) {
      showToast('error', 'Items', 'Category is required');
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
      loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId);
    } else {
      showToast('error', 'Items', res.error || 'Failed to save item');
    }
  };

  const saveCategory = async () => {
    if (!categoryForm.name?.trim()) {
      showToast('error', 'Categories', 'Category name is required');
      return;
    }
    setLoading(true);
    const res = categoryForm.category_id
      ? await productService.updateCategory(categoryForm.category_id, categoryForm)
      : await productService.createCategory(categoryForm);
    setLoading(false);

    if (res.success) {
      showToast('success', 'Categories', categoryForm.category_id ? 'Category updated' : 'Category created');
      setCategoryModalOpen(false);
      setCategoryForm(defaultCategoryForm);
      loadCategories();
    } else {
      showToast('error', 'Categories', res.error || 'Failed to save category');
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
      loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId);
    } else {
      showToast('error', 'Item State', res.error || 'Failed to update item state');
    }
  };

  const deleteItem = async () => {
    if (!itemToDelete) return;
    setLoading(true);
    const res = await productService.remove(itemToDelete.product_id);
    setLoading(false);

    if (res.success) {
      showToast('success', 'Items', 'Item deleted');
      setItemToDelete(null);
      loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId);
    } else {
      showToast('error', 'Items', res.error || 'Failed to delete item');
    }
  };

  const deleteCategory = async () => {
    if (!categoryToDelete) return;
    setLoading(true);
    const res = await productService.removeCategory(categoryToDelete.category_id);
    setLoading(false);

    if (res.success) {
      showToast('success', 'Categories', 'Category deleted');
      setCategoryToDelete(null);
      loadCategories();
    } else {
      showToast('error', 'Categories', res.error || 'Failed to delete category');
    }
  };

  const storeSectionTabs = [
    {
      id: 'items',
      label: 'Store Items',
      icon: Boxes,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
              <select
                className="min-w-52 rounded-lg border px-3 py-2 text-sm"
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={showItems}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
              >
                Show Items
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (categories.length === 0) {
                    await loadCategories();
                  }
                  setItemForm(defaultProductForm);
                  setItemModalOpen(true);
                }}
                className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
              >
                New Items
              </button>
            </div>
          </div>
          <DataTable
            data={products}
            columns={itemColumns}
            isLoading={loading}
            onEdit={(row) => {
              setItemForm(row);
              setItemModalOpen(true);
            }}
            onDelete={(row) => setItemToDelete(row)}
            searchPlaceholder="Search items..."
          />
        </div>
      ),
    },
    {
      id: 'store',
      label: 'Store',
      icon: Store,
      content: <StoresPage embedded />,
    },
    {
      id: 'categories',
      label: 'Categories',
      icon: Tags,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Categories"
            primaryAction={{
              label: 'New Category',
              onClick: () => {
                setCategoryForm(defaultCategoryForm);
                setCategoryModalOpen(true);
              },
            }}
            onDisplay={() => loadCategories()}
          />
          <DataTable
            data={categories}
            columns={categoryColumns}
            isLoading={loading}
            onEdit={(row) => {
              setCategoryForm(row);
              setCategoryModalOpen(true);
            }}
            onDelete={(row) => setCategoryToDelete(row)}
            searchPlaceholder="Search categories..."
          />
        </div>
      ),
    },
    {
      id: 'state',
      label: 'Item State',
      icon: BadgeAlert,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Item State"
            primaryAction={{
              label: 'Set State',
              onClick: () => {
                setStateForm({ product_id: undefined, status: 'active' });
                setStateModalOpen(true);
              },
            }}
            onDisplay={() => loadProducts(search, selectedCategoryId === '' ? undefined : selectedCategoryId)}
            onSearch={(value: string) => setSearch(value)}
          />
          <DataTable
            data={products}
            columns={stateColumns}
            isLoading={loading}
            onEdit={(row) => {
              setStateForm({
                product_id: row.product_id,
                status: (row.status === 'inactive' ? 'inactive' : 'active'),
              });
              setStateModalOpen(true);
            }}
            onDelete={(row) => setItemToDelete(row)}
            searchPlaceholder="Search item state..."
          />
        </div>
      ),
    },
  ];

  const adjustmentSectionTabs = [
    {
      id: 'adjustment-items',
      label: 'Adjustment Items',
      icon: SlidersHorizontal,
      content: <StockAdjustmentsPage embedded />,
    },
  ];

  return (
    <div>
      <PageHeader title="Store Management" description="Manage store items, store setup, categories, item state, and adjustment items." />
      <div className="space-y-8">
        {!isAdjustmentOnly && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Store</h2>
            <Tabs
              tabs={storeSectionTabs}
              defaultTab={
                location.pathname.endsWith('/store') || location.pathname.endsWith('/stores')
                  ? 'store'
                  : location.pathname.endsWith('/categories')
                  ? 'categories'
                  : location.pathname.endsWith('/item-state')
                  ? 'state'
                  : 'items'
              }
            />
          </section>
        )}

        {isAdjustmentOnly && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Adjustment Items</h2>
            <Tabs tabs={adjustmentSectionTabs} defaultTab="adjustment-items" />
          </section>
        )}
      </div>

      <Modal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title={itemForm.product_id ? 'Edit Item' : 'New Item'}
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveItem();
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Name
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.name || ''} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">SKU
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.sku || ''} onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Category
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.category_id ?? ''} onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Select category</option>
              {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Cost
            <input type="number" step="0.01" className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.cost ?? 0} onChange={(e) => setItemForm({ ...itemForm, cost: Number(e.target.value || 0) })} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Price
            <input type="number" step="0.01" className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.price ?? 0} onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value || 0) })} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Stock
            <input type="number" step="1" className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.stock ?? 0} onChange={(e) => setItemForm({ ...itemForm, stock: Number(e.target.value || 0) })} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Opening Balance
            <input
              type="number"
              min={0}
              step="0.001"
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={itemForm.opening_balance ?? 0}
              onChange={(e) => setItemForm({ ...itemForm, opening_balance: Number(e.target.value || 0) })}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Reorder Level
            <input type="number" step="1" className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.reorder_level ?? 0} onChange={(e) => setItemForm({ ...itemForm, reorder_level: Number(e.target.value || 0) })} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">State
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.status || 'active'} onChange={(e) => setItemForm({ ...itemForm, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 md:col-span-2">Description
            <textarea className="mt-1 w-full rounded-lg border px-3 py-2" value={itemForm.description || ''} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
          </label>
          <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setItemModalOpen(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white">Save</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={categoryForm.category_id ? 'Edit Category' : 'New Category'}
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCategory();
          }}
          className="space-y-3"
        >
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Name
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={categoryForm.name || ''} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Description
            <textarea className="mt-1 w-full rounded-lg border px-3 py-2" value={categoryForm.description || ''} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} />
          </label>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={categoryForm.is_active ?? true} onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })} />
            Active
          </label>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCategoryModalOpen(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white">Save</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={stateModalOpen}
        onClose={() => setStateModalOpen(false)}
        title="Update Item State"
        size="sm"
      >
        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Select Item
            <select
              required
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={stateForm.product_id ?? ''}
              onChange={(e) => setStateForm({ ...stateForm, product_id: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="">Select item</option>
              {products.map((item) => (
                <option key={item.product_id} value={item.product_id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Status
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={stateForm.status} onChange={(e) => setStateForm({ ...stateForm, status: e.target.value as 'active' | 'inactive' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setStateModalOpen(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
            <button type="button" onClick={saveState} className="px-4 py-2 rounded-lg bg-primary-600 text-white">Save</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={deleteItem}
        title="Delete Item"
        message={`Delete item "${itemToDelete?.name || ''}"?`}
        confirmText="Delete"
        variant="danger"
        isLoading={loading}
      />

      <ConfirmDialog
        isOpen={!!categoryToDelete}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={deleteCategory}
        title="Delete Category"
        message={`Delete category "${categoryToDelete?.name || ''}"?`}
        confirmText="Delete"
        variant="danger"
        isLoading={loading}
      />
    </div>
  );
};

export default Products;
