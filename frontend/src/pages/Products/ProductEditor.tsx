import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, Image as ImageIcon, ShieldCheck, X } from 'lucide-react';
import { useToast } from '../../components/ui/toast/Toast';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';
import { Category, Product, Unit, productService } from '../../services/product.service';
import { imageService } from '../../services/image.service';
import { storeService, Store as StoreType } from '../../services/store.service';
import { supplierService, Supplier } from '../../services/supplier.service';
import { useBranch } from '../../context/BranchContext';
import { useBusinessConfig } from '../../context/BusinessConfigContext';
import { PRODUCT_ATTRIBUTE_CATALOG, ProductAttributeDef } from '../../config/productAttributes';

type ProductForm = Partial<Product>;

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

const QUICK_CREATE_CATEGORY_SENTINEL = -1;
const QUICK_CREATE_UNIT_SENTINEL = -1;
const QUICK_CREATE_SUPPLIER_SENTINEL = -1;

// Shared, theme-aware control styling for every <input> / <select> in the form.
// Defined once so light/dark, focus, placeholder and disabled states stay
// consistent across the entire page instead of relying on implicit global CSS.
const fieldControlClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'placeholder:text-slate-400 [color-scheme:light] transition-colors ' +
  'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 ' +
  'disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 ' +
  'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 ' +
  'dark:[color-scheme:dark] dark:focus:border-emerald-400 dark:focus:ring-emerald-400/25 ' +
  'dark:disabled:border-slate-700 dark:disabled:bg-slate-900/60 dark:disabled:text-slate-500';

// Deliberately has no error/touched/success state: the form relies on native HTML5
// validation (required/minLength/min on the inputs themselves) instead of custom
// red-border flashing, matching the Employee modal's behavior.
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
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        <span>{label}{required ? ' *' : ''}</span>
      </label>
      {children}
    </div>
  );
}

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      </div>
      {right}
    </div>
  );
}

// Phase 9: "New Product"/"Edit Product" used to be a Modal inside
// Products.tsx - moved to its own page/route (same reasoning as Sales'
// SaleCreate.tsx and Purchases' PurchaseEditor.tsx already being full
// pages, not modals) so it has room for however many Dynamic Product
// Attributes fields a category ends up needing.
const ProductEditor = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editId = Number(id || 0) || null;
  const isEditing = Boolean(editId);

  const { activeBranchId } = useBranch();
  const { profile: businessProfile } = useBusinessConfig();
  const productConfig = businessProfile.productConfig;
  const sizeLabel = businessProfile.businessType === 'perfume' ? 'Volume' : 'Size';
  const colorLabel = businessProfile.businessType === 'cosmetics' ? 'Shade' : 'Color';

  const [loading, setLoading] = useState(false);
  const [itemForm, setItemForm] = useState<ProductForm>(defaultProductForm);
  const [itemStoreId, setItemStoreId] = useState<number | ''>('');
  const [stores, setStores] = useState<StoreType[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);
  const [itemImageRemoved, setItemImageRemoved] = useState(false);
  const [itemCategoryQuery, setItemCategoryQuery] = useState('');
  const [itemUnitQuery, setItemUnitQuery] = useState('');
  const [itemSupplierQuery, setItemSupplierQuery] = useState('');
  const [creatingItemCategory, setCreatingItemCategory] = useState(false);
  const [creatingItemUnit, setCreatingItemUnit] = useState(false);
  const [creatingItemSupplier, setCreatingItemSupplier] = useState(false);

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

  const resolveSuppliers = async () => {
    const res = await supplierService.list({ branchId: activeBranchId ?? undefined });
    const loaded = res.success && res.data?.suppliers ? res.data.suppliers : [];
    setSuppliers(loaded);
    return loaded;
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const [loadedStores] = await Promise.all([
        resolveStores(),
        resolveCategories(),
        resolveUnits(),
        resolveSuppliers(),
      ]);
      if (isEditing && editId) {
        const res = await productService.get(editId);
        if (res.success && res.data?.product) {
          const row = res.data.product;
          setItemForm({ ...row, quantity: Number(row.quantity ?? row.stock ?? 0) });
          setItemImagePreview(row.image_url || null);
          setItemStoreId(row.store_id || loadedStores[0]?.store_id || '');
        } else {
          showToast('error', 'Products', res.error || 'Product not found');
          navigate('/items');
        }
      } else {
        const main =
          loadedStores.find((s) => String(s.store_name || '').toLowerCase() === 'main store') || loadedStores[0];
        if (main) setItemStoreId(main.store_id);
      }
      setLoading(false);
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const setItemField = (field: string, value: unknown) => {
    setItemForm((prev) => ({ ...prev, [field]: value } as ProductForm));
  };

  // Phase 9: Dynamic Product Attributes - the selected category's
  // attribute_keys, minus whichever ones are already covered by the legacy
  // flag-driven fields above (Brand is always shown; Size/Color/Generic
  // Name/Strength depend on productConfig) so nothing is ever duplicated.
  // Loose/coerced comparison, not === : category_id comes back from Postgres
  // as a JSON string for BIGINT columns, while itemForm.category_id is set
  // as a number by the combobox's onChange.
  const selectedItemCategory = categories.find((c) => String(c.category_id) === String(itemForm.category_id));
  const legacyAttributeColumns = new Set<string>(
    ['brand', productConfig.size && 'size', productConfig.color && 'color', productConfig.genericName && 'generic_name', productConfig.strength && 'strength'].filter(
      (v): v is string => Boolean(v)
    )
  );
  const dynamicAttributeDefs: ProductAttributeDef[] = (selectedItemCategory?.attribute_keys || [])
    .map((key) => PRODUCT_ATTRIBUTE_CATALOG[key])
    .filter((def): def is ProductAttributeDef => Boolean(def) && !(def.column && legacyAttributeColumns.has(def.column)));

  const setAttributeField = (def: ProductAttributeDef, value: string) => {
    if (def.column) {
      setItemField(def.column, value);
    } else {
      setItemForm((prev) => ({ ...prev, attributes: { ...(prev.attributes || {}), [def.key]: value } }));
    }
  };

  const getAttributeValue = (def: ProductAttributeDef): string => {
    if (def.column) return String((itemForm as unknown as Record<string, unknown>)[def.column] ?? '');
    return String(itemForm.attributes?.[def.key] ?? '');
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

  const handleCreateItemSupplier = async (typedName: string) => {
    const name = typedName.trim();
    if (!name) return;
    const existing = suppliers.find((s) => s.supplier_name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setItemField('supplier_id', existing.supplier_id);
      return;
    }
    setCreatingItemSupplier(true);
    const res = await supplierService.create({ supplier_name: name, is_active: true });
    setCreatingItemSupplier(false);
    if (res.success && res.data?.supplier) {
      setSuppliers((prev) => [...prev, res.data!.supplier]);
      setItemField('supplier_id', res.data.supplier.supplier_id);
      showToast('success', 'Suppliers', `"${res.data.supplier.supplier_name}" was added as a new supplier.`);
    } else {
      showToast('error', 'Suppliers', res.error || 'Could not create this supplier.');
    }
  };

  const [savingMode, setSavingMode] = useState<'save' | 'saveAndAdd' | null>(null);

  const resetFormForNewEntry = (main: StoreType | undefined) => {
    setItemForm(defaultProductForm);
    setItemImageFile(null);
    setItemImagePreview(null);
    setItemImageRemoved(false);
    setItemCategoryQuery('');
    setItemUnitQuery('');
    setItemSupplierQuery('');
    if (main) setItemStoreId(main.store_id);
  };

  const saveItem = async (andAddAnother: boolean) => {
    if (!itemForm.category_id) {
      showToast('error', 'Products', 'Category is required');
      return;
    }
    if (!itemForm.unit_id) {
      showToast('error', 'Products', 'Unit is required');
      return;
    }
    setSavingMode(andAddAnother ? 'saveAndAdd' : 'save');
    const payload = {
      ...itemForm,
      is_active: true,
      storeId: Number(itemStoreId),
      quantity: itemForm.product_id ? undefined : Number(itemForm.quantity ?? 0),
    };
    const res = itemForm.product_id
      ? await productService.update(itemForm.product_id, payload)
      : await productService.create(payload);
    if (!res.success || !res.data?.product) {
      setSavingMode(null);
      showToast('error', 'Products', res.error || 'Failed to save product');
      return;
    }

    const savedId = res.data.product.product_id;
    if (itemImageFile) {
      const imgRes = await imageService.uploadProductImage(savedId, itemImageFile);
      if (!imgRes.success) {
        showToast('error', 'Products', imgRes.error || 'Product saved, but the image could not be uploaded.');
      }
    } else if (itemImageRemoved && itemForm.product_id) {
      await imageService.deleteProductImage(savedId, 'Removed via product edit');
    }

    setSavingMode(null);
    showToast('success', 'Products', itemForm.product_id ? 'Product updated' : 'Product created');
    if (andAddAnother && !itemForm.product_id) {
      resetFormForNewEntry(stores.find((s) => String(s.store_name || '').toLowerCase() === 'main store') || stores[0]);
      return;
    }
    navigate('/items');
  };

  const attributesSectionVisible =
    Boolean(productConfig.size) ||
    Boolean(productConfig.color) ||
    Boolean(productConfig.genericName) ||
    Boolean(productConfig.strength) ||
    dynamicAttributeDefs.length > 0;

  const costPriceNum = Number(itemForm.cost_price || 0);
  const sellPriceNum = Number(itemForm.sell_price || 0);
  const grossMarginAmount = sellPriceNum - costPriceNum;
  const grossMarginPct = sellPriceNum > 0 ? (grossMarginAmount / sellPriceNum) * 100 : 0;

  return (
    <div className="space-y-4 px-2 md:px-4 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/items')}
            className="mt-1 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {isEditing ? 'Edit Product' : 'New Product'}
              </h1>
              <span
                className={
                  isEditing
                    ? 'inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : 'inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                }
              >
                {isEditing ? 'Editing' : 'Catalog Draft'}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {isEditing ? "Update this product's details." : 'Add a new product to your catalog.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/items')}
          aria-label="Close"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X size={20} />
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void saveItem(false); }} className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader
              title="General Information & Media"
              right={<span className="text-xs font-medium text-slate-400 dark:text-slate-500">* Required fields</span>}
            />
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <ItemField label="Product Name" required>
                  <input
                    required
                    minLength={2}
                    placeholder="Enter product name"
                    className={fieldControlClass}
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
                        <ImageIcon className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
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
                          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove image
                        </button>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400">JPG, PNG, GIF or WEBP. Up to 10MB.</p>
                    </div>
                  </div>
                </ItemField>
              </div>

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
                  className={fieldControlClass}
                  value={itemForm.brand || ''}
                  onChange={(e) => setItemField('brand', e.target.value)}
                />
              </ItemField>

              <ItemField label="Supplier">
                <SearchableCombobox<number>
                  value={itemForm.supplier_id ?? ''}
                  options={(() => {
                    const base = suppliers.map((s) => ({ value: s.supplier_id, label: s.supplier_name }));
                    const q = itemSupplierQuery.trim();
                    if (!q) return base;
                    const exists = suppliers.some((s) => s.supplier_name.trim().toLowerCase() === q.toLowerCase());
                    if (exists) return base;
                    return [{ value: QUICK_CREATE_SUPPLIER_SENTINEL, label: `+ Create "${q}"` }, ...base];
                  })()}
                  placeholder="No default supplier"
                  disabled={creatingItemSupplier}
                  onSearch={(q) => setItemSupplierQuery(q)}
                  onChange={(nextValue) => {
                    if (nextValue === QUICK_CREATE_SUPPLIER_SENTINEL) {
                      void handleCreateItemSupplier(itemSupplierQuery.trim());
                      return;
                    }
                    setItemField('supplier_id', nextValue === '' ? null : Number(nextValue));
                  }}
                />
              </ItemField>

              <div className="md:col-span-2">
                <ItemField label="Barcode">
                  <input
                    placeholder="Scan or enter barcode"
                    className={fieldControlClass}
                    value={itemForm.barcode || ''}
                    onChange={(e) => setItemField('barcode', e.target.value)}
                  />
                </ItemField>
              </div>
            </div>
          </div>

          {attributesSectionVisible && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <SectionHeader title="Product Attributes" />
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
                {productConfig.size && (
                  <ItemField label={sizeLabel}>
                    <input
                      placeholder={sizeLabel === 'Volume' ? 'e.g. 50ml' : 'e.g. M, L, XL'}
                      className={fieldControlClass}
                      value={itemForm.size || ''}
                      onChange={(e) => setItemField('size', e.target.value)}
                    />
                  </ItemField>
                )}

                {productConfig.color && (
                  <ItemField label={colorLabel}>
                    <input
                      placeholder={colorLabel === 'Shade' ? 'e.g. Ivory, Rose Gold' : 'e.g. Red, Navy Blue'}
                      className={fieldControlClass}
                      value={itemForm.color || ''}
                      onChange={(e) => setItemField('color', e.target.value)}
                    />
                  </ItemField>
                )}

                {productConfig.genericName && (
                  <ItemField label="Generic Name">
                    <input
                      placeholder="e.g. Paracetamol"
                      className={fieldControlClass}
                      value={itemForm.generic_name || ''}
                      onChange={(e) => setItemField('generic_name', e.target.value)}
                    />
                  </ItemField>
                )}

                {productConfig.strength && (
                  <ItemField label="Strength">
                    <input
                      placeholder="e.g. 500mg"
                      className={fieldControlClass}
                      value={itemForm.strength || ''}
                      onChange={(e) => setItemField('strength', e.target.value)}
                    />
                  </ItemField>
                )}

                {/* Phase 9: Dynamic Product Attributes - one field per key the
                    selected category lists (Category tab controls the list),
                    e.g. Model/Storage/RAM/Screen Size/IMEI for an Electronics
                    "Mobile Phones" category. */}
                {dynamicAttributeDefs.map((def) =>
                  def.type === 'select' ? (
                    <ItemField key={def.key} label={def.label}>
                      <select
                        className={fieldControlClass}
                        value={getAttributeValue(def)}
                        onChange={(e) => setAttributeField(def, e.target.value)}
                      >
                        <option value="">Select {def.label.toLowerCase()}</option>
                        {(def.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </ItemField>
                  ) : (
                    <ItemField key={def.key} label={def.label}>
                      <input
                        type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                        placeholder={`e.g. ${def.label}`}
                        className={fieldControlClass}
                        value={getAttributeValue(def)}
                        onChange={(e) => setAttributeField(def, e.target.value)}
                      />
                    </ItemField>
                  )
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader
              title="Pricing & Stock Levels"
              right={
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Gross Margin:{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    ${grossMarginAmount.toFixed(2)}
                  </span>{' '}
                  ({grossMarginPct.toFixed(0)}%)
                </span>
              }
            />
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-3">
              <ItemField label="Cost Price" required>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  className={fieldControlClass}
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
                  className={fieldControlClass}
                  value={itemForm.sell_price ?? 0}
                  onChange={(e) => setItemField('sell_price', Number(e.target.value || 0))}
                />
              </ItemField>

              <ItemField label="Stock Alert">
                <input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="5"
                  className={fieldControlClass}
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
                      GL entry at all. Real stock changes belong in Stock
                      Adjustment, which does this correctly. */}
                  <ItemField label="Opening Balance">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      placeholder="0"
                      className={fieldControlClass}
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
                      className={fieldControlClass}
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
                    className={fieldControlClass}
                    value={itemForm.opening_balance ?? 0}
                    onChange={(e) => {
                      const value = Number(e.target.value || 0);
                      setItemForm((prev) => ({ ...prev, opening_balance: value, quantity: value }));
                    }}
                  />
                </ItemField>
              )}

              <ItemField label="Store" required>
                <select
                  required
                  value={itemStoreId}
                  className={fieldControlClass}
                  onChange={(e) => setItemStoreId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="" disabled>Select store</option>
                  {stores.map((s) => <option key={s.store_id} value={s.store_id}>{s.store_name}</option>)}
                </select>
              </ItemField>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              Instant validation active
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/items')}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              {!isEditing && (
                <button
                  type="button"
                  disabled={savingMode !== null}
                  onClick={() => void saveItem(true)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {savingMode === 'saveAndAdd' ? 'Saving...' : 'Save & Add Another'}
                </button>
              )}
              <button
                type="submit"
                disabled={savingMode !== null}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {savingMode === 'save' ? (
                  'Saving...'
                ) : (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {isEditing ? 'Update Product' : 'Save Product'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

export default ProductEditor;