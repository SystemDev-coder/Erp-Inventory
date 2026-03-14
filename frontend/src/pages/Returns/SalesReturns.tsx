import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { returnsService, ReturnItemOption } from '../../services/returns.service';
import { customerService, Customer } from '../../services/customer.service';
import { accountService, Account } from '../../services/account.service';

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const tableHeadCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const tableCellCls = 'px-3 py-2 text-sm text-slate-800 dark:text-slate-200';

const fmtCurrency = (n: number) => `$${Number(n || 0).toFixed(2)}`;

type ReturnLine = {
  itemId: number | '';
  quantity: number;
  unitPrice: number;
};

const defaultLine = (): ReturnLine => ({ itemId: '', quantity: 1, unitPrice: 0 });

const SalesReturns = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams();
  const editingId = useMemo(() => {
    const parsed = Number(id);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [id]);
  const isEditing = Boolean(editingId);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    referenceNo: '',
    note: '',
    customerId: '',
    refundAccId: '',
    refundAmount: 0,
  });
  const [lines, setLines] = useState<ReturnLine[]>([defaultLine()]);
  const [items, setItems] = useState<ReturnItemOption[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0),
    [lines]
  );
  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.customer_id) === String(form.customerId)),
    [customers, form.customerId]
  );
  const customerOutstanding = useMemo(() => {
    const raw = (selectedCustomer as any)?.balance ?? (selectedCustomer as any)?.remaining_balance ?? 0;
    return Number(raw || 0);
  }, [selectedCustomer]);
  const minRefund = useMemo(() => Math.max(0, Number((subtotal - Math.max(customerOutstanding, 0)).toFixed(2))), [subtotal, customerOutstanding]);
  const balanceReduction = useMemo(() => Math.max(0, Number((subtotal - Number(form.refundAmount || 0)).toFixed(2))), [subtotal, form.refundAmount]);

  useEffect(() => {
    void loadCustomers();
    void loadAccounts();
  }, []);

  useEffect(() => {
    void loadReturn();
  }, [editingId]);

  useEffect(() => {
    if (!form.customerId) {
      setItems([]);
    }
  }, [form.customerId]);

  const loadCustomers = async () => {
    const res = await customerService.list();
    if (res.success && res.data?.customers) setCustomers(res.data.customers);
  };

  const loadAccounts = async () => {
    const res = await accountService.list();
    if (res.success && res.data?.accounts) setAccounts(res.data.accounts);
  };

  const loadItemsForCustomer = async (customerId?: number) => {
    if (!customerId) {
      setItems([]);
      return [];
    }
    const res = await returnsService.listSalesItemsByCustomer(customerId);
    if (res.success && res.data?.items) {
      const mapped = res.data.items.map((item) => ({
        ...item,
        item_id: Number(item.item_id),
        cost_price: Number(item.cost_price || 0),
        sell_price: Number(item.sell_price || 0),
      }));
      setItems(mapped);
      return mapped;
    }
    setItems([]);
    showToast('error', 'Sales Return', res.error || 'Failed to load customer items');
    return [];
  };

  const resetForm = () => {
    setForm({
      referenceNo: '',
      note: '',
      customerId: '',
      refundAccId: '',
      refundAmount: 0,
    });
    setLines([defaultLine()]);
    setItems([]);
  };

  const loadReturn = async () => {
    if (!editingId) {
      resetForm();
      return;
    }
    setLoading(true);
    const res = await returnsService.getSalesReturn(editingId);
    if (res.success && res.data?.return) {
      const row = res.data.return;
      const customerId = row.customer_id ? String(row.customer_id) : '';
      setForm({
        referenceNo: row.reference_no || '',
        note: row.note || '',
        customerId,
        refundAccId: row.refund_acc_id ? String(row.refund_acc_id) : '',
        refundAmount: Number(row.refund_amount || 0),
      });
      await loadItemsForCustomer(row.customer_id ? Number(row.customer_id) : undefined);
      const itemsRes = await returnsService.getSalesReturnItems(editingId);
      if (itemsRes.success && itemsRes.data?.items) {
        const nextLines = itemsRes.data.items.map((item) => ({
          itemId: Number(item.item_id),
          quantity: Math.round(Number(item.quantity || 0)),
          unitPrice: Number(item.unit_price || 0),
        }));
        setLines(nextLines.length ? nextLines : [defaultLine()]);
      } else {
        setLines([defaultLine()]);
      }
    } else {
      showToast('error', 'Sales Return', res.error || 'Failed to load return');
      navigate('/returns');
    }
    setLoading(false);
  };

  const handleCustomerChange = async (customerId: string) => {
    setForm((prev) => ({ ...prev, customerId }));
    setLines([defaultLine()]);
    await loadItemsForCustomer(customerId ? Number(customerId) : undefined);
  };

  const setLineValue = (index: number, patch: Partial<ReturnLine>) => {
    setLines((prev) => {
      const next = [...prev];
      const merged = { ...next[index], ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'quantity')) {
        const selected = items.find((item) => Number(item.item_id) === Number(merged.itemId));
        const maxQty = selected?.available_qty ? Number(selected.available_qty) : 0;
        const rawQty = Math.round(Number((merged as any).quantity || 0));
        const clamped = maxQty > 0 ? Math.min(Math.max(rawQty, 1), maxQty) : Math.max(rawQty, 1);
        merged.quantity = clamped;
      }
      next[index] = merged;
      return next;
    });
  };

  const handleSelectItem = (index: number, value: string) => {
    const itemId = value ? Number(value) : '';
    const selected = items.find((item) => Number(item.item_id) === Number(itemId));
    setLineValue(index, {
      itemId,
      unitPrice: selected ? Number(selected.sell_price || selected.cost_price || 0) : 0,
      quantity: 1,
    });
  };

  const addLine = () => setLines((prev) => [...prev, defaultLine()]);
  const removeLine = (index: number) =>
    setLines((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length ? next : [defaultLine()];
    });

  const handleReset = () => {
    if (isEditing) {
      void loadReturn();
    } else {
      resetForm();
    }
  };

  const submitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId) {
      showToast('error', 'Sales Return', 'Customer is required');
      return;
    }
    const normalized = lines
      .filter((line) => line.itemId)
      .map((line) => ({
        itemId: Number(line.itemId),
        quantity: Math.round(Number(line.quantity || 0)),
        unitPrice: Number(line.unitPrice || 0),
      }));
    if (!normalized.length || normalized.some((line) => line.quantity <= 0)) {
      showToast('error', 'Sales Return', 'Select at least one item with quantity');
      return;
    }
    const refundAmount = Number(form.refundAmount || 0);
    if (refundAmount > 0 && !form.refundAccId) {
      showToast('error', 'Sales Return', 'Select a refund account');
      return;
    }
    if (refundAmount > subtotal) {
      showToast('error', 'Sales Return', 'Refund amount cannot exceed return total');
      return;
    }
    if (refundAmount + 1e-9 < minRefund) {
      showToast('error', 'Sales Return', `Refund must be at least ${minRefund.toFixed(2)} (to avoid negative customer balance)`);
      return;
    }

    setSaving(true);
    const payload: any = {
      customerId: Number(form.customerId),
      referenceNo: form.referenceNo || undefined,
      note: form.note || undefined,
      items: normalized,
    };
    payload.refundAccId = form.refundAccId ? Number(form.refundAccId) : undefined;
    payload.refundAmount = refundAmount;
    const res = editingId
      ? await returnsService.updateSalesReturn(editingId, payload)
      : await returnsService.createSalesReturn(payload);
    setSaving(false);
    if (res.success) {
      showToast('success', 'Sales Return', editingId ? 'Return updated successfully' : 'Return recorded successfully');
      navigate('/returns');
    } else {
      showToast('error', 'Sales Return', res.error || 'Failed to save return');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? `Edit Sales Return #${editingId}` : 'New Sales Return'}
        description="Record a sales return with the same layout as sales."
        actions={(
          <button
            type="button"
            onClick={() => navigate('/returns')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back to Returns
          </button>
        )}
      />

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Return Details</p>
            <p className="text-xs text-slate-500">Add items using the table like sales.</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {isEditing ? 'Reload' : 'Clear Form'}
          </button>
        </div>
        <form onSubmit={submitReturn} className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Customer *</label>
              <select
                className={inputClass}
                value={form.customerId}
                required
                disabled={loading}
                onChange={(e) => void handleCustomerChange(e.target.value)}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Reference No</label>
              <input
                className={inputClass}
                value={form.referenceNo}
                onChange={(e) => setForm((prev) => ({ ...prev, referenceNo: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
              <span>Items</span>
              <button type="button" onClick={addLine} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700">
                <Plus className="h-3.5 w-3.5" /> Add line
              </button>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className={tableHeadCls}>Item</th>
                  <th className={`${tableHeadCls} text-right`}>Qty</th>
                  <th className={`${tableHeadCls} text-right`}>Unit Price</th>
                  <th className={`${tableHeadCls} text-right`}>Line Total</th>
                  <th className={`${tableHeadCls} text-center`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lines.map((line, idx) => (
                  <tr key={`${line.itemId}-${idx}`}>
                    <td className={tableCellCls}>
                      <div className="space-y-1">
                        <select
                          className={inputClass}
                          value={line.itemId}
                          disabled={!form.customerId}
                          onChange={(e) => handleSelectItem(idx, e.target.value)}
                        >
                          <option value="">
                            {form.customerId ? 'Select item' : 'Select customer first'}
                          </option>
                          {items.map((item) => (
                            <option key={item.item_id} value={item.item_id}>{item.name}</option>
                          ))}
                        </select>
                        {line.itemId ? (() => {
                          const it = items.find((x) => Number(x.item_id) === Number(line.itemId));
                          if (!it) return null;
                          return (
                            <div className="text-[11px] text-slate-500">
                              Sold: {Number(it.sold_qty || 0)} | Returned: {Number(it.returned_qty || 0)} | Available: {Number(it.available_qty || 0)}
                            </div>
                          );
                        })() : null}
                      </div>
                    </td>
                    <td className={`${tableCellCls} text-right`}>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className={inputClass}
                        value={line.quantity}
                        onChange={(e) => setLineValue(idx, { quantity: Math.round(Number(e.target.value || 0)) })}
                      />
                    </td>
                    <td className={`${tableCellCls} text-right`}>
                      <input
                        type="number"
                        className={`${inputClass} bg-slate-50 dark:bg-slate-800/70`}
                        value={line.unitPrice}
                        readOnly
                      />
                    </td>
                    <td className={`${tableCellCls} text-right`}>
                      {fmtCurrency(Number(line.quantity || 0) * Number(line.unitPrice || 0))}
                    </td>
                    <td className={`${tableCellCls} text-center`}>
                      <button type="button" onClick={() => removeLine(idx)} className="inline-flex items-center justify-center rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {form.customerId && items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-center text-xs text-amber-600 dark:text-amber-400">
                      This customer has no sold items available for return.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
              <p className="text-xs uppercase text-slate-500">Subtotal</p>
              <p className="text-lg font-semibold">{fmtCurrency(subtotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
              <p className="text-xs uppercase text-slate-500">Customer Outstanding</p>
              <p className="text-lg font-semibold">{fmtCurrency(customerOutstanding)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
              <p className="text-xs uppercase text-slate-500">Balance Reduction</p>
              <p className="text-lg font-semibold">{fmtCurrency(balanceReduction)}</p>
              {minRefund > 0 ? (
                <p className="mt-1 text-[11px] text-amber-600">Min refund required: {fmtCurrency(minRefund)}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={`${labelClass} font-semibold`}>Refund Account</label>
              <select
                className={inputClass}
                value={form.refundAccId}
                onChange={(e) => setForm((prev) => ({ ...prev, refundAccId: e.target.value }))}
              >
                <option value="">{minRefund > 0 ? 'Select refund account' : 'No refund'}</option>
                {accounts.filter((a) => a.is_active).map((a) => (
                  <option key={a.acc_id} value={a.acc_id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${labelClass} font-semibold`}>Refund Amount</label>
              <input
                type="number"
                min={minRefund}
                step={0.01}
                className={inputClass}
                value={form.refundAmount}
                onChange={(e) => setForm((prev) => ({ ...prev, refundAmount: Number(e.target.value) }))}
                placeholder="0.00"
              />
              {minRefund > 0 ? (
                <p className="mt-1 text-[11px] text-slate-500">Refund must be at least {fmtCurrency(minRefund)} (customer has no enough outstanding).</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Note</label>
              <input className={inputClass} value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Optional" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => navigate('/returns')} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={saving || loading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {isEditing ? 'Update Return' : 'Save Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalesReturns;
