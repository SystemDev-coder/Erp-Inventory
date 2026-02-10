import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Package, Grid, Tag, Archive, Image as ImageIcon } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { ImageUpload } from '../../components/common/ImageUpload';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';
import { productService, Product, Category } from '../../services/product.service';
import { imageService } from '../../services/image.service';
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
  description?: string;
  product_image_url?: string | null;
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
  description: '',
  product_image_url: null,
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
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'product' | 'category'; data: Product | Category } | null>(null);

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
    {
      accessorKey: 'product_image_url',
      header: 'Image',
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          {row.original.product_image_url ? (
            <img
              src={row.original.product_image_url}
              alt={row.original.name}
              className="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <ImageIcon className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            </div>
          )}
        </div>
      ),
    },
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
      description: productForm.description,
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

  // Ensure a product record exists before uploading/deleting an image.
  const ensureProductExists = async (): Promise<number> => {
    if (productForm.product_id) return productForm.product_id;

    const payload = {
      name: productForm.name || 'Untitled Product',
      sku: productForm.sku,
      categoryId: productForm.category_id ?? undefined,
      price: Number(productForm.price || 0),
      cost: Number(productForm.cost || 0),
      stock: Number(productForm.stock || 0),
      status: productForm.status,
      reorderLevel: Number(productForm.reorder_level || 0),
      isActive: productForm.status === 'active',
      description: productForm.description,
    };

    const res = await productService.create(payload);

    if (!res.success || !res.data?.product?.product_id) {
      throw new Error(res.error || 'Could not create product before uploading image.');
    }

    const newProduct = res.data.product;
    setProductForm((prev) => ({ ...prev, product_id: newProduct.product_id }));
    // refresh list so the new draft appears
    fetchData(search);
    return newProduct.product_id;
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
    console.log('onEditProduct called with:', row);
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
      description: row.description || '',
      product_image_url: row.product_image_url || null,
      is_active: row.is_active,
    });
    setProductModalOpen(true);
  };

  const onEditCategory = (row: Category) => {
    console.log('onEditCategory called with:', row);
    setCategoryForm({
      category_id: row.category_id,
      name: row.name,
      description: row.description || '',
      parent_id: row.parent_id ?? null,
    });
    setCategoryModalOpen(true);
  };

  const handleDeleteProduct = (row: Product) => {
    console.log('handleDeleteProduct called with:', row);
    if (!row.product_id) {
      console.error('No product_id found');
      showToast('error', 'Error', 'Product ID not found');
      return;
    }
    setItemToDelete({ type: 'product', data: row });
    setDeleteConfirmOpen(true);
  };

  const handleDeleteCategory = (row: Category) => {
    console.log('handleDeleteCategory called with:', row);
    if (!row.category_id) {
      console.error('No category_id found');
      showToast('error', 'Error', 'Category ID not found');
      return;
    }
    setItemToDelete({ type: 'category', data: row });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    setLoading(true);
    
    if (itemToDelete.type === 'product') {
      const product = itemToDelete.data as Product;
      const res = await productService.remove(product.product_id);
      if (res.success) {
        showToast('success', 'Deleted', 'Product removed successfully');
        fetchData(search);
      } else {
        showToast('error', 'Delete failed', res.error || 'Could not delete product');
      }
    } else {
      const category = itemToDelete.data as Category;
      const res = await productService.removeCategory(category.category_id);
      if (res.success) {
        showToast('success', 'Deleted', 'Category removed successfully');
        fetchData(search);
      } else {
        showToast('error', 'Delete failed', res.error || 'Could not delete category');
      }
    }
    
    setLoading(false);
    setItemToDelete(null);
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
            onSearch={(value: string) => {
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
            onSearch={(value: string) => {
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
        size="xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-2">
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Name
            <input
              placeholder="e.g. Wireless Mouse"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              value={productForm.name}
              onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            SKU
            <input
              placeholder="Optional SKU"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              value={productForm.sku}
              onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Category
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              value={productForm.category_id ?? ''}
              onChange={(e) => setProductForm({ ...productForm, category_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Status
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              value={productForm.status}
              onChange={(e) => setProductForm({ ...productForm, status: e.target.value as 'active' | 'inactive' })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Price
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              placeholder="0.00"
              value={productForm.price}
              onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Cost
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              placeholder="0.00"
              value={productForm.cost}
              onChange={(e) => setProductForm({ ...productForm, cost: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Stock
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              placeholder="0"
              value={productForm.stock}
              onChange={(e) => setProductForm({ ...productForm, stock: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Reorder Level
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              placeholder="0"
              value={productForm.reorder_level}
              onChange={(e) => setProductForm({ ...productForm, reorder_level: Number(e.target.value) })}
            />
          </label>
          
          <label className="md:col-span-2 flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Description
            <textarea
              placeholder="Optional product description"
              rows={3}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              value={productForm.description || ''}
              onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
            />
          </label>

          <div className="md:col-span-1 flex md:justify-center justify-center md:self-center md:mt-2 mt-4">
            <ImageUpload
              label="Product Image"
              currentImage={productForm.product_image_url || undefined}
              onUpload={async (file) => {
                const productId = await ensureProductExists();
                const result = await imageService.uploadProductImage(productId, file);
                if (result.success && result.data?.product_image_url) {
                  setProductForm({ ...productForm, product_image_url: result.data.product_image_url });
                  fetchData(search);
                  return result.data.product_image_url;
                } else {
                  throw new Error(result.error || 'Failed to upload image.');
                }
              }}
              onDelete={async () => {
                const productId = await ensureProductExists();
                const result = await imageService.deleteProductImage(productId);
                if (result.success) {
                  setProductForm({ ...productForm, product_image_url: null });
                  fetchData(search);
                } else {
                  throw new Error(result.error || 'Failed to delete image.');
                }
              }}
              aspectRatio="square"
              maxSizeMB={5}
              maxWidthClass="max-w-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => setProductModalOpen(false)}>Cancel</button>
          <button className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors" onClick={handleSaveProduct}>
            {productForm.product_id ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>

      {/* Category modal */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title={categoryForm.category_id ? 'Edit Category' : 'New Category'}
      >
        <div className="space-y-3 p-2">
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Name
            <input
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Description
            <textarea
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 min-h-[80px]"
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Parent
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
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
          <button className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => setCategoryModalOpen(false)}>Cancel</button>
          <button className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors" onClick={handleSaveCategory}>
            {categoryForm.category_id ? 'Update' : 'Create'}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDelete}
        title={`Delete ${itemToDelete?.type === 'product' ? 'Product' : 'Category'}?`}
        message={
          itemToDelete?.type === 'product'
            ? `⚠️ WARNING: You are about to permanently delete "${(itemToDelete?.data as Product)?.name}". This action cannot be undone and will impact your inventory records.`
            : `⚠️ WARNING: Deleting "${(itemToDelete?.data as Category)?.name}" will affect all products in this category. This action cannot be undone.`
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={loading}
      />
    </div>
  );
};

export default Products;
