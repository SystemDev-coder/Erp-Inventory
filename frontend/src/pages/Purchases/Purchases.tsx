import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ShoppingBag, Plus, Users, Receipt as ReceiptIcon } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import { purchaseService, Purchase } from '../../services/purchase.service';
import { supplierService, Supplier } from '../../services/supplier.service';
import { receiptService, Receipt } from '../../services/receipt.service';

const debounce = (fn: (...args: any[]) => void, wait = 300) => {
  let t: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => { if (t) clearTimeout(t); t = null; };
  return wrapped as typeof fn & { cancel: () => void };
};

type PurchaseForm = {
  purchase_id?: number;
  supplier_id: number | '';
  purchase_date: string;
  purchase_type: 'cash' | 'credit';
  subtotal: number;
  discount: number;
  total: number;
  status: 'received' | 'partial' | 'unpaid' | 'void';
  note?: string;
};

const emptyForm: PurchaseForm = {
  supplier_id: '',
  purchase_date: new Date().toISOString().slice(0, 10),
  purchase_type: 'cash',
  subtotal: 0,
  discount: 0,
  total: 0,
  status: 'received',
  note: '',
};

const Purchases = () => {
  const { showToast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<PurchaseForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState<Supplier>({
    supplier_id: 0,
    supplier_name: '',
    contact_person: '',
    phone: '',
    email: '',
    is_active: true,
  } as Supplier);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState<{
    charge_id?: number;
    customer_id?: number;
    acc_id?: number;
    amount?: number;
    reference_no?: string;
    note?: string;
    receipt_id?: number;
  }>({});

  const fetchData = async (term?: string) => {
    setLoading(true);
    const [pRes, sRes, rRes] = await Promise.all([
      purchaseService.list(term),
      supplierService.list(),
      receiptService.list(),
    ]);
    if (pRes.success && pRes.data?.purchases) {
      setPurchases(pRes.data.purchases);
    } else {
      showToast('error', 'Load failed', pRes.error || 'Could not load purchases');
    }
    if (sRes.success && sRes.data?.suppliers) {
      setSuppliers(sRes.data.suppliers);
    }
    if (rRes.success && rRes.data?.receipts) {
      setReceipts(rRes.data.receipts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const debouncedSearch = useMemo(
    () =>
      debounce((term: string) => {
        fetchData(term);
      }, 300),
    []
  );

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const columns: ColumnDef<Purchase>[] = useMemo(() => [
    {
      accessorKey: 'purchase_date',
      header: 'Date',
      cell: ({ row }) => new Date(row.original.purchase_date).toLocaleDateString(),
    },
    {
      accessorKey: 'supplier_name',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name || '—',
    },
    {
      accessorKey: 'purchase_type',
      header: 'Type',
      cell: ({ row }) => row.original.purchase_type === 'cash' ? 'Cash' : 'Credit',
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => `$${Number(row.original.total || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          color={
            row.original.status === 'received' ? 'success' :
            row.original.status === 'partial' ? 'warning' :
            row.original.status === 'unpaid' ? 'error' : 'secondary'
          }
          variant="light"
        >
          {row.original.status}
        </Badge>
      ),
    },
    { accessorKey: 'note', header: 'Note' },
  ], []);

  const recalcTotal = (nextSubtotal: number, nextDiscount: number) =>
    Math.max(0, Number(nextSubtotal) - Number(nextDiscount));

  const handleSave = async () => {
    if (!form.supplier_id) {
      showToast('error', 'Missing supplier', 'Choose a supplier');
      return;
    }
    setLoading(true);
    const payload = {
      supplierId: form.supplier_id,
      purchaseDate: form.purchase_date,
      purchaseType: form.purchase_type,
      subtotal: Number(form.subtotal),
      discount: Number(form.discount),
      total: Number(form.total),
      status: form.status,
      note: form.note,
    };
    const res = form.purchase_id
      ? await purchaseService.update(form.purchase_id, payload)
      : await purchaseService.create(payload);

    if (res.success) {
      showToast('success', 'Saved', form.purchase_id ? 'Purchase updated' : 'Purchase created');
      setIsModalOpen(false);
      setForm(emptyForm);
      fetchData(search);
    } else {
      showToast('error', 'Save failed', res.error || 'Check the form');
    }
    setLoading(false);
  };

  const onEdit = (row: Purchase) => {
    setForm({
      purchase_id: row.purchase_id,
      supplier_id: row.supplier_id,
      purchase_date: row.purchase_date.slice(0, 10),
      purchase_type: row.purchase_type as 'cash' | 'credit',
      subtotal: Number(row.subtotal || 0),
      discount: Number(row.discount || 0),
      total: Number(row.total || 0),
      status: row.status as PurchaseForm['status'],
      note: row.note || '',
    });
    setIsModalOpen(true);
  };

  const onDelete = (row: Purchase) => {
    setPurchaseToDelete(row);
    setDeleteOpen(true);
  };

  const saveSupplier = async () => {
    if (!supplierForm.supplier_name) {
      showToast('error', 'Name required', 'Enter supplier name');
      return;
    }
    setLoading(true);
    const res = supplierForm.supplier_id
      ? await supplierService.update(supplierForm.supplier_id, supplierForm)
      : await supplierService.create(supplierForm);
    if (res.success) {
      showToast('success', 'Supplier saved');
      setSupplierModalOpen(false);
      setSupplierForm({
        supplier_id: 0,
        supplier_name: '',
        contact_person: '',
        phone: '',
        email: '',
        is_active: true,
      } as Supplier);
      fetchData(search);
    } else {
      showToast('error', 'Save failed', res.error || 'Check the form');
    }
    setLoading(false);
  };

  const deleteSupplier = async (row: Supplier) => {
    setLoading(true);
    const res = await supplierService.remove(row.supplier_id);
    if (res.success) {
      showToast('success', 'Supplier deleted');
      fetchData(search);
    } else {
      showToast('error', 'Delete failed', res.error || 'Cannot delete supplier');
    }
    setLoading(false);
  };

  const saveReceipt = async () => {
    if (!receiptForm.charge_id || !receiptForm.acc_id || !receiptForm.amount) {
      showToast('error', 'Missing fields', 'charge, account, amount required');
      return;
    }
    setLoading(true);
    const res = receiptForm.receipt_id
      ? await receiptService.update(receiptForm.receipt_id, receiptForm as any)
      : await receiptService.create(receiptForm as any);
    if (res.success) {
      showToast('success', 'Receipt saved');
      setReceiptModalOpen(false);
      setReceiptForm({});
      fetchData(search);
    } else {
      showToast('error', 'Save failed', res.error || 'Check the form');
    }
    setLoading(false);
  };

  const deleteReceipt = async (row: Receipt) => {
    setLoading(true);
    const res = await receiptService.remove(row.receipt_id);
    if (res.success) {
      showToast('success', 'Receipt deleted');
      fetchData(search);
    } else {
      showToast('error', 'Delete failed', res.error || 'Cannot delete receipt');
    }
    setLoading(false);
  };

  const confirmDelete = async () => {
    if (!purchaseToDelete) return;
    setLoading(true);
    const res = await purchaseService.remove(purchaseToDelete.purchase_id);
    if (res.success) {
      showToast('success', 'Deleted', `Purchase #${purchaseToDelete.purchase_id} removed`);
      fetchData(search);
    } else {
      showToast('error', 'Delete failed', res.error || 'Could not delete purchase');
    }
    setLoading(false);
    setPurchaseToDelete(null);
    setDeleteOpen(false);
  };

  const supplierColumns: ColumnDef<Supplier>[] = [
    { accessorKey: 'supplier_name', header: 'Supplier' },
    { accessorKey: 'contact_person', header: 'Contact' },
    { accessorKey: 'phone', header: 'Phone' },
    {
      accessorKey: 'is_active',
      header: 'Active',
      cell: ({ row }) => row.original.is_active ? 'Yes' : 'No',
    },
  ];

  const receiptColumns: ColumnDef<Receipt>[] = [
    { accessorKey: 'receipt_date', header: 'Date', cell: ({ row }) => new Date(row.original.receipt_date).toLocaleDateString() },
    { accessorKey: 'customer_name', header: 'Customer' },
    { accessorKey: 'charge_id', header: 'Charge ID' },
    { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `$${Number(row.original.amount || 0).toFixed(2)}` },
    { accessorKey: 'reference_no', header: 'Reference' },
    { accessorKey: 'note', header: 'Note' },
  ];

  const tabs = [
    {
      id: 'list',
      label: 'Purchases',
      icon: ShoppingBag,
      badge: purchases.length,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Purchase Orders"
            primaryAction={{ label: 'New Purchase', onClick: () => { setForm(emptyForm); setIsModalOpen(true); } }}
            onSearch={(value: string) => { setSearch(value); debouncedSearch(value); }}
            onExport={() => showToast('info', 'Export', 'Export coming soon')}
          />
          <DataTable
            data={purchases}
            columns={columns}
            isLoading={loading}
            searchPlaceholder="Find by supplier or note..."
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      ),
    },
    {
      id: 'suppliers',
      label: 'Suppliers',
      icon: Users,
      badge: suppliers.length,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Suppliers"
            primaryAction={{
              label: 'New Supplier',
              onClick: () => {
                setSupplierForm({
                  supplier_id: 0,
                  supplier_name: '',
                  contact_person: '',
                  phone: '',
                  email: '',
                  is_active: true,
                } as Supplier);
                setSupplierModalOpen(true);
              },
            }}
            onSearch={(value: string) => { setSearch(value); debouncedSearch(value); }}
          />
          <DataTable
            data={suppliers}
            columns={supplierColumns}
            isLoading={loading}
            searchPlaceholder="Find supplier..."
            onEdit={(row) => { setSupplierForm(row as Supplier); setSupplierModalOpen(true); }}
            onDelete={deleteSupplier}
          />
        </div>
      ),
    },
    {
      id: 'receipts',
      label: 'Receipts',
      icon: ReceiptIcon,
      badge: receipts.length,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Receipts"
            primaryAction={{ label: 'New Receipt', onClick: () => { setReceiptForm({}); setReceiptModalOpen(true); } }}
            onSearch={(value: string) => { setSearch(value); debouncedSearch(value); }}
          />
          <DataTable
            data={receipts}
            columns={receiptColumns}
            isLoading={loading}
            searchPlaceholder="Find receipt..."
            onEdit={(row) => {
              setReceiptForm({
                receipt_id: row.receipt_id,
                charge_id: row.charge_id,
                acc_id: row.acc_id,
                amount: row.amount,
                customer_id: row.customer_id,
                reference_no: row.reference_no || '',
                note: row.note || '',
              });
              setReceiptModalOpen(true);
            }}
            onDelete={deleteReceipt}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Track incoming stock and supplier bills."
      />

      <Tabs tabs={tabs} defaultTab="list" />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={form.purchase_id ? 'Edit Purchase' : 'New Purchase'}
        size="lg"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2"
        >
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Supplier
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={form.supplier_id}
              onChange={(e) => setForm({ ...form, supplier_id: e.target.value ? Number(e.target.value) : '' })}
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Date
            <input
              type="date"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={form.purchase_date}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
            />
          </label>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Type
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={form.purchase_type}
              onChange={(e) => setForm({ ...form, purchase_type: e.target.value as 'cash' | 'credit' })}
            >
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </label>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Status
            <select
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as PurchaseForm['status'] })}
            >
              <option value="received">Received</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
              <option value="void">Void</option>
            </select>
          </label>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Subtotal
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={form.subtotal}
              onChange={(e) => {
                const v = Number(e.target.value || 0);
                setForm((prev) => ({ ...prev, subtotal: v, total: recalcTotal(v, prev.discount) }));
              }}
            />
          </label>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Discount
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={form.discount}
              onChange={(e) => {
                const v = Number(e.target.value || 0);
                setForm((prev) => ({ ...prev, discount: v, total: recalcTotal(prev.subtotal, v) }));
              }}
            />
          </label>

          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Total
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              value={form.total}
              onChange={(e) => setForm({ ...form, total: Number(e.target.value || 0) })}
            />
          </label>

          <label className="md:col-span-2 flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Note
            <textarea
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm min-h-[80px]"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>

          <div className="md:col-span-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
            >
              {form.purchase_id ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => { setDeleteOpen(false); setPurchaseToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete Purchase?"
        message={
          purchaseToDelete
            ? `⚠️ Deleting purchase #${purchaseToDelete.purchase_id} will remove its line items. This cannot be undone.`
            : 'Are you sure you want to delete this purchase?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={loading}
      />

      <Modal
        isOpen={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        title={supplierForm.supplier_id ? 'Edit Supplier' : 'New Supplier'}
        size="md"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); saveSupplier(); }}
          className="space-y-3 p-2"
        >
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Name
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              value={supplierForm.supplier_name}
              onChange={(e) => setSupplierForm({ ...supplierForm, supplier_name: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Contact
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              value={supplierForm.contact_person || ''}
              onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Phone
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              value={supplierForm.phone || ''}
              onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Email
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              value={supplierForm.email || ''}
              onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setSupplierModalOpen(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white">
              {supplierForm.supplier_id ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        title={receiptForm.receipt_id ? 'Edit Receipt' : 'New Receipt'}
        size="md"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); saveReceipt(); }}
          className="grid grid-cols-1 gap-3 p-2"
        >
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Charge ID
            <input
              type="number"
              className="rounded-lg border px-3 py-2"
              value={receiptForm.charge_id ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, charge_id: Number(e.target.value) })}
              required
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Account ID
            <input
              type="number"
              className="rounded-lg border px-3 py-2"
              value={receiptForm.acc_id ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, acc_id: Number(e.target.value) })}
              required
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Amount
            <input
              type="number"
              className="rounded-lg border px-3 py-2"
              value={receiptForm.amount ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, amount: Number(e.target.value) })}
              required
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Customer ID (optional)
            <input
              type="number"
              className="rounded-lg border px-3 py-2"
              value={receiptForm.customer_id ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, customer_id: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Reference
            <input
              className="rounded-lg border px-3 py-2"
              value={receiptForm.reference_no ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, reference_no: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Note
            <textarea
              className="rounded-lg border px-3 py-2 min-h-[80px]"
              value={receiptForm.note ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, note: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setReceiptModalOpen(false)} className="px-4 py-2 rounded-lg border">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary-600 text-white">
              {receiptForm.receipt_id ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Purchases;
