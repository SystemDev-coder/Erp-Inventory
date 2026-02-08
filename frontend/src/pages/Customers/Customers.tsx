import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Users, UserPlus, UserCheck, History } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';

// Mock Data
const mockCustomers = [
    { id: '1', name: 'John Doe', phone: '+123456789', type: 'Regular', balance: 450.00, status: 'Active' },
    { id: '2', name: 'Emily Watson', phone: '+198765432', type: 'Regular', balance: 0.00, status: 'Active' },
    { id: '3', name: 'Walking Customer', phone: '-', type: 'One-time', balance: 0.00, status: 'Active' },
    { id: '4', name: 'Mark Smith', phone: '+112233445', type: 'Regular', balance: 120.50, status: 'Inactive' },
];

const Customers = () => {
    const { showToast } = useToast();
    const [isAddOpen, setIsAddOpen] = useState(false);

    const columns: ColumnDef<any>[] = [
        { accessorKey: 'name', header: 'Customer Name' },
        { accessorKey: 'phone', header: 'Phone Number' },
        { accessorKey: 'type', header: 'Customer Type' },
        {
            accessorKey: 'balance',
            header: 'Pending Balance',
            cell: ({ row }) => (
                <span className={row.original.balance > 0 ? 'text-red-600 font-bold' : ''}>
                    ${row.original.balance.toFixed(2)}
                </span>
            )
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => (
                <Badge
                    color={row.original.status === 'Active' ? 'success' : 'error'}
                    variant="light"
                >
                    {row.original.status}
                </Badge>
            )
        },
    ];

    const tabs = [
        {
            id: 'all',
            label: 'All Customers',
            icon: Users,
            badge: mockCustomers.length,
            content: (
                <DataTable
                    data={mockCustomers}
                    columns={columns}
                    searchPlaceholder="Find a customer by name or phone..."
                />
            )
        },
        {
            id: 'regular',
            label: 'Regular Customers',
            icon: UserCheck,
            content: (
                <DataTable
                    data={mockCustomers.filter(c => c.type === 'Regular')}
                    columns={columns}
                />
            )
        },
        {
            id: 'walking',
            label: 'Walking Customers',
            icon: UserPlus,
            content: (
                <DataTable
                    data={mockCustomers.filter(c => c.type === 'One-time')}
                    columns={columns}
                />
            )
        },
        {
            id: 'history',
            label: 'Customer History',
            icon: History,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    View history of sales for each customer.
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader
                title="Customers"
                description="Manage the people who buy from your shop."
                actions={
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Add Customer
                    </button>
                }
            />
            <Tabs tabs={tabs} defaultTab="all" />

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title="Add New Customer"
                size="md"
            >
                <form onSubmit={(e) => {
                    e.preventDefault();
                    showToast('success', 'Customer Added!', 'The new customer has been added to your list.');
                    setIsAddOpen(false);
                }} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Customer Name</label>
                        <input type="text" required placeholder="Full Name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Phone Number</label>
                        <input type="tel" placeholder="+123..." className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Customer Type</label>
                        <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all">
                            <option>Regular Customer</option>
                            <option>One-time Visitor</option>
                        </select>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="px-6 py-2.5 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                        <button type="submit" className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95">Save Customer</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Customers;
