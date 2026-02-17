import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, RefreshCw } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { Modal } from '../../components/ui/modal/Modal';
import { useToast } from '../../components/ui/toast/Toast';
import { accountService, Account } from '../../services/account.service';

type LedgerRow = { date: string; reference: string; amount: number; status: string };

const demoTransfers: LedgerRow[] = [
  { date: '2026-02-15', reference: 'TR-1005', amount: 450, status: 'posted' },
  { date: '2026-02-13', reference: 'TR-1004', amount: 300, status: 'posted' },
];
const demoOtherIncome: LedgerRow[] = [
  { date: '2026-02-15', reference: 'OI-12', amount: 120, status: 'posted' },
  { date: '2026-02-12', reference: 'OI-11', amount: 90, status: 'posted' },
];
const demoEmployeePayments: LedgerRow[] = [
  { date: '2026-02-10', reference: 'EMP-PAY-92', amount: 700, status: 'posted' },
  { date: '2026-02-05', reference: 'EMP-PAY-91', amount: 650, status: 'posted' },
];
const demoExpenses: LedgerRow[] = [
  { date: '2026-02-14', reference: 'EXP-33', amount: 210, status: 'posted' },
  { date: '2026-02-11', reference: 'EXP-32', amount: 145, status: 'posted' },
];
const demoExpenseCharges: LedgerRow[] = [
  { date: '2026-02-13', reference: 'EXP-CH-8', amount: 80, status: 'posted' },
  { date: '2026-02-08', reference: 'EXP-CH-7', amount: 65, status: 'posted' },
];
const demoExpenseBudget: LedgerRow[] = [
  { date: '2026-02-01', reference: 'BUD-MKT', amount: 500, status: 'active' },
  { date: '2026-02-01', reference: 'BUD-OPS', amount: 850, status: 'active' },
];
const demoSupplierLoans: LedgerRow[] = [
  { date: '2026-02-10', reference: 'SUP-LOAN-18', amount: 1300, status: 'open' },
  { date: '2026-02-02', reference: 'SUP-LOAN-17', amount: 900, status: 'partial' },
];
const demoCustomerLoans: LedgerRow[] = [
  { date: '2026-02-12', reference: 'CUS-LOAN-25', amount: 220, status: 'open' },
  { date: '2026-02-06', reference: 'CUS-LOAN-24', amount: 180, status: 'partial' },
];

const Finance = () => {
  const location = useLocation();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState<Partial<Account>>({
    name: '',
    institution: '',
    currency_code: 'USD',
    balance: 0,
    is_active: true,
  });

  const accountColumns: ColumnDef<Account>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Account' },
      { accessorKey: 'institution', header: 'Institution', cell: ({ row }) => row.original.institution || '-' },
      { accessorKey: 'currency_code', header: 'Currency' },
      { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => `$${Number(row.original.balance || 0).toFixed(2)}` },
      { accessorKey: 'is_active', header: 'Active', cell: ({ row }) => (row.original.is_active ? 'Yes' : 'No') },
    ],
    []
  );

  const ledgerColumns: ColumnDef<LedgerRow>[] = useMemo(
    () => [
      { accessorKey: 'date', header: 'Date' },
      { accessorKey: 'reference', header: 'Reference' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `$${Number(row.original.amount || 0).toFixed(2)}` },
      { accessorKey: 'status', header: 'Status' },
    ],
    []
  );

  const fetchAccounts = async () => {
    setLoading(true);
    const res = await accountService.list();
    if (res.success && res.data?.accounts) {
      setAccounts(res.data.accounts);
    } else {
      showToast('error', 'Finance', res.error || 'Failed to load accounts');
    }
    setLoading(false);
  };

  const saveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountForm.name?.trim()) {
      showToast('error', 'Finance', 'Account name is required');
      return;
    }
    setLoading(true);
    const response = editingId
      ? await accountService.update(editingId, {
          name: accountForm.name,
          institution: accountForm.institution || undefined,
          is_active: accountForm.is_active ?? true,
        })
      : await accountService.create({
          name: accountForm.name,
          institution: accountForm.institution || undefined,
          balance: accountForm.balance || 0,
          is_active: accountForm.is_active ?? true,
        });
    setLoading(false);

    if (response.success) {
      showToast('success', 'Finance', editingId ? 'Account updated' : 'Account created');
      setIsAccountModalOpen(false);
      setEditingId(null);
      setAccountForm({ name: '', institution: '', currency_code: 'USD', balance: 0, is_active: true });
      fetchAccounts();
    } else {
      showToast('error', 'Finance', response.error || 'Could not save account');
    }
  };

  const accountsTabs = [
    {
      id: 'accounts',
      label: 'Accounts',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => fetchAccounts()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Display
            </button>
            <button
              onClick={() => {
                setEditingId(null);
                setAccountForm({ name: '', institution: '', currency_code: 'USD', balance: 0, is_active: true });
                setIsAccountModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
            >
              <Plus className="h-4 w-4" /> New Account
            </button>
          </div>
          <DataTable
            data={accounts}
            columns={accountColumns}
            isLoading={loading}
            searchPlaceholder="Search accounts..."
            onEdit={(row) => {
              setEditingId(row.acc_id);
              setAccountForm(row);
              setIsAccountModalOpen(true);
            }}
          />
        </div>
      ),
    },
    {
      id: 'account-transfer',
      label: 'Account Transfer',
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> Display
            </button>
          </div>
          <DataTable data={demoTransfers} columns={ledgerColumns} isLoading={false} searchPlaceholder="Search transfers..." />
        </div>
      ),
    },
    {
      id: 'other-income',
      label: 'Other Income',
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> Display
            </button>
          </div>
          <DataTable data={demoOtherIncome} columns={ledgerColumns} isLoading={false} searchPlaceholder="Search other income..." />
        </div>
      ),
    },
  ];

  const payrollTabs = [
    {
      id: 'employee-payment',
      label: 'Employee Payment',
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> Display
            </button>
          </div>
          <DataTable data={demoEmployeePayments} columns={ledgerColumns} isLoading={false} searchPlaceholder="Search employee payments..." />
        </div>
      ),
    },
  ];

  const expenseTabs = [
    {
      id: 'expense',
      label: 'Expense',
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> Display
            </button>
          </div>
          <DataTable data={demoExpenses} columns={ledgerColumns} isLoading={false} searchPlaceholder="Search expenses..." />
        </div>
      ),
    },
    {
      id: 'expense-charge',
      label: 'Expense Charge',
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> Display
            </button>
          </div>
          <DataTable data={demoExpenseCharges} columns={ledgerColumns} isLoading={false} searchPlaceholder="Search expense charges..." />
        </div>
      ),
    },
    {
      id: 'expense-budget',
      label: 'Expense Budget',
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> Display
            </button>
          </div>
          <DataTable data={demoExpenseBudget} columns={ledgerColumns} isLoading={false} searchPlaceholder="Search expense budget..." />
        </div>
      ),
    },
  ];

  const loansTabs = [
    {
      id: 'supplier-loans',
      label: 'Supplier Loans',
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> Display
            </button>
          </div>
          <DataTable data={demoSupplierLoans} columns={ledgerColumns} isLoading={false} searchPlaceholder="Search supplier loans..." />
        </div>
      ),
    },
    {
      id: 'customer-loans',
      label: 'Customer Loans',
      content: (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> Display
            </button>
          </div>
          <DataTable data={demoCustomerLoans} columns={ledgerColumns} isLoading={false} searchPlaceholder="Search customer loans..." />
        </div>
      ),
    },
  ];

  const section = location.pathname.endsWith('/payroll')
    ? 'payroll'
    : location.pathname.endsWith('/expense')
    ? 'expense'
    : location.pathname.endsWith('/loans')
    ? 'loans'
    : 'accounts';

  const sectionContent =
    section === 'payroll' ? (
      <Tabs tabs={payrollTabs} defaultTab="employee-payment" />
    ) : section === 'expense' ? (
      <Tabs tabs={expenseTabs} defaultTab="expense" />
    ) : section === 'loans' ? (
      <Tabs tabs={loansTabs} defaultTab="supplier-loans" />
    ) : (
      <Tabs tabs={accountsTabs} defaultTab="accounts" />
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Open a finance submenu from the sidebar to view and manage that section."
      />
      {sectionContent}

      <Modal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        title={editingId ? 'Edit Account' : 'New Account'}
        size="md"
      >
        <form onSubmit={saveAccount} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Account Name</span>
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={accountForm.name || ''}
              onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Institution</span>
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={accountForm.institution || ''}
              onChange={(e) => setAccountForm({ ...accountForm, institution: e.target.value })}
            />
          </label>
          {!editingId && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Opening Balance</span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="w-full rounded-lg border px-3 py-2"
                value={Number(accountForm.balance || 0)}
                onChange={(e) => setAccountForm({ ...accountForm, balance: Number(e.target.value || 0) })}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsAccountModalOpen(false)} className="rounded-lg border px-4 py-2">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Finance;
