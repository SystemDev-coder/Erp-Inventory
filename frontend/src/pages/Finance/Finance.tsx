import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, BarChart3, TrendingUp, TrendingDown, Users, Wallet, CreditCard, FileText } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';

// Mock Data
const mockFinance = [
    { id: '1', date: '2026-02-03', description: 'Sale #1240 - Cash', type: 'Income', amount: 125.00, status: 'Completed' },
    { id: '2', date: '2026-02-03', description: 'Utility Bill - Office', type: 'Expense', amount: -340.00, status: 'Completed' },
    { id: '3', date: '2026-02-02', description: 'Customer Payment - John Doe', type: 'Income', amount: 450.00, status: 'Completed' },
    { id: '4', date: '2026-02-02', description: 'Supplier Payment - Apple Inc', type: 'Expense', amount: -2500.00, status: 'Pending' },
    { id: '5', date: '2026-02-01', description: 'Refund for Order #1230', type: 'Expense', amount: -45.00, status: 'Completed' },
];

const Finance = () => {
    const { showToast } = useToast();
    const [isAddOpen, setIsAddOpen] = useState(false);

    const columns: ColumnDef<any>[] = [
        { accessorKey: 'date', header: 'Date' },
        { accessorKey: 'description', header: 'Description' },
        {
            accessorKey: 'amount',
            header: 'Amount',
            cell: ({ row }) => (
                <span className={row.original.amount < 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>
                    {row.original.amount < 0 ? '-' : '+'}${Math.abs(row.original.amount).toFixed(2)}
                </span>
            )
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => (
                <Badge
                    color={row.original.status === 'Completed' ? 'success' : 'warning'}
                    variant="light"
                >
                    {row.original.status}
                </Badge>
            )
        },
    ];

    const tabs = [
        {
            id: 'overview',
            label: 'Overview',
            icon: BarChart3,
            content: (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">Cash in Hand</p>
                        <h3 className="text-2xl font-bold mt-2">$24,500.00</h3>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">Total Money In (Month)</p>
                        <h3 className="text-2xl font-bold mt-2 text-emerald-600">$12,400.00</h3>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-sm font-medium text-slate-500">Total Money Out (Month)</p>
                        <h3 className="text-2xl font-bold mt-2 text-red-600">$8,200.00</h3>
                    </div>
                </div>
            )
        },
        {
            id: 'money-in',
            label: 'Money In',
            icon: TrendingUp,
            content: (
                <DataTable
                    data={mockFinance.filter(f => f.type === 'Income')}
                    columns={columns}
                    searchPlaceholder="Search income records..."
                />
            )
        },
        {
            id: 'money-out',
            label: 'Money Out',
            icon: TrendingDown,
            content: (
                <DataTable
                    data={mockFinance.filter(f => f.type === 'Expense')}
                    columns={columns}
                    searchPlaceholder="Search expense records..."
                />
            )
        },
        {
            id: 'customer-payments',
            label: 'Customer Payments',
            icon: Users,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Payments received from customers on credit.
                </div>
            )
        },
        {
            id: 'supplier-payments',
            label: 'Supplier Payments',
            icon: Wallet,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Payments made to your suppliers.
                </div>
            )
        },
        {
            id: 'customer-balances',
            label: 'Customer Balances',
            icon: CreditCard,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    List of customers who owe you money.
                </div>
            )
        },
        {
            id: 'supplier-balances',
            label: 'Supplier Balances',
            icon: CreditCard,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    List of suppliers you owe money to.
                </div>
            )
        },
        {
            id: 'reports',
            label: 'Reports',
            icon: FileText,
            content: (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500">
                    Financial summaries and tax reports.
                </div>
            )
        }
    ];

    return (
        <div>
            <PageHeader
                title="Finance Management"
                description="Track all money coming in and going out of your business."
                actions={
                    <button
                        onClick={() => setIsAddOpen(true)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                    >
                        <Plus className="w-5 h-5" />
                        Record Payment
                    </button>
                }
            />
            <Tabs tabs={tabs} defaultTab="overview" />

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title="Record New Payment"
                size="md"
            >
                <form onSubmit={(e) => {
                    e.preventDefault();
                    showToast('success', 'Payment Recorded', 'The financial transaction has been saved.');
                    setIsAddOpen(false);
                }} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Payment Type</label>
                        <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all">
                            <option>Money In (Income)</option>
                            <option>Money Out (Expense)</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Description</label>
                        <input type="text" required placeholder="e.g. Monthly Rent, Sale Payment" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Amount</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input type="number" step="0.01" required placeholder="0.00" className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:ring-2 focus:ring-primary-500 outline-none transition-all" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={() => setIsAddOpen(false)} className="px-6 py-2.5 font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">Cancel</button>
                        <button type="submit" className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95">Record Transaction</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Finance;
