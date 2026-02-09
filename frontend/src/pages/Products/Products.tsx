import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Package, Grid, Tag, Archive } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';
import { productService, Product, Category } from '../../services/product.service';
// Lightweight debounce with cancel
const debounce = (fn: (...args: any[]) => void, wait = 300) => {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return wrapped as typeof fn & { cancel: () => void };
};

type ProductForm = {
  product_id?: number;
  name: string;
  sku: string;
  category_id: number | null;
  price: number;
  cost: number;
  stock: number;
  status: 'active' | 'inactive';
  reorder_level: number;
  is_active?: boolean;
};

type CategoryForm = {
  category_id?: number;
  name: string;
  description: string;
  parent_id: number | null;
};

const emptyProduct: ProductForm = {
  name: '',
  sku: '',
  category_id: null,
  price: 0,
  cost: 0,
  stock: 0,
  status: 'active',
  reorder_level: 0,
  is_active: true,
};

const emptyCategory: CategoryForm = {
  name: '',
  description: '',
  parent_id: null,
};

const Products = () => {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);

  const fetchData = async (term?: string) => {
    setLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        productService.list(term),
        productService.listCategories(),
      ]);
      if (prodRes.success && prodRes.data?.products) {
        setProducts(prodRes.data.products);
      } else {
        showToast('error', 'Load failed', prodRes.error || 'Could not load products');
      }
      if (catRes.success && catRes.data?.categories) {
        setCategories(catRes.data.categories);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // initial load

  // debounce search to reduce requests
  const debouncedSearch = useMemo(
    () =>
      debounce((term: string) => {
        fetchData(term);
      }, 300),
    []
  );

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  const columns: ColumnDef<Product>[] = useMemo(() => [
    { accessorKey: 'name', header: 'Product Name' },
    { accessorKey: 'sku', header: 'SKU' },
    {
      accessorKey: 'category_name',
      header: 'Category',
      cell: ({ row }) => row.original.category_name || '—',
    },
    {
      accessorKey: 'price',
      header: 'Price',
      cell: ({ row }) => `$${Number(row.original.price || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      cell: ({ row }) => (
        <span className={Number(row.original.stock || 0) < 10 ? 'text-red-600 font-semibold' : ''}>
          {Number(row.original.stock || 0)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          color={row.original.status === 'active' ? 'success' : 'error'}
          variant="light"
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Active',
      cell: ({ row }) => (row.original.is_active ? 'Yes' : 'No'),
    },
  ], []);

  const categoryColumns: ColumnDef<Category>[] = [
    { accessorKey: 'name', header: 'Category' },
    { accessorKey: 'description', header: 'Description' },
    {
      accessorKey: 'is_active',
      header: 'Active',
      cell: ({ row }) => row.original.is_active ? 'Yes' : 'No',
    },
  ];

  const handleSaveProduct = async () => {
    const payload = {
      name: productForm.name,
      sku: productForm.sku,
      categoryId: productForm.category_id ?? undefined,
      price: Number(productForm.price || 0),
      cost: Number(productForm.cost || 0),
      stock: Number(productForm.stock || 0),
      status: productForm.status,
      reorderLevel: Number(productForm.reorder_level || 0),
      isActive: productForm.status === 'active',
    };
    setLoading(true);
    const res = productForm.product_id
      ? await productService.update(productForm.product_id, payload)
      : await productService.create(payload);

    if (res.success) {
      showToast('success', 'Saved', productForm.product_id ? 'Product updated' : 'Product created');
      setProductModalOpen(false);
      setProductForm(emptyProduct);
      fetchData(search);
    } else {
      showToast('error', 'Save failed', res.error || 'Validation error');
    }
    setLoading(false);
  };

  const handleSaveCategory = async () => {
    const payload = {
      name: categoryForm.name,
      description: categoryForm.description,
      parentId: categoryForm.parent_id ?? undefined,
      isActive: true,
    };
    setLoading(true);
    const res = categoryForm.category_id
      ? await productService.updateCategory(categoryForm.category_id, payload)
      : await productService.createCategory(payload);

    if (res.success) {
      showToast('success', 'Saved', categoryForm.category_id ? 'Category updated' : 'Category created');
      setCategoryModalOpen(false);
      setCategoryForm(emptyCategory);
      fetchData(search);
    } else {
      showToast('error', 'Save failed', res.error || 'Validation error');
    }
    setLoading(false);
  };

  const onEditProduct = (row: Product) => {
    setProductForm({
      product_id: row.product_id,
      name: row.name,
      sku: row.sku || '',
      category_id: row.category_id ?? null,
      price: Number(row.price || 0),
      cost: Number(row.cost || 0),
      stock: Number(row.stock || 0),
      status: (row.status as 'active' | 'inactive') || 'active',
      reorder_level: Number(row.reorder_level || 0),
      is_active: row.is_active,
    });
    setProductModalOpen(true);
  };

  const onEditCategory = (row: Category) => {
    setCategoryForm({
      category_id: row.category_id,
      name: row.name,
      description: row.description || '',
      parent_id: row.parent_id ?? null,
    });
    setCategoryModalOpen(true);
  };

  const handleDeleteProduct = async (row: Product) => {
    if (!row.product_id) return;
    if (!confirm('Delete this product?')) return;
    setLoading(true);
    const res = await productService.remove(row.product_id);
    if (res.success) {
      showToast('success', 'Deleted', 'Product removed');
      fetchData(search);
    } else {
      showToast('error', 'Delete failed', res.error || 'Could not delete');
    }
    setLoading(false);
  };

  const handleDeleteCategory = async (row: Category) => {
    if (!row.category_id) return;
    if (!confirm('Delete this category?')) return;
    setLoading(true);
    const res = await productService.removeCategory(row.category_id);
    if (res.success) {
      showToast('success', 'Deleted', 'Category removed');
      fetchData(search);
    } else {
      showToast('error', 'Delete failed', res.error || 'Could not delete');
    }
    setLoading(false);
  };

  const tabs = [
    {
      id: 'catalog',
      label: 'Products Catalog',
      icon: Package,
      badge: products.length,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Your Inventory Items"
            primaryAction={{ label: 'Add Product', onClick: () => { setProductForm(emptyProduct); setProductModalOpen(true); } }}
            quickAddItems={[
              { label: 'Import via Excel', icon: <Archive className="w-4 h-4" />, onClick: () => showToast('info', 'Import', 'Excel import coming soon.') },
              { label: 'Print Barcodes', icon: <Tag className="w-4 h-4" />, onClick: () => window.print() },
            ]}
            onExport={() => showToast('success', 'Export', 'Products exported')}
            onSearch={(value) => {
              setSearch(value);
              debouncedSearch(value);
            }}
          />
          <DataTable
            data={products}
            columns={columns}
            isLoading={loading}
            searchPlaceholder="Find a product..."
            onEdit={onEditProduct}
            onDelete={handleDeleteProduct}
          />
        </div>
      )
    },
    {
      id: 'categories',
      label: 'Categories',
      icon: Grid,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Product Groups"
            primaryAction={{ label: 'New Category', onClick: () => { setCategoryForm(emptyCategory); setCategoryModalOpen(true); } }}
            onSearch={(value) => {
              setSearch(value);
              debouncedSearch(value);
            }}
          />
          <DataTable
            data={categories}
            columns={categoryColumns}
            isLoading={loading}
            searchPlaceholder="Search categories..."
            onEdit={onEditCategory}
            onDelete={handleDeleteCategory}
          />
        </div>
      )
    },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage catalog and categories."
      />
      <Tabs tabs={tabs} defaultTab="catalog" />

      {/* Product modal */}
      <Modal
        isOpen={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={productForm.product_id ? 'Edit Product' : 'Add Product'}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4 p-2">
          <label className="flex flex-col text-sm font-medium gap-1">
            Name
            <input
              placeholder="e.g. Wireless Mouse"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            SKU
            <input
              placeholder="Optional SKU"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={productForm.sku}
              onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            Category
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={productForm.category_id ?? ''}
              onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            Status
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={productForm.status}
              onChange={(e) => setProductForm({ ...productForm, status: e.target.value as 'active' | 'inactive' })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            Price
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="0.00"
              value={productForm.price}
              onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            Cost
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="0.00"
              value={productForm.cost}
              onChange={(e) => setProductForm({ ...productForm, cost: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            Stock
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="0"
              value={productForm.stock}
              onChange={(e) => setProductForm({ ...productForm, stock: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            Reorder Level
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="0"
              value={productForm.reorder_level}
              onChange={(e) => setProductForm({ ...productForm, reorder_level: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700" onClick={() => setProductModalOpen(false)}>Cancel</button>
          <button className="px-4 py-2 rounded-lg bg-primary-600 text-white" onClick={handleSaveProduct}>Save</button>
        </div>
      </Modal>

      {/* Category modal */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={categoryForm.category_id ? 'Edit Category' : 'New Category'}
      >
        <div className="space-y-3 p-2">
          <label className="flex flex-col text-sm font-medium gap-1">
            Name
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            Description
            <textarea
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1">
            Parent
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={categoryForm.parent_id ?? ''}
              onChange={(e) => setCategoryForm({ ...categoryForm, parent_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700" onClick={() => setCategoryModalOpen(false)}>Cancel</button>
          <button className="px-4 py-2 rounded-lg bg-primary-600 text-white" onClick={handleSaveCategory}>Save</button>
        </div>
      </Modal>
    </div>
  );
};

export default Products;
