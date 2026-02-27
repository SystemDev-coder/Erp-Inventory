import { useMemo, useRef, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, RefreshCw, AlertCircle, DollarSign, Wallet, TrendingDown } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { useToast } from '../../components/ui/toast/Toast';
import { Modal } from '../../components/ui/modal/Modal';
import DeleteConfirmModal from '../../components/ui/modal/DeleteConfirmModal';
import { accountService, Account } from '../../services/account.service';
import { customerService, Customer } from '../../services/customer.service';
import { supplierService, Supplier } from '../../services/supplier.service';
import {
    financeService,
    Receipt,
    UnpaidCustomer,
    UnpaidSupplier,
    SupplierOutstandingPurchase,
} from '../../services/finance.service';

type ActiveTab = 'customer-receipts' | 'supplier-receipts';

interface ReceiptFormState {
    acc_id?: number;
    customer_id?: number;
    supplier_id?: number;
    purchase_id?: number;
    amount?: number;
    payment_method?: string;
    reference_no?: string;
    note?: string;
}

type DeleteReceiptTarget = {
    type: 'customer' | 'supplier';
    id: number;
    label: string;
};

const fmt = (n: number | null | undefined) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });

// Small badge for balance status
const BalanceBadge = ({ value }: { value: number }) => {
    const isNegative = value < 0;
    const cls = isNegative
        ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
        : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
            {isNegative ? <TrendingDown className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
            {fmt(Math.abs(value))}
        </span>
    );
};

// Summary stat card
const StatCard = ({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) => (
    <div className={`flex items-center gap-3 rounded-xl p-4 ${color}`}>
        <div className="rounded-lg bg-white/60 p-2">
            <Icon className="h-5 w-5" />
        </div>
        <div>
            <div className="text-xs font-medium opacity-70">{label}</div>
            <div className="text-lg font-bold">{value}</div>
        </div>
    </div>
);

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'Mobile Money', 'Credit Card', 'Other'];

const Receipts = () => {
    const { showToast } = useToast();

    const [activeTab, setActiveTab] = useState<ActiveTab>('customer-receipts');
    const [loading, setLoading] = useState(false);

    // Data
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [customerReceipts, setCustomerReceipts] = useState<Receipt[]>([]);
    const [supplierReceipts, setSupplierReceipts] = useState<Receipt[]>([]);
    const [unpaidCustomers, setUnpaidCustomers] = useState<UnpaidCustomer[]>([]);
    const [unpaidSuppliers, setUnpaidSuppliers] = useState<UnpaidSupplier[]>([]);
    const [outstandingPurchases, setOutstandingPurchases] = useState<SupplierOutstandingPurchase[]>([]);

    // UI state
    const [showCustOutstanding, setShowCustOutstanding] = useState(true);
    const [showSupOutstanding, setShowSupOutstanding] = useState(true);
    const firstLoadRef = useRef(true);

    // Modal state
    const [isCustModalOpen, setIsCustModalOpen] = useState(false);
    const [isSupModalOpen, setIsSupModalOpen] = useState(false);
    const [editingReceiptId, setEditingReceiptId] = useState<number | null>(null);
    const [receiptForm, setReceiptForm] = useState<ReceiptFormState>({});
    const [submitting, setSubmitting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DeleteReceiptTarget | null>(null);
    const [deletingReceipt, setDeletingReceipt] = useState(false);

    // ─── Data Loading ──────────────────────────────────────────────────────────
    const loadAll = async () => {
        setLoading(true);
        try {
            const [accRes, custRes, supRes, crRes, srRes, unpaidC, unpaidS, outPurch] = await Promise.all([
                accountService.list(),
                customerService.list(),
                supplierService.list(),
                financeService.listCustomerReceipts(),
                financeService.listSupplierReceipts(),
                financeService.listCustomerUnpaid(),
                financeService.listSupplierUnpaid(),
                financeService.listSupplierOutstandingPurchases(),
            ]);
            if (accRes.success && accRes.data?.accounts) setAccounts(accRes.data.accounts);
            if (custRes.success && custRes.data?.customers) setCustomers(custRes.data.customers);
            if (supRes.success && supRes.data?.suppliers) setSuppliers(supRes.data.suppliers);
            if (crRes.success && crRes.data?.receipts) setCustomerReceipts(crRes.data.receipts);
            if (srRes.success && srRes.data?.receipts) setSupplierReceipts(srRes.data.receipts);
            if (unpaidC.success && unpaidC.data?.unpaid) setUnpaidCustomers(unpaidC.data.unpaid);
            if (unpaidS.success && unpaidS.data?.unpaid) setUnpaidSuppliers(unpaidS.data.unpaid);
            if (outPurch.success && outPurch.data?.purchases) setOutstandingPurchases(outPurch.data.purchases);

            if (firstLoadRef.current) {
                if (unpaidC.success && (unpaidC.data?.unpaid?.length ?? 0) > 0) setShowCustOutstanding(true);
                if (unpaidS.success && (unpaidS.data?.unpaid?.length ?? 0) > 0) setShowSupOutstanding(true);
                firstLoadRef.current = false;
            }
        } finally {
            setLoading(false);
        }
    };

    const displayReceiptsData = async () => {
        await loadAll();
    };

    // ─── Computed Summaries ────────────────────────────────────────────────────
    const custTotalReceived = customerReceipts.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const custTotalOwed = unpaidCustomers.reduce((s, u) => s + Number(u.balance ?? 0), 0);
    const supTotalPaid = supplierReceipts.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const supTotalOwed = outstandingPurchases.reduce((s, p) => s + Number(p.outstanding ?? 0), 0);

    // ─── Columns ───────────────────────────────────────────────────────────────
    const custReceiptColumns: ColumnDef<Receipt>[] = useMemo(() => [
        {
            accessorKey: 'receipt_date',
            header: 'Date',
            cell: ({ row }) => fmtDate(row.original.receipt_date),
        },
        {
            accessorKey: 'customer_name',
            header: 'Customer',
            cell: ({ row }) => row.original.customer_name || <span className="text-slate-400 italic">—</span>,
        },
        {
            accessorKey: 'account_name',
            header: 'Account',
            cell: ({ row }) => row.original.account_name || '—',
        },
        {
            accessorKey: 'payment_method',
            header: 'Method',
            cell: ({ row }) => row.original.payment_method || '—',
        },
        {
            accessorKey: 'reference_no',
            header: 'Reference',
            cell: ({ row }) => row.original.reference_no || '—',
        },
        {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ row }) => <span className="font-semibold text-emerald-700">{fmt(row.original.amount)}</span>,
        },
    ], []);

    const supReceiptColumns: ColumnDef<Receipt>[] = useMemo(() => [
        {
            accessorKey: 'receipt_date',
            header: 'Date',
            cell: ({ row }) => fmtDate(row.original.receipt_date),
        },
        {
            accessorKey: 'supplier_name',
            header: 'Supplier',
            cell: ({ row }) => row.original.supplier_name || <span className="text-slate-400 italic">—</span>,
        },
        {
            accessorKey: 'account_name',
            header: 'Account',
            cell: ({ row }) => row.original.account_name || '—',
        },
        {
            accessorKey: 'payment_method',
            header: 'Method',
            cell: ({ row }) => row.original.payment_method || '—',
        },
        {
            accessorKey: 'reference_no',
            header: 'Reference',
            cell: ({ row }) => row.original.reference_no || '—',
        },
        {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ row }) => <span className="font-semibold text-blue-700">{fmt(row.original.amount)}</span>,
        },
    ], []);

    const unpaidCustColumns: ColumnDef<UnpaidCustomer>[] = useMemo(() => [
        { accessorKey: 'customer_name', header: 'Customer' },
        { accessorKey: 'total', header: 'Total Sale', cell: ({ row }) => fmt(row.original.total) },
        { accessorKey: 'paid', header: 'Paid', cell: ({ row }) => fmt(row.original.paid) },
        {
            accessorKey: 'balance',
            header: 'Outstanding Balance',
            cell: ({ row }) => <BalanceBadge value={row.original.balance} />,
        },
    ], []);

    const unpaidSupColumns: ColumnDef<UnpaidSupplier>[] = useMemo(() => [
        { accessorKey: 'supplier_name', header: 'Supplier' },
        { accessorKey: 'total', header: 'Total Purchase', cell: ({ row }) => fmt(row.original.total) },
        { accessorKey: 'paid', header: 'Paid', cell: ({ row }) => fmt(row.original.paid) },
        {
            accessorKey: 'balance',
            header: 'Outstanding Balance',
            cell: ({ row }) => <BalanceBadge value={row.original.balance} />,
        },
    ], []);

    const outstandingPurchaseColumns: ColumnDef<SupplierOutstandingPurchase>[] = useMemo(() => [
        { accessorKey: 'purchase_date', header: 'Purchase Date', cell: ({ row }) => fmtDate(row.original.purchase_date) },
        { accessorKey: 'supplier_name', header: 'Supplier' },
        { accessorKey: 'total', header: 'Total', cell: ({ row }) => fmt(row.original.total) },
        { accessorKey: 'paid', header: 'Paid', cell: ({ row }) => fmt(row.original.paid) },
        {
            accessorKey: 'outstanding',
            header: 'Still Owed',
            cell: ({ row }) => <span className="font-bold text-red-600">{fmt(row.original.outstanding)}</span>,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const s = row.original.status;
                const cls = s === 'received' ? 'bg-emerald-50 text-emerald-700' : s === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700';
                return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{s}</span>;
            },
        },
    ], []);

    // ─── Modal Handlers ────────────────────────────────────────────────────────
    const openCustModal = (row?: Receipt) => {
        if (row) {
            setEditingReceiptId(row.receipt_id);
            setReceiptForm({
                acc_id: row.acc_id,
                customer_id: row.customer_id ?? undefined,
                amount: Number(row.amount),
                payment_method: row.payment_method ?? '',
                reference_no: row.reference_no ?? '',
                note: row.note ?? '',
            });
        } else {
            setEditingReceiptId(null);
            setReceiptForm({});
        }
        setIsCustModalOpen(true);
    };

    const openSupModal = (row?: Receipt) => {
        if (row) {
            setEditingReceiptId(row.receipt_id);
            setReceiptForm({
                acc_id: row.acc_id,
                supplier_id: row.supplier_id ?? undefined,
                amount: Number(row.amount),
                payment_method: row.payment_method ?? '',
                reference_no: row.reference_no ?? '',
                note: row.note ?? '',
            });
        } else {
            setEditingReceiptId(null);
            setReceiptForm({});
        }
        setIsSupModalOpen(true);
    };

    const submitCustReceipt = async () => {
        if (!receiptForm.acc_id || !receiptForm.amount) return showToast('error', 'Receipts', 'Account and amount are required');
        if (Number(receiptForm.amount) <= 0) return showToast('error', 'Receipts', 'Amount must be greater than 0');
        setSubmitting(true);
        try {
            const res = editingReceiptId
                ? await financeService.updateCustomerReceipt(editingReceiptId, {
                    acc_id: receiptForm.acc_id,
                    customer_id: receiptForm.customer_id,
                    amount: Number(receiptForm.amount),
                    payment_method: receiptForm.payment_method,
                    reference_no: receiptForm.reference_no,
                    note: receiptForm.note,
                })
                : await financeService.createCustomerReceipt({
                    acc_id: receiptForm.acc_id,
                    customer_id: receiptForm.customer_id,
                    amount: Number(receiptForm.amount),
                    payment_method: receiptForm.payment_method,
                    reference_no: receiptForm.reference_no,
                    note: receiptForm.note,
                });
            if (res.success) {
                showToast('success', 'Receipts', editingReceiptId ? 'Customer receipt updated' : 'Customer receipt saved');
                setIsCustModalOpen(false);
                setReceiptForm({});
                setEditingReceiptId(null);
                loadAll();
            } else {
                showToast('error', 'Receipts', res.error || 'Failed to save receipt');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const deleteCustReceipt = async (id: number) => {
        const res = await financeService.deleteCustomerReceipt(id);
        if (res.success) {
            showToast('success', 'Receipts', 'Receipt deleted');
            await loadAll();
        } else {
            showToast('error', 'Receipts', res.error || 'Delete failed');
        }
    };

    const submitSupReceipt = async () => {
        if (!receiptForm.supplier_id && !receiptForm.purchase_id) {
            return showToast('error', 'Receipts', 'Supplier or linked purchase is required');
        }
        if (!receiptForm.acc_id || !receiptForm.amount) return showToast('error', 'Receipts', 'Account and amount are required');
        if (Number(receiptForm.amount) <= 0) return showToast('error', 'Receipts', 'Amount must be greater than 0');
        setSubmitting(true);
        try {
            const res = editingReceiptId
                ? await financeService.updateSupplierReceipt(editingReceiptId, {
                    acc_id: receiptForm.acc_id,
                    supplier_id: receiptForm.supplier_id,
                    purchase_id: receiptForm.purchase_id,
                    amount: Number(receiptForm.amount),
                    payment_method: receiptForm.payment_method,
                    reference_no: receiptForm.reference_no,
                    note: receiptForm.note,
                })
                : await financeService.createSupplierReceipt({
                    acc_id: receiptForm.acc_id,
                    supplier_id: receiptForm.supplier_id,
                    purchase_id: receiptForm.purchase_id,
                    amount: Number(receiptForm.amount),
                    payment_method: receiptForm.payment_method,
                    reference_no: receiptForm.reference_no,
                    note: receiptForm.note,
                });
            if (res.success) {
                showToast('success', 'Receipts', editingReceiptId ? 'Supplier receipt updated' : 'Supplier payment recorded');
                setIsSupModalOpen(false);
                setReceiptForm({});
                setEditingReceiptId(null);
                loadAll();
            } else {
                showToast('error', 'Receipts', res.error || 'Failed to save receipt');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const deleteSupReceipt = async (id: number) => {
        const res = await financeService.deleteSupplierReceipt(id);
        if (res.success) {
            showToast('success', 'Receipts', 'Receipt deleted');
            await loadAll();
        } else {
            showToast('error', 'Receipts', res.error || 'Delete failed');
        }
    };

    const requestDeleteCustReceipt = (row: Receipt) => {
        setDeleteTarget({
            type: 'customer',
            id: row.receipt_id,
            label: `${row.customer_name || 'Customer'} - ${fmt(row.amount)}`,
        });
    };

    const requestDeleteSupReceipt = (row: Receipt) => {
        setDeleteTarget({
            type: 'supplier',
            id: row.receipt_id,
            label: `${row.supplier_name || 'Supplier'} - ${fmt(row.amount)}`,
        });
    };

    const confirmDeleteReceipt = async () => {
        if (!deleteTarget) return;
        setDeletingReceipt(true);
        try {
            if (deleteTarget.type === 'customer') {
                await deleteCustReceipt(deleteTarget.id);
            } else {
                await deleteSupReceipt(deleteTarget.id);
            }
        } finally {
            setDeletingReceipt(false);
            setDeleteTarget(null);
        }
    };

    // ─── Selected customer/supplier for balance preview ────────────────────────
    const selectedCustomer = customers.find(c => c.customer_id === receiptForm.customer_id);
    const selectedUnpaidCust = unpaidCustomers.find(u => u.customer_id === receiptForm.customer_id);
    const selectedUnpaidSup = unpaidSuppliers.find(u => u.supplier_id === receiptForm.supplier_id);
    const filteredOutstandingBySupplier = outstandingPurchases.filter(
        p => !receiptForm.supplier_id || p.supplier_id === receiptForm.supplier_id
    );

    // ─── Tabs ──────────────────────────────────────────────────────────────────
    const tabs = [
        {
            id: 'customer-receipts',
            label: `Customer Receipts${customerReceipts.length ? ` (${customerReceipts.length})` : ''}`,
            content: (
                <div className="space-y-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <StatCard label="Total Collected" value={fmt(custTotalReceived)} icon={DollarSign} color="bg-emerald-50 text-emerald-800" />
                        <StatCard label="Outstanding Balance" value={fmt(custTotalOwed)} icon={AlertCircle} color="bg-amber-50 text-amber-800" />
                        <StatCard label="Unpaid Customers" value={String(unpaidCustomers.length)} icon={Wallet} color="bg-blue-50 text-blue-800" />
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => void displayReceiptsData()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                            <RefreshCw className="h-4 w-4" /> Display
                        </button>
                        <button
                            onClick={() => openCustModal()}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                            <Plus className="h-4 w-4" /> New Customer Receipt
                        </button>
                        {unpaidCustomers.length > 0 && (
                            <button
                                onClick={() => setShowCustOutstanding(v => !v)}
                                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
                            >
                                <AlertCircle className="h-4 w-4" />
                                {showCustOutstanding ? 'Hide' : 'Show'} Outstanding ({unpaidCustomers.length})
                            </button>
                        )}
                    </div>

                    {/* Outstanding Customers Panel */}
                    {showCustOutstanding && unpaidCustomers.length > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                                <AlertCircle className="h-4 w-4" />
                                Customers with Outstanding Balance
                            </div>
                            <DataTable
                                data={unpaidCustomers}
                                columns={unpaidCustColumns}
                                isLoading={loading}
                                searchPlaceholder="Search customers..."
                                onEdit={(row) => {
                                    const rec = row as UnpaidCustomer;
                                    setReceiptForm({ customer_id: rec.customer_id, amount: rec.balance });
                                    setEditingReceiptId(null);
                                    setIsCustModalOpen(true);
                                }}
                            />
                        </div>
                    )}

                    {/* Main receipts table */}
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-4 py-3">
                            <h3 className="text-sm font-semibold text-slate-700">All Customer Receipts</h3>
                        </div>
                        <DataTable
                            data={customerReceipts}
                            columns={custReceiptColumns}
                            isLoading={loading}
                            searchPlaceholder="Search by customer, reference..."
                            onEdit={(row) => openCustModal(row as Receipt)}
                            onDelete={(row) => requestDeleteCustReceipt(row as Receipt)}
                        />
                    </div>
                </div>
            ),
        },
        {
            id: 'supplier-receipts',
            label: `Supplier Payments${supplierReceipts.length ? ` (${supplierReceipts.length})` : ''}`,
            content: (
                <div className="space-y-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <StatCard label="Total Paid to Suppliers" value={fmt(supTotalPaid)} icon={DollarSign} color="bg-blue-50 text-blue-800" />
                        <StatCard label="Still Owed to Suppliers" value={fmt(supTotalOwed)} icon={TrendingDown} color="bg-red-50 text-red-800" />
                        <StatCard label="Outstanding Purchases" value={String(outstandingPurchases.length)} icon={AlertCircle} color="bg-amber-50 text-amber-800" />
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => void displayReceiptsData()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                            <RefreshCw className="h-4 w-4" /> Display
                        </button>
                        <button
                            onClick={() => openSupModal()}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                        >
                            <Plus className="h-4 w-4" /> New Supplier Payment
                        </button>
                        {outstandingPurchases.length > 0 && (
                            <button
                                onClick={() => setShowSupOutstanding(v => !v)}
                                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
                            >
                                <TrendingDown className="h-4 w-4" />
                                {showSupOutstanding ? 'Hide' : 'Show'} Outstanding ({outstandingPurchases.length})
                            </button>
                        )}
                    </div>

                    {/* Outstanding Suppliers Panel */}
                    {showSupOutstanding && outstandingPurchases.length > 0 && (
                        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-800">
                                <TrendingDown className="h-4 w-4" />
                                Purchases with Outstanding Balance (still owed to suppliers)
                            </div>
                            <DataTable
                                data={outstandingPurchases}
                                columns={outstandingPurchaseColumns}
                                isLoading={loading}
                                searchPlaceholder="Search supplier purchases..."
                                onEdit={(row) => {
                                    const p = row as SupplierOutstandingPurchase;
                                    // Pre-fill the supplier receipt form with the outstanding amount
                                    const sup = suppliers.find(s => s.supplier_id === p.supplier_id);
                                    setReceiptForm({
                                        supplier_id: p.supplier_id ?? sup?.supplier_id,
                                        purchase_id: p.purchase_id,
                                        amount: Number(p.outstanding),
                                    });
                                    setEditingReceiptId(null);
                                    setIsSupModalOpen(true);
                                }}
                            />
                            {/* Outstanding by supplier summary */}
                            {unpaidSuppliers.length > 0 && (
                                <div className="mt-3 border-t border-red-200 pt-3">
                                    <div className="mb-2 text-xs font-semibold text-red-700">By Supplier (net payable)</div>
                                    <DataTable
                                        data={unpaidSuppliers}
                                        columns={unpaidSupColumns}
                                        isLoading={loading}
                                        searchPlaceholder="Search suppliers..."
                                        onEdit={(row) => {
                                            const rec = row as UnpaidSupplier;
                                            setReceiptForm({ supplier_id: rec.supplier_id, amount: rec.balance });
                                            setEditingReceiptId(null);
                                            setIsSupModalOpen(true);
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Main receipts table */}
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 px-4 py-3">
                            <h3 className="text-sm font-semibold text-slate-700">All Supplier Payments</h3>
                        </div>
                        <DataTable
                            data={supplierReceipts}
                            columns={supReceiptColumns}
                            isLoading={loading}
                            searchPlaceholder="Search by supplier, reference..."
                            onEdit={(row) => openSupModal(row as Receipt)}
                            onDelete={(row) => requestDeleteSupReceipt(row as Receipt)}
                        />
                    </div>
                </div>
            ),
        },
    ];

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            <PageHeader
                title="Receipts"
                description="Record customer payments received and track payments made to suppliers."
            />

            <Tabs
                tabs={tabs}
                defaultTab={activeTab}
                onChange={(id) => setActiveTab(id as ActiveTab)}
            />

            {/* ─── Customer Receipt Modal ──────────────────────────────────────── */}
            <Modal
                isOpen={isCustModalOpen}
                onClose={() => { setIsCustModalOpen(false); setEditingReceiptId(null); setReceiptForm({}); }}
                title={editingReceiptId ? 'Edit Customer Receipt' : 'New Customer Receipt'}
                size="md"
            >
                <div className="space-y-4">
                    {/* Customer selector */}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Customer</span>
                        <select
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            value={receiptForm.customer_id ?? ''}
                            onChange={(e) => {
                                const customerId = e.target.value ? Number(e.target.value) : undefined;
                                const unpaid = unpaidCustomers.find((u) => u.customer_id === customerId);
                                const customer = customers.find((c) => c.customer_id === customerId);
                                const nextAmount = Number(unpaid?.balance ?? customer?.balance ?? 0);
                                setReceiptForm((f) => ({
                                    ...f,
                                    customer_id: customerId,
                                    amount: customerId ? nextAmount : f.amount,
                                }));
                            }}
                        >
                            <option value="">— Select Customer (optional) —</option>
                            {customers.map(c => (
                                <option key={c.customer_id} value={c.customer_id}>
                                    {c.full_name}{c.phone ? ` · ${c.phone}` : ''}
                                </option>
                            ))}
                        </select>
                        {selectedUnpaidCust && (
                            <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                Outstanding balance: <strong>{fmt(selectedUnpaidCust.balance)}</strong>
                                <button
                                    type="button"
                                    className="ml-auto rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold hover:bg-amber-300"
                                    onClick={() => setReceiptForm(f => ({ ...f, amount: selectedUnpaidCust.balance }))}
                                >
                                    Use Full Balance
                                </button>
                            </div>
                        )}
                        {selectedCustomer && !selectedUnpaidCust && (
                            <div className="mt-1.5 text-xs text-slate-500">Open balance on account: {fmt(selectedCustomer.balance ?? 0)}</div>
                        )}
                    </label>

                    {/* Account selector */}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Deposit To Account <span className="text-red-500">*</span></span>
                        <select
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            value={receiptForm.acc_id ?? ''}
                            onChange={(e) => setReceiptForm(f => ({ ...f, acc_id: e.target.value ? Number(e.target.value) : undefined }))}
                        >
                            <option value="">— Select Account —</option>
                            {accounts.filter(a => a.is_active).map(a => (
                                <option key={a.acc_id} value={a.acc_id}>
                                    {a.name}{a.institution ? ` · ${a.institution}` : ''} — Balance: {fmt(a.balance)}
                                </option>
                            ))}
                        </select>
                    </label>

                    {/* Amount */}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Amount <span className="text-red-500">*</span></span>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                placeholder="0.00"
                                value={receiptForm.amount ?? ''}
                                onChange={(e) => setReceiptForm(f => ({ ...f, amount: e.target.value ? Number(e.target.value) : undefined }))}
                            />
                        </div>
                    </label>

                    {/* Payment method */}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Payment Method</span>
                        <select
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            value={receiptForm.payment_method ?? ''}
                            onChange={(e) => setReceiptForm(f => ({ ...f, payment_method: e.target.value }))}
                        >
                            <option value="">— Select Method —</option>
                            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </label>

                    {/* Reference + Note */}
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Reference No.</span>
                            <input
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                placeholder="e.g. TXN-001"
                                value={receiptForm.reference_no ?? ''}
                                onChange={(e) => setReceiptForm(f => ({ ...f, reference_no: e.target.value }))}
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Note</span>
                            <input
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                placeholder="Optional note"
                                value={receiptForm.note ?? ''}
                                onChange={(e) => setReceiptForm(f => ({ ...f, note: e.target.value }))}
                            />
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => { setIsCustModalOpen(false); setReceiptForm({}); setEditingReceiptId(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={submitCustReceipt}
                            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {submitting ? 'Saving...' : editingReceiptId ? 'Update Receipt' : 'Save Receipt'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ─── Supplier Receipt Modal ──────────────────────────────────────── */}
            <Modal
                isOpen={isSupModalOpen}
                onClose={() => { setIsSupModalOpen(false); setEditingReceiptId(null); setReceiptForm({}); }}
                title={editingReceiptId ? 'Edit Supplier Payment' : 'New Supplier Payment'}
                size="md"
            >
                <div className="space-y-4">
                    {/* Supplier selector */}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Supplier <span className="text-red-500">*</span></span>
                        <select
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={receiptForm.supplier_id ?? ''}
                            onChange={(e) => setReceiptForm(f => ({ ...f, supplier_id: e.target.value ? Number(e.target.value) : undefined, purchase_id: undefined }))}
                        >
                            <option value="">— Select Supplier —</option>
                            {suppliers.map(s => (
                                <option key={s.supplier_id} value={s.supplier_id}>
                                    {s.supplier_name}
                                </option>
                            ))}
                        </select>
                        {selectedUnpaidSup && (
                            <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800">
                                <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                                Outstanding ledger balance: <strong>{fmt(selectedUnpaidSup.balance)}</strong>
                                <button
                                    type="button"
                                    className="ml-auto rounded bg-red-200 px-1.5 py-0.5 text-xs font-semibold hover:bg-red-300"
                                    onClick={() => setReceiptForm(f => ({ ...f, amount: selectedUnpaidSup.balance }))}
                                >
                                    Use Full Balance
                                </button>
                            </div>
                        )}
                    </label>

                    {/* Outstanding purchase selector */}
                    {filteredOutstandingBySupplier.length > 0 && (
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Link to Outstanding Purchase</span>
                            <select
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={receiptForm.purchase_id ?? ''}
                                onChange={(e) => {
                                    const purchId = e.target.value ? Number(e.target.value) : undefined;
                                    const purch = outstandingPurchases.find(p => p.purchase_id === purchId);
                                    setReceiptForm(f => ({
                                        ...f,
                                        supplier_id: purch?.supplier_id ?? f.supplier_id,
                                        purchase_id: purchId,
                                        amount: purch ? Number(purch.outstanding) : f.amount,
                                    }));
                                }}
                            >
                                <option value="">— Select Purchase (optional) —</option>
                                {filteredOutstandingBySupplier.map(p => (
                                    <option key={p.purchase_id} value={p.purchase_id}>
                                        #{p.purchase_id} · {p.supplier_name} · {fmtDate(p.purchase_date)} · Owed: {fmt(p.outstanding)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    {/* Account selector */}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Pay From Account <span className="text-red-500">*</span></span>
                        <select
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={receiptForm.acc_id ?? ''}
                            onChange={(e) => setReceiptForm(f => ({ ...f, acc_id: e.target.value ? Number(e.target.value) : undefined }))}
                        >
                            <option value="">— Select Account —</option>
                            {accounts.filter(a => a.is_active).map(a => (
                                <option key={a.acc_id} value={a.acc_id}>
                                    {a.name}{a.institution ? ` · ${a.institution}` : ''} — Balance: {fmt(a.balance)}
                                </option>
                            ))}
                        </select>
                    </label>

                    {/* Amount */}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Amount <span className="text-red-500">*</span></span>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="0.00"
                                value={receiptForm.amount ?? ''}
                                onChange={(e) => setReceiptForm(f => ({ ...f, amount: e.target.value ? Number(e.target.value) : undefined }))}
                            />
                        </div>
                    </label>

                    {/* Payment method */}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Payment Method</span>
                        <select
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={receiptForm.payment_method ?? ''}
                            onChange={(e) => setReceiptForm(f => ({ ...f, payment_method: e.target.value }))}
                        >
                            <option value="">— Select Method —</option>
                            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </label>

                    {/* Reference + Note */}
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Reference No.</span>
                            <input
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="e.g. INV-2026-001"
                                value={receiptForm.reference_no ?? ''}
                                onChange={(e) => setReceiptForm(f => ({ ...f, reference_no: e.target.value }))}
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="mb-1 block font-medium text-slate-700">Note</span>
                            <input
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Optional note"
                                value={receiptForm.note ?? ''}
                                onChange={(e) => setReceiptForm(f => ({ ...f, note: e.target.value }))}
                            />
                        </label>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={() => { setIsSupModalOpen(false); setReceiptForm({}); setEditingReceiptId(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={submitSupReceipt}
                            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                        >
                            {submitting ? 'Saving...' : editingReceiptId ? 'Update Payment' : 'Save Payment'}
                        </button>
                    </div>
                </div>
            </Modal>

            <DeleteConfirmModal
                isOpen={!!deleteTarget}
                onClose={() => { if (!deletingReceipt) setDeleteTarget(null); }}
                onConfirm={confirmDeleteReceipt}
                title={deleteTarget?.type === 'supplier' ? 'Delete Supplier Payment?' : 'Delete Customer Receipt?'}
                message={
                    deleteTarget?.type === 'supplier'
                        ? 'This supplier payment will be removed. Account and payable balances will be recalculated.'
                        : 'This customer receipt will be removed. Account and receivable balances will be recalculated.'
                }
                itemName={deleteTarget?.label}
                isDeleting={deletingReceipt}
            />
        </div>
    );
};

export default Receipts;
