import { useMemo, useState } from 'react';
import { RotateCcw, ShoppingBag, Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/layout';
import { Tabs } from '../../components/ui/tabs';
import { useToast } from '../../components/ui/toast/Toast';
import { returnsService, SalesReturn, PurchaseReturn, ReturnItemOption } from '../../services/returns.service';
import { customerService, Customer } from '../../services/customer.service';
import { supplierService, Supplier } from '../../services/supplier.service';
import { Modal } from '../../components/ui/modal/Modal';

const inputClass =
  'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const tableHeadCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const tableCellCls = 'px-3 py-2 text-sm text-slate-800 dark:text-slate-200';

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString(); } catch { return d; }
};
const fmtCurrency = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const resolveStatus = (value?: string | null) => (value && value.trim() ? value.toUpperCase() : 'POSTED');

const Returns = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  // --- Sales Returns state ---
  const [salesRows, setSalesRows] = useState<SalesReturn[]>([]);
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [editingSalesId, setEditingSalesId] = useState<number | null>(null);
  const [salesForm, setSalesForm] = useState({ referenceNo: '', note: '', customerId: '', itemId: '', qty: 1, unitPrice: 0 });

  // --- Purchase Returns state ---
  const [purchaseRows, setPurchaseRows] = useState<PurchaseReturn[]>([]);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null);
  const [purchaseForm, setPurchaseForm] = useState({ referenceNo: '', note: '', supplierId: '', itemId: '', qty: 1, unitCost: 0 });

  // --- Shared items list ---
  const [items, setItems] = useState<ReturnItemOption[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const loadItems = async () => {
    const res = await returnsService.listItems();
    if (res.success && res.data?.items) setItems(res.data.items);
    else showToast('error', 'Returns', res.error || 'Failed to load return items');
  };

  const loadSalesReturns = async () => {
    setLoading(true);
    const res = await returnsService.listSalesReturns();
    setLoading(false);
    if (res.success && res.data?.rows) {
      setSalesRows(res.data.rows);
    } else {
      showToast('error', 'Sales Returns', res.error || 'Failed to load sales returns');
    }
  };

  const loadPurchaseReturns = async () => {
    setLoading(true);
    const res = await returnsService.listPurchaseReturns();
    setLoading(false);
    if (res.success && res.data?.rows) {
      setPurchaseRows(res.data.rows);
    } else {
      showToast('error', 'Purchase Returns', res.error || 'Failed to load purchase returns');
    }
  };

  const openSalesModal = async () => {
    await Promise.all([loadItems(), loadCustomers()]);
    setEditingSalesId(null);
    setSalesForm({ referenceNo: '', note: '', customerId: '', itemId: '', qty: 1, unitPrice: 0 });
    setSalesModalOpen(true);
  };

  const openPurchaseModal = async () => {
    await Promise.all([loadItems(), loadSuppliers()]);
    setEditingPurchaseId(null);
    setPurchaseForm({ referenceNo: '', note: '', supplierId: '', itemId: '', qty: 1, unitCost: 0 });
    setPurchaseModalOpen(true);
  };

  const openEditSalesModal = async (row: SalesReturn) => {
    await Promise.all([loadItems(), loadCustomers()]);
    setEditingSalesId(row.sr_id);
    setSalesForm({
      referenceNo: row.reference_no || '',
      note: row.note || '',
      customerId: row.customer_id ? String(row.customer_id) : '',
      itemId: '',
      qty: 1,
      unitPrice: 0,
    });
    setSalesModalOpen(true);
  };

  const openEditPurchaseModal = async (row: PurchaseReturn) => {
    await Promise.all([loadItems(), loadSuppliers()]);
    setEditingPurchaseId(row.pr_id);
    setPurchaseForm({
      referenceNo: row.reference_no || '',
      note: row.note || '',
      supplierId: row.supplier_id ? String(row.supplier_id) : '',
      itemId: '',
      qty: 1,
      unitCost: 0,
    });
    setPurchaseModalOpen(true);
  };

  const loadCustomers = async () => {
    const res = await customerService.list();
    if (res.success && res.data?.customers) setCustomers(res.data.customers);
  };

  const loadSuppliers = async () => {
    const res = await supplierService.list();
    if (res.success && res.data?.suppliers) setSuppliers(res.data.suppliers);
  };

  const submitSalesReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salesForm.customerId || !salesForm.itemId || salesForm.qty <= 0) {
      showToast('error', 'Sales Return', 'Customer, item and quantity are required');
      return;
    }
    setLoading(true);
    const payload = {
      customerId: Number(salesForm.customerId),
      referenceNo: salesForm.referenceNo || undefined,
      note: salesForm.note || undefined,
      items: [{ itemId: Number(salesForm.itemId), quantity: salesForm.qty, unitPrice: salesForm.unitPrice }],
    };
    const res = editingSalesId
      ? await returnsService.updateSalesReturn(editingSalesId, payload)
      : await returnsService.createSalesReturn(payload);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Sales Return', editingSalesId ? 'Return updated successfully' : 'Return recorded successfully');
      setSalesModalOpen(false);
      setEditingSalesId(null);
      await loadSalesReturns();
    } else {
      showToast('error', 'Sales Return', res.error || 'Failed to create return');
    }
  };

  const submitPurchaseReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseForm.supplierId || !purchaseForm.itemId || purchaseForm.qty <= 0) {
      showToast('error', 'Purchase Return', 'Supplier, item and quantity are required');
      return;
    }
    setLoading(true);
    const payload = {
      supplierId: Number(purchaseForm.supplierId),
      referenceNo: purchaseForm.referenceNo || undefined,
      note: purchaseForm.note || undefined,
      items: [{ itemId: Number(purchaseForm.itemId), quantity: purchaseForm.qty, unitCost: purchaseForm.unitCost }],
    };
    const res = editingPurchaseId
      ? await returnsService.updatePurchaseReturn(editingPurchaseId, payload)
      : await returnsService.createPurchaseReturn(payload);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Purchase Return', editingPurchaseId ? 'Return updated successfully' : 'Return recorded successfully');
      setPurchaseModalOpen(false);
      setEditingPurchaseId(null);
      await loadPurchaseReturns();
    } else {
      showToast('error', 'Purchase Return', res.error || 'Failed to create return');
    }
  };

  const removeSalesReturn = async (id: number) => {
    if (!window.confirm('Delete this sales return?')) return;
    setLoading(true);
    const res = await returnsService.deleteSalesReturn(id);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Sales Return', 'Deleted successfully');
      await loadSalesReturns();
    } else {
      showToast('error', 'Sales Return', res.error || 'Failed to delete return');
    }
  };

  const removePurchaseReturn = async (id: number) => {
    if (!window.confirm('Delete this purchase return?')) return;
    setLoading(true);
    const res = await returnsService.deletePurchaseReturn(id);
    setLoading(false);
    if (res.success) {
      showToast('success', 'Purchase Return', 'Deleted successfully');
      await loadPurchaseReturns();
    } else {
      showToast('error', 'Purchase Return', res.error || 'Failed to delete return');
    }
  };

  const salesItemsById = useMemo(() => {
    const m: Record<number, string> = {};
    items.forEach((i) => { m[i.item_id] = i.name; });
    return m;
  }, [items]);

  const tabs = [
    {
      id: 'sales-return',
      label: 'Sales Return',
      icon: RotateCcw,
      badge: salesRows.length,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void loadSalesReturns()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Display
            </button>
            <button
              type="button"
              onClick={() => void openSalesModal()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" /> Add Return
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" /></div>
            ) : salesRows.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No sales returns found.</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className={tableHeadCls}>#</th>
                    <th className={tableHeadCls}>Date</th>
                    <th className={tableHeadCls}>Reference</th>
                    <th className={tableHeadCls}>Customer</th>
                    <th className={tableHeadCls}>Total</th>
                    <th className={tableHeadCls}>Status</th>
                    <th className={tableHeadCls}>Note</th>
                    <th className={tableHeadCls}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {salesRows.map((row) => (
                    <tr key={row.sr_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className={tableCellCls}>{row.sr_id}</td>
                      <td className={tableCellCls}>{fmtDate(row.return_date)}</td>
                      <td className={tableCellCls}>{row.reference_no || '-'}</td>
                      <td className={tableCellCls}>{row.customer_name || '-'}</td>
                      <td className={tableCellCls}>{fmtCurrency(row.total)}</td>
                      <td className={tableCellCls}>
                        {(() => {
                          const status = resolveStatus((row as any).status);
                          const isPosted = status === 'POSTED';
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPosted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {status}
                            </span>
                          );
                        })()}
                      </td>
                      <td className={tableCellCls}>{row.note || '-'}</td>
                      <td className={tableCellCls}>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => void openEditSalesModal(row)} className="rounded border px-2 py-1 text-xs">Edit</button>
                          <button type="button" onClick={() => void removeSalesReturn(row.sr_id)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'purchase-return',
      label: 'Supplier Return',
      icon: ShoppingBag,
      badge: purchaseRows.length,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void loadPurchaseReturns()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Display
            </button>
            <button
              type="button"
              onClick={() => void openPurchaseModal()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" /> Add Return
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" /></div>
            ) : purchaseRows.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">No supplier returns found.</div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className={tableHeadCls}>#</th>
                    <th className={tableHeadCls}>Date</th>
                    <th className={tableHeadCls}>Reference</th>
                    <th className={tableHeadCls}>Supplier</th>
                    <th className={tableHeadCls}>Total</th>
                    <th className={tableHeadCls}>Status</th>
                    <th className={tableHeadCls}>Note</th>
                    <th className={tableHeadCls}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {purchaseRows.map((row) => (
                    <tr key={row.pr_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className={tableCellCls}>{row.pr_id}</td>
                      <td className={tableCellCls}>{fmtDate(row.return_date)}</td>
                      <td className={tableCellCls}>{row.reference_no || '-'}</td>
                      <td className={tableCellCls}>{row.supplier_name || '-'}</td>
                      <td className={tableCellCls}>{fmtCurrency(row.total)}</td>
                      <td className={tableCellCls}>
                        {(() => {
                          const status = resolveStatus((row as any).status);
                          const isPosted = status === 'POSTED';
                          return (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isPosted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {status}
                            </span>
                          );
                        })()}
                      </td>
                      <td className={tableCellCls}>{row.note || '-'}</td>
                      <td className={tableCellCls}>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => void openEditPurchaseModal(row)} className="rounded border px-2 py-1 text-xs">Edit</button>
                          <button type="button" onClick={() => void removePurchaseReturn(row.pr_id)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-600">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Returns" description="Manage sales returns and purchase/supplier returns." />
      <Tabs tabs={tabs} defaultTab="sales-return" />

      {/* Sales Return Modal */}
      <Modal isOpen={salesModalOpen} onClose={() => setSalesModalOpen(false)} title={editingSalesId ? 'Edit Sales Return' : 'New Sales Return'} size="md">
        <form onSubmit={(e) => void submitSalesReturn(e)} className="space-y-3">
          <div>
            <label className={labelClass}>Customer *</label>
            <select className={inputClass} value={salesForm.customerId} required onChange={(e) => setSalesForm((p) => ({ ...p, customerId: e.target.value }))}>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Item *</label>
            <select className={inputClass} value={salesForm.itemId} required onChange={(e) => {
              const id = e.target.value;
              const sel = items.find((i) => i.item_id === Number(id));
              setSalesForm((p) => ({ ...p, itemId: id, unitPrice: sel ? Number(sel.sell_price || 0) : 0 }));
            }}>
              <option value="">Select item</option>
              {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Qty *</label>
              <input type="number" min={0.001} step={0.001} className={inputClass} value={salesForm.qty} onChange={(e) => setSalesForm((p) => ({ ...p, qty: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={labelClass}>Unit Price</label>
              <input type="number" min={0} step={0.01} className={inputClass} value={salesForm.unitPrice} onChange={(e) => setSalesForm((p) => ({ ...p, unitPrice: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Reference No</label>
            <input className={inputClass} value={salesForm.referenceNo} onChange={(e) => setSalesForm((p) => ({ ...p, referenceNo: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className={labelClass}>Note</label>
            <input className={inputClass} value={salesForm.note} onChange={(e) => setSalesForm((p) => ({ ...p, note: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setSalesModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">{editingSalesId ? 'Update Return' : 'Save Return'}</button>
          </div>
        </form>
      </Modal>

      {/* Purchase Return Modal */}
      <Modal isOpen={purchaseModalOpen} onClose={() => setPurchaseModalOpen(false)} title={editingPurchaseId ? 'Edit Purchase Return' : 'New Purchase Return'} size="md">
        <form onSubmit={(e) => void submitPurchaseReturn(e)} className="space-y-3">
          <div>
            <label className={labelClass}>Supplier *</label>
            <select className={inputClass} value={purchaseForm.supplierId} required onChange={(e) => setPurchaseForm((p) => ({ ...p, supplierId: e.target.value }))}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Item *</label>
            <select className={inputClass} value={purchaseForm.itemId} required onChange={(e) => {
              const id = e.target.value;
              const sel = items.find((i) => i.item_id === Number(id));
              setPurchaseForm((p) => ({ ...p, itemId: id, unitCost: sel ? Number(sel.cost_price || 0) : 0 }));
            }}>
              <option value="">Select item</option>
              {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Qty *</label>
              <input type="number" min={0.001} step={0.001} className={inputClass} value={purchaseForm.qty} onChange={(e) => setPurchaseForm((p) => ({ ...p, qty: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={labelClass}>Unit Cost</label>
              <input type="number" min={0} step={0.01} className={inputClass} value={purchaseForm.unitCost} onChange={(e) => setPurchaseForm((p) => ({ ...p, unitCost: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Reference No</label>
            <input className={inputClass} value={purchaseForm.referenceNo} onChange={(e) => setPurchaseForm((p) => ({ ...p, referenceNo: e.target.value }))} placeholder="Optional" />
          </div>
          <div>
            <label className={labelClass}>Note</label>
            <input className={inputClass} value={purchaseForm.note} onChange={(e) => setPurchaseForm((p) => ({ ...p, note: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPurchaseModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">{editingPurchaseId ? 'Update Return' : 'Save Return'}</button>
          </div>
        </form>
      </Modal>

      {/* Suppress unused variable warning: salesItemsById used for future line-item expansion */}
      {salesItemsById && null}
    </div>
  );
};

export default Returns;
