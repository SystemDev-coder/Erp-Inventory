import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, ClipboardList, RefreshCw, ShoppingBag, Users } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import Badge from '../../components/ui/badge/Badge';
import { useToast } from '../../components/ui/toast/Toast';
import { PurchaseItem, purchaseService, Purchase, PurchaseItemView } from '../../services/purchase.service';
import { supplierService, Supplier } from '../../services/supplier.service';
import ImportUploadModal from '../../components/import/ImportUploadModal';
import { defaultDateRange, optionalDateParam } from '../../utils/dateRange';
import { useBranch } from '../../context/BranchContext';

type SupplierFieldErrors = Partial<Record<string, string>>;

function SupplierField({
  label,
  error,
  touched,
  success,
  children,
}: {
  label: string;
  error?: string;
  touched?: boolean;
  success?: boolean;
  children: React.ReactNode;
}) {
  const showError = touched && error;
  const showSuccess = touched && !error && success;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        {showSuccess && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
      </div>
      {children}
      {showError && (
        <p className="text-xs font-medium text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

type PurchaseForm = {
  purchase_id?: number;
  supplier_id: number | '';
  purchase_date: string;
  purchase_type: 'cash' | 'credit';
  subtotal: number;
  discount: number;
  total: number;
  status: 'ordered' | 'received' | 'partial' | 'unpaid' | 'void';
  note?: string;
};

const Purchases = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { activeBranchId } = useBranch();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<PurchaseItemView[]>([]);
  const [loading, setLoading] = useState(false);
  const [search] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseForm['status']>('all');
  const [dateRange, setDateRange] = useState(() => defaultDateRange());
  const [suppliersDisplayed, setSuppliersDisplayed] = useState(false);
  const [itemsDisplayed, setItemsDisplayed] = useState(false);
  const [purchasesDisplayed, setPurchasesDisplayed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [viewItems, setViewItems] = useState<PurchaseItem[]>([]);
  const [supplierDeleteOpen, setSupplierDeleteOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierImportOpen, setSupplierImportOpen] = useState(false);

  // Orders tab state
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [ordersDisplayed, setOrdersDisplayed] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderDateRange, setOrderDateRange] = useState(() => defaultDateRange());
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [orderToReceive, setOrderToReceive] = useState<Purchase | null>(null);
  const [receiveStatus, setReceiveStatus] = useState<'received' | 'partial' | 'unpaid'>('received');
  const [orderDeleteOpen, setOrderDeleteOpen] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState<Purchase | null>(null);
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
  const [supplierErrors, setSupplierErrors] = useState<SupplierFieldErrors>({});
  const [supplierTouched, setSupplierTouched] = useState<Partial<Record<string, boolean>>>({});

  const loadPurchases = async (term?: string, status?: string) => {
    setLoading(true);
    const res = await purchaseService.list({
      search: term,
      status,
      fromDate: optionalDateParam(dateRange.fromDate),
      toDate: optionalDateParam(dateRange.toDate),
      branchId: activeBranchId ?? undefined,
    });
    if (res.success && res.data?.purchases) {
      setPurchases(res.data.purchases);
    } else {
      showToast('error', 'Load failed', res.error || 'Could not load purchases');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (purchasesDisplayed) void loadPurchases(search, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranchId]);

  const loadSuppliers = async (term?: string) => {
    setLoading(true);
    const res = await supplierService.list({
      search: term,
    });
    if (res.success && res.data?.suppliers) {
      setSuppliers(res.data.suppliers);
    } else {
      showToast('error', 'Load failed', res.error || 'Could not load suppliers');
    }
    setLoading(false);
  };

  const loadItems = async (term?: string) => {
    setLoading(true);
    const res = await purchaseService.listItems({
      search: term,
    });
    if (res.success && res.data?.items) {
      setItems(res.data.items);
    } else {
      showToast('error', 'Load failed', res.error || 'Could not load items');
    }
    setLoading(false);
  };

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
      cell: ({ row }) => row.original.supplier_name || (row.original.supplier_id == null ? 'Walk-in' : '-'),
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

  const onView = async (row: Purchase) => {
    setViewOpen(true);
    setViewLoading(true);
    const res = await purchaseService.get(row.purchase_id);
    if (!res.success || !res.data?.purchase) {
      showToast('error', 'Purchase', res.error || 'Failed to load purchase details');
      setViewOpen(false);
      setViewLoading(false);
      return;
    }

    const paidFromSummary = Number(res.data.paymentSummary?.total_paid ?? 0);
    const paidFallback = Number(res.data.purchase.paid_amount ?? 0);
    const paidAmount = paidFromSummary > 0.005 ? paidFromSummary : paidFallback;

    setViewPurchase({ ...res.data.purchase, paid_amount: paidAmount });
    setViewItems(res.data.items || []);
    setViewLoading(false);
  };

  const downloadPurchasesXlsx = async () => {
    if (!purchasesDisplayed) {
      showToast('info', 'Export', 'Click Display to load data.');
      return;
    }
    if (filteredPurchases.length === 0) {
      showToast('info', 'Export', 'No data to export.');
      return;
    }
    if (exporting) return;

    setExporting(true);
    const res = await purchaseService.exportXlsx({
      search,
      status: statusFilter,
      fromDate: optionalDateParam(dateRange.fromDate),
      toDate: optionalDateParam(dateRange.toDate),
    });
    setExporting(false);

    if (!res.success) {
      showToast('error', 'Export failed', res.error || 'Could not export purchases');
      return;
    }

    if (!res.blob) {
      showToast('error', 'Export failed', 'No file returned from server.');
      return;
    }

    const url = window.URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.filename || 'purchases.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const validateSupplier = (f: Supplier): SupplierFieldErrors => {
    const errs: SupplierFieldErrors = {};
    const digitCount = (val: string) => (val.match(/\d/g) || []).length;
    if (!f.supplier_name.trim()) errs.supplier_name = 'Supplier name is required';
    else if (f.supplier_name.trim().length < 2) errs.supplier_name = 'Name must be at least 2 characters';
    if (!f.company_name?.trim()) errs.company_name = 'Company name is required';
    if (!f.contact_person?.trim()) errs.contact_person = 'Contact person is required';
    if (!f.contact_phone?.trim()) errs.contact_phone = 'Contact phone is required';
    else if (digitCount(f.contact_phone) < 2) errs.contact_phone = 'Please add at least 2 numbers';
    if (!f.phone?.trim()) errs.phone = 'Phone is required';
    else if (digitCount(f.phone) < 2) errs.phone = 'Please add at least 2 numbers';
    if (!f.location?.trim()) errs.location = 'Location is required';
    if ((f.remaining_balance ?? 0) < 0) errs.remaining_balance = 'Balance cannot be negative';
    return errs;
  };

  const getSupplierInputCls = (field: string) => {
    const base = 'rounded-lg border px-3 py-2 w-full text-sm outline-none transition-all focus:ring-2';
    if (!supplierTouched[field]) return `${base} border-slate-300 dark:border-slate-600 focus:border-primary-500 focus:ring-primary-500/20`;
    if (supplierErrors[field]) return `${base} border-red-400 bg-red-50/40 dark:border-red-500 dark:bg-red-900/10 focus:border-red-500 focus:ring-red-500/20`;
    return `${base} border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20`;
  };

  const touchSupplier = (field: string) => {
    setSupplierTouched(t => ({ ...t, [field]: true }));
    setSupplierErrors(validateSupplier(supplierForm));
  };

  const setSupplierField = (field: string, value: unknown) => {
    const next = { ...supplierForm, [field]: value } as Supplier;
    setSupplierForm(next);
    if (supplierTouched[field]) setSupplierErrors(validateSupplier(next));
  };

  const openSupplierModal = (preset?: Supplier) => {
    setSupplierForm(preset ?? {
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
    setSupplierErrors({});
    setSupplierTouched({});
    setSupplierModalOpen(true);
  };

  const closeSupplierModal = () => {
    setSupplierModalOpen(false);
    setSupplierErrors({});
    setSupplierTouched({});
  };

  const saveSupplier = async () => {
    const errs = validateSupplier(supplierForm);
    if (Object.keys(errs).length > 0) {
      setSupplierErrors(errs);
      setSupplierTouched({ supplier_name: true, company_name: true, contact_person: true, contact_phone: true, phone: true, location: true, remaining_balance: true });
      return;
    }
    setLoading(true);
    const res = supplierForm.supplier_id
      ? await supplierService.update(supplierForm.supplier_id, supplierForm)
      : await supplierService.create(supplierForm);
    if (res.success) {
      showToast('success', 'Supplier saved');
      closeSupplierModal();
      if (suppliersDisplayed) loadSuppliers(search);
    } else {
      showToast('error', 'Save failed', res.error || 'Check the form');
    }
    setLoading(false);
  };

  const deleteSupplier = async (row: Supplier) => {
    setSupplierToDelete(row);
    setSupplierDeleteOpen(true);
  };

  const confirmDeleteSupplier = async (reason: string) => {
    if (!supplierToDelete) return;
    setLoading(true);
    const res = await supplierService.remove(supplierToDelete.supplier_id, reason);
    if (res.success) {
      showToast('success', 'Supplier deleted');
      if (suppliersDisplayed) loadSuppliers(search);
    } else {
      showToast('error', 'Delete failed', res.error || 'Cannot delete supplier');
    }
    setLoading(false);
    setSupplierDeleteOpen(false);
    setSupplierToDelete(null);
  };


  const confirmDelete = async (reason: string) => {
    if (!purchaseToDelete) return;
    setLoading(true);
    const res = await purchaseService.remove(purchaseToDelete.purchase_id, reason);
    if (res.success) {
      showToast('success', 'Deleted', `Purchase #${purchaseToDelete.purchase_id} removed`);
      if (purchasesDisplayed) loadPurchases(search, statusFilter);
    } else {
      showToast('error', 'Delete failed', res.error || 'Could not delete purchase');
    }
    setLoading(false);
    setPurchaseToDelete(null);
    setDeleteOpen(false);
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    const res = await purchaseService.list({
      docType: 'order',
      fromDate: optionalDateParam(orderDateRange.fromDate),
      toDate: optionalDateParam(orderDateRange.toDate),
    });
    if (res.success && res.data?.purchases) {
      setOrders(res.data.purchases);
    } else {
      showToast('error', 'Load failed', res.error || 'Could not load orders');
    }
    setOrdersLoading(false);
  };

  const openReceiveDialog = (order: Purchase) => {
    setOrderToReceive(order);
    setReceiveStatus('received');
    setReceiveOpen(true);
  };

  const confirmReceiveOrder = async () => {
    if (!orderToReceive) return;
    setReceiveLoading(true);
    const res = await purchaseService.receiveOrder(orderToReceive.purchase_id, {
      status: receiveStatus,
      purchaseType: receiveStatus === 'unpaid' ? 'credit' : 'cash',
    });
    setReceiveLoading(false);
    if (res.success) {
      showToast('success', 'Order Received', `PO-${orderToReceive.purchase_id} received — stock updated`);
      setReceiveOpen(false);
      setOrderToReceive(null);
      if (ordersDisplayed) void loadOrders();
    } else {
      showToast('error', 'Receive failed', res.error || 'Could not receive order');
    }
  };

  const confirmDeleteOrder = async (reason: string) => {
    if (!orderToDelete) return;
    setOrdersLoading(true);
    const res = await purchaseService.remove(orderToDelete.purchase_id, reason);
    if (res.success) {
      showToast('success', 'Deleted', `Order #${orderToDelete.purchase_id} removed`);
      if (ordersDisplayed) void loadOrders();
    } else {
      showToast('error', 'Delete failed', res.error || 'Could not delete order');
    }
    setOrdersLoading(false);
    setOrderDeleteOpen(false);
    setOrderToDelete(null);
  };

  const orderColumns: ColumnDef<Purchase>[] = [
    {
      accessorKey: 'purchase_date',
      header: 'Date',
      cell: ({ row }) => new Date(row.original.purchase_date).toLocaleDateString(),
    },
    { accessorKey: 'purchase_id', header: 'Order #', cell: ({ row }) => `PO-${row.original.purchase_id}` },
    {
      accessorKey: 'supplier_name',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name || '-',
    },
    {
      accessorKey: 'total',
      header: 'Total',
      cell: ({ row }) => `$${Number(row.original.total || 0).toFixed(2)}`,
    },
    {
      accessorKey: 'expected_date',
      header: 'Expected Date',
      cell: ({ row }) =>
        row.original.expected_date
          ? new Date(row.original.expected_date).toLocaleDateString()
          : <span className="text-slate-400 text-xs">—</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: () => (
        <Badge color="info" variant="light">Pending</Badge>
      ),
    },
    { accessorKey: 'note', header: 'Note', cell: ({ row }) => row.original.note || '—' },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openReceiveDialog(row.original)}
            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
          >
            ✓ Mark Received
          </button>
          <button
            onClick={() => navigate(`/purchases/${row.original.purchase_id}`)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => { setOrderToDelete(row.original); setOrderDeleteOpen(true); }}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

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

  const statusFilters: Array<'all' | PurchaseForm['status']> = ['all', 'ordered', 'received', 'partial', 'unpaid', 'void'];
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
    { accessorKey: 'quantity', header: 'Qty', cell: ({ row }) => Number(row.original.quantity || 0).toFixed(0) },
    { accessorKey: 'unit_cost', header: 'Unit Cost', cell: ({ row }) => `$${Number(row.original.unit_cost || 0).toFixed(2)}` },
    { accessorKey: 'cost_price', header: 'Cost Price', cell: ({ row }) => `$${Number(row.original.cost_price || row.original.unit_cost || 0).toFixed(2)}` },
    { accessorKey: 'sale_price', header: 'Sale Price', cell: ({ row }) => `$${Number(row.original.sale_price || 0).toFixed(2)}` },
    { accessorKey: 'discount', header: 'Discount', cell: ({ row }) => `$${Number(row.original.discount || 0).toFixed(2)}` },
    { accessorKey: 'line_total', header: 'Line Total', cell: ({ row }) => `$${Number(row.original.line_total || 0).toFixed(2)}` },
  ], []);


  const tabs = [
    {
      id: 'suppliers',
      label: 'Suppliers',
      icon: Users,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Suppliers"
            primaryAction={{
              label: 'New Supplier',
              onClick: () => openSupplierModal(),
            }}
            secondaryAction={{ label: 'Upload Data', onClick: () => setSupplierImportOpen(true) }}
            onDisplay={() => {
              setSuppliersDisplayed(true);
              void loadSuppliers();
            }}
            displayLoading={loading}
          />
          {!suppliersDisplayed && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              Click <span className="font-semibold">Display</span> to load data.
            </div>
          )}
          {suppliersDisplayed && !loading && suppliers.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              No data found for the selected filters.
            </div>
          )}
          <DataTable
            data={suppliersDisplayed ? suppliers : []}
            columns={supplierColumns}
            isLoading={loading}
            searchPlaceholder="Find supplier..."
            onEdit={(row) => openSupplierModal(row as Supplier)}
            onDelete={deleteSupplier}
          />
        </div>
      ),
    },
    {
      id: 'items',
      label: 'Items',
      icon: ShoppingBag,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setItemsDisplayed(true);
                void loadItems(search);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Display'}
            </button>
          </div>
          {!itemsDisplayed && !loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              Click <span className="font-semibold">Display</span> to load data.
            </div>
          )}
          {itemsDisplayed && !loading && items.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              No data found for the selected filters.
            </div>
          )}
          <DataTable
            data={itemsDisplayed ? items : []}
            columns={itemColumns}
            isLoading={loading}
            searchPlaceholder="Search purchased items..."
          />
        </div>
      ),
    },
    {
      id: 'list',
      label: 'Purchases',
      icon: ShoppingBag,
      content: (
        <div className="space-y-2">
          <TabActionToolbar
            title="Purchase Orders"
            // UPDATED: Support Purchase Orders (planned) separate from Purchases (received).
            primaryAction={{ label: 'New Purchase', onClick: () => navigate('/purchases/new') }}
            onDisplay={() => {
              setPurchasesDisplayed(true);
              void loadPurchases(search, statusFilter);
            }}
            displayLoading={loading}
            onExport={downloadPurchasesXlsx}
            dateRange={{
              fromDate: dateRange.fromDate,
              toDate: dateRange.toDate,
              onFromDateChange: (value) => setDateRange((prev) => ({ ...prev, fromDate: value })),
              onToDateChange: (value) => setDateRange((prev) => ({ ...prev, toDate: value })),
            }}
          />
          <div className="flex flex-wrap gap-2 px-1">
            {statusFilters.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                }}
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
            data={purchasesDisplayed ? filteredPurchases : []}
            columns={columns}
            isLoading={loading}
            searchPlaceholder="Find by supplier or note..."
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          {!purchasesDisplayed && !loading && (
            <div className="text-sm text-slate-500 px-1">Click Display to load data.</div>
          )}
          {purchasesDisplayed && !loading && filteredPurchases.length === 0 && (
            <div className="text-sm text-slate-500 px-1">No data found for the selected filters.</div>
          )}
        </div>
      ),
    },
    {
      id: 'orders',
      label: 'Orders',
      icon: ClipboardList,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">From Date</span>
              <input
                type="date"
                value={orderDateRange.fromDate}
                onChange={(e) => setOrderDateRange((prev) => ({ ...prev, fromDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">To Date</span>
              <input
                type="date"
                value={orderDateRange.toDate}
                onChange={(e) => setOrderDateRange((prev) => ({ ...prev, toDate: e.target.value }))}
                className="h-10 w-36 rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={ordersLoading}
                onClick={() => { setOrdersDisplayed(true); void loadOrders(); }}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${ordersLoading ? 'animate-spin' : ''}`} />
                {ordersLoading ? 'Loading...' : 'Display'}
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate('/purchases/new?docType=order')}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-orange-600 transition-colors"
            >
              + New Order
            </button>
          </div>

          {!ordersDisplayed && !ordersLoading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              Click <span className="font-semibold">Display</span> to load orders.
            </div>
          )}
          {ordersDisplayed && !ordersLoading && orders.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
              No pending orders found for the selected date range.
            </div>
          )}

          <DataTable
            data={ordersDisplayed ? orders : []}
            columns={orderColumns}
            isLoading={ordersLoading}
            searchPlaceholder="Find by supplier or note..."
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

      <Tabs
        tabs={tabs}
        defaultTab={
          location.pathname.endsWith('/suppliers')
            ? 'suppliers'
            : location.pathname.endsWith('/items')
            ? 'items'
            : location.pathname.endsWith('/orders')
            ? 'orders'
            : 'list'
        }
      />

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => { setDeleteOpen(false); setPurchaseToDelete(null); }}
        onConfirm={(reason) => void confirmDelete(reason || '')}
        requireReason
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

      {/* Mark as Received modal */}
      <Modal
        isOpen={receiveOpen}
        onClose={() => { setReceiveOpen(false); setOrderToReceive(null); }}
        title={orderToReceive ? `Receive Order PO-${orderToReceive.purchase_id}` : 'Receive Order'}
        size="sm"
      >
        {orderToReceive && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Supplier</span>
                <span className="font-medium">{orderToReceive.supplier_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-medium">${Number(orderToReceive.total || 0).toFixed(2)}</span>
              </div>
              {orderToReceive.expected_date && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Date</span>
                  <span className="font-medium">{new Date(orderToReceive.expected_date).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Receive as
              </label>
              <select
                value={receiveStatus}
                onChange={(e) => setReceiveStatus(e.target.value as typeof receiveStatus)}
                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="received">Received — Fully Paid (Cash)</option>
                <option value="unpaid">Unpaid — Credit / Pay Later</option>
                <option value="partial">Partial — Some Paid</option>
              </select>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              This will update stock inventory and record the supplier bill.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setReceiveOpen(false); setOrderToReceive(null); }}
                disabled={receiveLoading}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={confirmReceiveOrder}
                disabled={receiveLoading}
                className="px-4 py-2 rounded-xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {receiveLoading ? 'Processing...' : 'Confirm Receipt'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={orderDeleteOpen}
        onClose={() => { setOrderDeleteOpen(false); setOrderToDelete(null); }}
        onConfirm={(reason) => void confirmDeleteOrder(reason || '')}
        requireReason
        title="Delete Order?"
        message={
          orderToDelete
            ? `Delete order PO-${orderToDelete.purchase_id}? This cannot be undone.`
            : 'Are you sure?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={ordersLoading}
      />

      <ConfirmDialog
        isOpen={supplierDeleteOpen}
        onClose={() => { setSupplierDeleteOpen(false); setSupplierToDelete(null); }}
        onConfirm={(reason) => void confirmDeleteSupplier(reason || '')}
        requireReason
        title="Delete Supplier?"
        message={
          supplierToDelete
            ? `Deleting supplier "${supplierToDelete.supplier_name}" will remove their record. If this supplier has transactions, deletion will be blocked automatically.`
            : 'Are you sure you want to delete this supplier?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={loading}
      />

      <Modal
        isOpen={viewOpen}
        onClose={() => {
          setViewOpen(false);
          setViewLoading(false);
          setViewPurchase(null);
          setViewItems([]);
        }}
        title={viewPurchase ? `Purchase Details (PO-${viewPurchase.purchase_id})` : 'Purchase Details'}
        size="xl"
      >
        {viewLoading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading purchase details...</div>
        ) : !viewPurchase ? (
          <div className="py-10 text-center text-sm text-slate-500">No details to display.</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">PO #</p>
                <p className="font-semibold text-slate-900">{`PO-${viewPurchase.purchase_id}`}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Date & Time</p>
                <p className="font-semibold text-slate-900">{new Date(viewPurchase.purchase_date).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Supplier</p>
                <p className="font-semibold text-slate-900">{viewPurchase.supplier_name || 'Walk-in'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Type</p>
                <p className="font-semibold text-slate-900 capitalize">{viewPurchase.purchase_type}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <p className="font-semibold text-slate-900 capitalize">{viewPurchase.status}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Paid</p>
                <p className="font-semibold text-slate-900">${Number(viewPurchase.paid_amount || 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Balance</p>
                <p className="font-semibold text-slate-900">
                  ${Math.max(Number(viewPurchase.total || 0) - Number(viewPurchase.paid_amount || 0), 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Note</p>
                <p className="font-semibold text-slate-900">{viewPurchase.note || '-'}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Cost</th>
                    <th className="px-3 py-2 text-right">Discount</th>
                    <th className="px-3 py-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        No items found.
                      </td>
                    </tr>
                  ) : (
                    viewItems.map((item, index) => (
                      <tr key={`${item.purchase_item_id || item.product_id || index}`} className="border-t border-slate-200">
                        <td className="px-3 py-2 text-slate-900">{item.product_name || `Item #${item.product_id || '-'}`}</td>
                        <td className="px-3 py-2 text-right text-slate-900">{Number(item.quantity || 0)}</td>
                        <td className="px-3 py-2 text-right text-slate-900">${Number(item.unit_cost || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-slate-900">${Number(item.discount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900">
                          ${Number(item.line_total ?? Number(item.quantity || 0) * Number(item.unit_cost || 0) - Number(item.discount || 0)).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="ml-auto grid w-full max-w-xs gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-semibold text-slate-900">${Number(viewPurchase.subtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Discount</span>
                <span className="font-semibold text-slate-900">${Number(viewPurchase.discount || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-300 pt-2">
                <span className="text-slate-700">Total</span>
                <span className="font-bold text-slate-900">${Number(viewPurchase.total || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={supplierModalOpen}
        onClose={closeSupplierModal}
        title={supplierForm.supplier_id ? 'Edit Supplier' : 'New Supplier'}
        size="xl"
      >
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); saveSupplier(); }}
          className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 p-2"
        >
          {/* Supplier Name — spans full width */}
          <div className="md:col-span-2">
            <SupplierField
              label="Supplier Name"
              error={supplierErrors.supplier_name}
              touched={supplierTouched.supplier_name}
              success={supplierForm.supplier_name.trim().length >= 2}
            >
              <input
                className={getSupplierInputCls('supplier_name')}
                placeholder="Enter supplier name"
                value={supplierForm.supplier_name}
                onBlur={() => touchSupplier('supplier_name')}
                onChange={(e) => setSupplierField('supplier_name', e.target.value)}
              />
            </SupplierField>
          </div>

          <SupplierField
            label="Company"
            error={supplierErrors.company_name}
            touched={supplierTouched.company_name}
            success={!!(supplierForm.company_name?.trim())}
          >
            <input
              className={getSupplierInputCls('company_name')}
              placeholder="Company name"
              value={supplierForm.company_name || ''}
              onBlur={() => touchSupplier('company_name')}
              onChange={(e) => setSupplierField('company_name', e.target.value)}
            />
          </SupplierField>

          <SupplierField
            label="Contact Person"
            error={supplierErrors.contact_person}
            touched={supplierTouched.contact_person}
            success={!!(supplierForm.contact_person?.trim())}
          >
            <input
              className={getSupplierInputCls('contact_person')}
              placeholder="Contact person name"
              value={supplierForm.contact_person || ''}
              onBlur={() => touchSupplier('contact_person')}
              onChange={(e) => setSupplierField('contact_person', e.target.value)}
            />
          </SupplierField>

          <SupplierField
            label="Contact Phone"
            error={supplierErrors.contact_phone}
            touched={supplierTouched.contact_phone}
            success={!!(supplierForm.contact_phone?.trim()) && (supplierForm.contact_phone.match(/\d/g) || []).length >= 2}
          >
            <input
              className={getSupplierInputCls('contact_phone')}
              placeholder="+1 555 000 1234"
              value={supplierForm.contact_phone || ''}
              onBlur={() => touchSupplier('contact_phone')}
              onChange={(e) => setSupplierField('contact_phone', e.target.value)}
            />
          </SupplierField>

          <SupplierField
            label="Phone"
            error={supplierErrors.phone}
            touched={supplierTouched.phone}
            success={!!(supplierForm.phone?.trim()) && (supplierForm.phone.match(/\d/g) || []).length >= 2}
          >
            <input
              className={getSupplierInputCls('phone')}
              placeholder="+1 555 123 4567"
              value={supplierForm.phone || ''}
              onBlur={() => touchSupplier('phone')}
              onChange={(e) => setSupplierField('phone', e.target.value)}
            />
          </SupplierField>

          <SupplierField
            label="Location"
            error={supplierErrors.location}
            touched={supplierTouched.location}
            success={!!(supplierForm.location?.trim())}
          >
            <input
              className={getSupplierInputCls('location')}
              placeholder="City / area"
              value={supplierForm.location || ''}
              onBlur={() => touchSupplier('location')}
              onChange={(e) => setSupplierField('location', e.target.value)}
            />
          </SupplierField>

          <SupplierField
            label="Remaining Balance"
            error={supplierErrors.remaining_balance}
            touched={supplierTouched.remaining_balance}
            success={(supplierForm.remaining_balance ?? 0) >= 0}
          >
            <input
              type="number"
              className={getSupplierInputCls('remaining_balance')}
              placeholder="0.00"
              value={supplierForm.remaining_balance ?? 0}
              onBlur={() => touchSupplier('remaining_balance')}
              onChange={(e) => setSupplierField('remaining_balance', Number(e.target.value || 0))}
            />
          </SupplierField>

          <div className="md:col-span-2 flex justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700 mt-1">
            <button
              type="button"
              onClick={closeSupplierModal}
              className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              {supplierForm.supplier_id ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <ImportUploadModal
        isOpen={supplierImportOpen}
        onClose={() => setSupplierImportOpen(false)}
        importType="suppliers"
        title="Upload Suppliers"
        columns={[
          'supplier_name',
          'company_name',
          'contact_person',
          'contact_phone',
          'phone',
          'location',
          'remaining_balance',
          'is_active',
        ]}
        templateHeaders={[
          'supplier_name',
          'company_name',
          'contact_person',
          'contact_phone',
          'phone',
          'location',
          'remaining_balance',
        ]}
        onImported={async () => {
          await loadSuppliers();
        }}
      />

    </div>
  );
};

export default Purchases;
