import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Plus, Trash2, ArrowLeft, Package } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { purchaseService, PurchaseItem } from '../../services/purchase.service';
import { supplierService, Supplier } from '../../services/supplier.service';
import { accountService, Account } from '../../services/account.service';
import { productService, Product } from '../../services/product.service';
import { Modal } from '../../components/ui/modal/Modal';
import { SearchableCombobox } from '../../components/ui/combobox/SearchableCombobox';

type LineItem = {
  product_id: number | '';
  name: string;
  description: string;
  quantity: number;
  unit_cost: number;
  sale_price: number;
  discount: number;
  batch_no?: string;
  expiry_date?: string;
  line_total: number;
};

const emptyLine: LineItem = {
  product_id: '',
  name: '',
  description: '',
  quantity: 1,
  unit_cost: 0,
  sale_price: 0,
  discount: 0,
  batch_no: '',
  expiry_date: '',
  line_total: 0,
};

const PurchaseEditor = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [supplierMode, setSupplierMode] = useState<'existing' | 'new'>('existing');
  const [newSupplier, setNewSupplier] = useState<Supplier>({
    supplier_id: 0,
    supplier_name: '',
    company_name: '',
    contact_person: '',
    contact_phone: '',
    phone: '',
    location: '',
    remaining_balance: 0,
    is_active: true,
  } as Supplier);

  const [form, setForm] = useState({
    supplier_id: '' as number | '',
    purchase_type: 'cash' as 'cash' | 'credit',
    acc_id: '' as number | '',
    paid_amount: 0,
    purchase_date: new Date().toISOString().slice(0, 10),
    subtotal: 0,
    discount: 0,
    total: 0,
    status: 'received' as 'received' | 'partial' | 'unpaid' | 'void',
    note: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine]);
  const [discountMode, setDiscountMode] = useState<'per_item' | 'all_items'>('all_items');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);

  const loadProducts = async (search?: string) => {
    const limit = 200; // server max for /api/products
    const q = (search || '').trim();

    try {
      setProductsLoading(true);
      // If we are searching, just fetch the first page from server and let the UI filter further.
      if (q) {
        const res = await productService.list({ search: q, page: 1, limit });
        if (!res.success) {
          showToast('error', 'Load failed', res.error || 'Could not load products');
          return;
        }
        setProducts(res.data?.products || []);
        setProductsLoaded(true);
        return;
      }

      // Otherwise, preload all products (paged) and do client-side filtering for comboboxes.
      let page = 1;
      const all: Product[] = [];
      const seen = new Set<number>();

      // safety stop (200 * 100 = 20,000 products)
      for (let guard = 0; guard < 100; guard++) {
        const res = await productService.list({ page, limit });
        if (!res.success) {
          showToast('error', 'Load failed', res.error || 'Could not load products');
          break;
        }
        const rows = res.data?.products || [];
        for (const p of rows) {
          if (!seen.has(p.product_id)) {
            seen.add(p.product_id);
            all.push(p);
          }
        }
        const totalPages = res.data?.pagination?.totalPages;
        if (!totalPages || page >= totalPages || rows.length === 0) break;
        page += 1;
      }

      all.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      setProducts(all);
      setProductsLoaded(true);
    } catch (e) {
      showToast(
        'error',
        'Load failed',
        e instanceof Error ? e.message : 'Could not load products'
      );
    } finally {
      setProductsLoading(false);
    }
  };

  const calculateTotals = (items: LineItem[], headerDiscount: number) => {
    const subtotal = items.reduce((sum, item) => {
      const line = Math.max(
        0,
        (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0) -
          (Number(item.discount) || 0)
      );
      return sum + line;
    }, 0);
    const total = Math.max(0, subtotal - Number(headerDiscount || 0));
    return {
      subtotal: Number(subtotal.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  };

  const recalcTotals = (items: LineItem[], headerDiscount: number) => {
    const totals = calculateTotals(items, headerDiscount);
    setForm((prev) => ({
      ...prev,
      subtotal: totals.subtotal,
      total: totals.total,
    }));
    return totals;
  };

  const setLineItemValue = (index: number, field: keyof LineItem, value: any) => {
    setLineItems((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      updated.line_total = Math.max(
        0,
        (Number(updated.quantity) || 0) * (Number(updated.unit_cost) || 0) -
          (Number(updated.discount) || 0)
      );
      next[index] = updated;
      return next;
    });
  };

  const loadOptions = async () => {
    const sRes = await supplierService.list();
    if (sRes.success && sRes.data?.suppliers) setSuppliers(sRes.data.suppliers);
    const aRes = await accountService.list();
    if (aRes.success && aRes.data?.accounts) setAccounts(aRes.data.accounts);
  };

  const loadPurchase = async (pid: number) => {
    setLoading(true);
    const res = await purchaseService.get(pid);
    if (res.success && res.data?.purchase) {
      const p = res.data.purchase;
        setForm({
          supplier_id: p.supplier_id ?? '',
          purchase_type: (p.purchase_type as 'cash' | 'credit') || 'cash',
          purchase_date: p.purchase_date.slice(0, 10),
          subtotal: Number(p.subtotal || 0),
          discount: Number(p.discount || 0),
          total: Number(p.total || 0),
        status: p.status as any,
        note: p.note || '',
        acc_id: '',
        paid_amount: Number(p.total || 0),
      });
      const fetchedItems = (res.data.items || []).map((it: PurchaseItem) => ({
        product_id: it.product_id,
        name: it.description || '',
        description: it.description || '',
        quantity: Number(it.quantity || 1),
        unit_cost: Number(it.unit_cost || 0),
        sale_price: Number((it as any).sale_price || 0),
        discount: Number(it.discount || 0),
        batch_no: it.batch_no || '',
        expiry_date: it.expiry_date || '',
        line_total: Math.max(
          0,
          (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0) -
            (Number(it.discount) || 0)
        ),
      })) as LineItem[];
      setLineItems(fetchedItems.length ? fetchedItems : [emptyLine]);
      const headerDiscount = Number(p.discount || 0);
      const perItemDiscount = fetchedItems.reduce((sum, li) => sum + (Number(li.discount) || 0), 0);
      const mode: 'per_item' | 'all_items' =
        headerDiscount > 0 && perItemDiscount === 0 ? 'all_items' : perItemDiscount > 0 ? 'per_item' : 'all_items';
      setDiscountMode(mode);
    } else {
      showToast('error', 'Load failed', res.error || 'Could not load purchase');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOptions();
    // preload some items for the inline item combobox (and keep using server-side search while typing)
    void loadProducts('');
    if (isEdit && Number(id)) loadPurchase(Number(id));
  }, [id]);

  useEffect(() => {
    if (productPickerOpen && !productsLoaded) void loadProducts('');
  }, [productPickerOpen, productsLoaded]);

  const lineDiscountTotal = lineItems.reduce((sum, item) => sum + (Number(item.discount) || 0), 0);
  const effectiveHeaderDiscount = Number(form.discount || 0);
  const discountSummary = lineDiscountTotal + effectiveHeaderDiscount;
  const itemsTableColSpan = discountMode === 'per_item' ? 8 : 7;

  const effectivePurchaseType: 'cash' | 'credit' = form.purchase_type;
  const effectiveStatus: 'received' | 'partial' | 'unpaid' | 'void' =
    effectivePurchaseType === 'credit' && form.status !== 'void' ? 'unpaid' : form.status;
  const shouldShowPaymentAccount = effectiveStatus !== 'void' && effectiveStatus !== 'unpaid' && effectivePurchaseType !== 'credit';

  useEffect(() => {
    // Keep paid_amount consistent with the chosen status + current total.
    if (effectivePurchaseType === 'credit') return;

    if (effectiveStatus === 'received') {
      const total = Number(form.total || 0);
      if (Math.abs(Number(form.paid_amount || 0) - total) > 0.000001) {
        setForm((prev) => ({ ...prev, paid_amount: Number(prev.total || 0) }));
      }
      return;
    }

    if (effectiveStatus === 'unpaid') {
      if (Math.abs(Number(form.paid_amount || 0)) > 0.000001 || form.acc_id !== '') {
        setForm((prev) => ({ ...prev, paid_amount: 0, acc_id: '' }));
      }
    }
  }, [effectivePurchaseType, effectiveStatus, form.total]);

  const applyDiscountMode = (mode: 'per_item' | 'all_items') => {
    setDiscountMode(mode);
    if (mode === 'all_items') {
      const nextItems = lineItems.map((li) => ({
        ...li,
        discount: 0,
        line_total: Math.max(0, (Number(li.quantity) || 0) * (Number(li.unit_cost) || 0)),
      }));
      setLineItems(nextItems);
      recalcTotals(nextItems, Number(form.discount || 0));
      return;
    }

    setForm((prev) => ({ ...prev, discount: 0 }));
    recalcTotals(lineItems, 0);
  };

  const handleSelectProduct = (p: Product) => {
    const existingIdx = lineItems.findIndex((li) => Number(li.product_id) === p.product_id);
    const filtered = lineItems.filter((li) => li.quantity > 0 || (li.name && li.name.trim()));
    if (existingIdx >= 0) {
      const updated = lineItems.map((li, i) => {
        if (i !== existingIdx) return li;
        const nextQty = (Number(li.quantity) || 1) + 1;
        return {
          ...li,
          quantity: nextQty,
          line_total: Math.max(
            0,
            nextQty * (Number(li.unit_cost) || 0) - (Number(li.discount) || 0)
          ),
        };
      });
      setLineItems(updated);
      recalcTotals(updated, effectiveHeaderDiscount);
    } else {
      const newItem: LineItem = {
        product_id: p.product_id,
        name: p.name,
        description: p.name,
        quantity: 1,
        unit_cost: Number(p.cost || 0),
        sale_price: Number(p.price || 0),
        discount: 0,
        line_total: Number(p.cost || 0),
      };
      const next = [...filtered, newItem];
      setLineItems(next);
      recalcTotals(next, effectiveHeaderDiscount);
    }
    setProductPickerOpen(false);
  };

  const handleSave = async () => {
    let supplierId = form.supplier_id as number | '';

    if (supplierMode === 'new') {
      if (!newSupplier.supplier_name) {
        showToast('error', 'Supplier name required', 'Enter supplier name');
        return;
      }
      setLoading(true);
      const res = await supplierService.create({
        supplier_name: newSupplier.supplier_name,
        company_name: newSupplier.company_name,
        contact_person: newSupplier.contact_person,
        contact_phone: newSupplier.contact_phone,
        phone: newSupplier.phone,
        location: newSupplier.location,
        remaining_balance: newSupplier.remaining_balance ?? 0,
        is_active: true,
      });
      if (!res.success || !res.data?.supplier) {
        showToast('error', 'Supplier save failed', res.error || 'Could not create supplier');
        setLoading(false);
        return;
      }
      supplierId = res.data.supplier.supplier_id;
      setSuppliers((prev) => [...prev, res.data!.supplier]);
      setForm((prev) => ({ ...prev, supplier_id: supplierId }));
      setSupplierMode('existing');
      setLoading(false);
    }

    // supplierId can be empty - backend uses Walking Supplier
    const preparedItems = lineItems
      .filter((li) => (li.product_id !== '' || li.name.trim() !== '') && li.quantity > 0)
      .map((li) => ({
        productId: li.product_id ? Number(li.product_id) : undefined,
        quantity: Number(li.quantity),
        unitCost: Number(li.unit_cost),
        salePrice: Number(li.sale_price || 0),
        discount: Number(li.discount || 0),
        description: (li.description || li.name || '').trim() || undefined,
        batchNo: li.batch_no || undefined,
        expiryDate: li.expiry_date || undefined,
      }));
    if (preparedItems.length === 0) {
      showToast('error', 'Add items', 'A purchase needs at least one line');
      return;
    }
    if (shouldShowPaymentAccount && !form.acc_id) {
      showToast('error', 'Account required', 'Select account for paid amount');
      return;
    }
    if (effectiveStatus === 'partial' && Number(form.paid_amount || 0) <= 0) {
      showToast('error', 'Paid amount required', 'Enter partial amount paid');
      return;
    }

    const totals = calculateTotals(lineItems, effectiveHeaderDiscount);
    setForm((prev) => ({ ...prev, subtotal: totals.subtotal, total: totals.total }));
    setLoading(true);
    const paidAmount =
      effectiveStatus === 'void'
        ? undefined
        : effectiveStatus === 'unpaid' || effectivePurchaseType === 'credit'
        ? 0
        : effectiveStatus === 'partial'
        ? Number(form.paid_amount || 0)
        : totals.total;
    const payload = {
      supplierId: supplierId ? Number(supplierId) : null,
      purchaseDate: form.purchase_date,
      purchaseType: effectivePurchaseType,
      subtotal: totals.subtotal,
      discount: effectiveHeaderDiscount,
      total: totals.total,
      status: effectiveStatus,
      note: form.note,
      items: preparedItems,
      // Inline payment info: optional, will update supplier remaining balance and account
      payFromAccId:
        !shouldShowPaymentAccount || !form.acc_id
          ? undefined
          : Number(form.acc_id),
      paidAmount,
    };
    const res = isEdit
      ? await purchaseService.update(Number(id), payload)
      : await purchaseService.create(payload);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Saved', isEdit ? 'Purchase updated' : 'Purchase created');
      navigate('/purchases');
    } else {
      showToast('error', 'Save failed', res.error || 'Check the form');
    }
  };

  const fieldCls =
    'h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-sm outline-none transition-all ' +
    'placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-primary-400 dark:focus:ring-primary-500/25';

  const compactNumberCls =
    'h-12 w-24 text-center rounded-md border border-slate-300 bg-white px-2 text-base text-slate-900 shadow-sm outline-none transition-all ' +
    'placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 ' +
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-primary-400 dark:focus:ring-primary-500/25';

  return (
    <div className="space-y-4 px-2 md:px-4">
      <PageHeader
        title={isEdit ? 'Edit Purchase' : 'New Purchase'}
        description="Create and manage purchase orders."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => navigate('/purchases')}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        }
      />

      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-6">
	        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
	          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
	            Supplier
	            <div className="w-full">
	              <SearchableCombobox<number>
	                value={supplierMode === 'existing' ? form.supplier_id : ''}
	                options={[
	                  ...suppliers.map((s) => ({
	                    value: s.supplier_id,
	                    label: s.supplier_name,
	                  })),
	                  { value: -1, label: '+ Add new supplier' },
	                ]}
	                placeholder="No supplier (Walk-in)"
	                disabled={loading}
	                onChange={(nextValue) => {
	                  if (nextValue === -1) {
	                    setSupplierMode('new');
	                    setForm((prev) => ({ ...prev, supplier_id: '' }));
	                    return;
	                  }
	                  setSupplierMode('existing');
	                  setForm((prev) => ({
	                    ...prev,
	                    supplier_id: nextValue === '' ? '' : Number(nextValue),
	                  }));
	                }}
	              />
	            </div>
	          </label>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Date
            <input
              type="date"
              className={fieldCls}
              value={form.purchase_date}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
            />
          </label>

        {supplierMode === 'new' && (
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 p-3 rounded-lg border border-dashed border-primary-300 bg-primary-50/60 dark:border-primary-700 dark:bg-primary-500/10">
            <div className="md:col-span-3 text-sm font-semibold text-primary-700 dark:text-primary-200">
              New supplier details
            </div>
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
              Name
              <input
                className={fieldCls}
                value={newSupplier.supplier_name}
                onChange={(e) => setNewSupplier({ ...newSupplier, supplier_name: e.target.value })}
                placeholder="Supplier name"
              />
            </label>
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
              Company
              <input
                className={fieldCls}
                value={newSupplier.company_name || ''}
                onChange={(e) => setNewSupplier({ ...newSupplier, company_name: e.target.value })}
                placeholder="Company"
              />
            </label>
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
              Contact Person
              <input
                className={fieldCls}
                value={newSupplier.contact_person || ''}
                onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })}
                placeholder="Contact person"
              />
            </label>
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
              Contact Phone
              <input
                className={fieldCls}
                value={newSupplier.contact_phone || ''}
                onChange={(e) => setNewSupplier({ ...newSupplier, contact_phone: e.target.value })}
                placeholder="+1 555 000 1234"
              />
            </label>
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
              Phone
              <input
                className={fieldCls}
                value={newSupplier.phone || ''}
                onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                placeholder="+1 555 123 4567"
              />
            </label>
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
              Remaining Balance
              <input
                type="number"
                className={fieldCls}
                value={newSupplier.remaining_balance ?? 0}
                onChange={(e) =>
                  setNewSupplier({ ...newSupplier, remaining_balance: Number(e.target.value || 0) })
                }
                placeholder="0.00"
              />
            </label>
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200 md:col-span-3">
              Location
              <input
                className={fieldCls}
                value={newSupplier.location || ''}
                onChange={(e) => setNewSupplier({ ...newSupplier, location: e.target.value })}
                placeholder="City / Area"
              />
            </label>
          </div>
        )}

        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Purchase Type
          <select
            className={fieldCls}
            value={effectivePurchaseType}
            onChange={(e) =>
              setForm((prev) => {
                const nextType = e.target.value as 'cash' | 'credit';
                return {
                  ...prev,
                  purchase_type: nextType,
                  status: nextType === 'credit' ? 'unpaid' : prev.status === 'unpaid' ? 'received' : prev.status,
                  acc_id: nextType === 'credit' ? '' : prev.acc_id,
                  paid_amount: nextType === 'credit' ? 0 : prev.paid_amount,
                };
              })
            }
          >
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
          </select>
        </label>

	        {shouldShowPaymentAccount ? (
	          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
	            Pay from Account
	            <SearchableCombobox<number>
	              value={form.acc_id}
	              options={accounts.map((a) => ({
	                value: a.acc_id,
	                label: `${a.name}${a.institution ? ` (${a.institution})` : ''}`,
	              }))}
	              placeholder="Select account"
	              disabled={loading}
	              onChange={(nextValue) => setForm({ ...form, acc_id: nextValue === '' ? '' : Number(nextValue) })}
	            />
	          </label>
	        ) : (
	          <div className="hidden md:block" />
	        )}

        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Status
          <select
            className={fieldCls}
            value={effectiveStatus}
            onChange={(e) => {
              const nextStatus = e.target.value as any;
              setForm((prev) => ({
                ...prev,
                status: nextStatus,
                paid_amount: nextStatus === 'void' ? 0 : prev.paid_amount,
                acc_id: nextStatus === 'void' ? '' : prev.acc_id,
              }));
            }}
            disabled={effectivePurchaseType === 'credit'}
          >
            <option value="received">Received</option>
            <option value="partial">Incomplete</option>
            <option value="unpaid">Unpaid</option>
            <option value="void">Cancelled</option>
          </select>
        </label>

        {effectivePurchaseType !== 'credit' && effectiveStatus !== 'void' && (
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Amount Paid
            <input
              type="number"
              className={fieldCls}
              value={form.paid_amount}
              min={0}
              max={form.total}
              onChange={(e) => {
                const raw = Number(e.target.value || 0);
                setForm((prev) => {
                  const total = Number(prev.total || 0);
                  const paid = Math.max(0, Math.min(raw, total));
                  const nextStatus =
                    paid <= 0
                      ? 'unpaid'
                      : paid + 0.000001 < total
                      ? 'partial'
                      : 'received';
                  return {
                    ...prev,
                    paid_amount: paid,
                    status: nextStatus as any,
                    acc_id: nextStatus === 'unpaid' ? '' : prev.acc_id,
                  };
                });
              }}
              placeholder="0.00"
              disabled={loading}
            />
          </label>
        )}

        <label className="flex flex-col text-sm font-medium gap-1 md:col-span-2 text-slate-800 dark:text-slate-200">
          Note
          <textarea
            className={`${fieldCls} min-h-[80px]`}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Items</span>
          <div className="flex flex-wrap items-end gap-2 justify-end">
            <select
              className="h-12 rounded-md border px-3 text-base transition-colors bg-white border-slate-300 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
              value={discountMode}
              onChange={(e) => applyDiscountMode(e.target.value as 'per_item' | 'all_items')}
              disabled={loading}
              title="Choose how discount is applied"
            >
              <option value="all_items">All items discount</option>
              <option value="per_item">Per item discount</option>
            </select>

            {discountMode === 'all_items' && (
              <label className="flex items-end gap-2 text-sm text-slate-700 dark:text-slate-200">
                Discount
                <input
                  type="number"
                  className="h-12 w-28 text-right rounded-md border px-3 text-base transition-colors bg-white border-slate-300 text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
                  value={form.discount}
                  min={0}
                  step="0.01"
                  onChange={(e) => {
                    const v = Number(e.target.value || 0);
                    setForm((prev) => ({ ...prev, discount: v }));
                    recalcTotals(lineItems, v);
                  }}
                  disabled={loading}
                />
              </label>
            )}

            <button
              type="button"
              onClick={() => setProductPickerOpen(true)}
              className="h-12 inline-flex items-center gap-2 text-base px-4 rounded-md bg-primary-600 text-white hover:bg-primary-700"
            >
              <Package size={16} /> Select from products
            </button>
            <button
              type="button"
              onClick={() => setLineItems((prev) => [...prev, { ...emptyLine }])}
              className="h-12 inline-flex items-center gap-2 text-base px-4 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Plus size={16} /> Add line
            </button>
          </div>
        </div>

        {/* Product Picker Modal */}
        <Modal
          isOpen={productPickerOpen}
          onClose={() => setProductPickerOpen(false)}
          title="Select products from inventory"
          size="lg"
        >
          <div className="space-y-3">
            <input
              type="text"
              className={`${fieldCls} h-12`}
              placeholder="Search products..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
	            <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
	              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
	                  {products
	                    .filter((p) =>
	                      productSearch.trim()
	                        ? String(p.name || '')
	                            .toLowerCase()
	                            .includes(productSearch.trim().toLowerCase())
	                        : true
	                    )
	                    .map((p) => (
	                    <tr
	                      key={p.product_id}
                      className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 text-right">${Number(p.cost || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">${Number(p.price || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleSelectProduct(p)}
                          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
                        >
                          Add
                        </button>
                      </td>
                    </tr>
	                  ))}
	                </tbody>
	              </table>
	              {products.length === 0 && (
	                <div className="py-8 text-center text-slate-500">No products found</div>
	              )}
	            </div>
	          </div>
	        </Modal>

	        <div className="overflow-x-auto">
	          <div className="min-w-[980px] rounded-lg border border-slate-200 dark:border-slate-800 overflow-visible">
	            <table className="min-w-full text-sm">
	              <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
	              <tr>
	                <th className="py-2 pr-2 pl-5 text-left">Item name</th>
	                <th className="py-2 pr-2 pl-5 text-left">Description</th>
	                <th className="px-2 py-2 text-center">Qty</th>
	                <th className="px-2 py-2 text-center">Unit Cost</th>
                <th className="px-2 py-2 text-center">Sale Price</th>
                {discountMode === 'per_item' && <th className="px-2 py-2 text-center">Discount</th>}
                <th className="px-2 py-2 text-right">Line Total</th>
                <th className="px-2 py-2 text-center">Action</th>
              </tr>
	              </thead>
	              <tbody>
	              {lineItems.map((item, idx) => (
	                <tr key={idx} className="border-t border-slate-200 dark:border-slate-800">
	                  <td className="px-2 py-2">
	                    <SearchableCombobox<number>
	                      value={item.product_id}
	                      options={products.map((p) => ({
	                        value: p.product_id,
	                        label: p.name?.trim() ? p.name : `Product #${p.product_id}`,
	                      }))}
	                      placeholder={productsLoading ? 'Loading items…' : 'Search & select item'}
	                      disabled={loading || productsLoading}
	                      onChange={(nextValue) => {
	                        const productId = nextValue === '' ? '' : Number(nextValue);
	                        const p = products.find((x) => x.product_id === productId);
	                        const next = lineItems.map((li, i) => {
	                          if (i !== idx) return li;
	                          if (!productId || !p) {
	                            const keepQty = Number(li.quantity || 1) || 1;
	                            return { ...emptyLine, quantity: keepQty };
	                          }
	                          const nextItem = {
	                            ...li,
	                            product_id: p.product_id,
	                            name: p.name,
	                            description: li.description?.trim() ? li.description : p.name,
	                            unit_cost: Number(p.cost || 0),
	                            sale_price: Number(p.price || 0),
	                          } as LineItem;
	                          nextItem.line_total = Math.max(
	                            0,
	                            (Number(nextItem.quantity) || 0) * (Number(nextItem.unit_cost) || 0) -
	                              (Number(nextItem.discount) || 0)
	                          );
	                          return nextItem;
	                        });
	                        setLineItems(next);
	                        recalcTotals(next, effectiveHeaderDiscount);
	                      }}
	                    />
	                  </td>
	                  <td className="px-2 py-2">
	                    <input
	                      className={`${fieldCls} w-full`}
                      value={item.description}
                      onChange={(e) => setLineItemValue(idx, 'description', e.target.value)}
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      className={compactNumberCls}
                      value={item.quantity}
                      min={0}
                      step="1"
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        setLineItemValue(idx, 'quantity', v);
                        recalcTotals(
                          lineItems.map((li, i) => (i === idx ? { ...li, quantity: v } : li)),
                          effectiveHeaderDiscount
                        );
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      className={compactNumberCls}
                      value={item.unit_cost}
                      min={0}
                      step="1"
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        setLineItemValue(idx, 'unit_cost', v);
                        recalcTotals(
                          lineItems.map((li, i) => (i === idx ? { ...li, unit_cost: v } : li)),
                          effectiveHeaderDiscount
                        );
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      className={compactNumberCls}
                      value={item.sale_price}
                      min={0}
                      step="1"
                      onChange={(e) => {
                        const v = Number(e.target.value || 0);
                        setLineItemValue(idx, 'sale_price', v);
                      }}
                    />
                  </td>
                  {discountMode === 'per_item' && (
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        className={compactNumberCls}
                        value={item.discount}
                        min={0}
                        step="1"
                        onChange={(e) => {
                          const v = Number(e.target.value || 0);
                          setLineItemValue(idx, 'discount', v);
                          recalcTotals(
                            lineItems.map((li, i) => (i === idx ? { ...li, discount: v } : li)),
                            effectiveHeaderDiscount
                          );
                        }}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2 text-right font-semibold">
                    ${item.line_total.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setLineItems((prev) => prev.filter((_, i) => i !== idx));
                        const next = lineItems.filter((_, i) => i !== idx);
                        recalcTotals(next.length ? next : [emptyLine], effectiveHeaderDiscount);
                      }}
                      className="p-2 text-red-500 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={itemsTableColSpan} className="text-center text-slate-500 py-3">
                    No items. Add a line to begin.
                  </td>
                </tr>
              )}
	              </tbody>
	            </table>
	          </div>
	        </div>

        <div className="flex justify-end gap-6 text-sm mt-2">
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold">${form.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Discount</span>
            <span className="font-semibold">${Number(discountSummary || 0).toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold">${form.total.toFixed(2)}</span>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseEditor;
