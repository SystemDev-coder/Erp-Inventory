import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { ShoppingBag, Users } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import { purchaseService, Purchase, PurchaseItemView } from '../../services/purchase.service';
import { supplierService, Supplier } from '../../services/supplier.service';

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

const Purchases = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<PurchaseItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseForm['status']>('all');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [supplierDeleteOpen, setSupplierDeleteOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState<Supplier>({
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

  const fetchData = async (term?: string, status?: string) => {
    setLoading(true);
    const [pRes, sRes, iRes] = await Promise.all([
      purchaseService.list(term, status),
      supplierService.list(),
      purchaseService.listItems({ search: term }),
    ]);
    if (pRes.success && pRes.data?.purchases) {
      setPurchases(pRes.data.purchases);
    } else {
      showToast('error', 'Load failed', pRes.error || 'Could not load purchases');
    }
    if (sRes.success && sRes.data?.suppliers) {
      setSuppliers(sRes.data.suppliers);
    }
    if (iRes.success && iRes.data?.items) {
      setItems(iRes.data.items);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const debouncedSearch = useMemo(
    () =>
      debounce((term: string) => {
        fetchData(term, statusFilter);
      }, 300),
    [statusFilter]
  );

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);
  useEffect(() => { fetchData(search, statusFilter); }, [statusFilter]);

  const columns: ColumnDef<Purchase>[] = useMemo(() => [
    {
      accessorKey: 'purchase_date',
      header: 'Date',
      cell: ({ row }) => new Date(row.original.purchase_date).toLocaleDateString(),
    },
    { accessorKey: 'purchase_id', header: 'PO #', cell: ({ row }) => `PO-${row.original.purchase_id}` },
    {
      accessorKey: 'supplier_name',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name || '-',
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
            row.original.status === 'unpaid' ? 'error' : 'info'
          }
          variant="light"
        >
          {row.original.status}
        </Badge>
      ),
    },
    { accessorKey: 'note', header: 'Note' },
  ], []);

  const onEdit = (row: Purchase) => {
    navigate(`/purchases/${row.purchase_id}`);
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
        company_name: '',
        contact_person: '',
        contact_phone: '',
        phone: '',
        location: '',
        remaining_balance: 0,
        is_active: true,
      } as Supplier);
      fetchData(search);
    } else {
      showToast('error', 'Save failed', res.error || 'Check the form');
    }
    setLoading(false);
  };

  const deleteSupplier = async (row: Supplier) => {
    setSupplierToDelete(row);
    setSupplierDeleteOpen(true);
  };

  const confirmDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    setLoading(true);
    const res = await supplierService.remove(supplierToDelete.supplier_id);
    if (res.success) {
      showToast('success', 'Supplier deleted');
      fetchData(search);
    } else {
      showToast('error', 'Delete failed', res.error || 'Cannot delete supplier');
    }
    setLoading(false);
    setSupplierDeleteOpen(false);
    setSupplierToDelete(null);
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
    { accessorKey: 'company_name', header: 'Company', cell: ({ row }) => row.original.company_name || '-' },
    { accessorKey: 'contact_person', header: 'Contact' },
    { accessorKey: 'contact_phone', header: 'Contact Phone', cell: ({ row }) => row.original.contact_phone || '-' },
    { accessorKey: 'phone', header: 'Phone' },
    { accessorKey: 'location', header: 'Location', cell: ({ row }) => row.original.location || '-' },
    {
      accessorKey: 'remaining_balance',
      header: 'Balance',
      cell: ({ row }) => `$${Number(row.original.remaining_balance || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'is_active',
      header: 'Active',
      cell: ({ row }) => row.original.is_active ? 'Yes' : 'No',
    },
  ];

  const statusFilters: Array<'all' | PurchaseForm['status']> = ['all', 'received', 'partial', 'unpaid', 'void'];
  const filteredPurchases = useMemo(
    () =>
      statusFilter === 'all'
        ? purchases
        : purchases.filter((p) => p.status === statusFilter),
    [purchases, statusFilter]
  );

  const itemColumns: ColumnDef<PurchaseItemView>[] = useMemo(() => [
    {
      accessorKey: 'purchase_date',
      header: 'Date',
      cell: ({ row }) => new Date(row.original.purchase_date).toLocaleDateString(),
    },
    { accessorKey: 'purchase_id', header: 'PO #', cell: ({ row }) => `PO-${row.original.purchase_id}` },
    { accessorKey: 'supplier_name', header: 'Supplier', cell: ({ row }) => row.original.supplier_name || '-' },
    { accessorKey: 'description', header: 'Item', cell: ({ row }) => row.original.description || row.original.product_name || '-' },
    { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => Number(row.original.quantity || 0).toFixed(3) },
    { accessorKey: 'unit_cost', header: 'Unit Cost', cell: ({ row }) => `$${Number(row.original.unit_cost || 0).toFixed(2)}` },
    { accessorKey: 'discount', header: 'Discount', cell: ({ row }) => `$${Number(row.original.discount || 0).toFixed(2)}` },
    { accessorKey: 'line_total', header: 'Line Total', cell: ({ row }) => `$${Number(row.original.line_total || 0).toFixed(2)}` },
    { accessorKey: 'purchase_type', header: 'Type', cell: ({ row }) => row.original.purchase_type },
  ], []);


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
            primaryAction={{ label: 'New Purchase', onClick: () => navigate('/purchases/new') }}
            onSearch={(value: string) => { setSearch(value); debouncedSearch(value); }}
            onExport={() => showToast('info', 'Export', 'Export coming soon')}
          />
          <div className="flex flex-wrap gap-2 px-1">
            {statusFilters.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  statusFilter === s
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <DataTable
            data={filteredPurchases}
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
                  company_name: '',
                  contact_person: '',
                  contact_phone: '',
                  phone: '',
                  location: '',
                  remaining_balance: 0,
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
      id: 'items',
      label: 'Items',
      icon: ShoppingBag,
      badge: items.length,
      content: (
        <div className="space-y-2">
          <DataTable
            data={items}
            columns={itemColumns}
            isLoading={loading}
            searchPlaceholder="Search purchased items..."
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

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => { setDeleteOpen(false); setPurchaseToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete Purchase?"
        message={
          purchaseToDelete
            ? `Deleting purchase #${purchaseToDelete.purchase_id} will remove its line items. This cannot be undone.`
            : 'Are you sure you want to delete this purchase?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={loading}
      />

      <ConfirmDialog
        isOpen={supplierDeleteOpen}
        onClose={() => { setSupplierDeleteOpen(false); setSupplierToDelete(null); }}
        onConfirm={confirmDeleteSupplier}
        title="Delete Supplier?"
        message={
          supplierToDelete
            ? `Deleting supplier "${supplierToDelete.supplier_name}" will remove their record. This cannot be undone.`
            : 'Are you sure you want to delete this supplier?'
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
        size="xl"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); saveSupplier(); }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2"
        >
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Name
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              placeholder="Supplier name"
              value={supplierForm.supplier_name}
              onChange={(e) => setSupplierForm({ ...supplierForm, supplier_name: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Company
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              placeholder="Company name"
              value={supplierForm.company_name || ''}
              onChange={(e) => setSupplierForm({ ...supplierForm, company_name: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Contact
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              placeholder="Contact person"
              value={supplierForm.contact_person || ''}
              onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Contact Phone
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              placeholder="+1 555 000 1234"
              value={supplierForm.contact_phone || ''}
              onChange={(e) => setSupplierForm({ ...supplierForm, contact_phone: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Phone
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              placeholder="+1 555 123 4567"
              value={supplierForm.phone || ''}
              onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Location
            <input
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              placeholder="City / area"
              value={supplierForm.location || ''}
              onChange={(e) => setSupplierForm({ ...supplierForm, location: e.target.value })}
            />
          </label>
          <label className="flex flex-col text-sm font-medium gap-1 text-slate-700 dark:text-slate-300">
            Remaining Balance
            <input
              type="number"
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2"
              placeholder="0.00"
              value={supplierForm.remaining_balance ?? 0}
              onChange={(e) => setSupplierForm({ ...supplierForm, remaining_balance: Number(e.target.value || 0) })}
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

    </div>
  );
};

export default Purchases;
