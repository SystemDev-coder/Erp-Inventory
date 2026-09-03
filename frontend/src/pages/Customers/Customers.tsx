import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { Users, UserPlus, UserCheck, CheckCircle2 } from 'lucide-react';
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
    remaining_balance: number;
    edit_reason: string;
};

type FieldErrors = Partial<Record<keyof CustomerForm, string>>;

const emptyForm: CustomerForm = {
    full_name: '',
    phone: '',
    customer_type: 'regular',
    address: '',
    gender: 'male',
    is_active: true,
    credit_allowed: true,
    credit_days: 30,
    remaining_balance: 0,
    edit_reason: '',
};

// ── Field-level validation ───────────────────────────────────────────────────
function validateForm(f: CustomerForm): FieldErrors {
    const e: FieldErrors = {};
    if (!f.full_name.trim())
        e.full_name = 'Customer name is required';
    else if (f.full_name.trim().length < 2)
        e.full_name = 'Name must be at least 2 characters';

    if (f.phone.trim()) {
        const digits = f.phone.replace(/\D/g, '');
        if (digits.length < 2)
            e.phone = 'Please add at least 2 numbers';
    }

    if (Number(f.remaining_balance) < 0)
        e.remaining_balance = 'Balance cannot be negative';

    return e;
}

// ── Shared field component ────────────────────────────────────────────────────
type FieldProps = {
    label: string;
    error?: string;
    touched?: boolean;
    success?: boolean;
    children: React.ReactNode;
    hint?: string;
    colSpan?: boolean;
};

function Field({ label, error, touched, success, children, hint, colSpan }: FieldProps) {
    const showError = touched && error;
    const showSuccess = touched && !error && success;
    return (
        <div className={`flex flex-col gap-1 ${colSpan ? 'md:col-span-2' : ''}`}>
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {label}
                </label>
                {showSuccess && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
            </div>
            {children}
            {showError ? (
                <p className="text-xs font-medium text-red-500 dark:text-red-400">{error}</p>
            ) : hint ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>
            ) : null}
        </div>
    );
}

// ── Input class helper ────────────────────────────────────────────────────────
function getInputCls(error?: string, touched?: boolean) {
    const base =
        'h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition-all duration-150 placeholder:text-slate-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';
    if (touched && error)
        return `${base} border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500 dark:bg-red-900/10`;
    if (touched && !error)
        return `${base} border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-600`;
    return `${base} border-slate-200 focus:border-primary-500 focus:ring-primary-500/20 dark:border-slate-700 dark:focus:border-primary-400`;
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
    const [form, setForm] = useState<CustomerForm>(emptyForm);
    const [originalOpeningBalance, setOriginalOpeningBalance] = useState<number | null>(null);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [touched, setTouched] = useState<Partial<Record<keyof CustomerForm, boolean>>>({});
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);

    const validateCurrentForm = (candidate: CustomerForm): FieldErrors => {
        const nextErrors = validateForm(candidate);
        const openingBalanceChanged =
            candidate.customer_id !== undefined &&
            originalOpeningBalance !== null &&
            Number(candidate.remaining_balance) !== originalOpeningBalance;
        if (openingBalanceChanged && !candidate.edit_reason.trim()) {
            nextErrors.edit_reason = 'Reason is required when changing the opening balance';
        }
        return nextErrors;
    };

    // touch a field on blur and validate immediately
    const touch = (field: keyof CustomerForm) => {
        setTouched((prev) => ({ ...prev, [field]: true }));
        setErrors(validateCurrentForm({ ...form }));
    };

    // update form + re-validate touched field live
    const set = <K extends keyof CustomerForm>(field: K, value: CustomerForm[K]) => {
        const next = { ...form, [field]: value };
        setForm(next);
        if (touched[field]) setErrors(validateCurrentForm(next));
    };

    const openModal = (preset?: CustomerForm, openingBalance: number | null = null) => {
        setForm(preset ?? emptyForm);
        setOriginalOpeningBalance(openingBalance);
        setErrors({});
        setTouched({});
        setIsAddOpen(true);
    };

    const closeModal = () => {
        setIsAddOpen(false);
        setOriginalOpeningBalance(null);
        setErrors({});
        setTouched({});
    };

    const fetchCustomers = async () => {
        setLoading(true);
        const res = await customerService.list({
            branchId: activeBranchId ?? undefined,
            limit: 500,
        });
        if (res.success && res.data?.customers) setCustomers(res.data.customers);
        else showToast('error', 'Load failed', res.error || 'Could not load customers');
        setLoading(false);
    };

    const handleDisplay = async () => { setHasDisplayed(true); await fetchCustomers(); };

    useEffect(() => {
        if (hasDisplayed) void fetchCustomers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBranchId]);

    const handleSave = async () => {
        // mark all fields as touched so all errors surface
        const balanceChanged =
            form.customer_id !== undefined &&
            originalOpeningBalance !== null &&
            Number(form.remaining_balance) !== originalOpeningBalance;
        const errs = validateCurrentForm(form);
        const allTouched: Partial<Record<keyof CustomerForm, boolean>> = {
            full_name: true,
            phone: true,
            remaining_balance: true,
            ...(balanceChanged ? { edit_reason: true } : {}),
        };
        setTouched(allTouched);
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;

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
            remaining_balance: Number(form.remaining_balance) || 0,
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
        const openingBalance = Number(row.open_balance ?? row.remaining_balance ?? row.balance ?? 0);
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
            remaining_balance: openingBalance,
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
                        onEdit={onEdit} onDelete={onDelete} />
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
                        columns={columns} isLoading={loading} onEdit={onEdit} onDelete={onDelete} />
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
                        columns={columns} isLoading={loading} onEdit={onEdit} onDelete={onDelete} />
                </div>
            )
        },
    ];

    // derived
    const t = touched;
    const e = errors;
    const balanceChanged =
        form.customer_id !== undefined &&
        originalOpeningBalance !== null &&
        Number(form.remaining_balance) !== originalOpeningBalance;

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
                    noValidate
                    className="space-y-5"
                >
                    {/* Row 1 – Name / Phone */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Customer Name" error={e.full_name} touched={t.full_name} success={!!form.full_name.trim()}>
                            <input
                                type="text"
                                placeholder="e.g. Ahmed Hassan"
                                value={form.full_name}
                                onChange={(ev) => set('full_name', ev.target.value)}
                                onBlur={() => touch('full_name')}
                                className={getInputCls(e.full_name, t.full_name)}
                                disabled={loading}
                                autoComplete="name"
                            />
                        </Field>

                        <Field label="Phone Number" error={e.phone} touched={t.phone} success={!!form.phone.trim() && !e.phone}>
                            <input
                                type="tel"
                                placeholder="e.g. +252 61 123 4567"
                                value={form.phone}
                                onChange={(ev) => set('phone', ev.target.value)}
                                onBlur={() => touch('phone')}
                                className={getInputCls(e.phone, t.phone)}
                                disabled={loading}
                                autoComplete="tel"
                            />
                        </Field>
                    </div>

                    {/* Row 2 – Type / Gender */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field label="Customer Type">
                            <select
                                className={getInputCls()}
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
                                className={getInputCls()}
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
                            className={getInputCls()}
                            disabled={loading}
                            autoComplete="street-address"
                        />
                    </Field>

                    {/* Row 4 – Balance / Credit / Active */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field
                            label="Opening Balance"
                            error={e.remaining_balance}
                            touched={t.remaining_balance}
                            hint="Amount the customer already owes (go-live balance)"
                        >
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="0.00"
                                value={form.remaining_balance}
                                onChange={(ev) => set('remaining_balance', Number(ev.target.value || 0))}
                                onBlur={() => touch('remaining_balance')}
                                className={getInputCls(e.remaining_balance, t.remaining_balance)}
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
                                    className={getInputCls()}
                                    disabled={loading}
                                />
                            </Field>
                        )}

                        {form.customer_id && (
                            <div className="flex items-center self-end pb-2">
                                <label className="relative inline-flex cursor-pointer items-center gap-3">
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

                    {balanceChanged && (
                        <Field
                            label="Reason for Balance Change"
                            error={e.edit_reason}
                            touched={t.edit_reason}
                            hint="Required to keep the customer balance audit trail."
                        >
                            <textarea
                                rows={3}
                                value={form.edit_reason}
                                onChange={(ev) => set('edit_reason', ev.target.value)}
                                onBlur={() => touch('edit_reason')}
                                placeholder="Explain why the opening balance is being changed"
                                className={`${getInputCls(e.edit_reason, t.edit_reason)} h-auto min-h-20 py-2.5`}
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
