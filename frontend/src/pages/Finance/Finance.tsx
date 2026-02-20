import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, RefreshCw } from 'lucide-react';
import { Tabs } from '../../components/ui/tabs';
import { PageHeader } from '../../components/ui/layout';
import { DataTable } from '../../components/ui/table/DataTable';
import { useToast } from '../../components/ui/toast/Toast';
import { accountService, Account } from '../../services/account.service';
import {
  financeService,
  AccountTransfer,
  Receipt,
  ExpenseCharge,
  ExpenseBudget,
  Expense,
  UnpaidCustomer,
  UnpaidSupplier,
} from '../../services/finance.service';
import { Modal } from '../../components/ui/modal/Modal';

const Finance = () => {
  const location = useLocation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [customerReceipts, setCustomerReceipts] = useState<Receipt[]>([]);
  const [supplierReceipts, setSupplierReceipts] = useState<Receipt[]>([]);
  const [expenseCharges, setExpenseCharges] = useState<ExpenseCharge[]>([]);
  const [expenseBudgets, setExpenseBudgets] = useState<ExpenseBudget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [unpaidCustomers, setUnpaidCustomers] = useState<UnpaidCustomer[]>([]);
  const [unpaidSuppliers, setUnpaidSuppliers] = useState<UnpaidSupplier[]>([]);
  const [showCustUnpaid, setShowCustUnpaid] = useState(false);
  const [showSupUnpaid, setShowSupUnpaid] = useState(false);
  const firstLoadRef = useRef(true);
  const [custMonthOnly, setCustMonthOnly] = useState(false);
  const [supMonthOnly, setSupMonthOnly] = useState(false);

  const currentMonth = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    return `${y}-${m}`;
  };

  const [quickCharge, setQuickCharge] = useState({ acc: '', amount: '' });
  const [quickBudget, setQuickBudget] = useState({ expType: '', year: '', month: '', amount: '' });

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountForm, setAccountForm] = useState<{ name: string; institution: string; balance: string }>({
    name: '',
    institution: '',
    balance: '',
  });

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [editingTransferId, setEditingTransferId] = useState<number | null>(null);
  const [transferForm, setTransferForm] = useState<{
    from_acc_id?: number;
    to_acc_id?: number;
    amount?: number;
    reference_no?: string;
    note?: string;
  }>({});
  const [isCustReceiptModalOpen, setIsCustReceiptModalOpen] = useState(false);
  const [isSupReceiptModalOpen, setIsSupReceiptModalOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState<{
    acc_id?: number;
    customer_id?: number;
    supplier_id?: number;
    amount?: number;
    reference_no?: string;
    note?: string;
  }>({});

  const accountColumns: ColumnDef<Account>[] = useMemo(
    () => [
      { accessorKey: 'name', header: 'Account' },
      { accessorKey: 'institution', header: 'Institution', cell: ({ row }) => row.original.institution || '-' },
      { accessorKey: 'currency_code', header: 'Currency' },
      { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => `$${Number(row.original.balance || 0).toFixed(2)}` },
    ],
    []
  );

  const transferColumns: ColumnDef<AccountTransfer>[] = useMemo(
    () => [
      { accessorKey: 'transfer_date', header: 'Date' },
      { accessorKey: 'from_account', header: 'From' },
      { accessorKey: 'to_account', header: 'To' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `$${Number(row.original.amount || 0).toFixed(2)}` },
      { accessorKey: 'reference_no', header: 'Reference' },
      { accessorKey: 'status', header: 'Status' },
    ],
    []
  );

  const receiptColumns: ColumnDef<Receipt>[] = useMemo(
    () => [
      { accessorKey: 'receipt_date', header: 'Date' },
      { accessorKey: 'account_name', header: 'Account' },
      { accessorKey: 'customer_name', header: 'Customer' },
      { accessorKey: 'supplier_name', header: 'Supplier' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `$${Number(row.original.amount || 0).toFixed(2)}` },
    ],
    []
  );

  const unpaidCustomerColumns: ColumnDef<UnpaidCustomer>[] = useMemo(
    () => [
      { accessorKey: 'customer_name', header: 'Customer' },
      { accessorKey: 'total', header: 'Total', cell: ({ row }) => `$${Number(row.original.total || 0).toFixed(2)}` },
      { accessorKey: 'paid', header: 'Paid', cell: ({ row }) => `$${Number(row.original.paid || 0).toFixed(2)}` },
      { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => `$${Number(row.original.balance || 0).toFixed(2)}` },
    ],
    []
  );

  const unpaidSupplierColumns: ColumnDef<UnpaidSupplier>[] = useMemo(
    () => [
      { accessorKey: 'supplier_name', header: 'Supplier' },
      { accessorKey: 'total', header: 'Total', cell: ({ row }) => `$${Number(row.original.total || 0).toFixed(2)}` },
      { accessorKey: 'paid', header: 'Paid', cell: ({ row }) => `$${Number(row.original.paid || 0).toFixed(2)}` },
      { accessorKey: 'balance', header: 'Balance', cell: ({ row }) => `$${Number(row.original.balance || 0).toFixed(2)}` },
    ],
    []
  );

  const chargeColumns: ColumnDef<ExpenseCharge>[] = useMemo(
    () => [
      { accessorKey: 'charge_date', header: 'Date' },
      { accessorKey: 'expense_type', header: 'Type' },
      { accessorKey: 'account_name', header: 'Account' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `$${Number(row.original.amount || 0).toFixed(2)}` },
    ],
    []
  );

  const budgetColumns: ColumnDef<ExpenseBudget>[] = useMemo(
    () => [
      { accessorKey: 'period_year', header: 'Year' },
      { accessorKey: 'period_month', header: 'Month' },
      { accessorKey: 'expense_type', header: 'Type' },
      { accessorKey: 'amount_limit', header: 'Limit', cell: ({ row }) => `$${Number(row.original.amount_limit || 0).toFixed(2)}` },
    ],
    []
  );

  const expenseColumns: ColumnDef<Expense>[] = useMemo(
    () => [
      { accessorKey: 'exp_date', header: 'Date' },
      { accessorKey: 'expense_type', header: 'Type' },
      { accessorKey: 'account_name', header: 'Account' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `$${Number(row.original.amount || 0).toFixed(2)}` },
      { accessorKey: 'note', header: 'Note' },
    ],
    []
  );

  const loadAll = async () => {
    setLoading(true);
    const [acc, tr, cr, sr, ch, bd, ex, unpaidC, unpaidS] = await Promise.all([
      accountService.list(),
      financeService.listTransfers(),
      financeService.listCustomerReceipts(),
      financeService.listSupplierReceipts(),
      financeService.listExpenseCharges(),
      financeService.listExpenseBudgets(),
      financeService.listExpenses(),
      financeService.listCustomerUnpaid(custMonthOnly ? currentMonth() : undefined),
      financeService.listSupplierUnpaid(supMonthOnly ? currentMonth() : undefined),
    ]);
    if (acc.success && acc.data?.accounts) setAccounts(acc.data.accounts);
    if (tr.success && tr.data?.transfers) setTransfers(tr.data.transfers);
    if (cr.success && cr.data?.receipts) setCustomerReceipts(cr.data.receipts);
    if (sr.success && sr.data?.receipts) setSupplierReceipts(sr.data.receipts);
    if (ch.success && ch.data?.charges) setExpenseCharges(ch.data.charges);
    if (bd.success && bd.data?.budgets) setExpenseBudgets(bd.data.budgets);
    if (ex.success && ex.data?.expenses) setExpenses(ex.data.expenses);
    if (unpaidC.success && unpaidC.data?.unpaid) setUnpaidCustomers(unpaidC.data.unpaid);
    if (unpaidS.success && unpaidS.data?.unpaid) setUnpaidSuppliers(unpaidS.data.unpaid);
    if (firstLoadRef.current) {
      if (unpaidC.success && (unpaidC.data?.unpaid?.length || 0) > 0) setShowCustUnpaid(true);
      if (unpaidS.success && (unpaidS.data?.unpaid?.length || 0) > 0) setShowSupUnpaid(true);
      firstLoadRef.current = false;
    }
    setLoading(false);
  };

  const openTransferModal = (row?: AccountTransfer) => {
    if (row) {
      setEditingTransferId(row.acc_transfer_id);
      setTransferForm({
        from_acc_id: row.from_acc_id,
        to_acc_id: row.to_acc_id,
        amount: row.amount,
        reference_no: row.reference_no || '',
        note: row.note || '',
      });
    } else {
      setEditingTransferId(null);
      setTransferForm({});
    }
    setIsTransferModalOpen(true);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const quickError = (msg: string) => showToast('error', 'Finance', msg);

  const openAccountModal = (row?: Account) => {
    if (row) {
      setEditingAccount(row);
      setAccountForm({
        name: row.name,
        institution: row.institution || '',
        balance: String(row.balance ?? 0),
      });
    } else {
      setEditingAccount(null);
      setAccountForm({ name: '', institution: '', balance: '' });
    }
    setIsAccountModalOpen(true);
  };

  const submitAccount = async () => {
    if (!accountForm.name.trim()) return quickError('Account name is required');
    const amount = accountForm.balance.trim() === '' ? 0 : Number(accountForm.balance);
    if (Number.isNaN(amount) || amount < 0) return quickError('Balance must be zero or positive');

    const payload = {
      name: accountForm.name.trim(),
      institution: accountForm.institution.trim() || undefined,
      balance: amount,
    };
    const res = editingAccount
      ? await accountService.update(editingAccount.acc_id, payload)
      : await accountService.create(payload);
    if (res.success) {
      showToast('success', 'Finance', editingAccount ? 'Account updated' : 'Account created');
      setIsAccountModalOpen(false);
      setEditingAccount(null);
      setAccountForm({ name: '', institution: '', balance: '' });
      loadAll();
    } else {
      quickError(res.error || 'Failed to save account');
    }
  };

  const submitTransfer = async () => {
    if (!transferForm.from_acc_id || !transferForm.to_acc_id || !transferForm.amount) {
      return quickError('From, to, amount required');
    }
    if (transferForm.from_acc_id === transferForm.to_acc_id) {
      return quickError('From and To accounts must differ');
    }
    const fromAcc = accounts.find((a) => a.acc_id === transferForm.from_acc_id);
    const toAcc = accounts.find((a) => a.acc_id === transferForm.to_acc_id);
    if (!fromAcc || !toAcc) return quickError('Select valid accounts');
    const amt = Number(transferForm.amount);
    if (amt <= 0 || Number.isNaN(amt)) return quickError('Amount must be > 0');
    const existingTransfer = editingTransferId
      ? transfers.find((t) => t.acc_transfer_id === editingTransferId)
      : undefined;
    const available =
      Number(fromAcc.balance || 0) +
      (existingTransfer && existingTransfer.from_acc_id === fromAcc.acc_id
        ? Number(existingTransfer.amount || 0)
        : 0);
    if (amt > available) {
      return quickError(`Insufficient balance in ${fromAcc.name} (available $${available.toFixed(2)})`);
    }

    const payload = {
      from_acc_id: transferForm.from_acc_id,
      to_acc_id: transferForm.to_acc_id,
      amount: amt,
      reference_no: transferForm.reference_no,
      note: transferForm.note,
      postNow: true,
    };
    const res = editingTransferId
      ? await financeService.updateTransfer(editingTransferId, payload)
      : await financeService.createTransfer(payload);
    if (res.success) {
      showToast('success', 'Finance', editingTransferId ? 'Transfer updated' : 'Transfer posted');
      setIsTransferModalOpen(false);
      setTransferForm({});
      setEditingTransferId(null);
      loadAll();
    } else quickError(res.error || 'Transfer failed');
  };

  const submitCustReceipt = async () => {
    if (!receiptForm.acc_id || !receiptForm.customer_id || !receiptForm.amount)
      return quickError('Account, customer, amount required');
    const res = await financeService.createCustomerReceipt({
      acc_id: receiptForm.acc_id,
      customer_id: receiptForm.customer_id,
      amount: Number(receiptForm.amount),
      reference_no: receiptForm.reference_no,
      note: receiptForm.note,
    });
    if (res.success) {
      showToast('success', 'Finance', 'Customer receipt saved');
      setReceiptForm({});
      setIsCustReceiptModalOpen(false);
      loadAll();
    } else quickError(res.error || 'Receipt failed');
  };

  const submitSupReceipt = async () => {
    if (!receiptForm.acc_id || !receiptForm.supplier_id || !receiptForm.amount)
      return quickError('Account, supplier, amount required');
    const res = await financeService.createSupplierReceipt({
      acc_id: receiptForm.acc_id,
      supplier_id: receiptForm.supplier_id,
      amount: Number(receiptForm.amount),
      reference_no: receiptForm.reference_no,
      note: receiptForm.note,
    });
    if (res.success) {
      showToast('success', 'Finance', 'Supplier receipt saved');
      setReceiptForm({});
      setIsSupReceiptModalOpen(false);
      loadAll();
    } else quickError(res.error || 'Receipt failed');
  };

  const submitCharge = async () => {
    if (!quickCharge.acc || !quickCharge.amount) return quickError('Account and amount required');
    const res = await financeService.createExpenseCharge({
      acc_id: Number(quickCharge.acc),
      amount: Number(quickCharge.amount),
    });
    if (res.success) {
      showToast('success', 'Finance', 'Expense charge saved');
      setQuickCharge({ acc: '', amount: '' });
      loadAll();
    } else quickError(res.error || 'Charge failed');
  };

  const submitBudget = async () => {
    if (!quickBudget.expType || !quickBudget.year || !quickBudget.month || !quickBudget.amount)
      return quickError('All budget fields required');
    const res = await financeService.createExpenseBudget({
      exp_type_id: Number(quickBudget.expType),
      period_year: Number(quickBudget.year),
      period_month: Number(quickBudget.month),
      amount_limit: Number(quickBudget.amount),
    });
    if (res.success) {
      showToast('success', 'Finance', 'Budget saved');
      setQuickBudget({ expType: '', year: '', month: '', amount: '' });
      loadAll();
    } else quickError(res.error || 'Budget failed');
  };

  const section = location.pathname.endsWith('/receipts')
    ? 'receipts'
    : location.pathname.endsWith('/expense')
    ? 'expense'
    : 'accounts';

  const accountsTabs = [
    {
      id: 'accounts',
      label: 'Accounts',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Manage cash/bank accounts.</span>
            <div className="flex items-center gap-2">
              <button
                onClick={loadAll}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={() => openAccountModal()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" /> New Account
              </button>
            </div>
          </div>
          <DataTable
            data={accounts}
            columns={accountColumns}
            isLoading={loading}
            searchPlaceholder="Search accounts..."
            onEdit={(row) => openAccountModal(row as Account)}
          />
        </div>
      ),
    },
    {
      id: 'transfers',
      label: 'Account Transfers',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button
              onClick={() => openTransferModal()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
            >
              <Plus className="h-4 w-4" /> New Transfer
            </button>
          </div>
          <DataTable
            data={transfers}
            columns={transferColumns}
            isLoading={false}
            searchPlaceholder="Search transfers..."
            onEdit={(row) => openTransferModal(row as AccountTransfer)}
          />
        </div>
      ),
    },
  ];

  const receiptsTabs = [
    {
      id: 'customer-receipts',
      label: 'Customer Receipts',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={loadAll}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={() => {
                  setReceiptForm({});
                  setIsCustReceiptModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm text-white transition-all hover:bg-primary-500 hover:-translate-y-0.5 hover:shadow-md"
              >
                <Plus className="h-4 w-4" /> New Customer Receipt
              </button>
              <button
                onClick={() => setShowCustUnpaid((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-primary-600 px-4 py-2 text-sm text-primary-700 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                {showCustUnpaid ? 'Hide Unpaid' : `Unpaid This Month (${unpaidCustomers.length})`}
              </button>
              <button
                onClick={() => {
                  setCustMonthOnly((v) => !v);
                  setTimeout(loadAll, 0);
                }}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all ${
                  custMonthOnly ? 'bg-primary-600 text-white hover:bg-primary-500' : 'border border-slate-300 text-slate-700 hover:-translate-y-0.5 hover:shadow-md'
                }`}
              >
                {custMonthOnly ? 'This Month' : 'All Time'}
              </button>
            </div>
          </div>
          {showCustUnpaid && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 shadow-sm">
              <div className="mb-2 text-xs font-semibold text-amber-800">Unpaid (current month)</div>
              <DataTable
                data={unpaidCustomers}
                columns={unpaidCustomerColumns}
                isLoading={loading}
                searchPlaceholder="Search unpaid customers..."
                onEdit={(row) => {
                  const rec = row as UnpaidCustomer;
                  setReceiptForm({
                    customer_id: rec.customer_id,
                    amount: rec.balance,
                  });
                  setIsCustReceiptModalOpen(true);
                }}
              />
            </div>
          )}
          {!showCustUnpaid && (
            <DataTable
              data={customerReceipts}
              columns={receiptColumns}
              isLoading={loading}
              searchPlaceholder="Search receipts..."
            />
          )}
        </div>
      ),
    },
    {
      id: 'supplier-receipts',
      label: 'Supplier Receipts',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={loadAll}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={() => {
                  setReceiptForm({});
                  setIsSupReceiptModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-4 py-2 text-sm text-white transition-all hover:bg-primary-500 hover:-translate-y-0.5 hover:shadow-md"
              >
                <Plus className="h-4 w-4" /> New Supplier Receipt
              </button>
              <button
                onClick={() => setShowSupUnpaid((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-primary-600 px-4 py-2 text-sm text-primary-700 transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                {showSupUnpaid ? 'Hide Unpaid' : `Unpaid This Month (${unpaidSuppliers.length})`}
              </button>
              <button
                onClick={() => {
                  setSupMonthOnly((v) => !v);
                  setTimeout(loadAll, 0);
                }}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-all ${
                  supMonthOnly ? 'bg-primary-600 text-white hover:bg-primary-500' : 'border border-slate-300 text-slate-700 hover:-translate-y-0.5 hover:shadow-md'
                }`}
              >
                {supMonthOnly ? 'This Month' : 'All Time'}
              </button>
            </div>
          </div>
          {showSupUnpaid && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 shadow-sm">
              <div className="mb-2 text-xs font-semibold text-amber-800">Unpaid (current month)</div>
              <DataTable
                data={unpaidSuppliers}
                columns={unpaidSupplierColumns}
                isLoading={loading}
                searchPlaceholder="Search unpaid suppliers..."
                onEdit={(row) => {
                  const rec = row as UnpaidSupplier;
                  setReceiptForm({
                    supplier_id: rec.supplier_id,
                    amount: rec.balance,
                  });
                  setIsSupReceiptModalOpen(true);
                }}
              />
            </div>
          )}
          {!showSupUnpaid && (
            <DataTable
              data={supplierReceipts}
              columns={receiptColumns}
              isLoading={loading}
              searchPlaceholder="Search receipts..."
            />
          )}
        </div>
      ),
    },
  ];

  const expenseTabs = [
    {
      id: 'expenses',
      label: 'Expenses',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-slate-600">Recent expenses.</span>
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
          <DataTable data={expenses} columns={expenseColumns} isLoading={loading} searchPlaceholder="Search expenses..." />
        </div>
      ),
    },
    {
      id: 'expense-charge',
      label: 'Expense Charge',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                className="w-28 rounded border px-2 py-1"
                placeholder="Account ID"
                value={quickCharge.acc}
                onChange={(e) => setQuickCharge({ ...quickCharge, acc: e.target.value })}
              />
              <input
                className="w-28 rounded border px-2 py-1"
                placeholder="Amount"
                value={quickCharge.amount}
                onChange={(e) => setQuickCharge({ ...quickCharge, amount: e.target.value })}
              />
              <button
                onClick={submitCharge}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
          <DataTable data={expenseCharges} columns={chargeColumns} isLoading={false} searchPlaceholder="Search charges..." />
        </div>
      ),
    },
    {
      id: 'expense-budget',
      label: 'Expense Budget',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                className="w-24 rounded border px-2 py-1"
                placeholder="Type"
                value={quickBudget.expType}
                onChange={(e) => setQuickBudget({ ...quickBudget, expType: e.target.value })}
              />
              <input
                className="w-20 rounded border px-2 py-1"
                placeholder="Year"
                value={quickBudget.year}
                onChange={(e) => setQuickBudget({ ...quickBudget, year: e.target.value })}
              />
              <input
                className="w-16 rounded border px-2 py-1"
                placeholder="Mo"
                value={quickBudget.month}
                onChange={(e) => setQuickBudget({ ...quickBudget, month: e.target.value })}
              />
              <input
                className="w-28 rounded border px-2 py-1"
                placeholder="Amount"
                value={quickBudget.amount}
                onChange={(e) => setQuickBudget({ ...quickBudget, amount: e.target.value })}
              />
              <button
                onClick={submitBudget}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          </div>
          <DataTable data={expenseBudgets} columns={budgetColumns} isLoading={false} searchPlaceholder="Search budgets..." />
        </div>
      ),
    },
  ];
  const sectionContent =
    section === 'receipts' ? (
      <Tabs tabs={receiptsTabs} defaultTab="customer-receipts" />
    ) : section === 'expense' ? (
      <Tabs tabs={expenseTabs} defaultTab="expense-charge" />
    ) : (
      <Tabs tabs={accountsTabs} defaultTab="accounts" />
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Finance" description="Manage accounts, transfers, receipts, and expenses." />
      {sectionContent}

      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title={editingTransferId ? 'Edit Transfer' : 'New Account Transfer'}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">From Account</span>
              <select
                className="w-full rounded border px-3 py-2"
                value={transferForm.from_acc_id ?? ''}
                onChange={(e) => setTransferForm({ ...transferForm, from_acc_id: Number(e.target.value) })}
              >
                <option value="">Select</option>
                {accounts.map((a) => (
                  <option key={a.acc_id} value={a.acc_id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">To Account</span>
              <select
                className="w-full rounded border px-3 py-2"
                value={transferForm.to_acc_id ?? ''}
                onChange={(e) => setTransferForm({ ...transferForm, to_acc_id: Number(e.target.value) })}
              >
                <option value="">Select</option>
                {accounts.map((a) => (
                  <option key={a.acc_id} value={a.acc_id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Amount</span>
              <input
                type="number"
                step="0.01"
                className="w-full rounded border px-3 py-2"
                value={transferForm.amount ?? ''}
                onChange={(e) => setTransferForm({ ...transferForm, amount: Number(e.target.value) })}
              />
            </label>
            <div className="text-xs text-slate-500 col-span-2 space-y-1">
              {(() => {
                const fromAcc = accounts.find((a) => a.acc_id === transferForm.from_acc_id);
                const toAcc = accounts.find((a) => a.acc_id === transferForm.to_acc_id);
                const amt = Number(transferForm.amount || 0);
                const existingTransfer = editingTransferId
                  ? transfers.find((t) => t.acc_transfer_id === editingTransferId)
                  : undefined;
                const fromBase =
                  fromAcc !== undefined
                    ? Number(fromAcc.balance || 0) +
                      (existingTransfer && existingTransfer.from_acc_id === fromAcc.acc_id
                        ? Number(existingTransfer.amount || 0)
                        : 0)
                    : null;
                const toBase =
                  toAcc !== undefined
                    ? Number(toAcc.balance || 0) -
                      (existingTransfer && existingTransfer.to_acc_id === toAcc.acc_id
                        ? Number(existingTransfer.amount || 0)
                        : 0)
                    : null;
                const fromPreview = fromBase !== null && Number.isFinite(amt) ? fromBase - amt : null;
                const toPreview = toBase !== null && Number.isFinite(amt) ? toBase + amt : null;
                return (
                  <>
                    <div>
                      From balance:{' '}
                      {fromBase !== null ? `$${fromBase.toFixed(2)}` : '--'}
                      {fromPreview !== null ? ` -> $${fromPreview.toFixed(2)}` : ''}
                    </div>
                    <div>
                      To balance:{' '}
                      {toBase !== null ? `$${toBase.toFixed(2)}` : '--'}
                      {toPreview !== null ? ` -> $${toPreview.toFixed(2)}` : ''}
                    </div>
                  </>
                );
              })()}
            </div>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Reference</span>
            <input
              className="w-full rounded border px-3 py-2"
              value={transferForm.reference_no || ''}
              onChange={(e) => setTransferForm({ ...transferForm, reference_no: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className="w-full rounded border px-3 py-2"
              value={transferForm.note || ''}
              onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsTransferModalOpen(false)}
              className="rounded border px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitTransfer}
              className="rounded bg-primary-600 px-4 py-2 text-white"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isCustReceiptModalOpen}
        onClose={() => setIsCustReceiptModalOpen(false)}
        title="New Customer Receipt"
        size="md"
      >
        <div className="space-y-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Customer (unpaid list)</span>
            <select
              className="w-full rounded border px-3 py-2"
              value={receiptForm.customer_id ?? ''}
              onChange={(e) => {
                const cid = Number(e.target.value);
                const unpaid = unpaidCustomers.find((u) => u.customer_id === cid);
                setReceiptForm({
                  ...receiptForm,
                  customer_id: cid || undefined,
                  amount: unpaid ? unpaid.balance : receiptForm.amount,
                });
              }}
            >
              <option value="">Select</option>
              {unpaidCustomers.length === 0 && <option disabled>No unpaid customers</option>}
              {unpaidCustomers.map((u) => (
                <option key={u.customer_id} value={u.customer_id}>
                  {u.customer_name} - Due ${Number(u.balance || 0).toFixed(2)}
                </option>
              ))}
            </select>
            {receiptForm.customer_id && (
              <div className="mt-1 text-xs text-slate-500">
                Remaining balance:{' '}
                {(() => {
                  const u = unpaidCustomers.find((x) => x.customer_id === receiptForm.customer_id);
                  return u ? `$${Number(u.balance || 0).toFixed(2)}` : '--';
                })()}
              </div>
            )}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Account</span>
            <select
              className="w-full rounded border px-3 py-2"
              value={receiptForm.acc_id ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, acc_id: Number(e.target.value) })}
            >
              <option value="">Select</option>
              {accounts.map((a) => (
                <option key={a.acc_id} value={a.acc_id}>
                  {a.name} (${Number(a.balance || 0).toFixed(2)})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded border px-3 py-2"
              value={receiptForm.amount ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, amount: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Reference</span>
            <input
              className="w-full rounded border px-3 py-2"
              value={receiptForm.reference_no || ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, reference_no: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className="w-full rounded border px-3 py-2"
              value={receiptForm.note || ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, note: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsCustReceiptModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitCustReceipt} className="rounded bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isSupReceiptModalOpen}
        onClose={() => setIsSupReceiptModalOpen(false)}
        title="New Supplier Receipt"
        size="md"
      >
        <div className="space-y-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Supplier (unpaid list)</span>
            <select
              className="w-full rounded border px-3 py-2"
              value={receiptForm.supplier_id ?? ''}
              onChange={(e) => {
                const sid = Number(e.target.value);
                const unpaid = unpaidSuppliers.find((u) => u.supplier_id === sid);
                setReceiptForm({
                  ...receiptForm,
                  supplier_id: sid || undefined,
                  amount: unpaid ? unpaid.balance : receiptForm.amount,
                });
              }}
            >
              <option value="">Select</option>
              {unpaidSuppliers.length === 0 && <option disabled>No unpaid suppliers</option>}
              {unpaidSuppliers.map((u) => (
                <option key={u.supplier_id} value={u.supplier_id}>
                  {u.supplier_name} - Due ${Number(u.balance || 0).toFixed(2)}
                </option>
              ))}
            </select>
            {receiptForm.supplier_id && (
              <div className="mt-1 text-xs text-slate-500">
                Remaining balance:{' '}
                {(() => {
                  const u = unpaidSuppliers.find((x) => x.supplier_id === receiptForm.supplier_id);
                  return u ? `$${Number(u.balance || 0).toFixed(2)}` : '--';
                })()}
              </div>
            )}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Account</span>
            <select
              className="w-full rounded border px-3 py-2"
              value={receiptForm.acc_id ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, acc_id: Number(e.target.value) })}
            >
              <option value="">Select</option>
              {accounts.map((a) => (
                <option key={a.acc_id} value={a.acc_id}>
                  {a.name} (${Number(a.balance || 0).toFixed(2)})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded border px-3 py-2"
              value={receiptForm.amount ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, amount: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Reference</span>
            <input
              className="w-full rounded border px-3 py-2"
              value={receiptForm.reference_no || ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, reference_no: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className="w-full rounded border px-3 py-2"
              value={receiptForm.note || ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, note: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsSupReceiptModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitSupReceipt} className="rounded bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        title={editingAccount ? 'Edit Account' : 'New Account'}
        size="md"
      >
        <div className="space-y-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Account Name</span>
            <input
              className="w-full rounded border px-3 py-2"
              value={accountForm.name}
              onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              placeholder="e.g. Cash on Hand"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Institution / Bank</span>
            <input
              className="w-full rounded border px-3 py-2"
              value={accountForm.institution}
              onChange={(e) => setAccountForm({ ...accountForm, institution: e.target.value })}
              placeholder="Optional"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Balance</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded border px-3 py-2"
              value={accountForm.balance}
              onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
            />
            {editingAccount && (
              <div className="mt-1 text-xs text-slate-500">
                Current stored balance: ${Number(editingAccount.balance || 0).toFixed(2)}
              </div>
            )}
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsAccountModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitAccount} className="rounded bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Finance;
