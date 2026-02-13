import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { purchaseService, PurchaseItem } from '../../services/purchase.service';
import { supplierService, Supplier } from '../../services/supplier.service';
import { accountService, Account } from '../../services/account.service';

type LineItem = {
  product_id: number | '';
  name: string;
  description: string;
  quantity: number;
  unit_cost: number;
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

  const recalcTotals = (items: LineItem[], headerDiscount: number) => {
    const subtotal = items.reduce((sum, item) => {
      const line = Math.max(
        0,
        (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0) -
          (Number(item.discount) || 0)
      );
      return sum + line;
    }, 0);
    const total = Math.max(0, subtotal - Number(headerDiscount || 0));
    setForm((prev) => ({
      ...prev,
      subtotal: Number(subtotal.toFixed(2)),
      total: Number(total.toFixed(2)),
    }));
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
          supplier_id: p.supplier_id,
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
    } else {
      showToast('error', 'Load failed', res.error || 'Could not load purchase');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadOptions();
    if (isEdit && Number(id)) loadPurchase(Number(id));
  }, [id]);

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

    if (!supplierId) {
      showToast('error', 'Missing supplier', 'Choose a supplier');
      return;
    }
    const preparedItems = lineItems
      .filter((li) => (li.product_id !== '' || li.name.trim() !== '') && li.quantity > 0)
      .map((li) => ({
        productId: li.product_id ? Number(li.product_id) : undefined,
        quantity: Number(li.quantity),
        unitCost: Number(li.unit_cost),
        discount: Number(li.discount || 0),
        description: (li.description || li.name || '').trim() || undefined,
        batchNo: li.batch_no || undefined,
        expiryDate: li.expiry_date || undefined,
      }));
    if (preparedItems.length === 0) {
      showToast('error', 'Add items', 'A purchase needs at least one line');
      return;
    }
    recalcTotals(lineItems, form.discount);
    setLoading(true);
    const payload = {
      supplierId: supplierId as number,
      purchaseDate: form.purchase_date,
      subtotal: Number(form.subtotal),
      discount: Number(form.discount),
      total: Number(form.total),
      status: form.status,
      note: form.note,
      items: preparedItems,
      // Inline payment info: optional, will update supplier remaining balance and account
      payFromAccId: form.status === 'void' || !form.acc_id ? undefined : Number(form.acc_id),
      paidAmount:
        form.status === 'void'
          ? undefined
          : Number(form.paid_amount || 0),
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
    'rounded-lg border px-3 py-2 text-sm transition-colors ' +
    'bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 ' +
    'dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 ' +
    'focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40 focus:outline-none';

  const compactNumberCls =
    'w-24 text-center rounded border px-2 py-2 text-sm transition-colors ' +
    'bg-white border-slate-200 text-slate-900 placeholder:text-slate-500 ' +
    'dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 ' +
    'focus:border-primary-500 focus:ring-1 focus:ring-primary-500/40 focus:outline-none';

  return (
    <div className="space-y-4 max-w-6xl mx-auto px-2 md:px-4">
      <PageHeader
        title={isEdit ? 'Edit Purchase' : 'New Purchase'}
        description="Create and manage purchase orders."
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border"
              onClick={() => navigate('/purchases')}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Supplier
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-2">
            <select
              className={fieldCls}
              value={supplierMode === 'existing' ? form.supplier_id : ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'new-supplier') {
                  setSupplierMode('new');
                  setForm((prev) => ({ ...prev, supplier_id: '' }));
                } else {
                  setSupplierMode('existing');
                  setForm((prev) => ({ ...prev, supplier_id: val ? Number(val) : '' }));
                }
              }}
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name}
                </option>
              ))}
              <option value="new-supplier">+ Add new supplier</option>
            </select>
          </div>
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
          Date
          <input
            type="date"
            className={fieldCls}
            value={form.purchase_date}
            onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
          />
        </label>

        {form.status !== 'void' && (
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Pay from Account
            <select
              className={fieldCls}
              value={form.acc_id}
              onChange={(e) => setForm({ ...form, acc_id: e.target.value ? Number(e.target.value) : '' })}
            >
              <option value="">Select account</option>
              {accounts.map((a) => (
                <option key={a.acc_id} value={a.acc_id}>
                  {a.name} ({a.institution})
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
          Status
          <select
            className={fieldCls}
            value={form.status}
            onChange={(e) => {
              const nextStatus = e.target.value as any;
              setForm((prev) => ({
                ...prev,
                status: nextStatus,
                paid_amount: nextStatus === 'void' ? 0 : prev.paid_amount,
                acc_id: nextStatus === 'void' ? '' : prev.acc_id,
              }));
            }}
          >
            <option value="received">Received</option>
            <option value="partial">Incomplete</option>
            <option value="unpaid">Unpaid</option>
            <option value="void">Cancelled</option>
          </select>
        </label>

        {form.status === 'partial' && (
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Partial Amount Paid
            <input
              type="number"
              className={fieldCls}
              value={form.paid_amount}
              min={0}
              max={form.total}
              onChange={(e) => setForm({ ...form, paid_amount: Number(e.target.value || 0) })}
              placeholder="0.00"
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
          <button
            type="button"
            onClick={() => setLineItems((prev) => [...prev, { ...emptyLine }])}
            className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
          >
            <Plus size={16} /> Add line
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-2 py-2 text-left">Item name</th>
                <th className="px-2 py-2 text-left">Description</th>
                <th className="px-2 py-2 text-center">Qty</th>
                <th className="px-2 py-2 text-center">Unit Cost</th>
                <th className="px-2 py-2 text-center">Discount</th>
                <th className="px-2 py-2 text-right">Line Total</th>
                <th className="px-2 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={idx} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-2 py-1">
                        <input
                          className={`${fieldCls} w-full`}
                          placeholder="Item name"
                          value={item.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLineItemValue(idx, 'name', val);
                            if (!lineItems[idx].description) {
                              setLineItemValue(idx, 'description', val);
                            }
                          }}
                        />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className={`${fieldCls} w-full`}
                      value={item.description}
                      onChange={(e) => setLineItemValue(idx, 'description', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
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
                          form.discount
                        );
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">
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
                          form.discount
                        );
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">
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
                          form.discount
                        );
                      }}
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-semibold">
                    ${item.line_total.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setLineItems((prev) => prev.filter((_, i) => i !== idx));
                        const next = lineItems.filter((_, i) => i !== idx);
                        recalcTotals(next.length ? next : [emptyLine], form.discount);
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
                  <td colSpan={7} className="text-center text-slate-500 py-3">
                    No items. Add a line to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-6 text-sm mt-2">
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold">${form.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Discount</span>
            <span className="font-semibold">${Number(form.discount || 0).toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold">${form.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseEditor;
