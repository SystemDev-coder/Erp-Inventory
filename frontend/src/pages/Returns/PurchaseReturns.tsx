import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../../components/ui/layout';
import { useToast } from '../../components/ui/toast/Toast';
import { returnsService, ReturnItemOption } from '../../services/returns.service';
import { supplierService, Supplier } from '../../services/supplier.service';
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
  unitCost: number;
};

const defaultLine = (): ReturnLine => ({ itemId: '', quantity: 1, unitCost: 0 });

const PurchaseReturns = () => {
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
    supplierId: '',
    refundAccId: '',
    refundAmount: 0,
  });
  const [lines, setLines] = useState<ReturnLine[]>([defaultLine()]);
  const [items, setItems] = useState<ReturnItemOption[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0),
    [lines]
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => String(s.supplier_id) === String(form.supplierId)),
    [suppliers, form.supplierId]
  );
  const supplierOutstanding = useMemo(() => Number((selectedSupplier as any)?.remaining_balance || 0), [selectedSupplier]);
  const minRefund = useMemo(() => Math.max(0, Number((subtotal - Math.max(supplierOutstanding, 0)).toFixed(2))), [subtotal, supplierOutstanding]);
  const payableReduction = useMemo(() => Math.max(0, Number((subtotal - Number(form.refundAmount || 0)).toFixed(2))), [subtotal, form.refundAmount]);

  useEffect(() => {
    void loadSuppliers();
    void loadAccounts();
  }, []);

  useEffect(() => {
    void loadReturn();
  }, [editingId]);

  useEffect(() => {
    if (!form.supplierId) {
      setItems([]);
    }
  }, [form.supplierId]);

  const loadSuppliers = async () => {
    const res = await supplierService.list();
    if (res.success && res.data?.suppliers) setSuppliers(res.data.suppliers);
  };

  const loadAccounts = async () => {
    const res = await accountService.list();
    if (res.success && res.data?.accounts) setAccounts(res.data.accounts);
  };

  const loadItemsForSupplier = async (supplierId?: number) => {
    if (!supplierId) {
      setItems([]);
      return [];
    }
    const res = await returnsService.listPurchaseItemsBySupplier(supplierId);
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
    showToast('error', 'Purchase Return', res.error || 'Failed to load supplier items');
    return [];
  };

  const resetForm = () => {
    setForm({
      referenceNo: '',
      note: '',
      supplierId: '',
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
    const res = await returnsService.getPurchaseReturn(editingId);
    if (res.success && res.data?.return) {
      const row = res.data.return;
      const supplierId = row.supplier_id ? String(row.supplier_id) : '';
      setForm({
        referenceNo: row.reference_no || '',
        note: row.note || '',
        supplierId,
        refundAccId: row.refund_acc_id ? String(row.refund_acc_id) : '',
        refundAmount: Number(row.refund_amount || 0),
      });
      await loadItemsForSupplier(row.supplier_id ? Number(row.supplier_id) : undefined);
      const itemsRes = await returnsService.getPurchaseReturnItems(editingId);
      if (itemsRes.success && itemsRes.data?.items) {
        const nextLines = itemsRes.data.items.map((item) => ({
          itemId: Number(item.item_id),
          quantity: Math.round(Number(item.quantity || 0)),
          unitCost: Number(item.unit_cost || 0),
        }));
        setLines(nextLines.length ? nextLines : [defaultLine()]);
      } else {
        setLines([defaultLine()]);
      }
    } else {
      showToast('error', 'Purchase Return', res.error || 'Failed to load return');
      navigate('/returns');
    }
    setLoading(false);
  };

  const handleSupplierChange = async (supplierId: string) => {
    setForm((prev) => ({ ...prev, supplierId }));
    setLines([defaultLine()]);
    await loadItemsForSupplier(supplierId ? Number(supplierId) : undefined);
  };

  const setLineValue = (index: number, patch: Partial<ReturnLine>) => {
    setLines((prev) => {
      const next = [...prev];
      const merged = { ...next[index], ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'quantity')) {
        const selected = items.find((item) => Number(item.item_id) === Number(merged.itemId));
        const maxQty = selected?.available_qty !== undefined ? Number(selected.available_qty || 0) : null;
        const rawQty = Math.round(Number((merged as any).quantity || 0));
        merged.quantity = maxQty === null ? Math.max(rawQty, 1) : Math.max(Math.min(rawQty, maxQty), 0);
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
      unitCost: selected ? Number(selected.cost_price || 0) : 0,
      quantity: selected && Number(selected.available_qty || 0) > 0 ? 1 : 0,
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
    if (!form.supplierId) {
      showToast('error', 'Purchase Return', 'Supplier is required');
      return;
    }
    const normalized = lines
      .filter((line) => line.itemId)
      .map((line) => ({
        itemId: Number(line.itemId),
        quantity: Math.round(Number(line.quantity || 0)),
        unitCost: Number(line.unitCost || 0),
      }));
    if (!normalized.length || normalized.some((line) => line.quantity <= 0)) {
      showToast('error', 'Purchase Return', 'Select at least one item with quantity');
      return;
    }
    const unavailable = normalized.find((line) => {
      const selected = items.find((it) => Number(it.item_id) === Number(line.itemId));
      const maxQty = selected?.available_qty !== undefined ? Number(selected.available_qty || 0) : null;
      return maxQty !== null && line.quantity > maxQty;
    });
    if (unavailable) {
      const selected = items.find((it) => Number(it.item_id) === Number(unavailable.itemId));
      const maxQty = selected?.available_qty !== undefined ? Number(selected.available_qty || 0) : 0;
      showToast('error', 'Purchase Return', `Return qty exceeds available stock (${maxQty}) for ${selected?.name || `item ${unavailable.itemId}`}`);
      return;
    }
    const refundAmount = Number(form.refundAmount || 0);
    if (refundAmount > 0 && !form.refundAccId) {
      showToast('error', 'Purchase Return', 'Select a refund account');
      return;
    }
    if (refundAmount > subtotal) {
      showToast('error', 'Purchase Return', 'Refund amount cannot exceed return total');
      return;
    }
    if (refundAmount + 1e-9 < minRefund) {
      showToast('error', 'Purchase Return', `Refund must be at least ${minRefund.toFixed(2)} (to avoid negative supplier balance)`);
      return;
    }

    setSaving(true);
    const payload: any = {
      supplierId: Number(form.supplierId),
      referenceNo: form.referenceNo || undefined,
      note: form.note || undefined,
      items: normalized,
    };
    payload.refundAccId = form.refundAccId ? Number(form.refundAccId) : undefined;
    payload.refundAmount = refundAmount;
    const res = editingId
      ? await returnsService.updatePurchaseReturn(editingId, payload)
      : await returnsService.createPurchaseReturn(payload);
    setSaving(false);
    if (res.success) {
      showToast('success', 'Purchase Return', editingId ? 'Return updated successfully' : 'Return recorded successfully');
      navigate('/returns');
    } else {
      showToast('error', 'Purchase Return', res.error || 'Failed to save return');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? `Edit Purchase Return #${editingId}` : 'New Purchase Return'}
        description="Record a supplier return with the same layout as purchases."
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
            <p className="text-xs text-slate-500">Add items using the table like purchases.</p>
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
              <label className={labelClass}>Supplier *</label>
              <select
                className={inputClass}
                value={form.supplierId}
                required
                disabled={loading}
                onChange={(e) => void handleSupplierChange(e.target.value)}
              >
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
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
                  <th className={`${tableHeadCls} text-right`}>Unit Cost</th>
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
                          disabled={!form.supplierId}
                          onChange={(e) => handleSelectItem(idx, e.target.value)}
                        >
                          <option value="">
                            {form.supplierId ? 'Select item' : 'Select supplier first'}
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
                              Purchased: {Number(it.sold_qty || 0)} | Returned: {Number(it.returned_qty || 0)} | On hand: {Number(it.on_hand_qty || 0)} | Available: {Number(it.available_qty || 0)}
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
                        value={line.unitCost}
                        readOnly
                      />
                    </td>
                    <td className={`${tableCellCls} text-right`}>
                      {fmtCurrency(Number(line.quantity || 0) * Number(line.unitCost || 0))}
                    </td>
                    <td className={`${tableCellCls} text-center`}>
                      <button type="button" onClick={() => removeLine(idx)} className="inline-flex items-center justify-center rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {form.supplierId && items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-center text-xs text-amber-600 dark:text-amber-400">
                      This supplier has no purchased items available for return.
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
              <p className="text-xs uppercase text-slate-500">Supplier Payable</p>
              <p className="text-lg font-semibold">{fmtCurrency(supplierOutstanding)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
              <p className="text-xs uppercase text-slate-500">Payable Reduction</p>
              <p className="text-lg font-semibold">{fmtCurrency(payableReduction)}</p>
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
                <p className="mt-1 text-[11px] text-slate-500">Refund must be at least {fmtCurrency(minRefund)} (supplier payable not enough).</p>
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

export default PurchaseReturns;
