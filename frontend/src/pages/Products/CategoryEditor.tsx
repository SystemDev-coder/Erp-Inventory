import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, ShieldCheck, X } from 'lucide-react';
import { useToast } from '../../components/ui/toast/Toast';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';
import { AttributeDataType, AttributeDefinition, Category, productService } from '../../services/product.service';
import { useBranch } from '../../context/BranchContext';
import { CATEGORY_ICON_OPTIONS, resolveCategoryIcon } from '../../config/categoryIcons';

type CategoryForm = Partial<Category>;

const defaultCategoryForm: CategoryForm = { name: '', description: '', is_active: true };

// Shared, theme-aware control styling for every <input> / <select> in the form -
// same as ProductEditor.tsx's fieldControlClass, kept as its own local copy
// here (this file has no other file to import it from without introducing a
// new shared module for a handful of classes).
const fieldControlClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'placeholder:text-slate-400 [color-scheme:light] transition-colors ' +
  'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 ' +
  'disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 ' +
  'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 ' +
  'dark:[color-scheme:dark] dark:focus:border-emerald-400 dark:focus:ring-emerald-400/25 ' +
  'dark:disabled:border-slate-700 dark:disabled:bg-slate-900/60 dark:disabled:text-slate-500';

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

// "New Category"/"Edit Category" used to be a Modal inside Products.tsx -
// moved to its own page/route (same reasoning as ProductEditor.tsx already
// being a full page, not a modal) so it has room for the attribute checklist
// and inline "+ New attribute" creator instead of squeezing them into a
// size="md" modal.
const CategoryEditor = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editId = Number(id || 0) || null;
  const isEditing = Boolean(editId);

  const { activeBranchId } = useBranch();

  const [loading, setLoading] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(defaultCategoryForm);
  const [categories, setCategories] = useState<Category[]>([]);
  const [attributeDefinitions, setAttributeDefinitions] = useState<AttributeDefinition[]>([]);
  const [newAttributeLabel, setNewAttributeLabel] = useState('');
  const [newAttributeDataType, setNewAttributeDataType] = useState<AttributeDataType>('text');
  const [newAttributeOptions, setNewAttributeOptions] = useState('');
  const [creatingAttribute, setCreatingAttribute] = useState(false);

  const resolveCategories = async () => {
    const res = await productService.listCategories({ branchId: activeBranchId ?? undefined });
    const loaded = res.success && res.data?.categories ? res.data.categories : [];
    setCategories(loaded);
    return loaded;
  };

  const resolveAttributes = async () => {
    const res = await productService.listAttributes(activeBranchId ?? undefined);
    const loaded = res.success && res.data?.attributes ? res.data.attributes : [];
    setAttributeDefinitions(loaded);
    return loaded;
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const [loadedCategories] = await Promise.all([resolveCategories(), resolveAttributes()]);
      if (isEditing && editId) {
        const row = loadedCategories.find((c) => Number(c.category_id) === editId);
        if (row) {
          setCategoryForm(row);
        } else {
          showToast('error', 'Categories', 'Category not found');
          navigate('/items');
        }
      }
      setLoading(false);
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Category Configuration Engine: lets an admin invent a brand-new
  // attribute type right from the checklist (no code change, no deploy).
  // If the typed label happens to already exist as a key, it's just
  // checked instead of re-created.
  const handleCreateAttribute = async () => {
    const label = newAttributeLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) {
      showToast('error', 'Attributes', 'Enter a valid label');
      return;
    }
    const existing = attributeDefinitions.find((a) => a.key === key);
    if (existing) {
      const current = categoryForm.attribute_keys || [];
      if (!current.includes(existing.key)) {
        setCategoryForm({ ...categoryForm, attribute_keys: [...current, existing.key] });
      }
      setNewAttributeLabel('');
      return;
    }
    const options =
      newAttributeDataType === 'select'
        ? newAttributeOptions.split(',').map((o) => o.trim()).filter(Boolean)
        : undefined;
    if (newAttributeDataType === 'select' && !options?.length) {
      showToast('error', 'Attributes', 'Enter at least one option (comma-separated)');
      return;
    }
    setCreatingAttribute(true);
    const res = await productService.createAttribute({
      key,
      label,
      dataType: newAttributeDataType,
      options,
      branchId: activeBranchId ?? undefined,
    });
    setCreatingAttribute(false);
    if (res.success && res.data?.attribute) {
      const created = res.data.attribute;
      setAttributeDefinitions((prev) => [...prev, created]);
      const current = categoryForm.attribute_keys || [];
      setCategoryForm({ ...categoryForm, attribute_keys: [...current, created.key] });
      setNewAttributeLabel('');
      setNewAttributeOptions('');
      setNewAttributeDataType('text');
      showToast('success', 'Attributes', `"${created.label}" was added as a new attribute.`);
    } else {
      showToast('error', 'Attributes', res.error || 'Could not create this attribute.');
    }
  };

  // A category can't become its own parent or its own descendant's parent -
  // computed client-side (string-compared: bigint ids come back as JSON
  // strings) so the picker never even offers an invalid option; the backend
  // enforces the same rule as a hard guard.
  const invalidParentIds = useMemo(() => {
    if (!categoryForm.category_id) return new Set<string>();
    const invalid = new Set<string>([String(categoryForm.category_id)]);
    let added = true;
    while (added) {
      added = false;
      for (const c of categories) {
        const cId = String(c.category_id);
        const pId = c.parent_id != null ? String(c.parent_id) : null;
        if (pId !== null && invalid.has(pId) && !invalid.has(cId)) {
          invalid.add(cId);
          added = true;
        }
      }
    }
    return invalid;
  }, [categories, categoryForm.category_id]);

  const [savingMode, setSavingMode] = useState<'save' | 'saveAndAdd' | null>(null);

  const resetFormForNewEntry = () => {
    setCategoryForm(defaultCategoryForm);
  };

  const saveCategory = async (andAddAnother: boolean) => {
    setSavingMode(andAddAnother ? 'saveAndAdd' : 'save');
    const res = categoryForm.category_id
      ? await productService.updateCategory(categoryForm.category_id, categoryForm)
      : await productService.createCategory({ ...categoryForm, branchId: activeBranchId ?? undefined } as Partial<Category> & { branchId?: number });
    setSavingMode(null);
    if (!res.success) {
      showToast('error', 'Categories', res.error || 'Failed to save category');
      return;
    }
    showToast('success', 'Categories', categoryForm.category_id ? 'Category updated' : 'Category created');
    if (andAddAnother && !categoryForm.category_id) {
      resetFormForNewEntry();
      await resolveCategories();
      return;
    }
    navigate('/items');
  };

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
                {isEditing ? 'Edit Category' : 'New Category'}
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
              {isEditing ? "Update this category's details." : 'Add a new product category.'}
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
        <form onSubmit={(e) => { e.preventDefault(); void saveCategory(false); }} className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader
              title="General Information"
              right={<span className="text-xs font-medium text-slate-400 dark:text-slate-500">* Required fields</span>}
            />
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <ItemField label="Category Name" required>
                  <input
                    required
                    minLength={2}
                    placeholder="e.g. Electronics"
                    className={fieldControlClass}
                    value={categoryForm.name || ''}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  />
                </ItemField>
              </div>

              <div className="md:col-span-2">
                <ItemField label="Description">
                  <input
                    placeholder="Optional description"
                    className={fieldControlClass}
                    value={categoryForm.description || ''}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  />
                </ItemField>
              </div>

              <div className="md:col-span-2">
                <ItemField label="Parent Category">
                  <SearchableCombobox<number>
                    value={categoryForm.parent_id ?? ''}
                    options={categories
                      .filter((c) => !invalidParentIds.has(String(c.category_id)))
                      .map((c, idx) => {
                        const { Icon, className } = resolveCategoryIcon(c.icon, idx);
                        return {
                          value: c.category_id,
                          label: c.name,
                          icon: <Icon className={`size-4 ${className}`} aria-hidden="true" />,
                        };
                      })}
                    placeholder="No parent (top-level category)"
                    onChange={(nextValue) =>
                      setCategoryForm({ ...categoryForm, parent_id: nextValue === '' ? null : Number(nextValue) })
                    }
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Optional - makes this a sub-category (e.g. "Face" under "Cosmetics").
                  </p>
                </ItemField>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader title="Icon" />
            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-3">
              Shown next to this category in lists, the POS category row, and product pickers.
            </p>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-7 md:grid-cols-9">
              {CATEGORY_ICON_OPTIONS.map((opt) => {
                const isSelected = categoryForm.icon === opt.key;
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    title={opt.label}
                    aria-label={opt.label}
                    aria-pressed={isSelected}
                    onClick={() => setCategoryForm({ ...categoryForm, icon: opt.key })}
                    className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 transition-colors ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-500/10'
                        : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <Icon className={`size-4 ${opt.className}`} aria-hidden="true" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <SectionHeader title="Attributes" />
            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-3">
              Which fields do products in this category need? (e.g. Model, Storage, RAM for phones)
            </p>
            <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2 md:grid-cols-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              {attributeDefinitions.map((def) => {
                const checked = (categoryForm.attribute_keys || []).includes(def.key);
                return (
                  <label key={def.key} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
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
            {/* Category Configuration Engine: an admin invents a brand-new
                attribute type here - no code change, no deploy - and it's
                immediately available for this and every future category. */}
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-primary-300 bg-primary-50/60 p-3 dark:border-primary-700 dark:bg-primary-500/10 sm:grid-cols-[1fr_auto_auto]">
              <input
                placeholder="+ New attribute label (e.g. Fragrance Type)"
                value={newAttributeLabel}
                onChange={(e) => setNewAttributeLabel(e.target.value)}
                className={`${fieldControlClass} text-xs`}
              />
              <select
                value={newAttributeDataType}
                onChange={(e) => setNewAttributeDataType(e.target.value as AttributeDataType)}
                className={`${fieldControlClass} text-xs`}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Select</option>
                <option value="date">Date</option>
              </select>
              <button
                type="button"
                disabled={creatingAttribute || !newAttributeLabel.trim()}
                onClick={() => void handleCreateAttribute()}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingAttribute ? 'Adding...' : 'Add'}
              </button>
              {newAttributeDataType === 'select' && (
                <input
                  placeholder="Options, comma-separated (e.g. Floral, Woody, Citrus)"
                  value={newAttributeOptions}
                  onChange={(e) => setNewAttributeOptions(e.target.value)}
                  className={`${fieldControlClass} sm:col-span-3 text-xs`}
                />
              )}
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
                  onClick={() => void saveCategory(true)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {savingMode === 'saveAndAdd' ? 'Saving...' : 'Save & Add Another'}
                </button>
              )}
              <button
                type="submit"
                disabled={savingMode !== null}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 dark:focus-visible:ring-slate-500"
              >
                {savingMode === 'save' ? (
                  'Saving...'
                ) : (
                  <>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {isEditing ? 'Update Category' : 'Save Category'}
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

export default CategoryEditor;
