import { useMemo, useState } from 'react';
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

type CustomerForm = {
    customer_id?: number;
    full_name: string;
    phone: string;
    customer_type: 'regular' | 'one-time';
    address?: string;
    gender: 'male' | 'female';
    is_active: boolean;
    remaining_balance: number;
};

const emptyForm: CustomerForm = {
    full_name: '',
    phone: '',
    customer_type: 'regular',
    address: '',
    gender: 'male',
    is_active: true,
    remaining_balance: 0,
};

const Customers = () => {
    const { tab } = useParams();
    const { showToast } = useToast();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [hasDisplayed, setHasDisplayed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState<CustomerForm>(emptyForm);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);

    const fetchCustomers = async () => {
        setLoading(true);
        const res = await customerService.list();
        if (res.success && res.data?.customers) {
            setCustomers(res.data.customers);
        } else {
            showToast('error', 'Load failed', res.error || 'Could not load customers');
        }
        setLoading(false);
    };

    const handleDisplay = async () => {
        setHasDisplayed(true);
        await fetchCustomers();
    };

    const columns: ColumnDef<Customer>[] = useMemo(() => [
        { accessorKey: 'full_name', header: 'Customer Name' },
        { accessorKey: 'phone', header: 'Phone Number' },
        {
            accessorKey: 'gender',
            header: 'Gender',
            cell: ({ row }) => row.original.gender || row.original.sex || '-',
        },
        {
            accessorKey: 'customer_type',
            header: 'Customer Type',
            cell: ({ row }) => row.original.customer_type === 'one-time' ? 'One-time' : 'Regular',
        },
        {
            accessorKey: 'balance',
            header: 'Pending Balance',
            cell: ({ row }) => (
                <span className={Number(row.original.balance) > 0 ? 'text-red-600 font-bold' : ''}>
                    ${Number(row.original.balance || 0).toFixed(2)}
                </span>
            )
        },
        {
            accessorKey: 'is_active',
            header: 'Status',
            cell: ({ row }) => (
                <Badge
                    color={row.original.is_active ? 'success' : 'error'}
                    variant="light"
                >
                    {row.original.is_active ? 'Active' : 'Inactive'}
                </Badge>
            )
        },
    ], []);

    const handleSave = async () => {
        setLoading(true);
        const payload = {
            full_name: form.full_name,
            phone: form.phone || null,
            customer_type: form.customer_type,
            address: form.address || null,
            sex: form.gender,
            gender: form.gender,
            is_active: form.is_active,
            remaining_balance: Number(form.remaining_balance) || 0,
        };

        const res = form.customer_id
            ? await customerService.update(form.customer_id, payload)
            : await customerService.create(payload);

        if (res.success) {
            showToast('success', 'Saved', form.customer_id ? 'Customer updated' : 'Customer added');
            setIsAddOpen(false);
            setForm(emptyForm);
            fetchCustomers();
        } else {
            showToast('error', 'Save failed', res.error || 'Please check the form');
        }
        setLoading(false);
    };

    const onEdit = (row: Customer) => {
        setForm({
            customer_id: row.customer_id,
            full_name: row.full_name,
            phone: row.phone || '',
            customer_type: (row.customer_type as 'regular' | 'one-time') || 'regular',
            address: row.address || '',
            gender: (row.gender as 'male' | 'female') || (row.sex as 'male' | 'female') || 'male',
            is_active: row.is_active,
            remaining_balance: Number(row.remaining_balance ?? 0),
        });
        setIsAddOpen(true);
    };

    const onDelete = (row: Customer) => {
        setCustomerToDelete(row);
        setDeleteConfirmOpen(true);
    };

    const visibleCustomers = hasDisplayed ? customers : [];

    const confirmDelete = async () => {
        if (!customerToDelete) return;
        setLoading(true);
        const res = await customerService.remove(customerToDelete.customer_id);
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

    const tabs = [
        {
            id: 'all',
            label: 'All',
            icon: Users,
            content: (
                <div className="space-y-2">
                        <TabActionToolbar
                        title="Customer Directory"
                        primaryAction={{ label: 'New Customer', onClick: () => { setForm(emptyForm); setIsAddOpen(true); } }}
                        secondaryAction={{ label: 'Upload Data', onClick: () => setImportModalOpen(true) }}
                        onDisplay={handleDisplay}
                        onExport={() => showToast('info', 'Export', 'Customer export coming soon')}
                    />
                    <DataTable
                        data={visibleCustomers}
                        columns={columns}
                        searchPlaceholder="Find a customer by name or phone..."
                        isLoading={loading}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </div>
            )
        },
        {
            id: 'regular',
            label: 'Regular',
            icon: UserCheck,
            content: (
                <div className="space-y-2">
                        <TabActionToolbar
                        title="Regular Customers"
                        primaryAction={{ label: 'New Customer', onClick: () => { setForm(emptyForm); setIsAddOpen(true); } }}
                        secondaryAction={{ label: 'Upload Data', onClick: () => setImportModalOpen(true) }}
                        onDisplay={handleDisplay}
                    />
                    <DataTable
                        data={visibleCustomers.filter(c => c.customer_type !== 'one-time')}
                        columns={columns}
                        isLoading={loading}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </div>
            )
        },
        {
            id: 'walking',
            label: 'Walking',
            icon: UserPlus,
            content: (
                <div className="space-y-2">
                        <TabActionToolbar
                        title="Walking Customers"
                        primaryAction={{ label: 'New Customer', onClick: () => { setForm(emptyForm); setIsAddOpen(true); } }}
                        secondaryAction={{ label: 'Upload Data', onClick: () => setImportModalOpen(true) }}
                        onDisplay={handleDisplay}
                    />
                    <DataTable
                        data={visibleCustomers.filter(c => c.customer_type === 'one-time')}
                        columns={columns}
                        isLoading={loading}
                        onEdit={onEdit}
                        onDelete={onDelete}
                    />
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader
                title="Customers"
                description="Manage the people who buy from your shop."
            />
            <Tabs tabs={tabs} defaultTab={tab === 'regular' || tab === 'walking' ? tab : 'all'} />

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title={form.customer_id ? 'Edit Customer' : 'Add New Customer'}
                size="md"
            >
                <form onSubmit={(e) => {
                    e.preventDefault();
                    handleSave();
                }} className="mx-auto max-w-xl space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Customer Name</label>
                            <input
                                type="text"
                                required
                                placeholder="Full Name"
                                value={form.full_name}
                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Phone Number</label>
                            <input
                                type="tel"
                                placeholder="+123..."
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Customer Type</label>
                            <select
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                                value={form.customer_type}
                                onChange={(e) => setForm({ ...form, customer_type: e.target.value as 'regular' | 'one-time' })}
                            >
                                <option value="regular">Regular Customer</option>
                                <option value="one-time">One-time Visitor</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Gender</label>
                            <select
                                required
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                                value={form.gender}
                                onChange={(e) => setForm({ ...form, gender: e.target.value as 'male' | 'female' })}
                            >
                                <option value="male">Male</option>
                                <option value="female">Female</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Address</label>
                            <input
                                type="text"
                                placeholder="Address (optional)"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Remaining Balance</label>
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="0.00"
                                value={form.remaining_balance}
                                onChange={(e) => setForm({ ...form, remaining_balance: Number(e.target.value || 0) })}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800"
                            />
                            <p className="text-xs text-slate-500">Opening balance or amount customer owes</p>
                        </div>
                    </div>

                    <div className="flex justify-center gap-3 pt-2">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="rounded-xl px-5 py-2 font-bold text-slate-600 transition-all hover:bg-slate-100">Cancel</button>
                        <button type="submit" className="rounded-xl bg-primary-600 px-7 py-2 text-white font-bold transition-all shadow-lg shadow-primary-500/20 hover:bg-primary-700 active:scale-95">
                            {form.customer_id ? 'Update Customer' : 'Save Customer'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={deleteConfirmOpen}
                onClose={() => { setDeleteConfirmOpen(false); setCustomerToDelete(null); }}
                onConfirm={confirmDelete}
                title="Delete Customer?"
                highlightedName={customerToDelete?.full_name}
                message={
                    customerToDelete
                        ? 'Deleting this customer will remove their balance history links. This cannot be undone.'
                        : 'Are you sure you want to delete this customer?'
                }
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                isLoading={loading}
            />

            <ImportUploadModal
                isOpen={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                importType="customers"
                title="Upload Customers"
                columns={['full_name', 'phone', 'customer_type', 'gender', 'address', 'remaining_balance']}
                templateHeaders={['full_name', 'phone', 'gender', 'address', 'remaining_balance']}
                onImported={async () => {
                    if (hasDisplayed) {
                        await fetchCustomers();
                    }
                }}
            />
        </div>
    );
};

export default Customers;
