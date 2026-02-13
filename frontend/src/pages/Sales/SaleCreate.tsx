import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { salesService, Sale } from '../../services/sales.service';
import { accountService, Account } from '../../services/account.service';
import { customerService, Customer } from '../../services/customer.service';
import { productService, Product } from '../../services/product.service';
import { Plus, ArrowLeft } from 'lucide-react';

const SaleCreate = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saleForm, setSaleForm] = useState({
    customer_id: '' as number | '',
    sale_type: 'cash' as 'cash' | 'credit',
    status: 'paid' as Sale['status'],
    sale_date: new Date().toISOString().slice(0, 10),
    subtotal: 0,
    discount: 0,
    total: 0,
    acc_id: '' as number | '',
    paid_amount: 0,
    note: '',
    items: [{ product_id: '' as number | '', quantity: 1, unit_price: 0 }],
  });

  useEffect(() => {
    const loadLookups = async () => {
      const [cRes, aRes, pRes] = await Promise.all([
        customerService.list(),
        accountService.list(),
        productService.list(),
      ]);
      if (cRes.success && cRes.data?.customers) setCustomers(cRes.data.customers);
      if (aRes.success && aRes.data?.accounts) setAccounts(aRes.data.accounts);
      if (pRes.success && pRes.data?.products) setProducts(pRes.data.products);
    };
    loadLookups();
  }, []);

  const recalcTotals = (items: typeof saleForm.items, headerDiscount: number) => {
    const subtotal = items.reduce(
      (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
      0,
    );
    const total = Math.max(0, subtotal - Number(headerDiscount || 0));
    setSaleForm(prev => ({
      ...prev,
      subtotal: Number(subtotal.toFixed(2)),
      total: Number(total.toFixed(2)),
    }));
  };

  const handleSaveSale = async () => {
    if (!saleForm.items.length || !saleForm.items.some(it => it.product_id && it.quantity > 0)) {
      showToast('error', 'Sale', 'Select at least one item');
      return;
    }
    if (!saleForm.acc_id && saleForm.sale_type === 'cash' && saleForm.status !== 'void') {
      showToast('error', 'Sale', 'Select account to receive cash');
      return;
    }

    const payload = {
      customerId: saleForm.customer_id || undefined,
      saleDate: saleForm.sale_date,
      subtotal: Number(saleForm.subtotal),
      discount: Number(saleForm.discount),
      total: Number(saleForm.total),
      saleType: saleForm.sale_type,
      status: saleForm.status,
      note: saleForm.note || undefined,
      items: saleForm.items
        .filter(it => it.product_id && it.quantity > 0)
        .map(it => ({
          productId: Number(it.product_id),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unit_price),
        })),
      payFromAccId: saleForm.status === 'void' || !saleForm.acc_id ? undefined : Number(saleForm.acc_id),
      paidAmount:
        saleForm.status === 'void'
          ? undefined
          : Number(saleForm.paid_amount || (saleForm.sale_type === 'cash' ? saleForm.total : 0)),
    };

    setLoading(true);
    const res = await salesService.create(payload);
    setLoading(false);
    if (res.success && res.data?.sale) {
      showToast('success', 'Sale', 'Sale recorded');
      navigate('/sales');
    } else {
      showToast('error', 'Sale', res.error || 'Save failed');
    }
  };

  return (
    <div>
      <PageHeader
        title="New Sale"
        description="Create a new sale transaction"
        actions={
          <button
            onClick={() => navigate('/sales')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        }
      />

      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Customer
            <select
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={saleForm.customer_id}
              onChange={e =>
                setSaleForm(prev => ({
                  ...prev,
                  customer_id: e.target.value ? Number(e.target.value) : '',
                }))
              }
            >
              <option value="">Walking Customer</option>
              {customers.map(c => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Date
            <input
              type="date"
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={saleForm.sale_date}
              onChange={e => setSaleForm(prev => ({ ...prev, sale_date: e.target.value }))}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Sale Type
            <select
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={saleForm.sale_type}
              onChange={e =>
                setSaleForm(prev => ({
                  ...prev,
                  sale_type: e.target.value as 'cash' | 'credit',
                }))
              }
            >
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
            Status
            <select
              className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={saleForm.status}
              onChange={e =>
                setSaleForm(prev => ({
                  ...prev,
                  status: e.target.value as Sale['status'],
                }))
              }
            >
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
              <option value="void">Void</option>
            </select>
          </label>
          {saleForm.sale_type === 'cash' && saleForm.status !== 'void' && (
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
              Receive To Account
              <select
                className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                value={saleForm.acc_id}
                onChange={e =>
                  setSaleForm(prev => ({
                    ...prev,
                    acc_id: e.target.value ? Number(e.target.value) : '',
                  }))
                }
              >
                <option value="">Select account</option>
                {accounts.map(a => (
                  <option key={a.acc_id} value={a.acc_id}>
                    {a.name} ({a.institution})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 dark:text-slate-200">Items</span>
            <button
              type="button"
              onClick={() =>
                setSaleForm(prev => ({
                  ...prev,
                  items: [...prev.items, { product_name: '', quantity: 1, unit_price: 0 }],
                }))
              }
              className="inline-flex items-center gap-1 text-sm px-3 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              <Plus size={16} /> Add line
            </button>
          </div>

          <div className="space-y-2">
            {saleForm.items.map((it, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center"
              >
                <select
                  className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sm"
                  value={it.product_id}
                  onChange={e => {
                    const pid = e.target.value ? Number(e.target.value) : '';
                    const product = products.find(p => p.product_id === pid);
                    const next = [...saleForm.items];
                    next[idx] = {
                      ...next[idx],
                      product_id: pid,
                      unit_price: product ? product.price ?? 0 : next[idx].unit_price,
                    };
                    setSaleForm(prev => ({ ...prev, items: next }));
                    recalcTotals(next, saleForm.discount);
                  }}
                >
                  <option value="">Select item</option>
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} ({p.sku || 'no sku'})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sm text-right"
                  value={it.quantity}
                  min={0}
                  onChange={e => {
                    const v = Number(e.target.value || 0);
                    const next = [...saleForm.items];
                    next[idx] = { ...next[idx], quantity: v };
                    setSaleForm(prev => ({ ...prev, items: next }));
                    recalcTotals(next, saleForm.discount);
                  }}
                />
                <input
                  type="number"
                  className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sm text-right"
                  value={it.unit_price}
                  min={0}
                  onChange={e => {
                    const v = Number(e.target.value || 0);
                    const next = [...saleForm.items];
                    next[idx] = { ...next[idx], unit_price: v };
                    setSaleForm(prev => ({ ...prev, items: next }));
                    recalcTotals(next, saleForm.discount);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = saleForm.items.filter((_, i) => i !== idx);
                    setSaleForm(prev => ({ ...prev, items: next }));
                    recalcTotals(next, saleForm.discount);
                  }}
                  className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-red-500 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-6 text-sm mt-2">
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Subtotal</span>
            <span className="font-semibold">${saleForm.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Discount</span>
            <input
              type="number"
              className="mt-1 rounded-lg border px-3 py-1 text-sm text-right bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              value={saleForm.discount}
              min={0}
              onChange={e => {
                const v = Number(e.target.value || 0);
                const next = { ...saleForm, discount: v };
                setSaleForm(next);
                recalcTotals(next.items, v);
              }}
            />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold">${saleForm.total.toFixed(2)}</span>
          </div>
        </div>

        {saleForm.status === 'partial' && saleForm.status !== 'void' && (
          <div className="flex justify-end">
            <label className="flex flex-col text-sm font-medium gap-1 text-slate-800 dark:text-slate-200">
              Amount Paid Now
              <input
                type="number"
                className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sm text-right"
                value={saleForm.paid_amount}
                min={0}
                max={saleForm.total}
                onChange={e =>
                  setSaleForm(prev => ({
                    ...prev,
                    paid_amount: Number(e.target.value || 0),
                  }))
                }
              />
            </label>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className="px-6 py-2.5 font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveSale}
            disabled={loading}
            className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-all shadow-md shadow-primary-500/20 active:scale-95"
          >
            {loading ? 'Saving...' : 'Save Sale'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaleCreate;
