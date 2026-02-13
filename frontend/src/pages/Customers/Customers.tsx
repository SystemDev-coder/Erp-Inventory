import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Users, UserPlus, UserCheck } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader, TabActionToolbar } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { ConfirmDialog } from '../../components/ui/modal/ConfirmDialog';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';
import { customerService, Customer } from '../../services/customer.service';

// Lightweight debounce (mirrors Products page)
const debounce = (fn: (...args: any[]) => void, wait = 300) => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const wrapped = (...args: any[]) => {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => {
        if (t) clearTimeout(t);
        t = null;
    };
    return wrapped as typeof fn & { cancel: () => void };
};

type CustomerForm = {
    customer_id?: number;
    full_name: string;
    phone: string;
    customer_type: 'regular' | 'one-time';
    address?: string;
    sex?: 'male' | 'female';
    is_active: boolean;
};

const emptyForm: CustomerForm = {
    full_name: '',
    phone: '',
    customer_type: 'regular',
    address: '',
    sex: undefined,
    is_active: true,
};

const Customers = () => {
    const { showToast } = useToast();
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState<CustomerForm>(emptyForm);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

    const fetchCustomers = async (term?: string) => {
        setLoading(true);
        const res = await customerService.list(term);
        if (res.success && res.data?.customers) {
            setCustomers(res.data.customers);
        } else {
            showToast('error', 'Load failed', res.error || 'Could not load customers');
        }
        setLoading(false);
    };

    const debouncedSearch = useMemo(
        () =>
            debounce((term: string) => {
                fetchCustomers(term);
            }, 300),
        []
    );

    useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

    const columns: ColumnDef<Customer>[] = useMemo(() => [
        { accessorKey: 'full_name', header: 'Customer Name' },
        { accessorKey: 'phone', header: 'Phone Number' },
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
            sex: form.sex,
            is_active: form.is_active,
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
            sex: row.sex as 'male' | 'female' | undefined,
            is_active: row.is_active,
        });
        setIsAddOpen(true);
    };

    const onDelete = (row: Customer) => {
        setCustomerToDelete(row);
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!customerToDelete) return;
        setLoading(true);
        const res = await customerService.remove(customerToDelete.customer_id);
        if (res.success) {
            showToast('success', 'Deleted', `"${customerToDelete.full_name}" removed`);
            fetchCustomers(search);
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
            label: 'All Customers',
            icon: Users,
            content: (
                <div className="space-y-2">
                    <TabActionToolbar
                        title="Customer Directory"
                        primaryAction={{ label: 'New Customer', onClick: () => { setForm(emptyForm); setIsAddOpen(true); } }}
                        onDisplay={() => fetchCustomers()}
                        onSearch={(value: string) => {
                            setSearch(value);
                            debouncedSearch(value);
                        }}
                        onExport={() => showToast('info', 'Export', 'Customer export coming soon')}
                    />
                    <DataTable
                        data={customers}
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
            label: 'Regular Customers',
            icon: UserCheck,
            content: (
                <div className="space-y-2">
                    <DataTable
                        data={customers.filter(c => c.customer_type !== 'one-time')}
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
            label: 'Walking Customers',
            icon: UserPlus,
            content: (
                <div className="space-y-2">
                    <DataTable
                        data={customers.filter(c => c.customer_type === 'one-time')}
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
            <Tabs tabs={tabs} defaultTab="all" />

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title={form.customer_id ? 'Edit Customer' : 'Add New Customer'}
                size="md"
            >
                <form onSubmit={(e) => {
                    e.preventDefault();
                    handleSave();
                }} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Customer Name</label>
                        <input
                            type="text"
                            required
                            placeholder="Full Name"
                            value={form.full_name}
                            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Phone Number</label>
                        <input
                            type="tel"
                            placeholder="+123..."
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Customer Type</label>
                        <select
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                            value={form.customer_type}
                            onChange={(e) => setForm({ ...form, customer_type: e.target.value as 'regular' | 'one-time' })}
                        >
                            <option value="regular">Regular Customer</option>
                            <option value="one-time">One-time Visitor</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Address</label>
                        <input
                            type="text"
                            placeholder="Address (optional)"
                            value={form.address}
                            onChange={(e) => setForm({ ...form, address: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="px-6 py-2.5 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                        <button type="submit" className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95">
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
                message={
                    customerToDelete
                        ? `⚠️ Deleting "${customerToDelete.full_name}" will remove their balance history links. This cannot be undone.`
                        : 'Are you sure you want to delete this customer?'
                }
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                isLoading={loading}
            />
        </div>
    );
};

export default Customers;
