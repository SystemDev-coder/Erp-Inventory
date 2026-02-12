import { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, BarChart3, TrendingUp, TrendingDown, Users, Wallet, CreditCard, FileText } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import Badge from '../../components/ui/badge/Badge';
import { accountService, Account } from '../../services/account.service';

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
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [accountForm, setAccountForm] = useState<Partial<Account>>({
        name: '',
        institution: '',
        currency_code: 'USD',
        balance: 0,
        is_active: true,
    });

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

    const accountColumns: ColumnDef<Account>[] = useMemo(() => [
        { accessorKey: 'name', header: 'Account' },
        { accessorKey: 'institution', header: 'Institution', cell: ({ row }) => row.original.institution || '-' },
        { accessorKey: 'currency_code', header: 'Currency' },
        { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => `$${Number(row.original.balance || 0).toFixed(2)}` },
        {
            accessorKey: 'is_active',
            header: 'Active',
            cell: ({ row }) => row.original.is_active ? 'Yes' : 'No',
        },
    ], []);

    const fetchAccounts = async () => {
        setLoading(true);
        const res = await accountService.list();
        if (res.success && res.data?.accounts) {
            setAccounts(res.data.accounts);
        } else {
            showToast('error', 'Load failed', res.error || 'Could not load accounts');
        }
        setLoading(false);
    };

    useEffect(() => { fetchAccounts(); }, []);

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
            id: 'accounts',
            label: 'Accounts',
            icon: Wallet,
            content: (
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-slate-600 dark:text-slate-300">Bank and cash accounts</div>
                        <button
                            onClick={() => { setAccountForm({ name: '', institution: '', currency_code: 'USD', balance: 0, is_active: true }); setEditingId(null); setIsAddOpen(true); }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 text-sm"
                        >
                            <Plus size={16} /> New Account
                        </button>
                    </div>
                    <DataTable
                        data={accounts}
                        columns={accountColumns}
                        isLoading={loading}
                        searchPlaceholder="Search accounts..."
                        showToolbarActions={false}
                        onEdit={(row) => {
                            setAccountForm({
                                name: row.name,
                                institution: row.institution || '',
                                currency_code: row.currency_code,
                                balance: row.balance,
                                is_active: row.is_active,
                            });
                            setEditingId(row.acc_id);
                            setIsAddOpen(true);
                        }}
                        onDelete={undefined}
                    />
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
                // actions={
                //     <button
                //         onClick={() => {
                //             setAccountForm({ name: '', institution: '', currency_code: 'USD', balance: 0, is_active: true });
                //             setIsAddOpen(true);
                //         }}
                //         className="flex items-center gap-2 px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-95"
                //     >
                //         <Plus className="w-5 h-5" />
                //         New Account
                //     </button>
                // }
            />
            <Tabs tabs={tabs} defaultTab="overview" />

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title="New Account"
                size="md"
            >
                <div className="p-2 md:p-3">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            (async () => {
                                setLoading(true);
                                const res = await accountService.create({
                                    name: accountForm.name || '',
                                    institution: accountForm.institution,
                                    currency_code: accountForm.currency_code || 'USD',
                                    balance: Number(accountForm.balance || 0),
                                    is_active: accountForm.is_active ?? true,
                                });
                                if (editingId) {
                                    const updateRes = await accountService.update(editingId, {
                                        name: accountForm.name || '',
                                        institution: accountForm.institution,
                                        currency_code: accountForm.currency_code || 'USD',
                                        balance: Number(accountForm.balance || 0),
                                        is_active: accountForm.is_active ?? true,
                                    });
                                    setLoading(false);
                                    const resToUse = updateRes.success ? updateRes : res;
                                    if (resToUse.success && resToUse.data && (resToUse.data as any).account) {
                                        const acct = (resToUse.data as { account: Account }).account;
                                        showToast('success', 'Account updated');
                                        setAccounts((prev) => prev.map((a) => (a.acc_id === editingId ? acct : a)));
                                        setEditingId(null);
                                        setIsAddOpen(false);
                                    } else {
                                        showToast('error', 'Save failed', resToUse.error || 'Check the form');
                                    }
                                    return;
                                }
                                setLoading(false);
                                if (res.success && res.data && (res.data as any).account) {
                                    const acct = (res.data as { account: Account }).account;
                                    showToast('success', 'Account created');
                                    setAccounts((prev) => [acct, ...prev]);
                                    setEditingId(null);
                                    setIsAddOpen(false);
                                } else {
                                    showToast('error', 'Save failed', res.error || 'Check the form');
                                }
                            })();
                        }}
                        className="space-y-4"
                    >
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                            Name
                            <input
                                type="text"
                                required
                                value={accountForm.name || ''}
                                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                                placeholder="Account name"
                                className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                            />
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                                Institution
                                <input
                                    value={accountForm.institution || ''}
                                    onChange={(e) => setAccountForm({ ...accountForm, institution: e.target.value })}
                                    placeholder="Bank name"
                                    className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                                Currency
                                <input
                                    value={accountForm.currency_code || 'USD'}
                                    onChange={(e) =>
                                        setAccountForm({
                                            ...accountForm,
                                            currency_code: e.target.value.toUpperCase().slice(0, 3),
                                        })
                                    }
                                    placeholder="USD"
                                    className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                                />
                            </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                                Opening Balance
                                <input
                                    type="number"
                                    value={accountForm.balance ?? 0}
                                    onChange={(e) => setAccountForm({ ...accountForm, balance: Number(e.target.value || 0) })}
                                    placeholder="0.00"
                                    className="rounded-lg border px-3 py-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                                />
                            </label>
                            <div className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-200 mt-6 md:mt-0">
                                <span>Status:</span>
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={accountForm.is_active ?? true}
                                        onChange={(e) => setAccountForm({ ...accountForm, is_active: e.target.checked })}
                                        className="h-4 w-4 accent-primary-500 rounded"
                                    />
                                    <span className={accountForm.is_active ? 'text-emerald-500' : 'text-slate-400'}>
                                        {accountForm.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsAddOpen(false)}
                                className="px-6 py-2.5 font-semibold text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-8 py-2.5 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 transition-all shadow-md shadow-primary-500/20 active:scale-95"
                            >
                                Save
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>
        </div>
    );
};

export default Finance;
