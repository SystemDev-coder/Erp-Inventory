import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, RefreshCw, SquarePen, Trash, History, CalendarClock } from 'lucide-react';
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
  ExpensePayment,
  PayrollRow,
} from '../../services/finance.service';
import { Modal } from '../../components/ui/modal/Modal';

const Finance = () => {
  const location = useLocation();
  const { showToast } = useToast();

  const currentMonth = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    return `${y}-${m}`;
  };

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
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [payrollPeriod, setPayrollPeriod] = useState(currentMonth());
  const [showCustUnpaid, setShowCustUnpaid] = useState(false);
  const [showSupUnpaid, setShowSupUnpaid] = useState(false);
  const firstLoadRef = useRef(true);
  const [custMonthOnly, setCustMonthOnly] = useState(false);
  const [supMonthOnly, setSupMonthOnly] = useState(false);

const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
const [editingAccount, setEditingAccount] = useState<Account | null>(null);
const [accountForm, setAccountForm] = useState<{ name: string; institution: string; balance: string }>({
  name: '',
  institution: '',
  balance: '',
});
const [accountErrors, setAccountErrors] = useState<{ name?: string; balance?: string }>({});

const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
const [editingTransferId, setEditingTransferId] = useState<number | null>(null);
const [transferForm, setTransferForm] = useState<{
  from_acc_id?: number;
  to_acc_id?: number;
  amount?: number;
  reference_no?: string;
  note?: string;
}>({});
const [transferErrors, setTransferErrors] = useState<{ from?: string; to?: string; amount?: string }>({});
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
const [custReceiptErrors, setCustReceiptErrors] = useState<{ acc?: string; customer?: string; amount?: string }>({});
const [supReceiptErrors, setSupReceiptErrors] = useState<{ acc?: string; supplier?: string; amount?: string }>({});

  // Expenses / budgets modal state
const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
const [expenseForm, setExpenseForm] = useState<{ name: string }>({ name: '' });
const [expenseErrors, setExpenseErrors] = useState<{ name?: string }>({});

const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
const [editingBudget, setEditingBudget] = useState<ExpenseBudget | null>(null);
const [budgetForm, setBudgetForm] = useState<{ exp_id?: number; fixed_amount?: number; note?: string }>({});
const [budgetErrors, setBudgetErrors] = useState<{ exp?: string; amount?: string }>({});

const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
const [editingChargeId, setEditingChargeId] = useState<number | null>(null);
const [chargeForm, setChargeForm] = useState<{ exp_id?: number; amount?: number; note?: string; exp_date?: string; reg_date?: string }>({});
const [chargeErrors, setChargeErrors] = useState<{ exp?: string; amount?: string }>({});

const [isPayChargeModalOpen, setIsPayChargeModalOpen] = useState(false);
const [isEditingPayment, setIsEditingPayment] = useState(false);
const [payChargeForm, setPayChargeForm] = useState<{ exp_ch_id?: number; acc_id?: number; amount?: number; pay_date?: string; reference_no?: string; note?: string }>({});
const [isPayHistoryOpen, setIsPayHistoryOpen] = useState(false);
const [payHistory, setPayHistory] = useState<ExpensePayment[]>([]);
const [payErrors, setPayErrors] = useState<{ acc?: string; amount?: string }>({});

const [isBudgetChargeModalOpen, setIsBudgetChargeModalOpen] = useState(false);
const [isDeleteChargeModalOpen, setIsDeleteChargeModalOpen] = useState(false);
const [pendingDeleteChargeId, setPendingDeleteChargeId] = useState<number | null>(null);
const [budgetChargeForm, setBudgetChargeForm] = useState<{ pay_date?: string; oper?: string }>({});
const [budgetChargeError, setBudgetChargeError] = useState<string>('');

const [isChargePayrollModalOpen, setIsChargePayrollModalOpen] = useState(false);
const [chargePayrollForm, setChargePayrollForm] = useState<{ period_date?: string }>({});
const [isPaySalaryModalOpen, setIsPaySalaryModalOpen] = useState(false);
const [paySalaryForm, setPaySalaryForm] = useState<{ payroll_line_id?: number; acc_id?: number; amount?: number; pay_date?: string; note?: string }>({});
const [paySalaryErrors, setPaySalaryErrors] = useState<{ acc?: string; amount?: string; date?: string }>({});
const [chargePayrollError, setChargePayrollError] = useState('');
const [isDeletePayrollModalOpen, setIsDeletePayrollModalOpen] = useState(false);
const [deletePayrollMode, setDeletePayrollMode] = useState<'line' | 'period'>('line');
const [pendingPayrollLineId, setPendingPayrollLineId] = useState<number | null>(null);

  const todayDate = () => new Date().toISOString().slice(0, 10);
  const todayDateTimeLocal = () => new Date().toISOString().slice(0, 16);
  const formatDate = (value?: string | Date | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10) || '-';
    return d.toISOString().slice(0, 10);
  };

  const fieldClass =
    'w-full rounded border px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700';

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
      { accessorKey: 'transfer_date', header: 'Date', cell: ({ row }) => formatDate(row.original.transfer_date) },
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
      { accessorKey: 'receipt_date', header: 'Date', cell: ({ row }) => formatDate(row.original.receipt_date) },
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
      { accessorKey: 'exp_date', header: 'Date', cell: ({ row }) => formatDate(row.original.exp_date) },
      { accessorKey: 'expense_name', header: 'Expense' },
      { accessorKey: 'amount', header: 'Amount', cell: ({ row }) => `$${Number(row.original.amount || 0).toFixed(2)}` },
      {
        id: 'is_budget',
        header: 'Budget?',
        cell: ({ row }) =>
          row.original.is_budget || row.original.exp_budget ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
              Budget
            </span>
          ) : (
            <span className="text-xs text-slate-500">Expense</span>
          ),
      },
      {
        id: 'remaining',
        header: 'Remaining',
        cell: ({ row }) => {
          const paid = Number(row.original.paid_sum || 0);
          const remaining = Math.max(0, Number(row.original.amount || 0) - paid);
          return `$${remaining.toFixed(2)}`;
        },
      },
      { accessorKey: 'created_by', header: 'By', cell: ({ row }) => row.original.created_by || '-' },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            {!!row.original.exp_id && (
              <button
                className="px-3 py-1.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold disabled:opacity-40"
                aria-label="Full payment"
                onClick={() => {
                  const ch = row.original;
                  const paid = Number(ch.paid_sum || 0);
                  const remaining = Math.max(0, Number(ch.amount || 0) - paid);
                  setIsEditingPayment(false);
                  setPayChargeForm({
                    exp_ch_id: ch.exp_ch_id,
                    acc_id: accounts[0]?.acc_id,
                    amount: remaining || ch.amount,
                    pay_date: todayDate(),
                    reference_no: '',
                    note: '',
                  });
                  setIsPayChargeModalOpen(true);
                }}
                disabled={Number(row.original.amount || 0) - Number(row.original.paid_sum || 0) <= 0}
              >
                {Number(row.original.amount || 0) - Number(row.original.paid_sum || 0) <= 0 ? 'Paid' : 'Full Payment'}
              </button>
            )}
            {!!row.original.exp_id && (
              <button
                className="p-2 text-slate-600 hover:text-slate-800"
                aria-label="View payment history"
                onClick={() => openPayHistory(row.original.exp_ch_id, row.original.exp_id)}
              >
                <History className="h-5 w-5" />
              </button>
            )}
            <button
              className="p-2 text-slate-600 hover:text-slate-800"
              aria-label="Edit expense charge"
              onClick={() => {
                const ch = row.original;
                setEditingChargeId(ch.exp_ch_id);
                setChargeForm({
                  exp_id: ch.exp_id,
                  amount: ch.amount,
                  note: ch.note || '',
                  exp_date: ch.exp_date ? ch.exp_date.slice(0, 10) : '',
                  reg_date: ch.reg_date ? ch.reg_date.slice(0, 10) : ch.exp_date ? ch.exp_date.slice(0, 10) : undefined,
                });
                setIsChargeModalOpen(true);
              }}
            >
              <SquarePen className="h-5 w-5" />
            </button>
            <button
              className="p-2 text-slate-600 hover:text-red-600"
              aria-label="Delete expense charge"
              onClick={() => {
                setPendingDeleteChargeId(row.original.exp_ch_id);
                setIsDeleteChargeModalOpen(true);
              }}
            >
              <Trash className="h-5 w-5" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  const budgetColumns: ColumnDef<ExpenseBudget>[] = useMemo(
    () => [
      { accessorKey: 'budget_id', header: 'ID' },
      { accessorKey: 'expense_name', header: 'Expense' },
      {
        accessorKey: 'fixed_amount',
        header: 'Amount',
        cell: ({ row }) => `$${Number(row.original.fixed_amount || row.original.amount_limit || 0).toFixed(2)}`,
      },
      { accessorKey: 'note', header: 'Note', cell: ({ row }) => row.original.note || '-' },
      { accessorKey: 'created_by', header: 'By', cell: ({ row }) => row.original.created_by || '-' },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <button
              className="p-2 text-slate-600 hover:text-slate-800"
              aria-label="Edit budget"
              onClick={() => {
                const b = row.original;
                setEditingBudget(b);
                setBudgetForm({
                  exp_id: b.exp_id,
                  fixed_amount: b.fixed_amount || b.amount_limit,
                  note: b.note || '',
                });
                setIsBudgetModalOpen(true);
              }}
            >
              <SquarePen className="h-5 w-5" />
            </button>
            <button
              className="p-2 text-slate-600 hover:text-red-600"
              aria-label="Delete budget"
              onClick={async () => {
                if (!confirm('Delete this budget?')) return;
                const res = await financeService.deleteExpenseBudget(row.original.budget_id);
                if (res.success) {
                  showToast('success', 'Finance', 'Budget deleted');
                  loadAll();
                } else {
                  quickError(res.error || 'Delete failed');
                }
              }}
            >
              <Trash className="h-5 w-5" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  const payrollColumns: ColumnDef<PayrollRow>[] = useMemo(
    () => [
      {
        accessorKey: 'full_name',
        header: 'Employee',
      },
      {
        accessorKey: 'net_salary',
        header: 'Salary',
        cell: ({ row }) => `$${Number(row.original.net_salary || 0).toFixed(2)}`,
      },
      {
        id: 'paid',
        header: 'Paid',
        cell: ({ row }) => `$${Number(row.original.paid_sum || 0).toFixed(2)}`,
      },
      {
        id: 'remaining',
        header: 'Remaining',
        cell: ({ row }) => {
          const remaining = Math.max(0, Number(row.original.net_salary || 0) - Number(row.original.paid_sum || 0));
          return `$${remaining.toFixed(2)}`;
        },
      },
      {
        id: 'period',
        header: 'Period',
        cell: ({ row }) =>
          row.original.period_year && row.original.period_month
            ? `${row.original.period_year}-${String(row.original.period_month).padStart(2, '0')}`
            : '-',
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const remaining = Math.max(0, Number(row.original.net_salary || 0) - Number(row.original.paid_sum || 0));
          return (
            <div className="flex items-center gap-3">
              <button
                className="px-3 py-1.5 rounded-lg text-white bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold disabled:opacity-40"
                aria-label="Pay salary"
                disabled={remaining <= 0}
                onClick={() => {
                  setPaySalaryForm({
                    payroll_line_id: row.original.payroll_line_id || undefined,
                    acc_id: accounts[0]?.acc_id,
                    amount: remaining > 0 ? remaining : row.original.net_salary || 0,
                    pay_date: todayDate(),
                    note: '',
                  });
                  setPaySalaryErrors({});
                  setIsPaySalaryModalOpen(true);
                }}
              >
                {remaining <= 0 ? 'Paid' : 'Pay'}
              </button>
              <button
                className="p-2 text-slate-600 hover:text-slate-800"
                aria-label="Edit salary line"
                onClick={() => {
                  setPaySalaryForm({
                    payroll_line_id: row.original.payroll_line_id || undefined,
                    acc_id: accounts[0]?.acc_id,
                    amount: remaining > 0 ? remaining : row.original.net_salary || 0,
                    pay_date: todayDate(),
                    note: '',
                  });
                  setPaySalaryErrors({});
                  setIsPaySalaryModalOpen(true);
                }}
              >
                <SquarePen className="h-5 w-5" />
              </button>
              <button
                className="p-2 text-slate-600 hover:text-red-600"
                aria-label="Delete salary charge"
                onClick={() => {
                  setPendingPayrollLineId(row.original.payroll_line_id || null);
                  setDeletePayrollMode('line');
                  setIsDeletePayrollModalOpen(true);
                }}
              >
                <Trash className="h-5 w-5" />
              </button>
            </div>
          );
        },
      },
    ],
    [accounts]
  );

  const loadAll = async () => {
    setLoading(true);
    const [acc, tr, cr, sr, ch, bd, ex, unpaidC, unpaidS, pr] = await Promise.all([
      accountService.list(),
      financeService.listTransfers(),
      financeService.listCustomerReceipts(),
      financeService.listSupplierReceipts(),
      financeService.listExpenseCharges(),
      financeService.listExpenseBudgets(),
      financeService.listExpenses(),
      financeService.listCustomerUnpaid(custMonthOnly ? currentMonth() : undefined),
      financeService.listSupplierUnpaid(supMonthOnly ? currentMonth() : undefined),
      financeService.listPayroll(payrollPeriod),
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
    if (pr.success && pr.data?.payroll) setPayroll(pr.data.payroll);
    if (firstLoadRef.current) {
      if (unpaidC.success && (unpaidC.data?.unpaid?.length || 0) > 0) setShowCustUnpaid(true);
      if (unpaidS.success && (unpaidS.data?.unpaid?.length || 0) > 0) setShowSupUnpaid(true);
      firstLoadRef.current = false;
    }
    setLoading(false);

    // derive paid charge set
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
    const errs: typeof accountErrors = {};
    if (!accountForm.name.trim()) errs.name = 'Account name is required';
    const amount = accountForm.balance.trim() === '' ? 0 : Number(accountForm.balance);
    if (Number.isNaN(amount) || amount < 0) errs.balance = 'Balance must be zero or positive';
    setAccountErrors(errs);
    if (Object.keys(errs).length) return;

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
      setAccountErrors({});
      loadAll();
    } else {
      quickError(res.error || 'Failed to save account');
    }
  };

  const submitTransfer = async () => {
    const errs: typeof transferErrors = {};
    if (!transferForm.from_acc_id) errs.from = 'From account required';
    if (!transferForm.to_acc_id) errs.to = 'To account required';
    if (transferForm.from_acc_id && transferForm.to_acc_id && transferForm.from_acc_id === transferForm.to_acc_id) {
      errs.to = 'From and To accounts must differ';
    }
    const fromAcc = accounts.find((a) => a.acc_id === transferForm.from_acc_id);
    const toAcc = accounts.find((a) => a.acc_id === transferForm.to_acc_id);
    if (!fromAcc || !toAcc) errs.from = errs.from || 'Select valid accounts';
    const amt = Number(transferForm.amount);
    if (amt <= 0 || Number.isNaN(amt)) errs.amount = 'Amount must be > 0';
    setTransferErrors(errs);
    if (Object.keys(errs).length) return;
    // type guard: fromAcc and toAcc exist here
    if (!fromAcc || !toAcc) return;
    const existingTransfer = editingTransferId
      ? transfers.find((t) => t.acc_transfer_id === editingTransferId)
      : undefined;
    const available =
      Number(fromAcc!.balance || 0) +
      (existingTransfer && existingTransfer.from_acc_id === fromAcc!.acc_id
        ? Number(existingTransfer.amount || 0)
        : 0);
    if (amt > available) {
      return quickError(`Insufficient balance in ${fromAcc!.name} (available $${available.toFixed(2)})`);
    }

    const payload = {
      from_acc_id: transferForm.from_acc_id!,
      to_acc_id: transferForm.to_acc_id!,
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
      setTransferErrors({});
      setEditingTransferId(null);
      loadAll();
    } else quickError(res.error || 'Transfer failed');
  };

  const submitCustReceipt = async () => {
    const errs: typeof custReceiptErrors = {};
    if (!receiptForm.acc_id) errs.acc = 'Account required';
    if (!receiptForm.customer_id) errs.customer = 'Customer required';
    if (!receiptForm.amount || receiptForm.amount <= 0) errs.amount = 'Amount must be greater than 0';
    setCustReceiptErrors(errs);
    if (Object.keys(errs).length) return;
    const res = await financeService.createCustomerReceipt({
      acc_id: receiptForm.acc_id!,
      customer_id: receiptForm.customer_id!,
      amount: Number(receiptForm.amount),
      reference_no: receiptForm.reference_no,
      note: receiptForm.note,
    });
    if (res.success) {
      showToast('success', 'Finance', 'Customer receipt saved');
      setReceiptForm({});
      setCustReceiptErrors({});
      setIsCustReceiptModalOpen(false);
      loadAll();
    } else quickError(res.error || 'Receipt failed');
  };

  const submitSupReceipt = async () => {
    const errs: typeof supReceiptErrors = {};
    if (!receiptForm.acc_id) errs.acc = 'Account required';
    if (!receiptForm.supplier_id) errs.supplier = 'Supplier required';
    if (!receiptForm.amount || receiptForm.amount <= 0) errs.amount = 'Amount must be greater than 0';
    setSupReceiptErrors(errs);
    if (Object.keys(errs).length) return;
    const res = await financeService.createSupplierReceipt({
      acc_id: receiptForm.acc_id!,
      supplier_id: receiptForm.supplier_id!,
      amount: Number(receiptForm.amount),
      reference_no: receiptForm.reference_no,
      note: receiptForm.note,
    });
    if (res.success) {
      showToast('success', 'Finance', 'Supplier receipt saved');
      setReceiptForm({});
      setSupReceiptErrors({});
      setIsSupReceiptModalOpen(false);
      loadAll();
    } else quickError(res.error || 'Receipt failed');
  };

  const submitCharge = async () => {
    const errs: typeof chargeErrors = {};
    if (!chargeForm.exp_id) errs.exp = 'Expense is required';
    if (chargeForm.amount === undefined || Number(chargeForm.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    setChargeErrors(errs);
    if (Object.keys(errs).length) return;
    const resolvedDate = chargeForm.exp_date || todayDate();
    const payload = {
      exp_id: chargeForm.exp_id,
      amount: Number(chargeForm.amount),
      note: chargeForm.note,
      exp_date: resolvedDate,
      reg_date: chargeForm.reg_date || resolvedDate,
    };
    const res = editingChargeId
      ? await financeService.updateExpenseCharge(editingChargeId, payload)
      : await financeService.createExpenseCharge(payload);
    if (res.success) {
      showToast('success', 'Finance', editingChargeId ? 'Expense charge updated' : 'Expense charge saved');
      setChargeForm({});
      setChargeErrors({});
      setEditingChargeId(null);
      setIsChargeModalOpen(false);
      loadAll();
    } else quickError(res.error || 'Charge failed');
  };

  const submitPayCharge = async () => {
    const errs: typeof payErrors = {};
    if (!payChargeForm.exp_ch_id) errs.acc = 'Select a charge';
    if (!payChargeForm.acc_id) errs.acc = 'Account required';
    if (!payChargeForm.amount || payChargeForm.amount <= 0) errs.amount = 'Amount must be greater than 0';
    setPayErrors(errs);
    if (Object.keys(errs).length) return;
    const res = await financeService.createExpensePayment({
      exp_ch_id: payChargeForm.exp_ch_id!,
      acc_id: payChargeForm.acc_id!,
      amount: payChargeForm.amount,
      pay_date: payChargeForm.pay_date,
      reference_no: payChargeForm.reference_no,
      note: payChargeForm.note,
    });
    if (res.success) {
      showToast('success', 'Finance', isEditingPayment ? 'Expense payment updated' : 'Expense payment recorded');
      setIsPayChargeModalOpen(false);
      setPayChargeForm({});
      setPayErrors({});
      loadAll();
    } else {
      if ((res as any).status === 404) {
        quickError('Cannot pay: expense record missing for this charge.');
        setIsPayChargeModalOpen(false);
      } else {
        quickError(res.error || 'Payment failed');
      }
    }
  };

  const openPayHistory = async (exp_ch_id: number, exp_id?: number) => {
    const res = await financeService.listExpensePayments({ chargeId: exp_ch_id, expenseId: exp_id });
    if (res.success && res.data) {
      setPayHistory(res.data.payments || []);
      setIsPayHistoryOpen(true);
    } else {
      quickError(res.error || 'Unable to load payments');
    }
  };

const submitBudget = async () => {
  const errs: typeof budgetErrors = {};
  if (!budgetForm.exp_id) errs.exp = 'Expense is required';
  if (budgetForm.fixed_amount === undefined || Number(budgetForm.fixed_amount) <= 0)
    errs.amount = 'Amount must be greater than 0';
  setBudgetErrors(errs);
  if (Object.keys(errs).length) return;

    const payload = {
      exp_id: budgetForm.exp_id!,
      fixed_amount: Number(budgetForm.fixed_amount),
      note: budgetForm.note,
    };
  const res = editingBudget
    ? await financeService.updateExpenseBudget(editingBudget.budget_id, payload)
    : await financeService.createExpenseBudget(payload);
  if (res.success) {
    showToast('success', 'Finance', editingBudget ? 'Budget updated' : 'Budget saved');
    setBudgetForm({});
    setBudgetErrors({});
    setEditingBudget(null);
    setIsBudgetModalOpen(false);
    loadAll();
  } else quickError(res.error || 'Budget failed');
};

const submitBudgetCharge = async () => {
  if (!budgetChargeForm.pay_date) {
    setBudgetChargeError('Date is required to charge budgets');
    return;
  }
  if (!expenseBudgets.length) {
    setBudgetChargeError('No expense budgets available. Create one first.');
    return;
  }
  setBudgetChargeError('');
  const res = await financeService.manageExpenseBudgetCharges({
    reg_date: budgetChargeForm.pay_date,
    oper: 'SYNC',
  });
    if (res.success) {
      showToast('success', 'Finance', 'Budget charged');
      setBudgetChargeForm({});
      setIsBudgetChargeModalOpen(false);
      loadAll();
    } else quickError(res.error || 'Charge failed');
  };

  const submitChargeSalary = async () => {
    if (!chargePayrollForm.period_date) {
      setChargePayrollError('Period date is required');
      return;
    }
    setChargePayrollError('');
    const res = await financeService.chargeSalaries({ periodDate: chargePayrollForm.period_date });
    if (res.success) {
      showToast('success', 'Finance', 'Salaries charged');
      setIsChargePayrollModalOpen(false);
      setChargePayrollForm({});
      loadAll();
    } else {
      quickError(res.error || 'Charge salaries failed');
    }
  };

  const submitPaySalary = async () => {
    const errs: typeof paySalaryErrors = {};
    if (!paySalaryForm.payroll_line_id) errs.amount = 'Select an employee line';
    if (!paySalaryForm.acc_id) errs.acc = 'Account required';
    if (!paySalaryForm.amount || Number(paySalaryForm.amount) <= 0) errs.amount = 'Amount must be greater than 0';
    if (!paySalaryForm.pay_date) errs.date = 'Pay date required';
    setPaySalaryErrors(errs);
    if (Object.keys(errs).length) return;
    const res = await financeService.paySalary({
      payroll_line_id: paySalaryForm.payroll_line_id!,
      acc_id: paySalaryForm.acc_id!,
      amount: paySalaryForm.amount,
      pay_date: paySalaryForm.pay_date,
      note: paySalaryForm.note,
    });
    if (res.success) {
      showToast('success', 'Finance', 'Salary paid');
      setIsPaySalaryModalOpen(false);
      setPaySalaryForm({});
      setPaySalaryErrors({});
      loadAll();
    } else {
      quickError(res.error || 'Salary payment failed');
    }
  };

  const submitExpense = async () => {
    if (!expenseForm.name.trim()) {
      setExpenseErrors({ name: 'Expense name required' });
      return;
    }
    setExpenseErrors({});
    const payload = {
      name: expenseForm.name.trim(),
    };
    const res = editingExpense
      ? await financeService.updateExpense(editingExpense.exp_id, payload)
      : await financeService.createExpense(payload);
    if (res.success) {
      showToast('success', 'Finance', editingExpense ? 'Expense updated' : 'Expense created');
      setExpenseForm({ name: '' });
      setEditingExpense(null);
      setIsExpenseModalOpen(false);
      loadAll();
    } else quickError(res.error || 'Expense failed');
  };

  const isPayrollRoute = location.pathname.includes('/finance/payroll');
  const section = isPayrollRoute
    ? 'payroll'
    : location.pathname.endsWith('/receipts')
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

  const expenseColumns: ColumnDef<Expense>[] = useMemo(
    () => [
      { accessorKey: 'exp_id', header: 'ID' },
      { accessorKey: 'name', header: 'Expense' },
      { accessorKey: 'created_at', header: 'Created At', cell: ({ row }) => formatDate(row.original.created_at) },
      { accessorKey: 'created_by', header: 'Created By', cell: ({ row }) => row.original.created_by || '-' },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <button
              className="p-2 text-slate-600 hover:text-slate-800"
              aria-label="Edit expense"
              onClick={() => {
                const exp = row.original;
                setEditingExpense(exp);
                setExpenseForm({
                  name: exp.name,
                });
                setIsExpenseModalOpen(true);
              }}
            >
              <SquarePen className="h-5 w-5" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  const expenseTabs = [
    {
      id: 'expenses',
      label: 'Expenses',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={loadAll}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-2 text-sm"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={() => {
                  setEditingExpense(null);
                  setExpenseForm({ name: '' });
                  setIsExpenseModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-3 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" /> New Expense
              </button>
            </div>
          </div>
          <DataTable
            data={expenses}
            columns={expenseColumns}
            isLoading={loading}
            searchPlaceholder="Search expenses..."
            className="rounded-2xl overflow-hidden border border-slate-200 shadow-md"
            headerClassName="bg-slate-900 text-white"
            rowHoverClassName="hover:bg-slate-50"
          />
        </div>
      ),
    },
    {
      id: 'expense-charge',
      label: 'Expense Charge',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={loadAll}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-2 text-sm"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={() => {
                  setChargeForm({
                    exp_id: expenses[0]?.exp_id,
                    amount: undefined,
                    note: '',
                    exp_date: todayDate(),
                    reg_date: todayDate(),
                  });
                  setIsChargeModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-3 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" /> New Charge
              </button>
            </div>
          </div>
          <DataTable
            data={expenseCharges}
            columns={chargeColumns}
            isLoading={false}
            searchPlaceholder="Search charges..."
            className="rounded-2xl overflow-hidden border border-slate-200 shadow-md"
            headerClassName="bg-slate-900 text-white"
            rowHoverClassName="hover:bg-slate-50"
          />
        </div>
      ),
    },
    {
      id: 'expense-budget',
      label: 'Expense Budget',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={loadAll}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-2 text-sm"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button
                onClick={() => {
                  setEditingBudget(null);
                  setBudgetForm({
                    exp_id: expenses[0]?.exp_id,
                    fixed_amount: undefined,
                    note: '',
                  });
                  setIsBudgetModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-3 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" /> New Budget
              </button>
              <button
                onClick={() => {
                  setBudgetChargeForm({
                    pay_date: todayDateTimeLocal(),
                    oper: 'SYNC',
                  });
                  setIsBudgetChargeModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-2 text-sm text-white"
              >
                <Plus className="h-4 w-4" /> Charge Budget
              </button>
            </div>
          </div>
          <DataTable
            data={expenseBudgets}
            columns={budgetColumns}
            isLoading={false}
            searchPlaceholder="Search budgets..."
            className="rounded-2xl overflow-hidden border border-slate-200 shadow-md"
            headerClassName="bg-slate-900 text-white"
            rowHoverClassName="hover:bg-slate-50"
          />
        </div>
      ),
    },
  ];

  const payrollTab = {
    id: 'employee-payment',
    label: 'Employee Payment',
    content: (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={loadAll}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <button
              onClick={() => {
                setChargePayrollForm({ period_date: `${payrollPeriod}-01T00:00` });
                setChargePayrollError('');
                setIsChargePayrollModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-3 py-2 text-sm text-white"
            >
              <CalendarClock className="h-4 w-4" /> Charge Salary
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-sm flex items-center gap-2">
              <span className="text-slate-600">Period</span>
              <input
                type="month"
                className="rounded border px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                value={payrollPeriod}
                onChange={(e) => {
                  setPayrollPeriod(e.target.value);
                  setTimeout(loadAll, 0);
                }}
              />
            </label>
          </div>
        </div>
        <DataTable
          data={payroll}
          columns={payrollColumns}
          isLoading={loading}
          searchPlaceholder="Search employees..."
          className="rounded-2xl overflow-hidden border border-slate-200 shadow-md"
          headerClassName="bg-slate-900 text-white"
          rowHoverClassName="hover:bg-slate-50"
        />
      </div>
    ),
  };
  const sectionContent =
    section === 'payroll' ? (
      <Tabs tabs={[payrollTab]} defaultTab="employee-payment" />
    ) : section === 'receipts' ? (
      <Tabs tabs={receiptsTabs} defaultTab="customer-receipts" />
    ) : section === 'expense' ? (
      <Tabs tabs={expenseTabs} defaultTab="expense-charge" />
    ) : (
      <Tabs tabs={accountsTabs} defaultTab="accounts" />
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title={section === 'payroll' ? 'Employee Payment' : 'Finance'}
        description={
          section === 'payroll'
            ? 'Charge salaries and record employee payments.'
            : 'Manage accounts, transfers, receipts, and expenses.'
        }
      />
      {sectionContent}

      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title={editingTransferId ? 'Edit Transfer' : 'New Account Transfer'}
        size="md"
      >
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">From Account</span>
              <select
                className={fieldClass}
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
              {transferErrors.from && <p className="mt-1 text-xs text-red-500">{transferErrors.from}</p>}
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">To Account</span>
              <select
                className={fieldClass}
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
              {transferErrors.to && <p className="mt-1 text-xs text-red-500">{transferErrors.to}</p>}
            </label>
          </div>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Amount</span>
              <input
                type="number"
                step="0.01"
                className={fieldClass}
                value={transferForm.amount ?? ''}
                onChange={(e) => setTransferForm({ ...transferForm, amount: Number(e.target.value) })}
              />
              {transferErrors.amount && <p className="mt-1 text-xs text-red-500">{transferErrors.amount}</p>}
            </label>
            <div className="text-xs text-slate-500 col-span-2 space-y-1">
              {(() => {
                const fromAcc = accounts.find((a) => a.acc_id === transferForm.from_acc_id);
                const toAcc = accounts.find((a) => a.acc_id === transferForm.to_acc_id);
                const amt = Number(transferForm.amount || 0);
                const existingTransfer = editingTransferId
                  ? transfers.find((t) => t.acc_transfer_id === editingTransferId)
                  : undefined;
                if (!fromAcc || !toAcc) {
                  return (
                    <>
                      <div>From balance: --</div>
                      <div>To balance: --</div>
                    </>
                  );
                }
                const fromBase =
                  Number(fromAcc.balance || 0) +
                  (existingTransfer && existingTransfer.from_acc_id === fromAcc.acc_id
                    ? Number(existingTransfer.amount || 0)
                    : 0);
                const toBase =
                  Number(toAcc.balance || 0) -
                  (existingTransfer && existingTransfer.to_acc_id === toAcc.acc_id
                    ? Number(existingTransfer.amount || 0)
                    : 0);
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
              className={fieldClass}
              value={transferForm.reference_no || ''}
              onChange={(e) => setTransferForm({ ...transferForm, reference_no: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className={fieldClass}
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
        <div className="space-y-3 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Customer (unpaid list)</span>
            <select
              className={fieldClass}
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
            {custReceiptErrors.customer && <p className="mt-1 text-xs text-red-500">{custReceiptErrors.customer}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Account</span>
            <select
              className={fieldClass}
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
            {custReceiptErrors.acc && <p className="mt-1 text-xs text-red-500">{custReceiptErrors.acc}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount</span>
            <input
              type="number"
              step="0.01"
              className={fieldClass}
              value={receiptForm.amount ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, amount: Number(e.target.value) })}
            />
            {custReceiptErrors.amount && <p className="mt-1 text-xs text-red-500">{custReceiptErrors.amount}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Reference</span>
            <input
              className={fieldClass}
              value={receiptForm.reference_no || ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, reference_no: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className={fieldClass}
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
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title={editingExpense ? 'Edit Expense' : 'New Expense'}
        size="sm"
      >
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Name</span>
            <input
              className={fieldClass}
              value={expenseForm.name}
              onChange={(e) => setExpenseForm({ ...expenseForm, name: e.target.value })}
              placeholder="e.g. Utilities"
            />
            {expenseErrors.name && <p className="mt-1 text-xs text-red-500">{expenseErrors.name}</p>}
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitExpense} className="rounded bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isChargeModalOpen} onClose={() => setIsChargeModalOpen(false)} title="New Expense Charge" size="md">
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Expense</span>
            <select
              className={fieldClass}
              value={chargeForm.exp_id ?? ''}
              onChange={(e) => setChargeForm({ ...chargeForm, exp_id: Number(e.target.value) })}
            >
              <option value="">Select</option>
              {expenses.map((ex) => (
                <option key={ex.exp_id} value={ex.exp_id}>
                  {ex.name}
                </option>
              ))}
            </select>
            {chargeErrors.exp && <p className="mt-1 text-xs text-red-500">{chargeErrors.exp}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Date</span>
            <input
              type="date"
              className={fieldClass}
              value={chargeForm.exp_date || ''}
              onChange={(e) => setChargeForm({ ...chargeForm, exp_date: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount</span>
            <input
              type="number"
              step="0.01"
              className={fieldClass}
              value={chargeForm.amount ?? ''}
              onChange={(e) => setChargeForm({ ...chargeForm, amount: Number(e.target.value) })}
            />
            {chargeErrors.amount && <p className="mt-1 text-xs text-red-500">{chargeErrors.amount}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className={fieldClass}
              value={chargeForm.note || ''}
              onChange={(e) => setChargeForm({ ...chargeForm, note: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsChargeModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitCharge} className="rounded bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isPayChargeModalOpen} onClose={() => setIsPayChargeModalOpen(false)} title={isEditingPayment ? 'Edit Expense Payment' : 'Pay Expense Charge'} size="sm">
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Account</span>
            <select
              className="w-full rounded border px-3 py-2 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
              value={payChargeForm.acc_id ?? ''}
              onChange={(e) => setPayChargeForm({ ...payChargeForm, acc_id: Number(e.target.value) })}
            >
              <option value="">Select</option>
              {accounts.map((a) => (
                <option key={a.acc_id} value={a.acc_id}>
                  {a.name} (${Number(a.balance || 0).toFixed(2)})
                </option>
              ))}
            </select>
            {payErrors.acc && <p className="mt-1 text-xs text-red-500">{payErrors.acc}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Pay Date</span>
            <input
              type="date"
              className="w-full rounded border px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
              value={payChargeForm.pay_date || ''}
              onChange={(e) => setPayChargeForm({ ...payChargeForm, pay_date: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount</span>
            <input
              type="number"
              step="0.01"
              className="w-full rounded border px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
              value={payChargeForm.amount ?? ''}
              onChange={(e) => setPayChargeForm({ ...payChargeForm, amount: Number(e.target.value) })}
            />
            {payErrors.amount && <p className="mt-1 text-xs text-red-500">{payErrors.amount}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Reference</span>
            <input
              className="w-full rounded border px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
              value={payChargeForm.reference_no || ''}
              onChange={(e) => setPayChargeForm({ ...payChargeForm, reference_no: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className="w-full rounded border px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
              value={payChargeForm.note || ''}
              onChange={(e) => setPayChargeForm({ ...payChargeForm, note: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsPayChargeModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitPayCharge} className="rounded bg-emerald-600 px-4 py-2 text-white">
              {isEditingPayment ? 'Update Payment' : 'Pay'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isPayHistoryOpen} onClose={() => setIsPayHistoryOpen(false)} title="Expense Payments" size="md">
        <div className="space-y-3 text-slate-900 dark:text-slate-100">
          {payHistory.length === 0 ? (
            <p className="text-sm text-slate-600">No payments found for this charge.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {payHistory.map((p) => (
                    <tr key={p.exp_payment_id} className="border-t border-slate-200">
                      <td className="px-3 py-2">{formatDate(p.pay_date)}</td>
                      <td className="px-3 py-2">{p.account_name || p.acc_id}</td>
                      <td className="px-3 py-2">${Number(p.amount_paid || 0).toFixed(2)}</td>
                      <td className="px-3 py-2">{p.reference_no || '-'}</td>
                      <td className="px-3 py-2">{p.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={() => setIsPayHistoryOpen(false)} className="rounded border px-4 py-2">
              Close
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteChargeModalOpen}
        onClose={() => setIsDeleteChargeModalOpen(false)}
        title="Delete Expense Charge"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Are you sure you want to delete this expense charge? This action cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsDeleteChargeModalOpen(false)}
              className="rounded border px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!pendingDeleteChargeId) {
                  setIsDeleteChargeModalOpen(false);
                  return;
                }
                const res = await financeService.deleteExpenseCharge(pendingDeleteChargeId);
                if (res.success) {
                  showToast('success', 'Finance', 'Expense charge deleted');
                  setPendingDeleteChargeId(null);
                  setIsDeleteChargeModalOpen(false);
                  loadAll();
                } else {
                  quickError(res.error || 'Delete failed');
                  setIsDeleteChargeModalOpen(false);
                }
              }}
              className="rounded bg-red-600 px-4 py-2 text-white"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isBudgetModalOpen}
        onClose={() => {
          setIsBudgetModalOpen(false);
          setEditingBudget(null);
        }}
        title={editingBudget ? 'Edit Expense Budget' : 'New Expense Budget'}
        size="md"
      >
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Expense</span>
            <select
              className={fieldClass}
              value={budgetForm.exp_id ?? ''}
              onChange={(e) => setBudgetForm({ ...budgetForm, exp_id: Number(e.target.value) })}
            >
              <option value="">Select</option>
              {expenses.map((ex) => (
                <option key={ex.exp_id} value={ex.exp_id}>
                  {ex.name}
                </option>
              ))}
            </select>
            {budgetErrors.exp && <p className="mt-1 text-xs text-red-500">{budgetErrors.exp}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount</span>
            <input
              type="number"
              step="0.01"
              className={fieldClass}
              value={budgetForm.fixed_amount ?? ''}
              onChange={(e) => setBudgetForm({ ...budgetForm, fixed_amount: Number(e.target.value) })}
            />
            {budgetErrors.amount && <p className="mt-1 text-xs text-red-500">{budgetErrors.amount}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className={fieldClass}
              value={budgetForm.note || ''}
              onChange={(e) => setBudgetForm({ ...budgetForm, note: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsBudgetModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitBudget} className="rounded bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isBudgetChargeModalOpen}
        onClose={() => setIsBudgetChargeModalOpen(false)}
        title="Charge Expense Budget"
        size="md"
      >
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Date</span>
            <input
              type="datetime-local"
              className={fieldClass}
              value={budgetChargeForm.pay_date ?? ''}
              onChange={(e) => {
                setBudgetChargeForm({ ...budgetChargeForm, pay_date: e.target.value });
                if (budgetChargeError) setBudgetChargeError('');
              }}
            />
            {budgetChargeError && <p className="mt-1 text-xs text-red-500">{budgetChargeError}</p>}
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsBudgetChargeModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitBudgetCharge} className="rounded bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isChargePayrollModalOpen}
        onClose={() => setIsChargePayrollModalOpen(false)}
        title="Charge Salary"
        size="sm"
      >
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Period Date</span>
            <input
              type="datetime-local"
              className={fieldClass}
              value={chargePayrollForm.period_date ?? ''}
              onChange={(e) => {
                setChargePayrollForm({ period_date: e.target.value });
                if (chargePayrollError) setChargePayrollError('');
              }}
            />
            {chargePayrollError && <p className="mt-1 text-xs text-red-500">{chargePayrollError}</p>}
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsChargePayrollModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitChargeSalary} className="rounded bg-primary-600 px-4 py-2 text-white">
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isPaySalaryModalOpen}
        onClose={() => setIsPaySalaryModalOpen(false)}
        title="Pay Salary"
        size="sm"
      >
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Account</span>
            <select
              className={fieldClass}
              value={paySalaryForm.acc_id ?? ''}
              onChange={(e) => setPaySalaryForm({ ...paySalaryForm, acc_id: Number(e.target.value) })}
            >
              <option value="">Select</option>
              {accounts.map((a) => (
                <option key={a.acc_id} value={a.acc_id}>
                  {a.name} (${Number(a.balance || 0).toFixed(2)})
                </option>
              ))}
            </select>
            {paySalaryErrors.acc && <p className="mt-1 text-xs text-red-500">{paySalaryErrors.acc}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Pay Date</span>
            <input
              type="date"
              className={fieldClass}
              value={paySalaryForm.pay_date || ''}
              onChange={(e) => setPaySalaryForm({ ...paySalaryForm, pay_date: e.target.value })}
            />
            {paySalaryErrors.date && <p className="mt-1 text-xs text-red-500">{paySalaryErrors.date}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount</span>
            <input
              type="number"
              step="0.01"
              className={fieldClass}
              value={paySalaryForm.amount ?? ''}
              onChange={(e) => setPaySalaryForm({ ...paySalaryForm, amount: Number(e.target.value) })}
            />
            {paySalaryErrors.amount && <p className="mt-1 text-xs text-red-500">{paySalaryErrors.amount}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className={fieldClass}
              value={paySalaryForm.note || ''}
              onChange={(e) => setPaySalaryForm({ ...paySalaryForm, note: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsPaySalaryModalOpen(false)} className="rounded border px-4 py-2">
              Cancel
            </button>
            <button type="button" onClick={submitPaySalary} className="rounded bg-emerald-600 px-4 py-2 text-white">
              Pay
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isDeletePayrollModalOpen}
        onClose={() => setIsDeletePayrollModalOpen(false)}
        title="Delete Salary Charge"
        size="sm"
      >
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <p className="text-sm text-slate-600">
            Choose what to delete. Deleting cannot be undone.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="delete-payroll"
                checked={deletePayrollMode === 'line'}
                onChange={() => setDeletePayrollMode('line')}
              />
              Delete selected employee charge only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="delete-payroll"
                checked={deletePayrollMode === 'period'}
                onChange={() => setDeletePayrollMode('period')}
              />
              Delete all salary charges for this period
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsDeletePayrollModalOpen(false)}
              className="rounded border px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (deletePayrollMode === 'line' && !pendingPayrollLineId) {
                  setDeletePayrollMode('period');
                  return;
                }
                const res = await financeService.deletePayroll({
                  mode: deletePayrollMode,
                  payroll_line_id: deletePayrollMode === 'line' ? pendingPayrollLineId ?? undefined : undefined,
                  period: deletePayrollMode === 'period' ? payrollPeriod : undefined,
                });
                if (res.success) {
                  showToast('success', 'Finance', 'Salary charge deleted');
                  setIsDeletePayrollModalOpen(false);
                  setPendingPayrollLineId(null);
                  loadAll();
                } else {
                  quickError(res.error || 'Delete failed');
                }
              }}
              className="rounded bg-red-600 px-4 py-2 text-white"
              disabled={!pendingPayrollLineId && deletePayrollMode === 'line'}
            >
              Delete
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
        <div className="space-y-3 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Supplier (unpaid list)</span>
            <select
              className={fieldClass}
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
            {supReceiptErrors.supplier && <p className="mt-1 text-xs text-red-500">{supReceiptErrors.supplier}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Account</span>
            <select
              className={fieldClass}
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
            {supReceiptErrors.acc && <p className="mt-1 text-xs text-red-500">{supReceiptErrors.acc}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Amount</span>
            <input
              type="number"
              step="0.01"
              className={fieldClass}
              value={receiptForm.amount ?? ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, amount: Number(e.target.value) })}
            />
            {supReceiptErrors.amount && <p className="mt-1 text-xs text-red-500">{supReceiptErrors.amount}</p>}
          </label>
         <label className="text-sm">
            <span className="mb-1 block font-medium">Reference</span>
            <input
              className={fieldClass}
              value={receiptForm.reference_no || ''}
              onChange={(e) => setReceiptForm({ ...receiptForm, reference_no: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              className={fieldClass}
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
        <div className="space-y-4 text-slate-900 dark:text-slate-100">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Account Name</span>
            <input
              className={fieldClass}
              value={accountForm.name}
              onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              placeholder="e.g. Cash on Hand"
            />
            {accountErrors.name && <p className="mt-1 text-xs text-red-500">{accountErrors.name}</p>}
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Institution / Bank</span>
            <input
              className={fieldClass}
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
              className={fieldClass}
              value={accountForm.balance}
              onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
            />
            {accountErrors.balance && <p className="mt-1 text-xs text-red-500">{accountErrors.balance}</p>}
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
