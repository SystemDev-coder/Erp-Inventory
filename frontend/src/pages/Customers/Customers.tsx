import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { Users, UserPlus, UserCheck } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';
import { customerService, Customer } from '../../services/customer.service';
import ImportUploadModal from '../../components/import/ImportUploadModal';
import { useBranch } from '../../context/BranchContext';

// ── Types ────────────────────────────────────────────────────────────────────
type CustomerForm = {
    customer_id?: number;
    full_name: string;
    phone: string;
    customer_type: 'regular' | 'one-time';
    address: string;
    gender: 'male' | 'female';
    is_active: boolean;
    credit_allowed: boolean;
    credit_days: number;
    // Kept as a string so the input never rewrites what is being typed. Coercing on
    // every keystroke turns "" into "0" and drops a trailing ".", which moves the
    // caret and makes the field (and the reason field below it) flicker.
    remaining_balance: string;
    edit_reason: string;
};

const emptyForm: CustomerForm = {
    full_name: '',
    phone: '',
    customer_type: 'regular',
    address: '',
    gender: 'male',
    is_active: true,
    credit_allowed: true,
    credit_days: 30,
    remaining_balance: '',
    edit_reason: '',
};

const parseBalance = (value: string) => {
    const numeric = Number(String(value).trim());
    return Number.isFinite(numeric) ? numeric : 0;
};

const hasOpeningBalanceChanged = (f: CustomerForm, original: number | null) =>
    f.customer_id !== undefined &&
    original !== null &&
    parseBalance(f.remaining_balance) !== original;

// ── Shared field component ─────────────────────────────────────────────────
// Deliberately has no error/touched/success state: the form relies on native
// HTML5 validation (required/minLength/min on the inputs themselves) instead
// of custom red-border flashing, matching the Employee modal's behavior. The
// browser blocks submission and shows its own message for invalid fields.
type FieldProps = {
    label: string;
    required?: boolean;
    children: React.ReactNode;
    hint?: string;
    colSpan?: boolean;
};

function Field({ label, required, children, hint, colSpan }: FieldProps) {
    return (
        <div className={`flex flex-col gap-1 ${colSpan ? 'md:col-span-2' : ''}`}>
            <label>
                <span>{label}{required ? ' *' : ''}</span>
            </label>
            {children}
            {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
        </div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────
const Customers = () => {
    const { tab } = useParams();
    const { showToast } = useToast();
    const { activeBranchId } = useBranch();

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [hasDisplayed, setHasDisplayed] = useState(false);
    const [loading, setLoading] = useState(false);
    // Server-side pagination: fetch one small page (PAGE_SIZE rows) at a time instead of
    // pulling the whole customer list into the browser on every Display click.
    const PAGE_SIZE = 20;
    const [pageIndex, setPageIndex] = useState(0); // 0-based
    const [totalPages, setTotalPages] = useState(0);
    const [totalRows, setTotalRows] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [form, setForm] = useState<CustomerForm>(emptyForm);
    const [originalOpeningBalance, setOriginalOpeningBalance] = useState<number | null>(null);
    const [reasonRevealed, setReasonRevealed] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);

    // update form state; latch the reason field open once the balance has actually diverged
    // (see hasOpeningBalanceChanged) so it doesn't mount/unmount while the user is still typing
    const set = <K extends keyof CustomerForm>(field: K, value: CustomerForm[K]) => {
        const next = { ...form, [field]: value };
        setForm(next);
        if (hasOpeningBalanceChanged(next, originalOpeningBalance)) setReasonRevealed(true);
    };

    const openModal = (preset?: CustomerForm, openingBalance: number | null = null) => {
        setForm(preset ?? emptyForm);
        setOriginalOpeningBalance(openingBalance);
        setReasonRevealed(false);
        setIsAddOpen(true);
    };

    const closeModal = () => {
        setIsAddOpen(false);
        setOriginalOpeningBalance(null);
        setReasonRevealed(false);
    };

    const fetchCustomers = async (nextPageIndex = pageIndex, search = searchTerm) => {
        setLoading(true);
        const res = await customerService.list({
            branchId: activeBranchId ?? undefined,
            page: nextPageIndex + 1,
            limit: PAGE_SIZE,
            search: search || undefined,
        });
        if (res.success && res.data?.customers) {
            setCustomers(res.data.customers);
            setTotalPages(res.data.pagination?.totalPages ?? 0);
            setTotalRows(res.data.pagination?.total ?? res.data.customers.length);
        } else {
            showToast('error', 'Load failed', res.error || 'Could not load customers');
        }
        setLoading(false);
    };

    const handleDisplay = async () => {
        setHasDisplayed(true);
        setPageIndex(0);
        await fetchCustomers(0, searchTerm);
    };

    const handlePageChange = (next: number) => {
        setPageIndex(next);
        void fetchCustomers(next, searchTerm);
    };

    const handleServerSearch = (value: string) => {
        setSearchTerm(value);
        setPageIndex(0);
        void fetchCustomers(0, value);
    };

    useEffect(() => {
        if (hasDisplayed) {
            setPageIndex(0);
            void fetchCustomers(0, searchTerm);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBranchId]);

    const handleSave = async () => {
        // Required/minLength/min are enforced natively on the inputs (see the form's
        // required attributes below), so the browser blocks submission before this
        // ever runs when a field is invalid - no manual check needed here.
        const balanceChanged = hasOpeningBalanceChanged(form, originalOpeningBalance);
        setLoading(true);
        const payload = {
            full_name: form.full_name.trim(),
            phone: form.phone?.trim() || null,
            customer_type: form.customer_type,
            address: form.address?.trim() || null,
            sex: form.gender,
            gender: form.gender,
            is_active: form.is_active,
            credit_allowed: form.customer_type === 'regular' ? form.credit_allowed : false,
            credit_days: form.customer_type === 'regular' && form.credit_allowed ? form.credit_days : 0,
            remaining_balance: parseBalance(form.remaining_balance),
            edit_reason: balanceChanged ? form.edit_reason.trim() : undefined,
        };
        const res = form.customer_id
            ? await customerService.update(form.customer_id, payload)
            : await customerService.create(payload);
        if (res.success) {
            showToast('success', 'Saved', form.customer_id ? 'Customer updated' : 'Customer added');
            closeModal();
            fetchCustomers();
        } else {
            showToast('error', 'Save failed', res.error || 'Please check the form');
        }
        setLoading(false);
    };

    const onEdit = (row: Customer) => {
        const openingBalance = Number(row.remaining_balance ?? row.balance ?? row.open_balance ?? 0);
        openModal({
            customer_id: row.customer_id,
            full_name: row.full_name,
            phone: row.phone || '',
            customer_type: (row.customer_type as 'regular' | 'one-time') || 'regular',
            address: row.address || '',
            gender: (row.gender || row.sex || 'male') as 'male' | 'female',
            is_active: row.is_active,
            credit_allowed: row.credit_allowed !== false,
            credit_days: Number(row.credit_days ?? 30),
            remaining_balance: String(openingBalance),
            edit_reason: '',
        }, openingBalance);
    };

    const onDelete = (row: Customer) => { setCustomerToDelete(row); setDeleteConfirmOpen(true); };

    const confirmDelete = async (reason: string) => {
        if (!customerToDelete) return;
        setLoading(true);
        const res = await customerService.remove(customerToDelete.customer_id, reason);
        if (res.success) {
            showToast('success', 'Deleted', `"${customerToDelete.full_name}" removed`);
            fetchCustomers();
        } else {
            showToast('error', 'Delete failed', res.error || 'Could not delete customer');
        }
        setLoading(false);
        setCustomerToDelete(null);
        setDeleteConfirmOpen(false);
    };

    const columns: ColumnDef<Customer>[] = useMemo(() => [
        { accessorKey: 'full_name', header: 'Customer Name' },
        { accessorKey: 'phone', header: 'Phone Number' },
        { accessorKey: 'gender', header: 'Gender', cell: ({ row }) => row.original.gender || row.original.sex || '-' },
        { accessorKey: 'customer_type', header: 'Customer Type', cell: ({ row }) => row.original.customer_type === 'one-time' ? 'One-time' : 'Regular' },
        {
            accessorKey: 'balance', header: 'Pending Balance',
            cell: ({ row }) => (
                <span className={Number(row.original.balance) > 0 ? 'font-bold text-red-600' : ''}>
                    ${Number(row.original.balance || 0).toFixed(2)}
                </span>
            )
        },
        {
            accessorKey: 'is_active', header: 'Status',
            cell: ({ row }) => (
                <Badge color={row.original.is_active ? 'success' : 'error'} variant="light">
                    {row.original.is_active ? 'Active' : 'Inactive'}
                </Badge>
            )
        },
    ], []);

    const visibleCustomers = hasDisplayed ? customers : [];

    const emptyHint = (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
            Click <strong>Display</strong> to load data.
        </div>
    );
    const noData = (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
            No customers found for the selected filters.
        </div>
    );

    const sharedToolbar = {
        primaryAction: { label: 'New Customer', onClick: () => openModal() },
        secondaryAction: { label: 'Upload Data', onClick: () => setImportModalOpen(true) },
        onDisplay: handleDisplay,
        displayLoading: loading,
    };

    // Real server-side pagination: `customers` is already just the current PAGE_SIZE-row
    // page from the API (see fetchCustomers), not the whole customer list. The Regular/
    // Walking tabs filter within that same page rather than issuing their own fetch, so
    // they may show fewer than a full page when types are mixed on the current page - a
    // deliberate trade-off to keep one shared fetch/pagination path across all three tabs
    // instead of tripling the state.
    const serverPaginationProps = {
        serverPagination: {
            pageIndex,
            pageSize: PAGE_SIZE,
            pageCount: Math.max(totalPages, 1),
            totalRows,
            onPageChange: handlePageChange,
            onPageSizeChange: () => {}, // fixed page size for now; server enforces PAGE_SIZE
        },
        onServerSearch: handleServerSearch,
    };

    const tabs = [
        {
            id: 'all', label: 'All', icon: Users,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar title="Customer Directory" {...sharedToolbar}
                        onExport={() => showToast('info', 'Export', 'Coming soon')} />
                    {!hasDisplayed && emptyHint}
                    {hasDisplayed && !loading && !visibleCustomers.length && noData}
                    <DataTable data={visibleCustomers} columns={columns}
                        searchPlaceholder="Search by name or phone…" isLoading={loading}
                        onEdit={onEdit} onDelete={onDelete} {...serverPaginationProps} />
                </div>
            )
        },
        {
            id: 'regular', label: 'Regular', icon: UserCheck,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar title="Regular Customers" {...sharedToolbar} />
                    {!hasDisplayed && emptyHint}
                    {hasDisplayed && !loading && !visibleCustomers.filter(c => c.customer_type !== 'one-time').length && noData}
                    <DataTable data={visibleCustomers.filter(c => c.customer_type !== 'one-time')}
                        columns={columns} isLoading={loading} onEdit={onEdit} onDelete={onDelete} {...serverPaginationProps} />
                </div>
            )
        },
        {
            id: 'walking', label: 'Walking', icon: UserPlus,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar title="Walking Customers" {...sharedToolbar} />
                    {!hasDisplayed && emptyHint}
                    {hasDisplayed && !loading && !visibleCustomers.filter(c => c.customer_type === 'one-time').length && noData}
                    <DataTable data={visibleCustomers.filter(c => c.customer_type === 'one-time')}
                        columns={columns} isLoading={loading} onEdit={onEdit} onDelete={onDelete} {...serverPaginationProps} />
                </div>
            )
        },
    ];

    // derived
    const balanceChanged = hasOpeningBalanceChanged(form, originalOpeningBalance);

    return (
        <div>
            <PageHeader title="Customers" description="Manage the people who buy from your shop." />
            <Tabs tabs={tabs} defaultTab={tab === 'regular' || tab === 'walking' ? tab : 'all'} />

            {/* ══ Customer Form Modal ══════════════════════════════════════════ */}
            <Modal
                isOpen={isAddOpen}
                onClose={closeModal}
                title={form.customer_id ? 'Edit Customer' : 'Add New Customer'}
                size="lg"
            >
                <form
                    onSubmit={(ev) => { ev.preventDefault(); handleSave(); }}
                    className="space-y-5"
                >
                    {/* Row 1 – Name / Phone */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Customer Name" required>
                            <input
                                type="text"
                                required
                                minLength={2}
                                placeholder="e.g. Ahmed Hassan"
                                value={form.full_name}
                                onChange={(ev) => set('full_name', ev.target.value)}
                                disabled={loading}
                                autoComplete="name"
                            />
                        </Field>

                        <Field label="Phone Number">
                            <input
                                type="tel"
                                placeholder="e.g. +252 61 123 4567"
                                value={form.phone}
                                onChange={(ev) => set('phone', ev.target.value)}
                                disabled={loading}
                                autoComplete="tel"
                            />
                        </Field>
                    </div>

                    {/* Row 2 – Type / Gender */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Customer Type">
                            <select
                                value={form.customer_type}
                                onChange={(ev) => {
                                    const nextType = ev.target.value as 'regular' | 'one-time';
                                    setForm((prev) => ({
                                        ...prev,
                                        customer_type: nextType,
                                        credit_allowed: nextType === 'regular' ? prev.credit_allowed : false,
                                    }));
                                }}
                                disabled={loading}
                            >
                                <option value="regular">Regular Customer</option>
                                <option value="one-time">One-time Visitor</option>
                            </select>
                        </Field>

                        <Field label="Gender">
                            <select
                                value={form.gender}
                                onChange={(ev) => set('gender', ev.target.value as 'male' | 'female')}
                                disabled={loading}
                            >
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </Field>
                    </div>

                    {/* Row 3 – Address (full width) */}
                    <Field label="Address" colSpan>
                        <input
                            type="text"
                            placeholder="City / Street (optional)"
                            value={form.address}
                            onChange={(ev) => set('address', ev.target.value)}
                            disabled={loading}
                            autoComplete="street-address"
                        />
                    </Field>

                    {/* Row 4 – Balance / Credit / Active */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field
                            label="Opening Balance"
                            hint="Amount the customer already owes (go-live balance)"
                        >
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="0.00"
                                value={form.remaining_balance}
                                onChange={(ev) => set('remaining_balance', ev.target.value)}
                                disabled={loading}
                            />
                        </Field>

                        {form.customer_type === 'regular' && (
                            <div className="flex items-center gap-3 self-center">
                                <input
                                    id="credit-allowed"
                                    type="checkbox"
                                    className="h-4 w-4 accent-primary-600"
                                    checked={form.credit_allowed}
                                    onChange={(ev) => set('credit_allowed', ev.target.checked)}
                                    disabled={loading}
                                />
                                <label htmlFor="credit-allowed" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Credit Allowed
                                </label>
                            </div>
                        )}

                        {form.customer_type === 'regular' && form.credit_allowed && (
                            <Field label="Credit Days" hint="Payment due period for credit sales">
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={form.credit_days}
                                    onChange={(ev) => set('credit_days', Number(ev.target.value || 0))}
                                    disabled={loading}
                                />
                            </Field>
                        )}

                        {form.customer_id && (
                            <div className="flex items-center self-end pb-2">
                                {/* The shared modal CSS forces every <label> into a column layout; this
                                    toggle needs its switch and text side by side, so override it inline. */}
                                <label className="relative inline-flex cursor-pointer items-center gap-3" style={{ flexDirection: 'row' }}>
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            className="peer sr-only"
                                            checked={form.is_active}
                                            onChange={(ev) => set('is_active', ev.target.checked)}
                                            disabled={loading}
                                        />
                                        <div className="h-6 w-11 rounded-full bg-slate-200 transition-colors peer-checked:bg-primary-500 dark:bg-slate-700 peer-checked:dark:bg-primary-500" />
                                        <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {form.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </label>
                            </div>
                        )}
                    </div>

                    {reasonRevealed && (
                        <Field
                            label="Reason for Balance Change"
                            required={balanceChanged}
                            hint={
                                balanceChanged
                                    ? 'Required to keep the customer balance audit trail.'
                                    : 'Balance matches the saved value, so no reason is needed.'
                            }
                        >
                            <textarea
                                rows={3}
                                required={balanceChanged}
                                value={form.edit_reason}
                                onChange={(ev) => set('edit_reason', ev.target.value)}
                                placeholder="Explain why the opening balance is being changed"
                                disabled={loading}
                            />
                        </Field>
                    )}

                    {/* Divider */}
                    <div className="border-t border-slate-100 dark:border-slate-800" />

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={closeModal}
                            disabled={loading}
                            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-lg bg-primary-600 px-7 py-2.5 text-sm font-bold text-white shadow-sm shadow-primary-500/30 transition-all hover:bg-primary-700 active:scale-95 disabled:opacity-60"
                        >
                            {loading ? 'Saving…' : form.customer_id ? 'Update Customer' : 'Save Customer'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ══ Delete confirm ══════════════════════════════════════════════ */}
            <ConfirmDialog
                isOpen={deleteConfirmOpen}
                onClose={() => { setDeleteConfirmOpen(false); setCustomerToDelete(null); }}
                onConfirm={(reason) => void confirmDelete(reason || '')}
                requireReason
                title="Delete Customer?"
                highlightedName={customerToDelete?.full_name}
                message={
                    customerToDelete
                        ? `Cannot delete if outstanding balance exists. Current balance: $${Number(customerToDelete.balance || 0).toFixed(2)}`
                        : 'Are you sure you want to delete this customer?'
                }
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                isLoading={loading}
            />

            {/* ══ Import ══════════════════════════════════════════════════════ */}
            <ImportUploadModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                importType="customers"
                title="Upload Customers"
                columns={['full_name', 'phone', 'customer_type', 'gender', 'address', 'remaining_balance']}
                templateHeaders={['full_name', 'phone', 'gender', 'address', 'remaining_balance']}
                onImported={async () => { if (hasDisplayed) await fetchCustomers(); }}
            />
        </div>
    );
};

export default Customers;
